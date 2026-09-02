/**
 * Cross-file integrity checks (checker pre-pass, after shape validation):
 *   E-101 empty body · E-102 review→album · E-103 album→artists ·
 *   E-104 bucket vs release-year config · E-108 file name = album field ·
 *   E-114 duplicate-year snapshot
 *   E-201 unregistered tags · E-203 story without refs · E-204 dead story ref ·
 *   E-205 no listen links
 *
 * Notes on scope: E-109 (reserved "etc") lives in the genres schema itself;
 * E-105/106/107 field shapes live in the content schemas — this module only
 * checks relations that no single file can know about.
 *
 * Empty artist body is NOT E-101: an aggregation-only artist page is a
 * designed state (api-contracts §3.4, US-14/R-4) — E-101 applies to reviews
 * and stories, where the body IS the product.
 */
import { defaultListenLinks } from '../listen-links.ts';
import type { RepoData } from './load.ts';
import type { CheckResult, Finding } from './types.ts';
import { emptyResult } from './types.ts';

function releaseYear(releaseDate: string): number {
  return Number(releaseDate.slice(0, 4));
}

/** Normalize a tag for registry lookup: exact canonical slug or alias. */
function tagStatus(tag: string, data: RepoData): 'canonical' | { alias: string } | 'unknown' {
  const registry = data.tags?.tags ?? [];
  for (const entry of registry) {
    if (entry.slug === tag) return 'canonical';
    if (entry.aliases.includes(tag)) return { alias: entry.slug };
  }
  return 'unknown';
}

export function resolveRepo(data: RepoData): CheckResult {
  const result = emptyResult();
  const { failures, warnings } = result;

  const albumsBySlug = new Map(data.albums.map((a) => [a.slug, a]));
  const artistSlugs = new Set(data.artists.map((a) => a.slug));
  const genreYears = new Map((data.genres?.years ?? []).map((y) => [y.year, y]));

  // ── Reviews ──────────────────────────────────────────────────────────
  for (const review of data.reviews) {
    if (review.body.trim().length === 0) {
      failures.push({
        code: 'E-101',
        message: 'E-101: 평론 본문이 비어 있습니다. 글이 곧 제품입니다 — 본문 없이 발행할 수 없습니다.',
        file: review.file,
      });
    }
    if (review.slug !== review.data.album) {
      failures.push({
        code: 'E-108',
        message: `E-108: 파일명 "${review.slug}"과(와) album 필드 "${review.data.album}"이(가) 다릅니다. 평론 파일명은 앨범 slug와 같아야 합니다 (1앨범 1평론). 파일명 또는 album 필드를 맞추세요.`,
        file: review.file,
      });
    }
    if (!albumsBySlug.has(review.data.album)) {
      failures.push({
        code: 'E-102',
        message: `E-102: album "${review.data.album}"에 해당하는 앨범 파일(content/albums/${review.data.album}.yaml)이 없습니다. album-add로 앨범을 먼저 만들거나 slug 오타를 확인하세요.`,
        file: review.file,
      });
    }
  }

  // ── Albums ───────────────────────────────────────────────────────────
  for (const album of data.albums) {
    for (const artist of album.data.artists) {
      if (!artistSlugs.has(artist)) {
        failures.push({
          code: 'E-103',
          message: `E-103: artists의 "${artist}"에 해당하는 아티스트 파일(content/artists/${artist}.md)이 없습니다. 파일을 만들거나 slug 오타를 확인하세요 (표기명 해석 불능).`,
          file: album.file,
        });
      }
    }

    // Bucket must exist in the RELEASE YEAR's config block ("etc" always ok).
    if (album.data.bucket !== 'etc' && data.genres) {
      const year = releaseYear(album.data.release_date);
      const block = genreYears.get(year);
      const ids = block ? block.buckets.map((b) => b.id) : [];
      if (!ids.includes(album.data.bucket)) {
        failures.push({
          code: 'E-104',
          message: block
            ? `E-104: bucket "${album.data.bucket}"은(는) 발매 연도 ${year}의 버킷 설정에 없습니다. 사용 가능: ${ids.join(', ')} 또는 "etc". config/genres.yaml을 확인하세요.`
            : `E-104: 발매 연도 ${year}의 버킷 설정 블록이 config/genres.yaml에 없습니다. ${year} 연도 블록을 추가하거나 bucket을 "etc"로 지정하세요.`,
          file: album.file,
        });
      }
    }

    checkTags(album.data.tags, album.file, data, warnings);

    // E-205: no listen links at all — publish with the row hidden, but warn.
    if ((album.data.listen_links?.length ?? 0) === 0) {
      const patterns = data.site?.listen_link_patterns ?? defaultListenLinks;
      if (Object.keys(patterns).length === 0) {
        warnings.push({
          code: 'E-205',
          message: 'E-205: 듣기 링크가 수기·자동 모두 없습니다. 링크 영역 없이 발행됩니다. listen_links를 추가하면 표시됩니다.',
          file: album.file,
        });
      }
    }
  }

  // ── Stories ──────────────────────────────────────────────────────────
  for (const story of data.stories) {
    if (story.body.trim().length === 0) {
      failures.push({
        code: 'E-101',
        message: 'E-101: 이야기 본문이 비어 있습니다. 본문 없이 발행할 수 없습니다.',
        file: story.file,
      });
    }
    if (story.data.albums.length === 0) {
      warnings.push({
        code: 'E-203',
        message: 'E-203: 참조 앨범이 0개입니다. 발행은 되지만 사다리(평론↔이야기 연결)에 참여하지 않습니다. 앨범을 다뤘다면 albums 목록을 채워 주세요.',
        file: story.file,
      });
    }
    for (const ref of story.data.albums) {
      if ('ref' in ref && !albumsBySlug.has(ref.ref)) {
        warnings.push({
          code: 'E-204',
          message: `E-204: albums의 ref "${ref.ref}"에 해당하는 앨범이 없습니다. 오타라면 고치고, 의도적 미등록 참조라면 {text: "표기"} 형태를 쓰세요.`,
          file: story.file,
        });
      }
    }
    checkTags(story.data.tags, story.file, data, warnings);
  }

  // ── Snapshots — duplicate year (E-114; schema shape is covered upstream) ─
  const seenYears = new Map<number, string>();
  for (const snap of data.snapshots) {
    const prev = seenYears.get(snap.data.year);
    if (prev) {
      failures.push({
        code: 'E-114',
        message: `E-114: ${snap.data.year}년 스냅샷이 중복입니다 (${prev}와 충돌). 연간 확정본은 연도당 1개여야 합니다.`,
        file: snap.file,
      });
    } else {
      seenYears.set(snap.data.year, snap.file);
    }
  }

  return result;
}

function checkTags(tags: string[], file: string, data: RepoData, warnings: Finding[]): void {
  for (const tag of tags) {
    const status = tagStatus(tag, data);
    if (status === 'canonical') continue;
    warnings.push({
      code: 'E-201',
      message:
        typeof status === 'object'
          ? `E-201: 태그 "${tag}"은(는) 등록부의 별칭입니다 — 표준 표기 "${status.alias}"로 바꿔 주세요 (콘텐츠는 canonical slug만 저장).`
          : `E-201: 태그 "${tag}"이(가) 등록부(config/tags.yaml)에 없습니다. 새 태그라면 등록부에 {slug: ${tag}, label: …}을 추가해 주세요.`,
      file,
    });
  }
}
