import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewFile, albumFile, artistFile, storyFile, updateAlbumCover } from './frontmatter.mjs';

test('reviewFile: score is ALWAYS a quoted string, date unquoted (matches published examples)', () => {
  const out = reviewFile({ albumSlug: 'phoebe-bridgers-lost-weekend', score: '8.4', date: '2026-09-06', body: '본문.' });
  assert.match(out, /^---\n/);
  assert.match(out, /\nalbum: phoebe-bridgers-lost-weekend\n/);
  assert.match(out, /\nscore: "8\.4"\n/);
  assert.match(out, /\ndate: 2026-09-06\n/);
  assert.match(out, /\neditorial_check: true\n/);
  assert.match(out, /\n---\n\n본문\.\n$/);
});

test('reviewFile: even a malformed score is passed through quoted, not fixed — the build catches it', () => {
  const out = reviewFile({ albumSlug: 'x', score: '8.40', date: '2026-01-01', body: 'b' });
  assert.match(out, /score: "8\.40"/);
});

test('albumFile: release_date is always quoted, tags/cover omitted when absent', () => {
  const out = albumFile({ title: 'Lost Weekend', artistSlugs: ['phoebe-bridgers'], releaseDate: '2026', bucket: 'rock' });
  assert.equal(
    out,
    'title: "Lost Weekend"\nartists: [phoebe-bridgers]\nrelease_date: "2026"\nbucket: rock\n',
  );
});

test('albumFile: cover fields appear together, tags appear when present', () => {
  const out = albumFile({
    title: 'Lost Weekend',
    artistSlugs: ['phoebe-bridgers'],
    releaseDate: '2026',
    bucket: 'rock',
    tags: ['city-pop'],
    cover: 'covers/phoebe-bridgers-lost-weekend.jpg',
    coverSource: '앨범 커버 (축소본)',
  });
  assert.match(out, /\ntags: \[city-pop\]\n/);
  assert.match(out, /\ncover: covers\/phoebe-bridgers-lost-weekend\.jpg\n/);
  assert.match(out, /\ncover_source: "앨범 커버 \(축소본\)"\n/);
});

test('albumFile: a title containing a double quote is safely escaped', () => {
  const out = albumFile({ title: 'The "Deluxe" Edition', artistSlugs: ['a'], releaseDate: '2026', bucket: 'pop' });
  assert.match(out, /^title: "The \\"Deluxe\\" Edition"\n/);
});

test('artistFile: empty body, quoted name', () => {
  assert.equal(artistFile({ name: 'Phoebe Bridgers' }), '---\nname: "Phoebe Bridgers"\n---\n');
});

test('storyFile: mixes ref and text album entries', () => {
  const out = storyFile({
    title: '93년 여름의 플레이리스트',
    date: '2026-09-08',
    body: '본문.',
    albums: [{ ref: 'phoebe-bridgers-lost-weekend' }, { text: '아직 모르는 앨범', artist: '아직 모르는 아티스트' }],
  });
  assert.match(out, /\n {2}- \{ ref: phoebe-bridgers-lost-weekend \}\n/);
  assert.match(out, /\n {2}- \{ text: "아직 모르는 앨범", artist: "아직 모르는 아티스트" \}\n/);
});

test('storyFile: no album mentions writes an explicit empty list, not an omitted key', () => {
  const out = storyFile({ title: 'T', date: '2026-01-01', body: 'b', albums: [] });
  assert.match(out, /\nalbums: \[\]\n/);
});

test('updateAlbumCover: no prior cover (E-202 placeholder) — appends both lines, leaves everything else untouched', () => {
  const raw = 'title: "Lost Weekend"\nartists: [phoebe-bridgers]\nrelease_date: "2026"\nbucket: rock\n';
  const out = updateAlbumCover(raw, { cover: 'covers/phoebe-bridgers-lost-weekend.jpg', coverSource: '독자 제공 (발행 데스크, 수정 — 축소본)' });
  assert.equal(
    out,
    'title: "Lost Weekend"\nartists: [phoebe-bridgers]\nrelease_date: "2026"\nbucket: rock\n' +
      'cover: covers/phoebe-bridgers-lost-weekend.jpg\ncover_source: "독자 제공 (발행 데스크, 수정 — 축소본)"\n',
  );
});

test('updateAlbumCover: an existing cover is replaced in place — line order and every OTHER field untouched', () => {
  const raw = [
    'title: "Lost Weekend"',
    'artists: [phoebe-bridgers]',
    'release_date: "2026"',
    'bucket: rock',
    'cover: covers/old.jpg',
    'cover_source: "예전 커버"',
    'mbid: abc-123',
    'label: "Dead Oceans"',
    '',
  ].join('\n');
  const out = updateAlbumCover(raw, { cover: 'covers/new.jpg', coverSource: '새 커버' });
  assert.match(out, /\ncover: covers\/new\.jpg\n/);
  assert.match(out, /\ncover_source: "새 커버"\n/);
  assert.doesNotMatch(out, /old\.jpg/);
  // Fields this package never models (mbid, label — album-add.ts's own) must
  // survive byte-for-byte: this is the whole reason for a line edit instead
  // of a parse+regenerate round trip (see the function's own doc comment).
  assert.match(out, /\nmbid: abc-123\n/);
  assert.match(out, /\nlabel: "Dead Oceans"\n/);
});

test('updateAlbumCover: a cover line with no cover_source line gets one inserted right after it', () => {
  const raw = 'title: "T"\nartists: [a]\nrelease_date: "2026"\nbucket: pop\ncover: covers/old.jpg\n';
  const out = updateAlbumCover(raw, { cover: 'covers/new.jpg', coverSource: '새 커버' });
  const lines = out.trim().split('\n');
  const coverIdx = lines.findIndex((l) => l.startsWith('cover:'));
  assert.equal(lines[coverIdx + 1], 'cover_source: "새 커버"');
});
