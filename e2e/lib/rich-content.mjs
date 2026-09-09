/**
 * Rich fixture content — 8 reviews across 3 buckets, written into a sandbox.
 * Scores mirror the W5 manual QA set so the board cut (top 5) is exercised.
 * Bodies contain no digits so score-leak greps stay unambiguous.
 *
 * SELF-SUFFICIENT (2026-09-06): the harness used to lean on the repo's
 * committed fixture set — the base album/story the specs address by name, and
 * its .jpg as the source for every generated cover. That made the E2E suite
 * hostage to whatever the editor has published: removing the fixtures (a
 * launch-checklist step, operations.md §8) broke setup outright. The sandbox's
 * content tree is now WIPED and rewritten from this file, and covers are
 * generated with sharp — no repo content reaches the sandbox any more.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

export const RICH_SET = [
  // 6 generated pop reviews + the base fixture (pop 8.3) = 7 pop → board keeps top 5.
  { slug: 'aurora-line-first-light',  title: '퍼스트 라이트',   artists: ['shared-artist'],              bucket: 'pop',        score: '9.1', reviewDate: '2026-08-21', release: '2026-03-20', cover: true,  tags: [] },
  { slug: 'aurora-line-second-wind',  title: '세컨드 윈드',     artists: ['shared-artist'],              bucket: 'pop',        score: '8.8', reviewDate: '2026-08-14', release: '2026-02-06', cover: true,  tags: ['city-pop'] },
  { slug: 'twin-motif-duet',          title: '듀엣',            artists: ['motif-one', 'motif-two'],     bucket: 'pop',        score: '7.9', reviewDate: '2026-07-10', release: '2026-01-30', cover: true,  tags: [] },
  { slug: 'quiet-harbor-tide',        title: '조수',            artists: ['quiet-harbor'],               bucket: 'pop',        score: '7.5', reviewDate: '2026-06-05', release: '2026-04-11', cover: true,  tags: [] },
  { slug: 'paper-crane-fold',         title: '접힌 학',         artists: ['paper-crane'],                bucket: 'pop',        score: '7.2', reviewDate: '2026-05-15', release: '2026-05-01', cover: true,  tags: [], noListen: true },
  { slug: 'ember-field-ash',          title: '재의 들판',       artists: ['ember-field'],                bucket: 'pop',        score: '6.8', reviewDate: '2026-04-02', release: '2026-03-01', cover: false, tags: [] },
  { slug: 'low-orbit-signal',         title: '낮은 궤도 신호',  artists: ['low-orbit'],                  bucket: 'hiphop', score: '8.0', reviewDate: '2026-08-01', release: '2026-06-15', cover: true,  tags: [] },
];

const ARTIST_NAMES = {
  'shared-artist': '공유 아티스트',
  'motif-one': '모티프 원',
  'motif-two': '모티프 투',
  'quiet-harbor': '조용한 항구',
  'paper-crane': '종이학',
  'ember-field': '잉걸 들판',
  'low-orbit': '낮은 궤도',
};

const BODY = `합성음이 방을 채우고, 문장은 결론을 향해 천천히 걷는다.

논증이 끝나기 전에는 판정이 나오지 않는다 — 그 순서가 이 매체의 문법이다.`;

/** The base album/story the specs address by name (ladder · retro-link ·
 *  listen-link override · story→review flow). */
export const BASE_SLUG = 'fixture-artist-fixture-album';

/** Empty every content collection + covers the sandbox inherited from the
 *  repo, so the suite sees exactly the set below and nothing else. */
function resetContent(dir) {
  for (const c of ['albums', 'artists', 'reviews', 'stories', 'snapshots']) {
    const d = join(dir, 'content', c);
    mkdirSync(d, { recursive: true });
    for (const f of readdirSync(d)) if (f !== '.gitkeep') rmSync(join(d, f), { recursive: true, force: true });
  }
  const covers = join(dir, 'public', 'covers');
  mkdirSync(covers, { recursive: true });
  for (const f of readdirSync(covers)) if (f !== '.gitkeep') rmSync(join(covers, f), { force: true });
}

/** A real 640px JPEG — the derived-cover route decodes it with sharp at build
 *  time, so arbitrary bytes would not do. */
async function makeCover(path) {
  await sharp({ create: { width: 640, height: 640, channels: 3, background: { r: 32, g: 30, b: 27 } } })
    .jpeg({ quality: 70 })
    .toFile(path);
}

async function writeBaseFixture(dir) {
  writeFileSync(
    join(dir, 'content', 'artists', 'fixture-artist.md'),
    ['---', 'name: 픽스처 아티스트', '---', '', '소개글 본문입니다 (빈 본문도 허용되지만 여기서는 채워 둡니다).', ''].join('\n'),
    'utf8',
  );
  await makeCover(join(dir, 'public', 'covers', `${BASE_SLUG}.jpg`));
  writeFileSync(
    join(dir, 'content', 'albums', `${BASE_SLUG}.yaml`),
    [
      'title: 픽스처 앨범',
      'artists: [fixture-artist]',
      'release_date: "2026-05-01"',
      'buckets: [pop]',
      `cover: covers/${BASE_SLUG}.jpg`,
      'cover_source: "fixture (generated placeholder art)"',
      'tags: [city-pop]',
      'listen_links:',
      '  - { service: spotify, url: "https://open.spotify.com/album/fixture" }',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(dir, 'content', 'reviews', `${BASE_SLUG}.md`),
    [
      '---',
      `album: ${BASE_SLUG}`,
      'score: "8.3"',
      'date: 2026-09-02',
      'editorial_check: true',
      '---',
      '',
      '이 앨범은 픽스처지만, 본문은 실제 평론처럼 흐른다. 1983년의 어떤 순간을',
      '떠올리게 하는 신시사이저가 첫 곡부터 공간을 채운다.',
      '',
      '논증이 끝나는 지점에서 점수가 나온다 — 그 전에는 나오지 않는다.',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(dir, 'content', 'stories', 'fixture-story.md'),
    [
      '---',
      'title: 픽스처 이야기',
      'date: 2026-09-01',
      'albums:',
      `  - { ref: ${BASE_SLUG} }`,
      '  - { text: "미등록 명반", artist: "어떤 아티스트" }',
      'tags: [city-pop]',
      '---',
      '',
      '이야기 본문. 등록 앨범 하나와 미등록 표기 하나를 참조한다.',
      '',
    ].join('\n'),
    'utf8',
  );
}

/** Just the base set — for specs that used to rely on the sandbox inheriting
 *  the repo's committed fixture and nothing else (ladder · retro-link). */
export async function writeBaseContent(dir) {
  resetContent(dir);
  await writeBaseFixture(dir);
}

export async function writeRichContent(dir) {
  resetContent(dir);
  await writeBaseFixture(dir);
  for (const [slug, name] of Object.entries(ARTIST_NAMES)) {
    writeFileSync(join(dir, 'content', 'artists', `${slug}.md`), `---\nname: ${name}\n---\n`, 'utf8');
  }
  for (const a of RICH_SET) {
    const lines = [
      `title: ${a.title}`,
      `artists: [${a.artists.join(', ')}]`,
      `release_date: "${a.release}"`,
      `buckets: [${a.bucket}]`,
    ];
    if (a.tags.length > 0) lines.push(`tags: [${a.tags.join(', ')}]`);
    if (a.cover) {
      await makeCover(join(dir, 'public', 'covers', `${a.slug}.jpg`));
      lines.push(`cover: covers/${a.slug}.jpg`, `cover_source: "generated placeholder (E2E)"`);
    }
    writeFileSync(join(dir, 'content', 'albums', `${a.slug}.yaml`), lines.join('\n') + '\n', 'utf8');
    writeFileSync(
      join(dir, 'content', 'reviews', `${a.slug}.md`),
      `---\nalbum: ${a.slug}\nscore: "${a.score}"\ndate: ${a.reviewDate}\neditorial_check: true\n---\n\n${BODY}\n`,
      'utf8',
    );
  }
}

/** Scale content for the 300-doc build-time NFR: counts are IN ADDITION to
 * whatever the sandbox already contains. Coverless (placeholder path). */
export function writeScaleContent(dir, { albums = 100, artists = 50, stories = 50 } = {}) {
  const buckets = ['pop', 'hiphop', 'rock'];
  mkdirSync(join(dir, 'content', 'stories'), { recursive: true });
  for (let i = 0; i < artists; i++) {
    writeFileSync(join(dir, 'content', 'artists', `scale-artist-${i}.md`), `---\nname: 스케일 아티스트 ${i}\n---\n`, 'utf8');
  }
  for (let i = 0; i < albums; i++) {
    const month = String((i % 8) + 1).padStart(2, '0');
    const day = String((i % 27) + 1).padStart(2, '0');
    const score = `${5 + (i % 5)}.${i % 10}`;
    writeFileSync(
      join(dir, 'content', 'albums', `scale-album-${i}.yaml`),
      [
        `title: 스케일 앨범 ${i}`,
        `artists: [scale-artist-${i % artists}]`,
        `release_date: "2026-${month}-${day}"`,
        `buckets: [${buckets[i % buckets.length]}]`,
      ].join('\n') + '\n',
      'utf8',
    );
    writeFileSync(
      join(dir, 'content', 'reviews', `scale-album-${i}.md`),
      `---\nalbum: scale-album-${i}\nscore: "${score}"\ndate: 2026-${month}-${day}\neditorial_check: true\n---\n\n${BODY}\n`,
      'utf8',
    );
  }
  for (let i = 0; i < stories; i++) {
    writeFileSync(
      join(dir, 'content', 'stories', `scale-story-${i}.md`),
      `---\ntitle: 스케일 이야기 ${i}\ndate: 2026-0${(i % 8) + 1}-15\nalbums:\n  - { ref: scale-album-${i % albums} }\n  - { ref: scale-album-${(i * 2) % albums} }\n---\n\n흐름을 따라가는 본문.\n`,
      'utf8',
    );
  }
}
