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
 * matching E-202's designed placeholder-publish path, never a hard failure. */
export function extractImageUrl(fieldText) {
  const match = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/.exec(fieldText);
  return match ? match[1] : null;
}

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

/**
 * Download an image. UNVERIFIED against a real private-repo attachment URL
 * (see module doc) — written to fail loudly and specifically rather than
 * silently produce a broken cover:
 *   - non-2xx status, or a content-type that isn't image/* -> throws with
 *     the status/type in the message, so the workflow's error comment names
 *     the actual cause instead of a generic "다운로드 실패".
 */
export async function downloadImage(url, fetchImpl = fetch) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`커버 이미지를 받지 못했습니다 (HTTP ${response.status}) — ${url}`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`이 주소가 이미지가 아닙니다 (content-type: "${contentType}") — ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
