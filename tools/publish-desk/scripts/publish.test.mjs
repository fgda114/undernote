/**
 * Integration tests for the orchestrator, run against a real temp directory
 * shaped like a public-repo checkout (fs I/O; network is stubbed via
 * `fetchImpl` injection — see stubFetch below — so this suite never makes a
 * real HTTP call, while still exercising a genuine download→resize→write
 * path against a real in-memory image).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { publishReview, publishStory } from './publish.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureBody = (name) => readFileSync(join(here, 'fixtures', name), 'utf8');

/** A fetch stub that returns a real (synthetic) JPEG for ANY url — used
 * everywhere a fixture happens to carry a dropped-image URL but the test
 * itself isn't about cover handling. */
async function stubFetch() {
  const bytes = await sharp({ create: { width: 900, height: 900, channels: 3, background: { r: 20, g: 20, b: 20 } } })
    .jpeg()
    .toBuffer();
  return new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
}

/** Asserts the promise rejects with a PdError carrying exactly this code —
 * checked against `err.code`, not a regex over the stringified error,
 * because the human-readable message text does not repeat the code. */
async function rejectsWithCode(fn, code) {
  await assert.rejects(fn, (err) => {
    assert.equal(err.code, code, `expected code ${code}, got ${err.code}: ${err.message}`);
    return true;
  });
}

function makeFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), 'publish-desk-orch-'));
  mkdirSync(join(root, 'content', 'artists'), { recursive: true });
  mkdirSync(join(root, 'content', 'albums'), { recursive: true });
  mkdirSync(join(root, 'content', 'reviews'), { recursive: true });
  mkdirSync(join(root, 'content', 'stories'), { recursive: true });
  mkdirSync(join(root, 'config'), { recursive: true });
  writeFileSync(
    join(root, 'config', 'genres.yaml'),
    [
      'years:',
      '  - year: 2026',
      '    buckets:',
      '      - { id: "hiphop-rnb", label: "Hip-Hop / R&B", order: 1 }',
      '      - { id: "pop", label: "Pop", order: 2 }',
      '      - { id: "rock", label: "Rock", order: 3 }',
      '    min_reviews_to_publish: 3',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(join(root, 'config', 'site.yaml'), 'site_name: "test"\nbase_url: "https://example.com/undernote"\nactive_year: 2026\n', 'utf8');
  return root;
}

test('publishReview: brand new artist + album + cover — writes all files, cover resized to <=640px', async (t) => {
  const root = makeFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  // The fixture's artist name ("피비 브리저스") is all-Korean, so it relies on
  // the "(선택) 아티스트 영문 표기" hint ("phoebe-bridgers") to get a slug at
  // all — without it this fails with PD-SLUG-EMPTY (covered below). The
  // fixture also carries a dropped-image URL, exercised here via stubFetch.
  const result = await publishReview({ issueBody: fixtureBody('review-form-body.txt'), publicRepoDir: root, fetchImpl: stubFetch });

  assert.equal(result.ok, true);
  assert.equal(result.kind, 'review');
  // Album slug = combinedSlug([artistSlug, title]) — the RESOLVED artist
  // slug, not the raw (Korean) name, per resolveAlbum's doc comment.
  assert.equal(result.slug, 'phoebe-bridgers-lost-weekend');
  assert.equal(result.url, 'https://example.com/undernote/reviews/phoebe-bridgers-lost-weekend/');

  assert.ok(existsSync(join(root, 'content', 'artists', 'phoebe-bridgers.md')), 'new artist file must be created');
  const albumYaml = readFileSync(join(root, 'content', 'albums', 'phoebe-bridgers-lost-weekend.yaml'), 'utf8');
  assert.match(albumYaml, /cover: covers\/phoebe-bridgers-lost-weekend\.jpg/);
  const reviewMd = readFileSync(join(root, 'content', 'reviews', 'phoebe-bridgers-lost-weekend.md'), 'utf8');
  assert.match(reviewMd, /album: phoebe-bridgers-lost-weekend/);
  assert.match(reviewMd, /score: "8\.4"/);

  const coverPath = join(root, 'public', 'covers', 'phoebe-bridgers-lost-weekend.jpg');
  assert.ok(existsSync(coverPath), 'cover master must be written');
  const meta = await sharp(readFileSync(coverPath)).metadata();
  assert.equal(meta.width, 640, 'the 900px source must be capped to 640px (ADR-0008 §2)');
});

test('publishReview: no artist-slug hint AND an all-Korean name fails with PD-SLUG-EMPTY (not a silent guess)', async (t) => {
  const root = makeFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const body = fixtureBody('review-form-body.txt').replace(
    '### (선택) 아티스트 영문 표기\n\nphoebe-bridgers',
    '### (선택) 아티스트 영문 표기\n\n_No response_',
  );

  await rejectsWithCode(() => publishReview({ issueBody: body, publicRepoDir: root, fetchImpl: stubFetch }), 'PD-SLUG-EMPTY');
});

test('publishReview: reuses an existing artist by exact name match — no second artist file', async (t) => {
  const root = makeFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'content', 'artists', 'phoebe-bridgers.md'), '---\nname: 피비 브리저스\n---\n', 'utf8');

  const result = await publishReview({ issueBody: fixtureBody('review-form-body.txt'), publicRepoDir: root, fetchImpl: stubFetch });

  assert.equal(result.ok, true);
  assert.equal(existsSync(join(root, 'content', 'artists', 'phoebe-bridgers-2.md')), false);
});

test('publishReview: reuses an existing album, leaves its file untouched, and notes the cover was skipped', async (t) => {
  const root = makeFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'content', 'artists', 'phoebe-bridgers.md'), '---\nname: 피비 브리저스\n---\n', 'utf8');
  writeFileSync(
    join(root, 'content', 'albums', 'phoebe-bridgers-lost-weekend.yaml'),
    'title: Lost Weekend\nartists: [phoebe-bridgers]\nrelease_date: "2026"\nbucket: rock\ncover: covers/phoebe-bridgers-lost-weekend.jpg\ncover_source: "curated by hand"\n',
    'utf8',
  );

  const result = await publishReview({ issueBody: fixtureBody('review-form-body.txt'), publicRepoDir: root, fetchImpl: stubFetch });

  assert.equal(result.ok, true);
  assert.equal(result.slug, 'phoebe-bridgers-lost-weekend');
  const albumYaml = readFileSync(join(root, 'content', 'albums', 'phoebe-bridgers-lost-weekend.yaml'), 'utf8');
  assert.match(albumYaml, /curated by hand/, 'existing album file must be left untouched');
  assert.match(result.notes.join(' '), /이번에 올린 커버 이미지는 반영되지 않았습니다/);
});

test('publishReview: refuses to overwrite when a review already exists for the album (1 album = 1 review)', async (t) => {
  const root = makeFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'content', 'artists', 'phoebe-bridgers.md'), '---\nname: 피비 브리저스\n---\n', 'utf8');
  writeFileSync(
    join(root, 'content', 'albums', 'phoebe-bridgers-lost-weekend.yaml'),
    'title: Lost Weekend\nartists: [phoebe-bridgers]\nrelease_date: "2026"\nbucket: rock\n',
    'utf8',
  );
  writeFileSync(
    join(root, 'content', 'reviews', 'phoebe-bridgers-lost-weekend.md'),
    '---\nalbum: x\nscore: "1.0"\ndate: 2020-01-01\neditorial_check: true\n---\n\nold\n',
    'utf8',
  );

  await rejectsWithCode(
    () => publishReview({ issueBody: fixtureBody('review-form-body.txt'), publicRepoDir: root, fetchImpl: stubFetch }),
    'PD-REVIEW-EXISTS',
  );
});

test('publishReview: an unresolvable genre label (config drift) fails with PD-GENRE-UNKNOWN, before any file is written', async (t) => {
  const root = makeFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const body = fixtureBody('review-form-body.txt').replace('Rock', 'Jazz');

  await rejectsWithCode(() => publishReview({ issueBody: body, publicRepoDir: root, fetchImpl: stubFetch }), 'PD-GENRE-UNKNOWN');
  // Resolve-before-commit (mirrors album-add.ts): a genre failure must leave
  // no orphan artist file for the next build to reject with E-113.
  assert.equal(existsSync(join(root, 'content', 'artists', 'phoebe-bridgers.md')), false);
});

test('publishReview: "그 외" writes bucket: etc for a brand new album', async (t) => {
  const root = makeFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = await publishReview({ issueBody: fixtureBody('review-form-body-minimal.txt'), publicRepoDir: root, fetchImpl: stubFetch });
  assert.equal(result.ok, true);
  const albumYaml = readFileSync(join(root, 'content', 'albums', `${result.slug}.yaml`), 'utf8');
  assert.match(albumYaml, /bucket: etc/);
  const reviewMd = readFileSync(join(root, 'content', 'reviews', `${result.slug}.md`), 'utf8');
  assert.match(reviewMd, /score: "8\.35"/); // malformed on purpose — left to the real build to catch (E-105)
});

test('publishReview: a cover field with no recognizable image fails with PD-COVER-NOT-IMAGE', async (t) => {
  const root = makeFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const body = fixtureBody('review-form-body.txt').replace(/!\[.*?\]\(.*?\)/, '그냥 텍스트를 붙여넣었어요');

  await rejectsWithCode(() => publishReview({ issueBody: body, publicRepoDir: root, fetchImpl: stubFetch }), 'PD-COVER-NOT-IMAGE');
});

test('publishReview: a cover download failure fails with PD-COVER-FETCH-FAILED and writes nothing', async (t) => {
  const root = makeFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const failingFetch = async () => new Response('nope', { status: 404 });

  await rejectsWithCode(
    () => publishReview({ issueBody: fixtureBody('review-form-body.txt'), publicRepoDir: root, fetchImpl: failingFetch }),
    'PD-COVER-FETCH-FAILED',
  );
  assert.equal(existsSync(join(root, 'content', 'artists', 'phoebe-bridgers.md')), false);
});

test('publishStory: writes a story with a resolved ref and an unresolved text mention', async (t) => {
  const root = makeFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'content', 'artists', 'phoebe-bridgers.md'), '---\nname: 피비 브리저스\n---\n', 'utf8');
  writeFileSync(
    join(root, 'content', 'albums', 'phoebe-bridgers-lost-weekend.yaml'),
    'title: Lost Weekend\nartists: [phoebe-bridgers]\nrelease_date: "2026"\nbucket: rock\n',
    'utf8',
  );

  const result = await publishStory({ issueBody: fixtureBody('story-form-body.txt'), publicRepoDir: root });

  assert.equal(result.ok, true);
  assert.equal(result.kind, 'story');
  const storyMd = readFileSync(join(root, 'content', 'stories', `${result.slug}.md`), 'utf8');
  assert.match(storyMd, /- \{ ref: phoebe-bridgers-lost-weekend \}/);
  assert.match(storyMd, /- \{ text: "아직 평론 없는 어떤 앨범", artist: "아직 모르는 아티스트" \}/);
});

test('publishStory: title collision is avoided, not failed (two stories, same title)', async (t) => {
  const root = makeFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const body = ['### 제목', '', 'Same Title', '', '### 언급한 앨범들 (있으면)', '', '_No response_', '', '### 글', '', '첫 번째.', ''].join('\n');

  const first = await publishStory({ issueBody: body, publicRepoDir: root });
  const second = await publishStory({ issueBody: body, publicRepoDir: root });

  assert.equal(first.slug, 'same-title');
  assert.equal(second.slug, 'same-title-2');
});
