/**
 * album-add — editing-time CLI (sequence A). Creates content/albums/<slug>.yaml
 * (+ content/artists/<slug>.md for new artists) from a MusicBrainz lookup,
 * downloads the CAA front cover re-encoded to <=640px (ADR-0008: reduced copy
 * only, source recorded), and never touches the build (scripts create files;
 * the build reads repo state only).
 *
 * Error paths follow E-401~404: every network failure degrades to a manual
 * prompt after at most ONE retry — a human is sitting here (P9), so no retry
 * loops, no daemons.
 *
 * Usage: node scripts/album-add.ts "아티스트" "앨범명" [앨범-slug]
 * (Node 22.18+ / 24 runs TypeScript natively.)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parse as parseYaml } from 'yaml';
import { MbClient } from '../src/lib/mb/client.ts';
import { MbError, type MbReleaseGroup } from '../src/lib/mb/types.ts';
import {
  albumYaml,
  artistMarkdown,
  creditNames,
  isValidSlug,
  releaseDateFrom,
  slugify,
} from '../src/lib/mb/scaffold.ts';
import { genresConfigSchema } from '../src/lib/schema/index.ts';

const root = process.cwd();
const rl = createInterface({ input: process.stdin, output: process.stdout });

async function ask(question: string, fallback = ''): Promise<string> {
  const answer = (await rl.question(question)).trim();
  return answer || fallback;
}

/** Ask until the value passes `valid` — release year and bucket are
 * non-negotiable, so there is no way to skip past them. */
async function askValid(
  question: string,
  valid: (v: string) => boolean,
  hint: string,
): Promise<string> {
  for (;;) {
    const answer = (await rl.question(question)).trim();
    if (valid(answer)) return answer;
    console.log(hint);
  }
}

function loadGenres() {
  const raw = parseYaml(readFileSync(join(root, 'config/genres.yaml'), 'utf8'));
  const parsed = genresConfigSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('config/genres.yaml이 유효하지 않습니다 — 먼저 고쳐야 합니다.');
    process.exit(1);
  }
  return parsed.data;
}

async function pickSearchHit(hits: MbReleaseGroup[]): Promise<MbReleaseGroup | null> {
  console.log('\nMusicBrainz 검색 결과:');
  hits.forEach((rg, i) => {
    const artists = creditNames(rg).join(', ');
    const date = rg['first-release-date'] ?? '발매일 미상';
    console.log(`  ${i + 1}. ${rg.title} — ${artists} (${date})`);
  });
  const choice = await ask('번호를 고르세요 (0 = 해당 없음, 수기 입력): ', '1');
  const idx = Number(choice);
  if (!Number.isInteger(idx) || idx < 1 || idx > hits.length) return null;
  return hits[idx - 1];
}

async function main() {
  const [artistArg, albumArg, slugArg] = process.argv.slice(2);
  if (!artistArg || !albumArg) {
    console.log('사용법: node scripts/album-add.ts "아티스트" "앨범명" [앨범-slug]');
    process.exit(1);
  }

  const genres = loadGenres();
  const client = new MbClient();

  // ── 1. MusicBrainz lookup (one retry on timeout — E-402) ─────────────
  let picked: MbReleaseGroup | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const hits = await client.searchReleaseGroups(artistArg, albumArg);
      if (hits.length === 0) {
        console.log(
          '\nMB 검색 0건 (E-401) — 신보는 등재가 늦을 수 있습니다. 수기로 진행하고 mbid는 나중에 연결하세요.',
        );
      } else {
        picked = await pickSearchHit(hits);
      }
      break;
    } catch (err) {
      if (err instanceof MbError && err.kind === 'timeout' && attempt === 0) {
        console.log(`${err.message} 한 번만 다시 시도합니다…`);
        continue;
      }
      const code =
        err instanceof MbError ? { timeout: 'E-402', network: 'E-402', server: 'E-403' }[err.kind] : 'E-402';
      console.log(`\n${code}: ${err instanceof Error ? err.message : String(err)} — 수기 입력으로 진행합니다.`);
      break;
    }
  }

  // Full detail fetch keeps search results lean (search omits some credits).
  if (picked?.id) {
    try {
      picked = await client.getReleaseGroup(picked.id);
    } catch {
      console.log('상세 조회 실패 — 검색 결과의 정보로 진행합니다.');
    }
  }

  // ── 2. Field assembly (MB values, editor override, manual fallback) ──
  const title = picked
    ? await ask(`앨범명 [${picked.title}]: `, picked.title)
    : await ask(`앨범명 [${albumArg}]: `, albumArg);

  const mbDate = picked ? releaseDateFrom(picked) : '';
  const releaseDate = mbDate
    ? await ask(`발매일 [${mbDate}]: `, mbDate)
    : await askValid(
        '발매일 (연도 필수 — YYYY 또는 YYYY-MM-DD): ',
        (v) => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(v),
        '발매 연도가 없으면 리스트 귀속이 불가능합니다 (E-102). YYYY 형식으로 적어 주세요.',
      );

  const names = picked ? creditNames(picked) : [artistArg];
  const artistSlugs: string[] = [];
  for (const name of names) {
    const suggestion = slugify(name);
    const slug = isValidSlug(suggestion)
      ? await ask(`아티스트 "${name}" slug [${suggestion}]: `, suggestion)
      : await askValid(
          `아티스트 "${name}"의 slug (kebab-case): `,
          isValidSlug,
          '소문자 영문·숫자·하이픈만 가능합니다 (예: some-artist).',
        );
    if (!isValidSlug(slug)) {
      console.error(`slug "${slug}"이(가) 형식에 맞지 않습니다 (E-107). 중단합니다.`);
      process.exit(1);
    }
    artistSlugs.push(slug);
    const artistPath = join(root, 'content/artists', `${slug}.md`);
    if (!existsSync(artistPath)) {
      writeFileSync(artistPath, artistMarkdown(name), 'utf8');
      console.log(`아티스트 파일 생성: content/artists/${slug}.md`);
    }
  }

  const year = releaseDate.slice(0, 4);
  const block = genres.years.find((y) => y.year === Number(year));
  const ids = block ? block.buckets.map((b) => b.id) : [];
  console.log(
    block
      ? `\n${year}년 버킷: ${ids.join(', ')} 또는 etc (명시 필수 — 침묵 기본값 없음)`
      : `\n${year}년 버킷 설정 블록이 없습니다 — "etc"만 가능합니다 (config/genres.yaml에 연도 블록을 추가하면 버킷 지정 가능).`,
  );
  const bucket = await askValid(
    '버킷: ',
    (v) => v === 'etc' || ids.includes(v),
    `사용 가능한 값: ${ids.length > 0 ? ids.join(', ') + ', ' : ''}etc`,
  );

  const defaultSlug = slugArg ?? slugify(`${names[0]} ${title}`);
  const slugAnswer = await ask(`앨범 slug [${defaultSlug}] (발행 후 불변 — R-9): `, defaultSlug);
  const albumSlug = slugAnswer;
  if (!isValidSlug(albumSlug)) {
    console.error(`slug "${albumSlug}"이(가) 형식에 맞지 않습니다 (E-107). 중단합니다.`);
    process.exit(1);
  }

  // ── 3. Cover via CAA (reduced copy only — ADR-0008 §2) ───────────────
  let cover: string | undefined;
  let coverSource: string | undefined;
  if (picked?.id) {
    try {
      const fetched = await client.fetchCoverFront(picked.id);
      if (fetched === null) {
        console.log(
          'E-404: CAA에 커버가 없습니다. 수기 확보(레이블 보도자료 등)하거나 플레이스홀더로 진행됩니다 (E-202 경고).',
        );
      } else {
        const sharp = (await import('sharp')).default;
        mkdirSync(join(root, 'public/covers'), { recursive: true });
        const outPath = join(root, 'public/covers', `${albumSlug}.jpg`);
        // Max 640px on the longest side, no enlargement — the stored copy IS
        // the ceiling; every derived size stays at or below it (ADR-0008 §2).
        await sharp(fetched.buffer)
          .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82, mozjpeg: true })
          .toFile(outPath);
        cover = `covers/${albumSlug}.jpg`;
        coverSource = fetched.sourceUrl;
        console.log(`커버 저장: public/covers/${albumSlug}.jpg (장변 ≤640px 재인코딩)`);
      }
    } catch (err) {
      console.log(`커버 확보 실패 (${err instanceof Error ? err.message : err}) — 플레이스홀더로 진행됩니다.`);
    }
  }

  // ── 4. Write album file ──────────────────────────────────────────────
  const albumPath = join(root, 'content/albums', `${albumSlug}.yaml`);
  if (existsSync(albumPath)) {
    console.error(
      `content/albums/${albumSlug}.yaml이 이미 있습니다 — slug는 발행 후 불변입니다 (R-9). 중단합니다.`,
    );
    process.exit(1);
  }
  writeFileSync(
    albumPath,
    albumYaml({ title, artistSlugs, releaseDate, bucket, mbid: picked?.id, cover, coverSource }),
    'utf8',
  );
  console.log(`\n앨범 파일 생성: content/albums/${albumSlug}.yaml`);
  console.log(
    `다음 단계: content/reviews/${albumSlug}.md 에 평론을 쓰고 push 하세요 (album·score·date·editorial_check 필수).`,
  );
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
