/**
 * Integration tests for the orchestrator, run against a real temp directory
 * shaped like a public-repo checkout (fs I/O; network is stubbed via
 * `fetchImpl` injection — see stubFetch below — so this suite never makes a
 * real HTTP call, while still exercising a genuine download→resize→write
 * path against a real in-memory image).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { publishReview, publishStory, updateReview, updateStory, takedownReview, takedownStory } from './publish.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// Normalized to LF on read: a Windows checkout (core.autocrlf) turns these
// fixture .txt files into CRLF on disk, which silently broke every test
// below that edits the fixture text with a literal `\n`-embedded
// `.replace()` (pre-existing bug, found and fixed in this same session —
// parseReviewForm/parseStoryForm themselves already normalize CRLF
// internally, so this only affects the TEST's own string surgery, never
// production behavior).
const fixtureBody = (name) => readFileSync(join(here, 'fixtures', name), 'utf8').replace(/\r\n/g, '\n');

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
  // MULTI-GENRE: the fixture checks BOTH "Hip-Hop / R&B" and "Rock" — both
  // ids land in `buckets`, in the order the form listed them.
  assert.match(albumYaml, /\nbuckets: \[hiphop-rnb, rock\]\n/);
  const reviewMd = readFileSync(join(root, 'content', 'reviews', 'phoebe-bridgers-lost-weekend.md'), 'utf8');
  assert.match(reviewMd, /album: phoebe-bridgers-lost-weekend/);
  assert.match(reviewMd, /score: "8\.4"/);

  const coverPath = join(root, 'public', 'covers', 'phoebe-bridgers-lost-weekend.jpg');
  assert.ok(existsSync(coverPath), 'cover master must be written');
  const meta = await sharp(readFileSync(coverPath)).metadata();
  assert.equal(meta.width, 640, 'the 900px source must be capped to 640px (ADR-0008 §2)');
});

test('publishReview: no artist-slug hint AND an all-Korean name — auto-generates a deterministic slug and NOTES it (2026-09-08, no more PD-SLUG-EMPTY)', async (t) => {
  const root = makeFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // Regex, not a literal string: a checkout with CRLF line endings (e.g.
  // Windows, core.autocrlf=true) would otherwise silently fail to match and
  // leave the hint in place, testing nothing.
  const body = fixtureBody('review-form-body.txt').replace(
    /### \(선택\) 아티스트 영문 표기\r?\n\r?\nphoebe-bridgers/,
    '### (선택) 아티스트 영문 표기\n\n_No response_',
  );

  const result = await publishReview({ issueBody: body, publicRepoDir: root, fetchImpl: stubFetch });
  assert.equal(result.ok, true);
  // fallbackSlug('artist', '피비 브리저스') — no ASCII survives, so it is
  // "artist-" + the deterministic content hash (see slugify.test.mjs).
  assert.match(result.slug, /^artist-[a-f0-9]{6}-lost-weekend$/);
  assert.ok(existsSync(join(root, 'content', 'artists', `${result.slug.replace(/-lost-weekend$/, '')}.md`)));
  // The writer never typed this URL segment — the success `notes` must say so.
  assert.equal(result.notes.length, 1);
  assert.match(result.notes[0], /아티스트 "피비 브리저스"의 인터넷 주소를 자동으로/);
  assert.match(result.notes[0], /User\(개발 담당\)에게 알려/);

  // Re-submitting the SAME issue (a writer's retry) must NOT create a second
  // artist file — the fallback slug is deterministic, so findArtistByName
  // still resolves it as an update to the same artist next time.
  const artists = readFileSync(join(root, 'content', 'artists', `${result.slug.replace(/-lost-weekend$/, '')}.md`), 'utf8');
  assert.match(artists, /name: "피비 브리저스"/);
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
    'title: Lost Weekend\nartists: [phoebe-bridgers]\nrelease_date: "2026"\nbuckets: [rock]\ncover: covers/phoebe-bridgers-lost-weekend.jpg\ncover_source: "curated by hand"\n',
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
    'title: Lost Weekend\nartists: [phoebe-bridgers]\nrelease_date: "2026"\nbuckets: [rock]\n',
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

test('publishReview: "그 외" writes buckets: [etc] for a brand new album', async (t) => {
  const root = makeFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = await publishReview({ issueBody: fixtureBody('review-form-body-minimal.txt'), publicRepoDir: root, fetchImpl: stubFetch });
  assert.equal(result.ok, true);
  const albumYaml = readFileSync(join(root, 'content', 'albums', `${result.slug}.yaml`), 'utf8');
  assert.match(albumYaml, /buckets: \[etc\]/);
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
    'title: Lost Weekend\nartists: [phoebe-bridgers]\nrelease_date: "2026"\nbuckets: [rock]\n',
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

test('publishReview: score 8.35 (a real E-105 case) still marks the artist as freshly created (createdArtistSlug)', async (t) => {
  const root = makeFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = await publishReview({ issueBody: fixtureBody('review-form-body-minimal.txt'), publicRepoDir: root, fetchImpl: stubFetch });
  assert.equal(result.ok, true);
  assert.equal(result.action, 'publish');
  assert.ok(result.createdArtistSlug, 'a brand new artist must be reported so a build-failure comment can filter a derived E-113');
});

test('publishReview: reusing an existing artist never reports createdArtistSlug', async (t) => {
  const root = makeFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'content', 'artists', 'phoebe-bridgers.md'), '---\nname: 피비 브리저스\n---\n', 'utf8');
  const result = await publishReview({ issueBody: fixtureBody('review-form-body.txt'), publicRepoDir: root, fetchImpl: stubFetch });
  assert.equal(result.createdArtistSlug, undefined);
});

// ── update / takedown — exercised against a REAL git repo (not a stub), so
// the whole path (resolve-published.mjs's git plumbing INCLUDED) is proven
// end to end, the same way resolve-published.test.mjs proves the plumbing
// in isolation. ──

function gitRun(cmd, cwd) {
  return execFileSync('sh', ['-c', cmd], { cwd, encoding: 'utf8' });
}

/** A fixture repo that has ALREADY been through one successful `publish`,
 * committed exactly the way .github/workflows/publish.yml's own "Commit and
 * push" step does — the one convention resolve-published.mjs depends on. */
async function makePublishedFixtureRepo({ issueNumber = 7, issueBody = fixtureBody('review-form-body.txt'), kind = 'review' } = {}) {
  const root = makeFixtureRepo();
  gitRun('git init -q -b main', root);
  gitRun('git config user.email "actions@users.noreply.github.com"', root);
  gitRun('git config user.name "undernote publish desk"', root);

  const result = kind === 'story' ? await publishStory({ issueBody, publicRepoDir: root }) : await publishReview({ issueBody, publicRepoDir: root, fetchImpl: stubFetch });
  // Two `-m` flags == two paragraphs, matching EXACTLY what publish.yml's own
  // "Commit and push" step produces (title paragraph, blank line, then the
  // "Issue-Number: N" trailer on its own line) — resolve-published.mjs's
  // grep depends on this shape (MJ-1).
  gitRun(`git add -A && git commit -q -m "발행: title" -m "Issue-Number: ${issueNumber}"`, root);
  return { root, result };
}

test('updateReview: body + score + cover change and are applied; date is frozen to the ORIGINAL publish date', async (t) => {
  const { root, result } = await makePublishedFixtureRepo({ issueNumber: 7 });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const originalDateLine = readFileSync(join(root, 'content', 'reviews', `${result.slug}.md`), 'utf8').match(/^date: .+$/m)[0];

  const editedBody = fixtureBody('review-form-body.txt')
    .replace('8.4', '9.0')
    .replace('나는 음악을 찾아서 듣는 편이 아니다', '고친 문장이다');

  const outcome = await updateReview({ issueBody: editedBody, issueNumber: 7, publicRepoDir: root, fetchImpl: stubFetch });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.action, 'update');
  assert.equal(outcome.slug, result.slug);

  const reviewMd = readFileSync(join(root, 'content', 'reviews', `${result.slug}.md`), 'utf8');
  assert.match(reviewMd, /score: "9\.0"/);
  assert.match(reviewMd, /고친 문장이다/);
  // date: unchanged from the original publish, even though the edit landed
  // "later" — R-1's tie-break and the archive's publication-year axis both
  // key off it, so an edit must never move it.
  assert.match(reviewMd, new RegExp(originalDateLine.replace('.', '\\.')));
});

test('updateReview: changing the album title is REJECTED with PD-IDENTITY-LOCKED, and writes nothing', async (t) => {
  const { root, result } = await makePublishedFixtureRepo({ issueNumber: 7 });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const before = readFileSync(join(root, 'content', 'reviews', `${result.slug}.md`), 'utf8');

  const editedBody = fixtureBody('review-form-body.txt').replace('Lost Weekend', 'A Completely Different Album');
  await assert.rejects(
    () => updateReview({ issueBody: editedBody, issueNumber: 7, publicRepoDir: root, fetchImpl: stubFetch }),
    (err) => {
      assert.equal(err.code, 'PD-IDENTITY-LOCKED');
      assert.match(err.message, /앨범명/);
      return true;
    },
  );
  assert.equal(readFileSync(join(root, 'content', 'reviews', `${result.slug}.md`), 'utf8'), before, 'nothing may be written on rejection');
});

test('updateReview: changing the release date is REJECTED', async (t) => {
  const { root } = await makePublishedFixtureRepo({ issueNumber: 7 });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const editedBody = fixtureBody('review-form-body.txt').replace('2026', '2020');
  await assert.rejects(
    () => updateReview({ issueBody: editedBody, issueNumber: 7, publicRepoDir: root, fetchImpl: stubFetch }),
    (err) => {
      assert.equal(err.code, 'PD-IDENTITY-LOCKED');
      assert.match(err.message, /발매일/);
      return true;
    },
  );
});

test('updateReview: an unresolvable genre label still fails with PD-GENRE-UNKNOWN (config drift, not an identity change)', async (t) => {
  const { root } = await makePublishedFixtureRepo({ issueNumber: 7 });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const editedBody = fixtureBody('review-form-body.txt').replace('Rock', 'Jazz');
  await assert.rejects(
    () => updateReview({ issueBody: editedBody, issueNumber: 7, publicRepoDir: root, fetchImpl: stubFetch }),
    (err) => {
      assert.equal(err.code, 'PD-GENRE-UNKNOWN');
      return true;
    },
  );
});

// MULTI-GENRE (2026-09-08): the identity check on `buckets` compares SETS,
// not arrays — the resolved order at edit time is not guaranteed to match
// whatever order the ORIGINAL publish happened to record (config/genres.yaml
// or the Issue Form's own checkbox order could both have changed in the
// meantime). This is exercised against a hand-built git history (not
// `makePublishedFixtureRepo`, which always writes buckets in today's
// resolution order) so the mismatch is real, not incidental.
test('updateReview: original buckets recorded in a DIFFERENT order than today\'s resolution — same set, NOT rejected', async (t) => {
  const root = makeFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  gitRun('git init -q -b main', root);
  gitRun('git config user.email "actions@users.noreply.github.com"', root);
  gitRun('git config user.name "undernote publish desk"', root);

  // review-form-body.txt checks "Hip-Hop / R&B" then "Rock", in that
  // template order — resolveGenreBuckets would resolve today's submission to
  // [hiphop-rnb, rock]. The ORIGINAL publish is hand-written here with the
  // OPPOSITE order to prove the comparison ignores it.
  writeFileSync(join(root, 'content', 'artists', 'phoebe-bridgers.md'), '---\nname: "피비 브리저스"\n---\n', 'utf8');
  writeFileSync(
    join(root, 'content', 'albums', 'phoebe-bridgers-lost-weekend.yaml'),
    'title: "Lost Weekend"\nartists: [phoebe-bridgers]\nrelease_date: "2026"\nbuckets: [rock, hiphop-rnb]\n',
    'utf8',
  );
  writeFileSync(
    join(root, 'content', 'reviews', 'phoebe-bridgers-lost-weekend.md'),
    '---\nalbum: phoebe-bridgers-lost-weekend\nscore: "8.4"\ndate: 2026-09-06\neditorial_check: true\n---\n\n원래 본문\n',
    'utf8',
  );
  gitRun('git add -A && git commit -q -m "발행: title" -m "Issue-Number: 7"', root);

  const outcome = await updateReview({ issueBody: fixtureBody('review-form-body.txt'), issueNumber: 7, publicRepoDir: root, fetchImpl: stubFetch });
  assert.equal(outcome.ok, true, 'the same genre SET in a different stored order must never be treated as an identity change');
});

test('updateReview: dropping a previously-selected genre is REJECTED, and the message names it as removed (제외됨)', async (t) => {
  const { root } = await makePublishedFixtureRepo({ issueNumber: 7 });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // review-form-body.txt originally checks both "Hip-Hop / R&B" and "Rock" —
  // unchecking Rock alone must be reported as a REMOVAL, not a generic diff.
  const editedBody = fixtureBody('review-form-body.txt').replace('- [X] Rock', '- [ ] Rock');
  await assert.rejects(
    () => updateReview({ issueBody: editedBody, issueNumber: 7, publicRepoDir: root, fetchImpl: stubFetch }),
    (err) => {
      assert.equal(err.code, 'PD-IDENTITY-LOCKED');
      assert.match(err.message, /제외됨: rock/);
      assert.doesNotMatch(err.message, /추가됨/, 'nothing was added, so that half of the message must not appear');
      return true;
    },
  );
});

test('updateReview: checking an ADDITIONAL genre is REJECTED, and the message names it as added (추가됨)', async (t) => {
  const { root } = await makePublishedFixtureRepo({ issueNumber: 7 });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const editedBody = fixtureBody('review-form-body.txt').replace('- [ ] Pop', '- [X] Pop');
  await assert.rejects(
    () => updateReview({ issueBody: editedBody, issueNumber: 7, publicRepoDir: root, fetchImpl: stubFetch }),
    (err) => {
      assert.equal(err.code, 'PD-IDENTITY-LOCKED');
      assert.match(err.message, /추가됨: pop/);
      assert.doesNotMatch(err.message, /제외됨/, 'nothing was removed, so that half of the message must not appear');
      return true;
    },
  );
});

test('updateStory: body changes; title change is REJECTED', async (t) => {
  const { root, result } = await makePublishedFixtureRepo({ issueNumber: 12, kind: 'story', issueBody: fixtureBody('story-form-body.txt') });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const editedBody = fixtureBody('story-form-body.txt').replace('그 해 여름은', '고친 문장, 그 해 여름은');
  const outcome = await updateStory({ issueBody: editedBody, issueNumber: 12, publicRepoDir: root });
  assert.equal(outcome.ok, true);
  const storyMd = readFileSync(join(root, 'content', 'stories', `${result.slug}.md`), 'utf8');
  assert.match(storyMd, /고친 문장/);

  const titleChanged = fixtureBody('story-form-body.txt').replace('93년 여름의 플레이리스트', '다른 제목');
  await assert.rejects(
    () => updateStory({ issueBody: titleChanged, issueNumber: 12, publicRepoDir: root }),
    (err) => {
      assert.equal(err.code, 'PD-IDENTITY-LOCKED');
      return true;
    },
  );
});

test('takedownReview: deletes review + album + cover + artist when nothing else references them', async (t) => {
  const { root, result } = await makePublishedFixtureRepo({ issueNumber: 7 });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const outcome = await takedownReview({ issueNumber: 7, publicRepoDir: root });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.action, 'takedown');
  assert.equal(outcome.url, null);
  assert.equal(existsSync(join(root, 'content', 'reviews', `${result.slug}.md`)), false);
  assert.equal(existsSync(join(root, 'content', 'albums', `${result.slug}.yaml`)), false);
  assert.equal(existsSync(join(root, 'content', 'artists', 'phoebe-bridgers.md')), false);
  assert.match(outcome.notes.join(' '), /아티스트 페이지도 함께 내렸습니다/);
});

test('takedownReview: refuses when the review is frozen into a confirmed year-end snapshot', async (t) => {
  const { root, result } = await makePublishedFixtureRepo({ issueNumber: 7 });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'content', 'snapshots'), { recursive: true });
  writeFileSync(
    join(root, 'content', 'snapshots', 'y2026.md'),
    [
      '---',
      'year: 2026',
      'finalized_at: 2026-12-31T00:00:00.000Z',
      `top10:\n  - { rank: 1, album: ${result.slug}, title: "T", artists_label: "A", score: "8.4" }`,
      'buckets: []',
      '---',
      '',
    ].join('\n'),
    'utf8',
  );

  await assert.rejects(
    () => takedownReview({ issueNumber: 7, publicRepoDir: root }),
    (err) => {
      assert.equal(err.code, 'PD-TAKEDOWN-LOCKED');
      assert.match(err.message, /2026/);
      return true;
    },
  );
  assert.equal(existsSync(join(root, 'content', 'reviews', `${result.slug}.md`)), true, 'the review must survive an unresolved takedown');
});

test('takedownStory: deletes the story and any artist reachable only through it', async (t) => {
  const { root, result } = await makePublishedFixtureRepo({ issueNumber: 12, kind: 'story', issueBody: fixtureBody('story-form-body.txt') });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const outcome = await takedownStory({ issueNumber: 12, publicRepoDir: root });
  assert.equal(outcome.ok, true);
  assert.equal(existsSync(join(root, 'content', 'stories', `${result.slug}.md`)), false);
});
