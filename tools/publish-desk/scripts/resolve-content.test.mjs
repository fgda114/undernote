import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  normalizeName,
  listArtists,
  listAlbums,
  listReviews,
  listStories,
  listSnapshots,
  existingSlugSet,
  findArtistByName,
  findAlbumByTitleArtist,
  resolveGenreBucket,
  resolveGenreBuckets,
  allConfiguredGenreLabels,
  missingGenreFormOptions,
  loadTagRegistry,
  resolveTags,
} from './resolve-content.mjs';
import { hashSlugFragment } from './slugify.mjs';

/** Build a minimal fixture "public repo" checkout — just enough of
 * content/{artists,albums} and config/genres.yaml for these functions. */
function makeFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), 'publish-desk-test-'));
  mkdirSync(join(root, 'content', 'artists'), { recursive: true });
  mkdirSync(join(root, 'content', 'albums'), { recursive: true });
  mkdirSync(join(root, 'config'), { recursive: true });

  writeFileSync(join(root, 'content', 'artists', 'phoebe-bridgers.md'), '---\nname: Phoebe Bridgers\n---\n', 'utf8');
  writeFileSync(join(root, 'content', 'artists', 'boygenius.md'), '---\nname: boygenius\n---\n', 'utf8');

  writeFileSync(
    join(root, 'content', 'albums', 'phoebe-bridgers-lost-weekend.yaml'),
    'title: lost weekend\nartists: [phoebe-bridgers]\nrelease_date: "2026"\nbuckets: [rock]\n',
    'utf8',
  );

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

  return root;
}

test('resolve-content: end-to-end against a fixture checkout', async (t) => {
  const root = makeFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  await t.test('normalizeName collapses whitespace/case/Unicode form for comparison', () => {
    assert.equal(normalizeName('  Phoebe   Bridgers '), normalizeName('phoebe bridgers'));
  });

  await t.test('listArtists reads every artist frontmatter', () => {
    const artists = listArtists(root);
    assert.deepEqual(
      artists.sort((a, b) => a.slug.localeCompare(b.slug)),
      [
        { slug: 'boygenius', name: 'boygenius' },
        { slug: 'phoebe-bridgers', name: 'Phoebe Bridgers' },
      ],
    );
  });

  await t.test('listAlbums reads every album yaml', () => {
    const albums = listAlbums(root);
    assert.equal(albums.length, 1);
    assert.equal(albums[0].slug, 'phoebe-bridgers-lost-weekend');
    assert.deepEqual(albums[0].artists, ['phoebe-bridgers']);
  });

  await t.test('existingSlugSet returns exactly the file-stem slugs', () => {
    const slugs = existingSlugSet(root, 'artists', '.md');
    assert.deepEqual([...slugs].sort(), ['boygenius', 'phoebe-bridgers']);
  });

  await t.test('findArtistByName: exact (normalized) match reuses the existing slug', () => {
    const artists = listArtists(root);
    assert.deepEqual(findArtistByName('phoebe bridgers', artists), { status: 'found', slug: 'phoebe-bridgers' });
  });

  await t.test('findArtistByName: no match reports "none"', () => {
    const artists = listArtists(root);
    assert.deepEqual(findArtistByName('Some New Artist', artists), { status: 'none' });
  });

  await t.test('findAlbumByTitleArtist: title+artist overlap reuses the existing album', () => {
    const albums = listAlbums(root);
    assert.deepEqual(findAlbumByTitleArtist('Lost Weekend', 'phoebe-bridgers', albums), {
      status: 'found',
      slug: 'phoebe-bridgers-lost-weekend',
    });
  });

  await t.test('findAlbumByTitleArtist: same title but a DIFFERENT artist is not a match', () => {
    const albums = listAlbums(root);
    assert.deepEqual(findAlbumByTitleArtist('Lost Weekend', 'boygenius', albums), { status: 'none' });
  });

  await t.test('resolveGenreBucket: "그 외" always maps to the reserved id "etc" without reading config', () => {
    assert.deepEqual(resolveGenreBucket('그 외', root), { status: 'found', id: 'etc' });
  });

  await t.test('resolveGenreBucket: matches a live config label to its id', () => {
    assert.deepEqual(resolveGenreBucket('Hip-Hop / R&B', root), { status: 'found', id: 'hiphop-rnb' });
  });

  await t.test('resolveGenreBucket: an unknown label (config drift) reports "none", never a silent guess', () => {
    assert.deepEqual(resolveGenreBucket('Jazz', root), { status: 'none' });
  });

  await t.test('resolveGenreBuckets: MULTI-GENRE — every checked label resolves to its own id, order kept', () => {
    assert.deepEqual(resolveGenreBuckets(['Rock', 'Hip-Hop / R&B'], root), { status: 'found', ids: ['rock', 'hiphop-rnb'] });
  });

  await t.test('resolveGenreBuckets: "그 외" alone resolves to ["etc"] without reading config', () => {
    assert.deepEqual(resolveGenreBuckets(['그 외'], root), { status: 'found', ids: ['etc'] });
  });

  await t.test('resolveGenreBuckets: [] resolves to an empty id list (caller decides whether that is allowed)', () => {
    assert.deepEqual(resolveGenreBuckets([], root), { status: 'found', ids: [] });
  });

  await t.test('resolveGenreBuckets: stops at the FIRST unresolvable label and names it', () => {
    assert.deepEqual(resolveGenreBuckets(['Rock', 'Jazz', 'Pop'], root), { status: 'none', label: 'Jazz' });
  });

  await t.test('allConfiguredGenreLabels: every bucket label across every year block, deduplicated', () => {
    assert.deepEqual(allConfiguredGenreLabels(root), new Set(['Hip-Hop / R&B', 'Pop', 'Rock']));
  });
});

// ── missingGenreFormOptions (2026-09-09, PD-GENRE-UNKNOWN-adjacent incident:
// config/genres.yaml split "Hip-Hop / R&B" into 8 buckets while review.yml's
// static checkboxes stayed at the old 4 — see resolve-content.mjs's own doc
// comment). Pure, so no fixture repo is needed for these. ──

test('missingGenreFormOptions: reports every configured label the form does NOT offer', () => {
  const configLabels = new Set(['Hip-Hop', 'R&B', 'Digicore', 'Rage']);
  const missing = missingGenreFormOptions(configLabels, ['Hip-Hop / R&B', 'Pop', 'Rock']);
  assert.deepEqual(new Set(missing), new Set(['Hip-Hop', 'R&B', 'Digicore', 'Rage']));
});

test('missingGenreFormOptions: returns [] when the form already offers every configured label', () => {
  const configLabels = new Set(['Rock', 'Pop']);
  assert.deepEqual(missingGenreFormOptions(configLabels, ['Rock', 'Pop', '그 외']), []);
});

test('missingGenreFormOptions: is order-independent — only presence matters', () => {
  const configLabels = new Set(['Rock', 'Pop']);
  assert.deepEqual(missingGenreFormOptions(configLabels, ['Pop', 'Rock']), []);
});

// ── resolveTags / loadTagRegistry (2026-09-09 — "태그" form field) ─────────

function makeTagRegistryRepo(tagsYaml) {
  const root = mkdtempSync(join(tmpdir(), 'publish-desk-tags-test-'));
  mkdirSync(join(root, 'config'), { recursive: true });
  if (tagsYaml !== null) writeFileSync(join(root, 'config', 'tags.yaml'), tagsYaml, 'utf8');
  return root;
}

test('loadTagRegistry: reads the live config/tags.yaml', async (t) => {
  const root = makeTagRegistryRepo('tags:\n  - { slug: "city-pop", label: "시티팝", aliases: ["citypop"] }\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(loadTagRegistry(root), [{ slug: 'city-pop', label: '시티팝', aliases: ['citypop'] }]);
});

test('loadTagRegistry: a missing file resolves to an empty registry, not a throw', async (t) => {
  const root = makeTagRegistryRepo(null);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(loadTagRegistry(root), []);
});

test('resolveTags: a tag matching an EXISTING label (Korean) reuses its registered slug — no new entry', async (t) => {
  const root = makeTagRegistryRepo('tags:\n  - { slug: "city-pop", label: "시티팝", aliases: ["citypop"] }\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(resolveTags(['시티팝'], root), { slugs: ['city-pop'], newEntries: [] });
});

test('resolveTags: label match is whitespace/case-insensitive (normalizeName, same rule as artist/album reuse)', async (t) => {
  const root = makeTagRegistryRepo('tags:\n  - { slug: "dream-pop", label: "Dream Pop", aliases: [] }\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(resolveTags(['  dream   pop '], root), { slugs: ['dream-pop'], newEntries: [] });
});

test('resolveTags: an ASCII newcomer slugifies directly and is reported as a new entry', async (t) => {
  const root = makeTagRegistryRepo('tags: []\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(resolveTags(['dream pop'], root), { slugs: ['dream-pop'], newEntries: [{ slug: 'dream-pop', label: 'dream pop' }] });
});

test('resolveTags: an all-Korean newcomer falls back to a deterministic hash slug, same as fallbackSlug("tag", …)', async (t) => {
  const root = makeTagRegistryRepo('tags: []\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const expectedSlug = `tag-${hashSlugFragment('시티팝')}`;
  assert.deepEqual(resolveTags(['시티팝'], root), { slugs: [expectedSlug], newEntries: [{ slug: expectedSlug, label: '시티팝' }] });
});

test('resolveTags: the SAME new tag typed twice on one form mints only ONE slug/entry, not two', async (t) => {
  const root = makeTagRegistryRepo('tags: []\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(resolveTags(['dream pop', 'Dream Pop'], root), {
    slugs: ['dream-pop'],
    newEntries: [{ slug: 'dream-pop', label: 'dream pop' }],
  });
});

test('resolveTags: blank/whitespace-only entries (an author\'s stray comma) are dropped, not turned into empty-string tags', async (t) => {
  const root = makeTagRegistryRepo('tags: []\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(resolveTags(['dream pop', '', '   '], root), {
    slugs: ['dream-pop'],
    newEntries: [{ slug: 'dream-pop', label: 'dream pop' }],
  });
});

test('resolveTags: [] resolves to no slugs and no new entries', async (t) => {
  const root = makeTagRegistryRepo('tags: []\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(resolveTags([], root), { slugs: [], newEntries: [] });
});

test('resolveTags: a missing config/tags.yaml is treated as an empty registry — every tag becomes a newcomer', async (t) => {
  const root = makeTagRegistryRepo(null);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(resolveTags(['dream pop'], root), { slugs: ['dream-pop'], newEntries: [{ slug: 'dream-pop', label: 'dream pop' }] });
});

test('listReviews / listStories / listSnapshots — takedown.mjs readers', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'publish-desk-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'content', 'reviews'), { recursive: true });
  mkdirSync(join(root, 'content', 'stories'), { recursive: true });
  mkdirSync(join(root, 'content', 'snapshots'), { recursive: true });

  writeFileSync(
    join(root, 'content', 'reviews', 'phoebe-bridgers-lost-weekend.md'),
    '---\nalbum: phoebe-bridgers-lost-weekend\nscore: "8.4"\ndate: 2026-09-06\neditorial_check: true\n---\n\n본문\n',
    'utf8',
  );

  await t.test('listReviews reads every review, reduced to its own album reference', () => {
    assert.deepEqual(listReviews(root), [{ slug: 'phoebe-bridgers-lost-weekend', album: 'phoebe-bridgers-lost-weekend' }]);
  });

  writeFileSync(
    join(root, 'content', 'stories', '93-summer.md'),
    [
      '---',
      'title: "93년 여름"',
      'date: 2026-09-08',
      'albums:',
      '  - { ref: phoebe-bridgers-lost-weekend }',
      '  - { text: "미등록 앨범", artist: "미등록 아티스트" }',
      '---',
      '',
      '본문',
      '',
    ].join('\n'),
    'utf8',
  );

  await t.test('listStories reduces albums to ONLY {ref} entries — a {text} mention carries no reachability', () => {
    assert.deepEqual(listStories(root), [{ slug: '93-summer', albumRefs: ['phoebe-bridgers-lost-weekend'] }]);
  });

  writeFileSync(
    join(root, 'content', 'snapshots', 'y2026.md'),
    [
      '---',
      'year: 2026',
      'finalized_at: 2026-12-31T00:00:00.000Z',
      'top10:',
      '  - { rank: 1, album: phoebe-bridgers-lost-weekend, title: "Lost Weekend", artists_label: "Phoebe Bridgers", score: "8.4" }',
      'buckets:',
      '  - { id: rock, label: Rock, published: true, winner: phoebe-bridgers-lost-weekend, nominees: [] }',
      '---',
      '',
    ].join('\n'),
    'utf8',
  );

  await t.test('listSnapshots collects every referenced album slug across top10 AND bucket winner/nominees', () => {
    assert.deepEqual(listSnapshots(root), [
      { slug: 'y2026', year: 2026, referencedAlbums: ['phoebe-bridgers-lost-weekend', 'phoebe-bridgers-lost-weekend'] },
    ]);
  });
});
