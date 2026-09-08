import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  normalizeName,
  listArtists,
  listAlbums,
  existingSlugSet,
  findArtistByName,
  findAlbumByTitleArtist,
  resolveGenreBucket,
} from './resolve-content.mjs';

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
    'title: lost weekend\nartists: [phoebe-bridgers]\nrelease_date: "2026"\nbucket: rock\n',
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
});
