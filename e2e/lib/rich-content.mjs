/**
 * Rich fixture content — 8 reviews across 3 buckets, written into a sandbox.
 * Scores mirror the W5 manual QA set so the board cut (top 5) is exercised.
 * Bodies contain no digits so score-leak greps stay unambiguous.
 */
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const RICH_SET = [
  // 6 generated pop reviews + the committed fixture (pop 8.3) = 7 pop → board keeps top 5.
  { slug: 'aurora-line-first-light',  title: '퍼스트 라이트',   artists: ['shared-artist'],              bucket: 'pop',        score: '9.1', reviewDate: '2026-08-21', release: '2026-03-20', cover: true,  tags: [] },
  { slug: 'aurora-line-second-wind',  title: '세컨드 윈드',     artists: ['shared-artist'],              bucket: 'pop',        score: '8.8', reviewDate: '2026-08-14', release: '2026-02-06', cover: true,  tags: ['city-pop'] },
  { slug: 'twin-motif-duet',          title: '듀엣',            artists: ['motif-one', 'motif-two'],     bucket: 'pop',        score: '7.9', reviewDate: '2026-07-10', release: '2026-01-30', cover: true,  tags: [] },
  { slug: 'quiet-harbor-tide',        title: '조수',            artists: ['quiet-harbor'],               bucket: 'pop',        score: '7.5', reviewDate: '2026-06-05', release: '2026-04-11', cover: true,  tags: [] },
  { slug: 'paper-crane-fold',         title: '접힌 학',         artists: ['paper-crane'],                bucket: 'pop',        score: '7.2', reviewDate: '2026-05-15', release: '2026-05-01', cover: true,  tags: [], noListen: true },
  { slug: 'ember-field-ash',          title: '재의 들판',       artists: ['ember-field'],                bucket: 'pop',        score: '6.8', reviewDate: '2026-04-02', release: '2026-03-01', cover: false, tags: [] },
  { slug: 'low-orbit-signal',         title: '낮은 궤도 신호',  artists: ['low-orbit'],                  bucket: 'hiphop-rnb', score: '8.0', reviewDate: '2026-08-01', release: '2026-06-15', cover: true,  tags: [] },
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

export function writeRichContent(dir) {
  for (const [slug, name] of Object.entries(ARTIST_NAMES)) {
    writeFileSync(join(dir, 'content', 'artists', `${slug}.md`), `---\nname: ${name}\n---\n`, 'utf8');
  }
  const fixtureCover = join(dir, 'public', 'covers', 'fixture-artist-fixture-album.jpg');
  for (const a of RICH_SET) {
    const lines = [
      `title: ${a.title}`,
      `artists: [${a.artists.join(', ')}]`,
      `release_date: "${a.release}"`,
      `bucket: ${a.bucket}`,
    ];
    if (a.tags.length > 0) lines.push(`tags: [${a.tags.join(', ')}]`);
    if (a.cover) {
      cpSync(fixtureCover, join(dir, 'public', 'covers', `${a.slug}.jpg`));
      lines.push(`cover: covers/${a.slug}.jpg`, `cover_source: "fixture copy (E2E)"`);
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
  const buckets = ['pop', 'hiphop-rnb', 'rock'];
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
        `bucket: ${buckets[i % buckets.length]}`,
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
