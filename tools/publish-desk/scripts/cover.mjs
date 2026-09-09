/**
 * Cover image acquisition: pull the URL GitHub inserted when the writer
 * dragged a picture into the "커버 이미지" field, download it, and re-encode
 * it to the same ceiling album-add.ts enforces for every other cover in the
 * repo (ADR-0008 §2 — reduced copy only, source recorded, never the
 * original resolution/bytes).
 *
 * IMPORTANT — see docs/publishing.md §"검증 못 한 것": the download step
 * (downloadImage) has NOT been exercised against a real private-repo issue
 * attachment. This environment has no network access and no live GitHub
 * repo to test against, so its behavior against a `private-user-images.
 * githubusercontent.com` URL is a documented assumption, not a verified
 * fact. `extractImageUrl` and `resizeCoverBuffer` ARE fully testable without
 * network access and have real tests.
 */

/** Pull the first `![...](https://...)` image URL out of a form field's raw
 * text — this is exactly the markdown GitHub inserts when an image is
 * dropped into any textarea field of an issue/PR. Returns null if the
 * writer left the field empty or pasted something else entirely (plain
 * text, a non-image link) — callers treat that as "no cover provided",
 * matching E-202's designed placeholder-publish path, never a hard failure.
 *
 * Deliberately does NOT host-check here (security review UN-SEC-016 asked
 * for a host allowlist, but the check lives in `downloadImage` instead —
 * see `isAllowedCoverHost` below): this function's only job is "did the
 * writer paste image markdown", and `resolveCover`/`resolveCoverForUpdate`
 * (publish.mjs) both rely on `extractImageUrl` returning a URL vs. null to
 * tell "not an image" (PD-COVER-NOT-IMAGE) apart from "an image, but we
 * refuse to fetch it" (PD-COVER-FETCH-FAILED, via downloadImage) — those are
 * different failure messages a writer needs to tell apart. */
export function extractImageUrl(fieldText) {
  const match = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/.exec(fieldText);
  return match ? match[1] : null;
}

/**
 * Host allowlist for cover downloads (security review UN-SEC-016 — SSRF/
 * arbitrary-fetch: without this, `downloadImage` would fetch ANY
 * `https?://` URL a writer's issue body happens to contain, including
 * internal/cloud-metadata addresses).
 *
 * SCOPE DECISION (recorded, not just implemented — the lead flagged this as
 * a real risk to get wrong): docs/publishing.md §3.1 is explicit that the
 * EXACT host GitHub uses for a private-repo issue attachment has never been
 * observed against a real issue in this environment (no network access, no
 * live repo to test against) — only two CANDIDATES are documented
 * (`user-images.githubusercontent.com` for public repos,
 * `private-user-images.githubusercontent.com` for private ones), and GitHub
 * has changed this scheme before (the newer `github.com/user-attachments/...`
 * form exists for some upload paths). Pinning to those two exact hostnames
 * would close the SSRF surface completely but risks PD-COVER-FETCH-FAILED on
 * the very FIRST real submission if the actual host differs even slightly —
 * a self-inflicted outage of a feature that has never been exercised
 * end-to-end. Matching instead on the OWNING domain (`github.com` or
 * `githubusercontent.com`, and their subdomains) still closes off the
 * actual threat this finding cares about — an attacker-controlled host, a
 * cloud metadata IP, an internal address — because none of those can ever
 * be a genuine subdomain of a domain the attacker does not control, while
 * staying correct across any GitHub-side renaming of the exact attachment
 * subdomain. If a real submission ever needs a GitHub host OUTSIDE these two
 * domains, `downloadImage` fails LOUD (PD-COVER-FETCH-FAILED, §above), never
 * silently — so narrowing this further later, if warranted, costs nothing
 * already published.
 */
const ALLOWED_COVER_HOST_SUFFIXES = ['github.com', 'githubusercontent.com'];

function isAllowedCoverHost(hostname) {
  return ALLOWED_COVER_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

/** 640px JPEG covers do not need more than a few hundred KB — 10MB is a
 * generous ceiling that still bounds the worst case (UN-SEC-016: no prior
 * limit meant an attacker-controlled or merely slow/huge response could
 * exhaust runner memory/time regardless of which host served it). */
const MAX_COVER_BYTES = 10 * 1024 * 1024;

const MAX_COVER_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Re-encode an arbitrary image buffer to the site's cover master format:
 * longest side <=640px, no upscaling, JPEG quality 82 with mozjpeg — the
 * EXACT parameters scripts/album-add.ts uses in the public repo. Kept in
 * sync by hand (documented sync point, docs/publishing.md): this is image
 * PROCESSING, not a content-validation RULE, so unlike score/slug/bucket
 * logic it has no schema to defer to and no way to "run the real check
 * instead" — the real check for image bytes does not exist as code.
 *
 * `sharpModule` is injected (not imported here) so this function is
 * testable without a network fetch — a real sharp instance in tests
 * produces a real re-encoded JPEG, exercised against a synthetic image the
 * test itself generates.
 */
export async function resizeCoverBuffer(buffer, sharpModule) {
  return sharpModule(buffer)
    .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/** Read a fetch `Response` body up to `maxBytes`, aborting the stream (not
 * just discarding the result afterwards) the moment the running total goes
 * over — a slow or intentionally huge response never gets to fully buffer
 * in memory first (UN-SEC-016 DoS half of the finding; the SSRF half is
 * `isAllowedCoverHost` above). Falls back to a whole-buffer read only if a
 * `Response` has no streamed `.body` at all (defensive — real `fetch`
 * responses always do; kept so a minimal test stub without stream support
 * still works, checked AFTER the fact in that fallback case only). */
async function readCappedBody(response, url, maxBytes) {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && Number(contentLength) > maxBytes) {
    throw new Error(`이미지가 너무 큽니다 (${contentLength} bytes, 상한 ${maxBytes} bytes) — ${url}`);
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new Error(`이미지가 너무 큽니다 (${buffer.length} bytes, 상한 ${maxBytes} bytes) — ${url}`);
    }
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(`이미지가 너무 큽니다 (상한 ${maxBytes} bytes 초과) — ${url}`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Download an image. UNVERIFIED against a real private-repo attachment URL
 * (see module doc) — written to fail loudly and specifically rather than
 * silently produce a broken cover:
 *   - a disallowed host (UN-SEC-016 — see isAllowedCoverHost's doc comment
 *     for the scope decision), non-2xx status, an oversized response, or a
 *     content-type that isn't image/* -> throws with the reason in the
 *     message, so the workflow's error comment (PD-COVER-FETCH-FAILED) names
 *     the actual cause instead of a generic "다운로드 실패".
 *
 * Redirects are followed MANUALLY (`redirect: 'manual'`), not by fetch
 * itself: the host check above would otherwise only ever see the FIRST
 * URL — a response from an allowed host that then 302s to an arbitrary one
 * would sail straight through (UN-SEC-016's own point about follow-the-
 * redirect bypasses). Each hop is re-validated against the same allowlist
 * before being followed, up to MAX_COVER_REDIRECTS hops.
 */
export async function downloadImage(url, fetchImpl = fetch) {
  let currentUrl = url;
  for (let hop = 0; ; hop++) {
    let parsed;
    try {
      parsed = new URL(currentUrl);
    } catch {
      throw new Error(`커버 이미지 주소가 올바르지 않습니다 — ${currentUrl}`);
    }
    if (!isAllowedCoverHost(parsed.hostname)) {
      throw new Error(`허용되지 않은 호스트("${parsed.hostname}")에서 커버 이미지를 받으려 했습니다 — GitHub 첨부 주소만 허용됩니다.`);
    }

    const response = await fetchImpl(currentUrl, { redirect: 'manual' });

    if (REDIRECT_STATUSES.has(response.status)) {
      if (hop >= MAX_COVER_REDIRECTS) {
        throw new Error(`리다이렉트가 너무 많습니다(${MAX_COVER_REDIRECTS}회 초과) — ${url}`);
      }
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`리다이렉트 응답에 location 헤더가 없습니다 — ${currentUrl}`);
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue; // re-validate the NEW host on the next loop iteration
    }

    if (!response.ok) {
      throw new Error(`커버 이미지를 받지 못했습니다 (HTTP ${response.status}) — ${currentUrl}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      throw new Error(`이 주소가 이미지가 아닙니다 (content-type: "${contentType}") — ${currentUrl}`);
    }
    return readCappedBody(response, currentUrl, MAX_COVER_BYTES);
  }
}
