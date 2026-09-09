/**
 * Cover image acquisition: pull the URL GitHub inserted when the writer
 * dragged a picture into the "커버 이미지" field, download it, and re-encode
 * it to the same ceiling album-add.ts enforces for every other cover in the
 * repo (ADR-0008 §2 — reduced copy only, source recorded, never the
 * original resolution/bytes).
 *
 * IMPORTANT — see docs/publishing.md §"검증 못 한 것" §3.1 for the full,
 * dated history. As of 2026-09-09 (`fgda114/undernote-desk#3`,
 * `PD-COVER-FETCH-FAILED`) every open question this module's doc comments
 * used to flag is now MEASURED, not assumed: the attachment host
 * (`github.com/user-attachments/assets/<uuid>`), the markup shape (HTML
 * `<img>`, handled by `extractImageUrl` below), and — the one that actually
 * broke a real submission — that a PRIVATE repo's attachment needs
 * authentication (`?jwt=`-style self-signed URLs, this project's prior
 * assumption, were never observed; a plain unauthenticated GET measured
 * 404, `Authorization: Bearer <token>` measured 200 against the exact same
 * URL). `downloadImage` below now accepts an optional token for exactly
 * this reason — see its own doc comment for the redirect-safety rule this
 * added.
 */

/**
 * Pull the first dropped-image URL out of a form field's raw text.
 *
 * GitHub inserts ONE OF TWO shapes when a picture is dropped into a textarea
 * field, and this project has now seen BOTH in the wild (2026-09-09 — a
 * decision-maker actually dragged a photo into a real issue's cover field,
 * `fgda114/undernote-desk#2`, `PD-COVER-NOT-IMAGE`): the classic markdown
 * form `![alt](url)`, and an HTML `<img ... src="url" ... />` tag — GitHub
 * has been observed to emit the HTML form for at least some attachment
 * uploads (this project cannot predict which; the two REGEXes below are
 * tried in one pass so whichever GitHub happens to send is caught). Before
 * this fix, only the markdown form was recognized — a real `<img>` submission
 * silently fell through to "not an image" (PD-COVER-NOT-IMAGE), which is
 * exactly the bug report above.
 *
 * `<img>` attribute order/quoting is NOT assumed: real markup carries
 * `width`/`height`/`alt` in front of `src` (see the fixture reproduced from
 * the actual issue, `fixtures/review-form-body-img-cover.txt`), the quote
 * character could in principle be `'` instead of `"`, and the tag may or may
 * not be self-closing (`/>` vs `>`) — the regex below tolerates all of that
 * by scanning past whatever attributes precede `src=` rather than assuming a
 * fixed position.
 *
 * Multiple images in the same field (a writer somehow drops more than one,
 * in either shape, possibly mixed) resolve to whichever URL appears FIRST in
 * the raw text, matching the pre-existing markdown-only behavior — a single
 * alternation-based regex naturally finds the leftmost match regardless of
 * which shape it is, rather than checking "any markdown" then "any html" as
 * two separate passes (which would always prefer markdown even when an
 * `<img>` tag came first in the text).
 *
 * Returns null if the writer left the field empty or pasted something else
 * entirely (plain text, a non-image link) — callers treat that as "no cover
 * provided", matching E-202's designed placeholder-publish path, never a
 * hard failure.
 *
 * Deliberately does NOT host-check here (security review UN-SEC-016 asked
 * for a host allowlist, but the check lives in `downloadImage` instead —
 * see `isAllowedCoverHost` below): this function's only job is "did the
 * writer paste an image reference", and `resolveCover`/`resolveCoverForUpdate`
 * (publish.mjs) both rely on `extractImageUrl` returning a URL vs. null to
 * tell "not an image" (PD-COVER-NOT-IMAGE) apart from "an image, but we
 * refuse to fetch it" (PD-COVER-FETCH-FAILED, via downloadImage) — those are
 * different failure messages a writer needs to tell apart. */
const IMAGE_REFERENCE_RE =
  /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)|<img\b[^>]*?\bsrc\s*=\s*(?:"(https?:\/\/[^"]+)"|'(https?:\/\/[^']+)')[^>]*>/i;

export function extractImageUrl(fieldText) {
  const match = IMAGE_REFERENCE_RE.exec(fieldText);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
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
 * Thrown for a 401/403 from `downloadImage` — kept as a DISTINCT class (not
 * a plain `Error`, unlike every other failure branch below) because it is
 * the one outcome `publish.mjs#fetchAndResizeCover` must NOT wrap as
 * PD-COVER-FETCH-FAILED. Every other failure (404, non-image, oversized,
 * disallowed host) is something a writer re-dropping a photo can plausibly
 * fix; an auth rejection means the token this workflow itself supplied is
 * missing, expired, or lacks the scope this attachment needs — no photo a
 * writer drops changes that outcome, so telling them to "다시 끌어다 놓고
 * 저장해 주세요" would be actively misleading. `publish.mjs` catches this
 * type specifically and lets it propagate uncaught instead, landing it in
 * the same "developer-only, via Actions log" bucket as any other
 * infrastructure fault (see publish.mjs's own module doc for that split).
 */
export class CoverAuthError extends Error {}

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

/** Turn a non-2xx status into writer-facing Korean — deliberately WITHOUT
 * the bare "HTTP 404" jargon this used to expose verbatim in the issue
 * comment (2026-09-09 lead directive: a failure message a writer reads must
 * read like something they can act on). 404 gets its own sentence because
 * it is the one status a writer's own action (a deleted/replaced photo)
 * plausibly causes; every other status keeps the numeric code, since there
 * is no better plain-language guess for e.g. a 500 or 503, and hiding the
 * number entirely would make repeat reports to the developer harder to
 * triage. 401/403 are handled separately by the caller (CoverAuthError,
 * above) and never reach this function. */
function describeDownloadFailure(status, url) {
  if (status === 404) {
    return `커버 이미지 주소를 찾을 수 없습니다 — 사진이 지워졌거나 옮겨진 것 같습니다. (${url})`;
  }
  return `커버 이미지를 받지 못했습니다 (서버 응답 코드 ${status}) — ${url}`;
}

/**
 * Download an image — written to fail loudly and specifically rather than
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
 *
 * `authToken`, if given, is sent as an `Authorization: Bearer <token>`
 * header — but ONLY on requests to the exact host the very first `url`
 * pointed at, never on a hop that redirected somewhere else, even to an
 * ALLOWED host. This is deliberately narrower than isAllowedCoverHost:
 * that allowlist protects against SSRF (an arbitrary host being fetched at
 * all); this rule protects against credential leakage (this workflow's own
 * token reaching a host that never asked for it). Real measurement
 * (2026-09-09, `fgda114/undernote-desk#3`) is the reason both halves of
 * this rule exist — a private-repo attachment's FIRST hop
 * (`github.com/user-attachments/assets/<uuid>`) genuinely 404s without a
 * token and 200s with one, but GitHub is also known to redirect attachment
 * requests to signed, time-limited CDN URLs on a DIFFERENT host (its own
 * query string already carries the authorization) — forwarding this
 * workflow's token there too would hand a live, comparatively long-lived
 * credential to a response whose destination this project does not
 * control, for no benefit (that hop does not need it). Same rationale as
 * curl's own default of stripping Authorization across a cross-host
 * redirect. `authToken` is optional and changes nothing when omitted — a
 * public-repo attachment (or any host that never needed auth to begin
 * with) downloads exactly as before.
 */
export async function downloadImage(url, fetchImpl = fetch, authToken = undefined) {
  let currentUrl = url;
  let authHost;
  try {
    authHost = new URL(url).hostname;
  } catch {
    authHost = null; // invalid `url` is reported uniformly by the loop's own first-iteration check below
  }

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

    // Never logged: this is passed straight into a `fetch` header, never
    // interpolated into any Error message or console output anywhere in
    // this module (grep-verify before touching this function again).
    const headers = authToken && parsed.hostname === authHost ? { Authorization: `Bearer ${authToken}` } : undefined;
    const response = await fetchImpl(currentUrl, { redirect: 'manual', headers });

    if (REDIRECT_STATUSES.has(response.status)) {
      if (hop >= MAX_COVER_REDIRECTS) {
        throw new Error(`리다이렉트가 너무 많습니다(${MAX_COVER_REDIRECTS}회 초과) — ${url}`);
      }
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`리다이렉트 응답에 location 헤더가 없습니다 — ${currentUrl}`);
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue; // re-validate the NEW host (and re-decide the auth header) on the next loop iteration
    }

    if (response.status === 401 || response.status === 403) {
      throw new CoverAuthError(`커버 이미지 요청이 인증 거부(HTTP ${response.status})됐습니다 — ${currentUrl}`);
    }
    if (!response.ok) {
      throw new Error(describeDownloadFailure(response.status, currentUrl));
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      throw new Error(`이 주소가 이미지가 아닙니다 (content-type: "${contentType}") — ${currentUrl}`);
    }
    return readCappedBody(response, currentUrl, MAX_COVER_BYTES);
  }
}
