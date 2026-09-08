import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planReviewTakedown, planStoryTakedown, lockedSnapshotYears } from './takedown.mjs';

function writeArtist(root, slug, name) {
  writeFileSync(join(root, 'content', 'artists', `${slug}.md`), `---\nname: "${name}"\n---\n`, 'utf8');
}
function writeAlbum(root, slug, { title, artists, bucket = 'rock' }) {
  // `bucket` here is just this test's own shorthand for "one bucket id" —
  // written as the real (MULTI-GENRE, 2026-09-08) `buckets: [...]` array
  // field so this fixture matches the actual album.yaml shape. takedown.mjs
  // never reads this field at all (genre plays no part in reachability), so
  // this is fixture realism only, not a behavior this test exercises.
  writeFileSync(
    join(root, 'content', 'albums', `${slug}.yaml`),
    `title: "${title}"\nartists: [${artists.join(', ')}]\nrelease_date: "2026"\nbuckets: [${bucket}]\ncover: covers/${slug}.jpg\n`,
    'utf8',
  );
}
function writeReview(root, slug) {
  writeFileSync(
    join(root, 'content', 'reviews', `${slug}.md`),
    `---\nalbum: ${slug}\nscore: "8.0"\ndate: 2026-09-01\neditorial_check: true\n---\n\n본문\n`,
    'utf8',
  );
}
function writeStory(root, slug, refs) {
  const albumsYaml = refs.length === 0 ? 'albums: []' : `albums:\n${refs.map((r) => `  - { ref: ${r} }`).join('\n')}`;
  writeFileSync(join(root, 'content', 'stories', `${slug}.md`), `---\ntitle: "${slug}"\ndate: 2026-09-01\n${albumsYaml}\n---\n\n본문\n`, 'utf8');
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'publish-desk-takedown-'));
  for (const d of ['artists', 'albums', 'reviews', 'stories', 'snapshots']) mkdirSync(join(root, 'content', d), { recursive: true });
  mkdirSync(join(root, 'public', 'covers'), { recursive: true });
  return root;
}

test('planReviewTakedown: sole review of a sole-artist album — deletes review, album, cover, and artist', (t) => {
  const root = makeRoot();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeArtist(root, 'phoebe-bridgers', 'Phoebe Bridgers');
  writeAlbum(root, 'phoebe-bridgers-lost-weekend', { title: 'Lost Weekend', artists: ['phoebe-bridgers'] });
  writeReview(root, 'phoebe-bridgers-lost-weekend');
  writeFileSync(join(root, 'public', 'covers', 'phoebe-bridgers-lost-weekend.jpg'), Buffer.from([0]));

  const plan = planReviewTakedown({ slug: 'phoebe-bridgers-lost-weekend', publicRepoDir: root });
  assert.equal(plan.deleteAlbum, true);
  assert.deepEqual(plan.deleteArtists, ['phoebe-bridgers']);
  assert.deepEqual(
    [...plan.deleteFiles].sort(),
    [
      'content/albums/phoebe-bridgers-lost-weekend.yaml',
      'content/artists/phoebe-bridgers.md',
      'content/reviews/phoebe-bridgers-lost-weekend.md',
      'public/covers/phoebe-bridgers-lost-weekend.jpg',
    ].sort(),
  );
});

test('planReviewTakedown: artist has ANOTHER review — artist file survives', (t) => {
  const root = makeRoot();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeArtist(root, 'phoebe-bridgers', 'Phoebe Bridgers');
  writeAlbum(root, 'album-a', { title: 'A', artists: ['phoebe-bridgers'] });
  writeAlbum(root, 'album-b', { title: 'B', artists: ['phoebe-bridgers'] });
  writeReview(root, 'album-a');
  writeReview(root, 'album-b');

  const plan = planReviewTakedown({ slug: 'album-a', publicRepoDir: root });
  assert.equal(plan.deleteAlbum, true);
  assert.deepEqual(plan.deleteArtists, [], 'still reachable through album-b\'s review');
  assert.deepEqual(plan.deleteFiles, ['content/reviews/album-a.md', 'content/albums/album-a.yaml']);
});

test('planReviewTakedown: a STORY still {ref}-erences the album — album AND artist both survive', (t) => {
  const root = makeRoot();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeArtist(root, 'phoebe-bridgers', 'Phoebe Bridgers');
  writeAlbum(root, 'phoebe-bridgers-lost-weekend', { title: 'Lost Weekend', artists: ['phoebe-bridgers'] });
  writeReview(root, 'phoebe-bridgers-lost-weekend');
  writeStory(root, '93-summer', ['phoebe-bridgers-lost-weekend']);

  const plan = planReviewTakedown({ slug: 'phoebe-bridgers-lost-weekend', publicRepoDir: root });
  assert.equal(plan.deleteAlbum, false);
  assert.deepEqual(plan.deleteArtists, []);
  assert.deepEqual(plan.deleteFiles, ['content/reviews/phoebe-bridgers-lost-weekend.md']);
});

test('planReviewTakedown: a story mentions the artist only as free TEXT — that does not keep the artist reachable', (t) => {
  const root = makeRoot();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeArtist(root, 'phoebe-bridgers', 'Phoebe Bridgers');
  writeAlbum(root, 'phoebe-bridgers-lost-weekend', { title: 'Lost Weekend', artists: ['phoebe-bridgers'] });
  writeReview(root, 'phoebe-bridgers-lost-weekend');
  // A story that only free-text-mentions the artist (no {ref}) carries no
  // reachability — same rule as src/lib/derive/archive.ts#deriveArchiveIndex.
  writeFileSync(
    join(root, 'content', 'stories', 'mention.md'),
    '---\ntitle: "mention"\ndate: 2026-09-01\nalbums:\n  - { text: "Lost Weekend", artist: "Phoebe Bridgers" }\n---\n\n본문\n',
    'utf8',
  );

  const plan = planReviewTakedown({ slug: 'phoebe-bridgers-lost-weekend', publicRepoDir: root });
  assert.equal(plan.deleteAlbum, true);
  assert.deepEqual(plan.deleteArtists, ['phoebe-bridgers']);
});

test('planReviewTakedown: multi-artist album — only the artist who has no OTHER reason to exist is removed', (t) => {
  const root = makeRoot();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeArtist(root, 'artist-a', 'Artist A');
  writeArtist(root, 'artist-b', 'Artist B');
  writeAlbum(root, 'collab', { title: 'Collab', artists: ['artist-a', 'artist-b'] });
  writeAlbum(root, 'solo-b', { title: 'Solo B', artists: ['artist-b'] });
  writeReview(root, 'collab');
  writeReview(root, 'solo-b');

  const plan = planReviewTakedown({ slug: 'collab', publicRepoDir: root });
  assert.equal(plan.deleteAlbum, true);
  assert.deepEqual(plan.deleteArtists, ['artist-a']);
});

test('planStoryTakedown: deletes the story, and an artist reachable ONLY through it', (t) => {
  const root = makeRoot();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeArtist(root, 'phoebe-bridgers', 'Phoebe Bridgers');
  writeAlbum(root, 'phoebe-bridgers-lost-weekend', { title: 'Lost Weekend', artists: ['phoebe-bridgers'] });
  // No review — the ONLY thing making this artist reachable is the story ref.
  writeStory(root, '93-summer', ['phoebe-bridgers-lost-weekend']);

  const plan = planStoryTakedown({ slug: '93-summer', publicRepoDir: root });
  assert.deepEqual(plan.deleteFiles, ['content/stories/93-summer.md', 'content/artists/phoebe-bridgers.md']);
  assert.deepEqual(plan.deleteArtists, ['phoebe-bridgers']);
});

test('planStoryTakedown: a REVIEW also keeps the artist reachable — artist file survives, no album/review touched', (t) => {
  const root = makeRoot();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeArtist(root, 'phoebe-bridgers', 'Phoebe Bridgers');
  writeAlbum(root, 'phoebe-bridgers-lost-weekend', { title: 'Lost Weekend', artists: ['phoebe-bridgers'] });
  writeReview(root, 'phoebe-bridgers-lost-weekend');
  writeStory(root, '93-summer', ['phoebe-bridgers-lost-weekend']);

  const plan = planStoryTakedown({ slug: '93-summer', publicRepoDir: root });
  assert.deepEqual(plan.deleteFiles, ['content/stories/93-summer.md']);
  assert.deepEqual(plan.deleteArtists, []);
});

test('lockedSnapshotYears: an album referenced by a top10 entry is locked', (t) => {
  const root = makeRoot();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, 'content', 'snapshots', 'y2026.md'),
    [
      '---',
      'year: 2026',
      'finalized_at: 2026-12-31T00:00:00.000Z',
      'top10:',
      '  - { rank: 1, album: locked-album, title: "T", artists_label: "A", score: "9.0" }',
      'buckets: []',
      '---',
      '',
    ].join('\n'),
    'utf8',
  );
  assert.deepEqual(lockedSnapshotYears('locked-album', root), [2026]);
  assert.deepEqual(lockedSnapshotYears('free-album', root), []);
});

test('lockedSnapshotYears: a bucket nominee (not just the winner) also locks the album', (t) => {
  const root = makeRoot();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, 'content', 'snapshots', 'y2026.md'),
    [
      '---',
      'year: 2026',
      'finalized_at: 2026-12-31T00:00:00.000Z',
      'top10: []',
      'buckets:',
      '  - { id: rock, label: Rock, published: true, winner: winner-album, nominees: [{ album: nominee-album, title: "N", artists_label: "A", score: "8.0" }] }',
      '---',
      '',
    ].join('\n'),
    'utf8',
  );
  assert.deepEqual(lockedSnapshotYears('nominee-album', root), [2026]);
  assert.deepEqual(lockedSnapshotYears('winner-album', root), [2026]);
});
