import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { extractImageUrl, resizeCoverBuffer, downloadImage, CoverAuthError } from './cover.mjs';

test('extractImageUrl reads the URL out of GitHub-inserted image markdown', () => {
  const field = '![lost-weekend](https://private-user-images.githubusercontent.com/1/2-3.jpg?jwt=abc)';
  assert.equal(extractImageUrl(field), 'https://private-user-images.githubusercontent.com/1/2-3.jpg?jwt=abc');
});

test('extractImageUrl returns null when the field is empty or not an image', () => {
  assert.equal(extractImageUrl(''), null);
  assert.equal(extractImageUrl('그냥 텍스트입니다'), null);
  assert.equal(extractImageUrl('[링크](https://example.com/not-an-image)'), null);
});

test('extractImageUrl takes the FIRST image if the writer somehow drops more than one', () => {
  const field = '![a](https://example.com/a.jpg) 그리고 ![b](https://example.com/b.jpg)';
  assert.equal(extractImageUrl(field), 'https://example.com/a.jpg');
});

// ── PD-COVER-NOT-IMAGE real-world repro (2026-09-09, `fgda114/undernote-
// desk#2`): GitHub inserted an HTML `<img>` tag, not markdown, for a real
// cover drag-and-drop into a real issue — the exact markup below is copied
// verbatim from that issue body, not hand-reproduced, per the lead's
// "새 픽스처는 실제 GitHub이 만든 것을 그대로 쓰십시오" instruction. ──

test('extractImageUrl reads the URL out of a real GitHub-inserted <img> tag (verbatim from the actual issue)', () => {
  const field = '<img width="640" height="640" alt="Image" src="https://github.com/user-attachments/assets/3d1bb141-3647-42b1-be84-89aec2ae9b58" />';
  assert.equal(extractImageUrl(field), 'https://github.com/user-attachments/assets/3d1bb141-3647-42b1-be84-89aec2ae9b58');
});

test('extractImageUrl reads an <img> tag regardless of attribute order (src FIRST, not last)', () => {
  const field = '<img src="https://user-images.githubusercontent.com/1/2.jpg" width="640" height="640" alt="Image" />';
  assert.equal(extractImageUrl(field), 'https://user-images.githubusercontent.com/1/2.jpg');
});

test('extractImageUrl reads an <img> tag with single-quoted attributes and no self-closing slash', () => {
  const field = "<img alt='Image' src='https://github.com/user-attachments/assets/abc123'>";
  assert.equal(extractImageUrl(field), 'https://github.com/user-attachments/assets/abc123');
});

test('extractImageUrl: when BOTH a markdown image and an <img> tag are present, the one appearing FIRST in the text wins', () => {
  const htmlFirst = '<img src="https://github.com/user-attachments/assets/first" /> 그리고 ![b](https://example.com/b.jpg)';
  assert.equal(extractImageUrl(htmlFirst), 'https://github.com/user-attachments/assets/first');

  const markdownFirst = '![a](https://example.com/a.jpg) 그리고 <img src="https://github.com/user-attachments/assets/second" />';
  assert.equal(extractImageUrl(markdownFirst), 'https://example.com/a.jpg');
});

// resizeCoverBuffer is exercised against a REAL sharp instance and a
// synthetic image (same technique as e2e/lib/rich-content.mjs's makeCover
// in the public repo) — a genuine re-encode, not a mocked call.
test('resizeCoverBuffer: an oversized image is capped to 640px on its longest side', async () => {
  const oversized = await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 10, g: 10, b: 10 } } })
    .jpeg()
    .toBuffer();
  const result = await resizeCoverBuffer(oversized, sharp);
  const meta = await sharp(result).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, 640);
  assert.ok(meta.height < 640);
});

test('resizeCoverBuffer: a small image is NOT upscaled (withoutEnlargement)', async () => {
  const small = await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 5, g: 5, b: 5 } } })
    .jpeg()
    .toBuffer();
  const result = await resizeCoverBuffer(small, sharp);
  const meta = await sharp(result).metadata();
  assert.equal(meta.width, 200);
  assert.equal(meta.height, 200);
});

// Every "should actually reach the network" test below uses an ALLOWED host
// (githubusercontent.com) — UN-SEC-016 added a host allowlist, so a stub
// pointed at example.com would now fail on the allowlist check before the
// fake fetch is even called (that check has its own dedicated tests further
// down).
const ALLOWED_URL = 'https://user-images.githubusercontent.com/missing.jpg';

// Writer-facing wording, not the raw "HTTP 404" this used to expose
// verbatim in the issue comment (2026-09-09 lead directive — see
// describeDownloadFailure's own doc comment in cover.mjs).
test('downloadImage rejects a 404 with writer-readable Korean, not raw "HTTP 404"', async () => {
  const fakeFetch = async () => new Response('nope', { status: 404 });
  await assert.rejects(() => downloadImage(ALLOWED_URL, fakeFetch), /찾을 수 없습니다/);
  await assert.rejects(() => downloadImage(ALLOWED_URL, fakeFetch), (err) => {
    assert.ok(!/HTTP 404/.test(err.message), `message must not expose raw "HTTP 404": ${err.message}`);
    return true;
  });
});

test('downloadImage rejects a non-2xx, non-404 response with the status code (no better plain-language guess exists)', async () => {
  const fakeFetch = async () => new Response('nope', { status: 500 });
  await assert.rejects(() => downloadImage(ALLOWED_URL, fakeFetch), /서버 응답 코드 500/);
});

test('downloadImage rejects a non-image content-type with a specific message', async () => {
  const fakeFetch = async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  await assert.rejects(() => downloadImage(ALLOWED_URL, fakeFetch), /content-type: "text\/html"/);
});

test('downloadImage returns a Buffer on a real image response', async () => {
  const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 1, b: 1 } } })
    .jpeg()
    .toBuffer();
  const fakeFetch = async () =>
    new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  const result = await downloadImage(ALLOWED_URL, fakeFetch);
  assert.ok(Buffer.isBuffer(result));
  assert.equal(result.length, bytes.length);
});

// ── UN-SEC-016 (security audit) — host allowlist, size cap, redirect
// re-validation. See isAllowedCoverHost's own doc comment in cover.mjs for
// the scope decision (why "github.com"/"githubusercontent.com" and their
// subdomains, not a narrower exact-hostname list). ──

test('downloadImage rejects a disallowed host WITHOUT ever calling fetch (SSRF surface closed before any request)', async () => {
  let called = false;
  const fakeFetch = async () => {
    called = true;
    return new Response('should never get here', { status: 200 });
  };
  await assert.rejects(
    () => downloadImage('https://attacker.example/beacon', fakeFetch),
    /허용되지 않은 호스트/,
  );
  assert.equal(called, false);
});

test('downloadImage rejects an internal/metadata-shaped host the same way as any other disallowed host', async () => {
  const fakeFetch = async () => new Response('nope', { status: 200 });
  await assert.rejects(
    () => downloadImage('http://169.254.169.254/latest/meta-data/', fakeFetch),
    /허용되지 않은 호스트/,
  );
});

// ── The redirect target GitHub actually sends us to (2026-09-10, measured
// on real submission `fgda114/undernote-desk#4`). `github.com/user-
// attachments/assets/<uuid>` does not serve bytes: with a token it accepts,
// it 302s to a SIGNED object-storage URL. The allowlist rejected that hop,
// which is how the failure text changed from HTTP 404 to "허용되지 않은
// 호스트" the moment the token finally worked. ──

test('downloadImage accepts GitHub의 서명 저장소 호스트 (실제 리다이렉트 대상)', async () => {
  const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 9, g: 9, b: 9 } } })
    .jpeg()
    .toBuffer();
  const fakeFetch = async () => new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  const out = await downloadImage('https://github-production-user-asset-6210df.s3.amazonaws.com/1/2/3?X-Amz-Signature=abc', fakeFetch);
  assert.ok(out.length > 0);
});

test('downloadImage rejects any OTHER S3 bucket — 접두어 없이는 안 된다', async () => {
  let called = false;
  const fakeFetch = async () => {
    called = true;
    return new Response('should never get here', { status: 200 });
  };
  // Without the prefix requirement this would open every bucket on S3 to a
  // URL a writer can put in an issue — the exact SSRF the allowlist exists
  // to prevent. Three shapes: a bare bucket, the apex, and a suffix that
  // merely CONTAINS the allowed host inside an attacker-owned domain.
  for (const host of ['evil.s3.amazonaws.com', 's3.amazonaws.com', 'github-production-user-asset-x.s3.amazonaws.com.evil.example']) {
    await assert.rejects(() => downloadImage(`https://${host}/x.jpg`, fakeFetch), /허용되지 않은 호스트/, host);
  }
  assert.equal(called, false);
});

// The actual host observed in a real submission (2026-09-09,
// `fgda114/undernote-desk#2`) is the bare `github.com` apex — NOT a
// `githubusercontent.com` subdomain, which is what §3.1's two original
// CANDIDATE hostnames both assumed. Had UN-SEC-016's allowlist been narrowed
// to those two candidates (as its own doc comment considered and rejected),
// this exact real URL would have been refused — this test is the concrete
// evidence for docs/publishing.md §3.1's "do not narrow further" decision.
test('downloadImage accepts the REAL observed host (github.com apex, user-attachments path)', async () => {
  const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 6, g: 6, b: 6 } } })
    .jpeg()
    .toBuffer();
  const fakeFetch = async () => new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  const result = await downloadImage('https://github.com/user-attachments/assets/3d1bb141-3647-42b1-be84-89aec2ae9b58', fakeFetch);
  assert.ok(Buffer.isBuffer(result));
});

test('downloadImage accepts a githubusercontent.com SUBDOMAIN (not just the exact apex)', async () => {
  const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 2, g: 2, b: 2 } } })
    .jpeg()
    .toBuffer();
  const fakeFetch = async () => new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  const result = await downloadImage('https://private-user-images.githubusercontent.com/1/2-3.jpg?jwt=abc', fakeFetch);
  assert.ok(Buffer.isBuffer(result));
});

test('downloadImage rejects a Content-Length above the cap WITHOUT reading the body', async () => {
  // A plain mock (not a real Response/ReadableStream): a real ReadableStream
  // eagerly fills its own internal buffer on construction regardless of
  // whether anything ever reads from it, which would make a "was the stream
  // touched" assertion measure the platform's own queuing behaviour instead
  // of OUR code's. What we actually need proven is narrower and stronger:
  // readCappedBody must never even ASK for the body (`.body`/`.arrayBuffer()`)
  // once the Content-Length header alone already says "too big".
  let bodyAccessed = false;
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'image/jpeg', 'content-length': String(20 * 1024 * 1024) }),
    get body() {
      bodyAccessed = true;
      return null;
    },
    async arrayBuffer() {
      bodyAccessed = true;
      return new ArrayBuffer(0);
    },
  });
  await assert.rejects(() => downloadImage(ALLOWED_URL, fakeFetch), /이미지가 너무 큽니다/);
  assert.equal(bodyAccessed, false, 'an oversized Content-Length must short-circuit before touching the body at all');
});

test('downloadImage aborts a stream that exceeds the cap even WITHOUT a Content-Length header (slow/chunked oversized response)', async () => {
  // A 1MB cap for this one test only (real cap is 10MB — a real 11MB+ image
  // in a unit test would be needlessly slow) — swap MAX_COVER_BYTES's effect
  // by feeding a stream that is deliberately impossible to fit under any
  // sane cover-image cap: many 1MB chunks, no content-length header at all.
  const chunk = new Uint8Array(1024 * 1024).fill(1);
  let chunksServed = 0;
  const fakeFetch = async () =>
    new Response(
      new ReadableStream({
        pull(controller) {
          chunksServed += 1;
          if (chunksServed > 15) {
            controller.close();
            return;
          }
          controller.enqueue(chunk);
        },
      }),
      { status: 200, headers: { 'content-type': 'image/jpeg' } }, // no content-length
    );
  await assert.rejects(() => downloadImage(ALLOWED_URL, fakeFetch), /이미지가 너무 큽니다/);
  // The stream must have been ABANDONED partway through, not drained to the
  // (attacker-controlled) end first.
  assert.ok(chunksServed < 15, 'oversized stream must be cancelled before being fully read');
});

test('downloadImage follows a redirect to an ALLOWED host', async () => {
  const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 3, g: 3, b: 3 } } })
    .jpeg()
    .toBuffer();
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    if (calls.length === 1) {
      return new Response(null, { status: 302, headers: { location: 'https://private-user-images.githubusercontent.com/final.jpg' } });
    }
    return new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  };
  const result = await downloadImage('https://user-images.githubusercontent.com/redirect', fakeFetch);
  assert.equal(calls.length, 2);
  assert.ok(Buffer.isBuffer(result));
});

test('downloadImage rejects a redirect that points OFF the allowlist, without following it', async () => {
  const fakeFetch = async (url) => {
    if (url === ALLOWED_URL) {
      return new Response(null, { status: 302, headers: { location: 'https://attacker.example/steal' } });
    }
    throw new Error(`should never fetch the redirect target: ${url}`);
  };
  await assert.rejects(() => downloadImage(ALLOWED_URL, fakeFetch), /허용되지 않은 호스트/);
});

test('downloadImage gives up after too many redirects rather than looping forever', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return new Response(null, { status: 302, headers: { location: ALLOWED_URL } }); // redirects to itself, forever
  };
  await assert.rejects(() => downloadImage(ALLOWED_URL, fakeFetch), /리다이렉트가 너무 많습니다/);
  assert.ok(calls < 20, 'must bail out well before an unbounded loop');
});

// ── Authentication (2026-09-09, PD-COVER-FETCH-FAILED, real submission
// `fgda114/undernote-desk#3` — MEASURED against the real attachment URL:
// no auth -> 404, `Authorization: Bearer <token>` -> 200/image/jpeg). See
// downloadImage's own doc comment for the redirect-safety rule tested
// below. ──

test('downloadImage sends Authorization: Bearer <token> on the FIRST request when a token is given', async () => {
  const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 7, g: 7, b: 7 } } })
    .jpeg()
    .toBuffer();
  let seenAuth;
  const fakeFetch = async (_url, init) => {
    seenAuth = init?.headers?.Authorization;
    return new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  };
  await downloadImage(ALLOWED_URL, fakeFetch, 'secret-token');
  assert.equal(seenAuth, 'Bearer secret-token');
});

test('downloadImage sends NO Authorization header when no token is given (public-repo / pre-existing behavior unchanged)', async () => {
  const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 8, g: 8, b: 8 } } })
    .jpeg()
    .toBuffer();
  let sawHeaders;
  const fakeFetch = async (_url, init) => {
    sawHeaders = init?.headers;
    return new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  };
  await downloadImage(ALLOWED_URL, fakeFetch);
  assert.equal(sawHeaders, undefined);
});

test('downloadImage strips the Authorization header on a redirect to a DIFFERENT host, even an ALLOWED one (no credential leak to a signed CDN URL)', async () => {
  const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 9, g: 9, b: 9 } } })
    .jpeg()
    .toBuffer();
  const authSeenPerCall = [];
  const fakeFetch = async (_url, init) => {
    authSeenPerCall.push(init?.headers?.Authorization);
    if (authSeenPerCall.length === 1) {
      return new Response(null, { status: 302, headers: { location: 'https://private-user-images.githubusercontent.com/final.jpg?sig=already-signed' } });
    }
    return new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  };
  await downloadImage('https://github.com/user-attachments/assets/abc', fakeFetch, 'secret-token');
  assert.equal(authSeenPerCall.length, 2);
  assert.equal(authSeenPerCall[0], 'Bearer secret-token', 'the FIRST hop (the actual private-repo attachment) must be authenticated');
  assert.equal(authSeenPerCall[1], undefined, 'a redirect to a DIFFERENT host must NOT receive the token');
});

test('downloadImage throws CoverAuthError (not a plain Error) on 401, with the token never in the message', async () => {
  const fakeFetch = async () => new Response('nope', { status: 401 });
  await assert.rejects(
    () => downloadImage(ALLOWED_URL, fakeFetch, 'secret-token'),
    (err) => {
      assert.ok(err instanceof CoverAuthError, `expected CoverAuthError, got ${err.constructor.name}`);
      assert.ok(!err.message.includes('secret-token'), `token must never appear in an error message: ${err.message}`);
      return true;
    },
  );
});

test('downloadImage throws CoverAuthError on 403 the same way as 401', async () => {
  const fakeFetch = async () => new Response('nope', { status: 403 });
  await assert.rejects(() => downloadImage(ALLOWED_URL, fakeFetch, 'secret-token'), (err) => err instanceof CoverAuthError);
});
