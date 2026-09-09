/**
 * finalize — year-end freeze CLI (sequence C). The ONLY transition from the
 * progressive lists to a frozen snapshot:
 *
 *   node scripts/finalize.ts --year 2026 --preface path/to/preface.md [--yes]
 *
 * Contract points:
 *  - Uses the SAME derive code path as the build (deriveTop10/deriveBoard) —
 *    a second implementation could disagree with the last progressive page.
 *  - The preface is passed as a FILE ARGUMENT and becomes the snapshot body;
 *    editing the generated snapshot by hand is forbidden (a wrong freeze is
 *    fixed by deleting the file and re-running finalize).
 *  - Snapshot entries are DENORMALIZED (title/artists_label/score copied as
 *    strings) so later album/config/score edits can never reach a frozen
 *    year (R-2/R-8). E-119 (checker/resolve.ts) enforces the config-block
 *    half of the same promise at build time.
 *  - RETROACTIVE FINALIZE (2026-09-08, R-8 rewrite): --year no longer has to
 *    be the current active_year. A year below active_year that has never
 *    been finalized can be built up "the same way" active_year is (its own
 *    genres.yaml block, its own reviews) and finalized once it is complete —
 *    the freeze rule is keyed on "has a snapshot", not on the calendar. That
 *    means finalizing a PAST year must never move active_year: it only
 *    advances when the year being finalized is the one active_year is
 *    currently pointing at (or later — advancing is always forward-only).
 *    The {year+1} bucket-block auto-copy is ALSO skipped on the retroactive
 *    path: that convenience exists so the NEXT active year always has a
 *    starting block the moment the current one freezes, which is meaningless
 *    for a year the site has already moved past (its "next" block, if it
 *    should exist at all, was either created earlier for the real active
 *    year or is a deliberate editorial decision this script should not guess
 *    at).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stringify } from 'yaml';
import { runPrePass } from '../src/lib/checker/index.ts';
import {
  deriveBoard,
  deriveTop10,
  detectBoundaryTies,
  joinReviews,
} from '../src/lib/derive/lists.ts';

function argOf(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** Today's date in Asia/Seoul (KST = UTC+9, no DST) — a record of when the
 * freeze happened, not a derive input (R-10). */
function todaySeoul(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

async function main() {
  const root = process.cwd();
  const year = Number(argOf('--year'));
  const prefacePath = argOf('--preface');
  if (!Number.isInteger(year) || !prefacePath) {
    console.log('사용법: node scripts/finalize.ts --year 2026 --preface <서문.md 경로> [--yes]');
    process.exit(1);
  }
  if (!existsSync(prefacePath)) {
    console.error(`서문 파일이 없습니다: ${prefacePath} — 서문은 content/ 밖에 초안으로 두고 경로만 넘기세요.`);
    process.exit(1);
  }
  const preface = readFileSync(prefacePath, 'utf8').trim();

  const snapshotPath = join(root, 'content/snapshots', `${year}.md`);
  if (existsSync(snapshotPath)) {
    console.error(`content/snapshots/${year}.md가 이미 있습니다. 잘못된 확정이면 그 파일을 삭제한 뒤 다시 실행하세요 (수동 편집 금지).`);
    process.exit(1);
  }

  // Full pre-pass (shape + cross-file integrity, E-100~110) — NOT loadRepo
  // alone: freezing under an E-102 state would bake a silently-short list
  // into the immutable snapshot (irreversible by design, ADR-0005).
  const { data, result } = runPrePass(root);
  if (result.failures.length > 0) {
    console.error('콘텐츠 검증 실패 상태에서는 확정할 수 없습니다 — 먼저 빌드를 통과시키세요.');
    for (const f of result.failures) console.error(`  ${f.file} — ${f.message}`);
    process.exit(1);
  }
  if (!data.genres || !data.site) process.exit(1);

  const joined = joinReviews(data);
  const eligible = joined.filter((j) => j.releaseYear === year);
  if (eligible.length === 0) {
    console.error(`E-405: ${year}년 발매작 평론이 0편입니다 — 동결할 것이 없습니다.`);
    process.exit(1);
  }

  // Same code path as the build's progressive pages.
  const top10 = deriveTop10(joined, year);
  const board = deriveBoard(joined, data.genres, year);
  const yearBlock = data.genres.years.find((y) => y.year === year);
  const minToPublish = yearBlock?.min_reviews_to_publish ?? 3;

  // Final boundary-tie notice — the editor's last chance to split by score.
  const ties = detectBoundaryTies(joined, data.genres, year);
  for (const tie of ties) console.log(`알림: ${tie.message}`);

  const buckets = board.buckets.map((bucket) => {
    const published = bucket.entries.length >= minToPublish;
    return {
      id: bucket.id,
      label: bucket.label,
      published,
      ...(published
        ? {
            winner: bucket.entries[0].album,
            nominees: bucket.entries.map((e) => ({
              album: e.album,
              title: e.title,
              artists_label: e.artists_label,
              score: e.score,
            })),
          }
        : {}),
    };
  });

  const frontmatter = {
    year,
    finalized_at: todaySeoul(),
    top10: top10.entries.map((e, i) => ({
      rank: i + 1,
      album: e.album,
      title: e.title,
      artists_label: e.artists_label,
      score: e.score,
    })),
    buckets,
  };

  console.log(`\n${year} 확정 요약: 올해의 앨범 ${top10.entries.length}장 · 성립 버킷 ${buckets.filter((b) => b.published).length}/${buckets.length} (기준 ${minToPublish}편)`);
  if (!process.argv.includes('--yes')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question('확정하고 스냅샷을 생성할까요? 확정 후에는 불변입니다 (y/N): ')).trim().toLowerCase();
    rl.close();
    if (answer !== 'y') {
      console.log('취소했습니다.');
      process.exit(0);
    }
  }

  // Scores/dates stay strings through QUOTE_DOUBLE — YAML must not refold them.
  const yamlText = stringify(frontmatter, { defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN' });
  // The collection directory may not exist — git does not carry empty dirs, so
  // a fresh clone (or any repo whose snapshots dir was never populated) hits
  // ENOENT here, AFTER the confirmation prompt. That is the worst possible
  // moment for an irreversible operation, so create the dir before writing.
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, `---\n${yamlText}---\n\n${preface}\n`, 'utf8');
  console.log(`스냅샷 생성: content/snapshots/${year}.md`);

  // active_year: forward-only. Advancing to year+1 is correct exactly when
  // finalizing the current frontier (year === active_year, the normal case)
  // or something even later; finalizing a PAST year (retroactive — see the
  // intro) must leave the clock alone, or a late 2025 freeze done after 2026
  // and 2027 both already exist would silently drag active_year backwards.
  const sitePath = join(root, 'config/site.yaml');
  const siteText = readFileSync(sitePath, 'utf8');
  const activeMatch = /^active_year:\s*(\d+)/m.exec(siteText);
  if (!activeMatch) {
    console.error('config/site.yaml: active_year 필드를 찾을 수 없습니다 (치환 대상 없음) — 형식을 확인하세요.');
    process.exit(1);
  }
  const currentActive = Number(activeMatch[1]);
  const isRetroactive = year + 1 <= currentActive;
  if (isRetroactive) {
    console.log(`config/site.yaml: 소급 확정 — active_year(${currentActive})는 그대로 둡니다 (과거 연도 확정은 진행 중인 연도를 되돌리지 않습니다).`);
  } else {
    writeFileSync(sitePath, siteText.replace(/^active_year:\s*\d+/m, `active_year: ${year + 1}`), 'utf8');
    console.log(`config/site.yaml: active_year → ${year + 1}`);
  }

  // Next-year bucket block: copied from the finalized year (edit the NEW
  // block if the buckets should change — past blocks are immutable, R-8).
  // Skipped entirely on the retroactive path — see the intro.
  const genresPath = join(root, 'config/genres.yaml');
  const hasNextBlock = data.genres.years.some((y) => y.year === year + 1);
  if (!isRetroactive && !hasNextBlock && yearBlock) {
    const nextBlock = stringify(
      {
        years: [
          {
            year: year + 1,
            buckets: yearBlock.buckets,
            min_reviews_to_publish: yearBlock.min_reviews_to_publish,
          },
        ],
      },
      { defaultKeyType: 'PLAIN' },
    )
      .split('\n')
      .slice(1) // drop the "years:" head — we append items to the existing list
      .join('\n');
    writeFileSync(genresPath, readFileSync(genresPath, 'utf8').trimEnd() + '\n' + nextBlock, 'utf8');
    console.log(`config/genres.yaml: ${year + 1} 블록 추가 (버킷 변경은 새 블록에서만 — 과거 블록 수정 금지)`);
  }

  console.log('\n다음 빌드부터 홈이 "확정 직후" 변형으로 렌더됩니다. 커밋 후 push 하세요.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
