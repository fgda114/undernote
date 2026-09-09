import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewFile, albumFile, artistFile, storyFile, updateAlbumCover, appendTagEntries } from './frontmatter.mjs';

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
  const out = albumFile({ title: 'Lost Weekend', artistSlugs: ['phoebe-bridgers'], releaseDate: '2026', buckets: ['rock'] });
  assert.equal(
    out,
    'title: "Lost Weekend"\nartists: [phoebe-bridgers]\nrelease_date: "2026"\nbuckets: [rock]\n',
  );
});

test('albumFile: MULTI-GENRE — more than one bucket is written in the given order', () => {
  const out = albumFile({ title: 'Lost Weekend', artistSlugs: ['phoebe-bridgers'], releaseDate: '2026', buckets: ['rock', 'pop'] });
  assert.match(out, /\nbuckets: \[rock, pop\]\n/);
});

test('albumFile: cover fields appear together, tags appear when present', () => {
  const out = albumFile({
    title: 'Lost Weekend',
    artistSlugs: ['phoebe-bridgers'],
    releaseDate: '2026',
    buckets: ['rock'],
    tags: ['city-pop'],
    cover: 'covers/phoebe-bridgers-lost-weekend.jpg',
    coverSource: '앨범 커버 (축소본)',
  });
  assert.match(out, /\ntags: \[city-pop\]\n/);
  assert.match(out, /\ncover: covers\/phoebe-bridgers-lost-weekend\.jpg\n/);
  assert.match(out, /\ncover_source: "앨범 커버 \(축소본\)"\n/);
});

test('albumFile: a title containing a double quote is safely escaped', () => {
  const out = albumFile({ title: 'The "Deluxe" Edition', artistSlugs: ['a'], releaseDate: '2026', buckets: ['pop'] });
  assert.match(out, /^title: "The \\"Deluxe\\" Edition"\n/);
});

test('albumFile: subtitle is written when present, omitted entirely when absent (2026-09-09)', () => {
  const withSubtitle = albumFile({
    title: 'Lost Weekend',
    artistSlugs: ['phoebe-bridgers'],
    releaseDate: '2026',
    buckets: ['rock'],
    subtitle: 'The 3rd Studio Album',
  });
  assert.match(withSubtitle, /\nsubtitle: "The 3rd Studio Album"\n/);

  const withoutSubtitle = albumFile({ title: 'Lost Weekend', artistSlugs: ['phoebe-bridgers'], releaseDate: '2026', buckets: ['rock'] });
  assert.doesNotMatch(withoutSubtitle, /subtitle:/);
});

test('albumFile: duration is written UNQUOTED when present, omitted entirely when absent (2026-09-09)', () => {
  const withDuration = albumFile({
    title: 'Lost Weekend',
    artistSlugs: ['phoebe-bridgers'],
    releaseDate: '2026',
    buckets: ['rock'],
    duration: '52:26',
  });
  assert.match(withDuration, /\nduration: 52:26\n/);

  const withoutDuration = albumFile({ title: 'Lost Weekend', artistSlugs: ['phoebe-bridgers'], releaseDate: '2026', buckets: ['rock'] });
  assert.doesNotMatch(withoutDuration, /duration:/);
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

test('storyFile: tags are written when present, omitted entirely when absent (2026-09-09)', () => {
  const withTags = storyFile({ title: 'T', date: '2026-01-01', body: 'b', albums: [], tags: ['summer', 'playlist'] });
  assert.match(withTags, /\ntags: \[summer, playlist\]\n/);

  const withoutTags = storyFile({ title: 'T', date: '2026-01-01', body: 'b', albums: [] });
  assert.doesNotMatch(withoutTags, /tags:/);
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

// ── appendTagEntries (2026-09-09 — "발행 파이프라인이 등록부에 자동으로
// 추가" decision, resolve-content.mjs#resolveTags' write-side counterpart) ──

test('appendTagEntries: no new entries returns the file untouched', () => {
  const raw = 'tags:\n  - { slug: "city-pop", label: "시티팝", aliases: ["citypop"] }\n';
  assert.equal(appendTagEntries(raw, []), raw);
});

test('appendTagEntries: extends an EXISTING block list, leaving prior entries byte-for-byte', () => {
  const raw = 'tags:\n  - { slug: "city-pop", label: "시티팝", aliases: ["citypop"] }\n';
  const out = appendTagEntries(raw, [{ slug: 'dream-pop', label: 'dream pop' }]);
  assert.equal(
    out,
    'tags:\n  - { slug: "city-pop", label: "시티팝", aliases: ["citypop"] }\n  - { slug: dream-pop, label: "dream pop", aliases: [] }\n',
  );
});

test('appendTagEntries: two new entries in one call are both appended, in order', () => {
  const raw = 'tags:\n  - { slug: "city-pop", label: "시티팝", aliases: ["citypop"] }\n';
  const out = appendTagEntries(raw, [
    { slug: 'dream-pop', label: 'dream pop' },
    { slug: 'tag-a1b2c3', label: '여름' },
  ]);
  const lines = out.trim().split('\n');
  assert.equal(lines[2], '  - { slug: dream-pop, label: "dream pop", aliases: [] }');
  assert.equal(lines[3], '  - { slug: tag-a1b2c3, label: "여름", aliases: [] }');
});

test('appendTagEntries: a shipped-empty "tags: []" (flow form) is rewritten to a block list, not left invalid', () => {
  const out = appendTagEntries('tags: []\n', [{ slug: 'dream-pop', label: 'dream pop' }]);
  assert.equal(out, 'tags:\n  - { slug: dream-pop, label: "dream pop", aliases: [] }\n');
});

test('appendTagEntries: a label containing a double quote is safely escaped', () => {
  const out = appendTagEntries('tags:\n', [{ slug: 'weird-tag', label: 'A "weird" tag' }]);
  assert.match(out, /label: "A \\"weird\\" tag"/);
});
