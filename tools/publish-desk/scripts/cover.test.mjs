import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { extractImageUrl, resizeCoverBuffer, downloadImage } from './cover.mjs';

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

test('downloadImage rejects a non-2xx response with a specific message', async () => {
  const fakeFetch = async () => new Response('nope', { status: 404 });
  await assert.rejects(() => downloadImage('https://example.com/missing.jpg', fakeFetch), /HTTP 404/);
});

test('downloadImage rejects a non-image content-type with a specific message', async () => {
  const fakeFetch = async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  await assert.rejects(() => downloadImage('https://example.com/page', fakeFetch), /content-type: "text\/html"/);
});

test('downloadImage returns a Buffer on a real image response', async () => {
  const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 1, b: 1 } } })
    .jpeg()
    .toBuffer();
  const fakeFetch = async () =>
    new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  const result = await downloadImage('https://example.com/ok.jpg', fakeFetch);
  assert.ok(Buffer.isBuffer(result));
  assert.equal(result.length, bytes.length);
});
