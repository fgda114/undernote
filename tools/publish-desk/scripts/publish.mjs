#!/usr/bin/env node
/**
 * Orchestrator — the only non-pure module in this package. Everything it
 * decides is delegated to the pure functions in the sibling modules; this
 * file's own job is sequencing + file I/O, called once per workflow run
 * from `.github/workflows/publish.yml` with the issue's data (and MODE —
 * see below) in env vars.
 *
 * Contract with the workflow: this script NEVER calls `npm run build` and
 * NEVER commits or pushes — it only writes/deletes files under
 * $PUBLIC_REPO_DIR and then writes ONE result file,
 * scripts/publish-result.json, for the workflow to act on:
 *
 *   success -> { ok: true, action, kind, slug, url, notes: string[], createdArtistSlug? }
 *   PD-*    -> { ok: false, code: "PD-...", message: "<Korean, ready to post>" }
 *
 * `action` is 'publish' | 'update' | 'takedown' (MODE, echoed back) — added
 * 2026-09-08 alongside the update/take-down pipelines; `kind` stays
 * 'review' | 'story' as before. It MAY also read git history (read-only:
 * `git log`/`git show` against the already-checked-out public repo, never a
 * write) to recover a prior publish's identity for MODE=update/takedown —
 * see resolve-published.mjs for why that is not a "touches git" violation
 * of the rule above, which is about MUTATING state, not reading it.
 *
 * A thrown/uncaught error (a bug here, or an unexpected I/O fault) is NOT
 * written as a PD-* result — it exits nonzero with nothing in
 * publish-result.json, and the workflow treats an absent/unparsable result
 * file as an infrastructure failure (formatInfraErrorComment), never as
 * something the writer could act on. This split — "the writer can fix it"
 * vs "only the developer can" — is the reason every failure path below
 * either produces a PD-* code or is left to propagate.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import sharp from 'sharp';

import { parseReviewForm, parseStoryForm } from './parse-form.mjs';
import { toMarkdownBody } from './body-to-markdown.mjs';
import { slugify, isValidSlug, combinedSlug, firstAvailableSlug, fallbackSlug } from './slugify.mjs';
import {
  listArtists,
  listAlbums,
  existingSlugSet,
  normalizeName,
  findArtistByName,
  findAlbumByTitleArtist,
  resolveGenreBuckets,
} from './resolve-content.mjs';
import { extractImageUrl, downloadImage, resizeCoverBuffer } from './cover.mjs';
import { reviewFile, albumFile, artistFile, storyFile, updateAlbumCover } from './frontmatter.mjs';
import { resolveOriginalPublication } from './resolve-published.mjs';
import { planReviewTakedown, planStoryTakedown, lockedSnapshotYears } from './takedown.mjs';

/** KST is fixed UTC+9, no DST — same pure-arithmetic convention as
 * src/lib/derive/lists.ts#currentYearMonthSeoul in the public repo. Used as
 * the review/story `date:` so the writer never has to type a date at all
 * (docs/publishing.md — a deliberate simplification vs the pre-automation
 * workflow, where a human copied today's date by hand). */
function todayKst(nowMs = Date.now()) {
  return new Date(nowMs + 9 * 3600_000).toISOString().slice(0, 10);
}

class PdError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function pdFail(code, message) {
  throw new PdError(code, message);
}

function readSiteConfig(publicRepoDir) {
  return parseYaml(readFileSync(join(publicRepoDir, 'config', 'site.yaml'), 'utf8'));
}

/**
 * Resolve an existing artist or decide the slug for a new one.
 *
 * NO LONGER ASKS BACK for a romanization (lead directive, 2026-09-08 —
 * reverses the previous "PD-SLUG-EMPTY, please supply one" behaviour): an
 * all-Korean name with no hint now gets a DETERMINISTIC fallback slug
 * (fallbackSlug — content-hash-based, see slugify.mjs) instead of stalling
 * the submission. `notes` collects a line explaining what was substituted
 * and why, which publishReview relays in the success comment — the writer
 * never picked this URL segment themselves, so they need to be told what it
 * is. A HINT the writer DID type, or a name that romanizes on its own, is
 * still validated/collision-checked exactly as before: those are values a
 * human is responsible for, so a conflict there is still worth stopping and
 * asking about (PD-SLUG-INVALID / PD-SLUG-COLLISION, unchanged).
 */
function resolveArtist({ name, slugHint }, publicRepoDir, notes) {
  const artists = listArtists(publicRepoDir);
  const match = findArtistByName(name, artists);
  if (match.status === 'ambiguous') {
    pdFail(
      'PD-AMBIGUOUS-ARTIST',
      `아티스트 "${name}"과(와) 같은 이름의 아티스트 페이지가 ${match.slugs.length}개 있어 어느 쪽인지 정할 수 없습니다 (${match.slugs.join(', ')}). User(개발 담당)에게 알려주세요 — 데이터 정리가 먼저 필요합니다.`,
    );
  }
  if (match.status === 'found') return { slug: match.slug, isNew: false };

  const existing = existingSlugSet(publicRepoDir, 'artists', '.md');
  const typed = slugHint.trim() || slugify(name);
  const usedFallback = typed === '';
  const candidate = usedFallback ? firstAvailableSlug(fallbackSlug('artist', name), existing) : typed;
  if (!isValidSlug(candidate)) {
    pdFail(
      'PD-SLUG-INVALID',
      `아티스트 영문 표기 "${candidate}"을(를) 인터넷 주소로 쓸 수 없습니다. 소문자 영문·숫자·하이픈만 사용해 주세요 (예: phoebe-bridgers).`,
    );
  }
  if (!usedFallback && existing.has(candidate)) {
    pdFail(
      'PD-SLUG-COLLISION',
      `아티스트 주소 "${candidate}"은(는) 이미 다른 아티스트가 쓰고 있습니다 (그리고 이름이 정확히 일치하지 않아 같은 사람으로 보지 않았습니다). "(선택) 아티스트 영문 표기" 칸에 다른 표기를 적어주세요.`,
    );
  }
  if (usedFallback) {
    notes.push(
      `아티스트 "${name}"의 인터넷 주소를 자동으로 "${candidate}"(으)로 정했습니다 — 이름이 한글이라 자동 변환이 안 돼서 임시로 붙인 주소입니다. 원하는 영문 표기가 있으면 User(개발 담당)에게 알려 바꿀 수 있습니다(다시 발행할 필요 없음).`,
    );
  }
  return { slug: candidate, isNew: true };
}

/** Resolve an existing album (by title+artist) or decide the slug for a new
 * one. Also enforces the 1-album-1-review invariant (E-108) BEFORE any file
 * is written, so a second review issue for the same album fails cleanly
 * instead of silently colliding with the review filename at build time.
 *
 * The primary slug attempt is built from the resolved artist SLUG, not the
 * raw artist name the writer typed: by the time this runs, resolveArtist()
 * already guaranteed `artistSlug` is a plain-ASCII kebab id (either reused,
 * a supplied hint, or itself a fallback), whereas the display name can still
 * be Korean. Using the name here would let slugify() silently drop it and
 * fall back to the title alone (album-add.ts's own convention —
 * "${artist-slug} ${title}" — is the one being mirrored). In practice
 * `combinedSlug([artistSlug, title])` is therefore never empty (artistSlug
 * alone always survives), so the fallback path below is defence in depth
 * for this call, not a path real submissions exercise today — kept for
 * parity with resolveArtist and in case a future caller passes an
 * unresolved artistSlug.
 *
 * NO LONGER ASKS BACK (same 2026-09-08 directive as resolveArtist): an
 * unresolvable title gets fallbackSlug('album', …, releaseDate) — release
 * year-month plus whatever romanized — instead of PD-SLUG-EMPTY. */
function resolveAlbum({ title, slugHint, artistSlug, releaseDate }, publicRepoDir, notes) {
  const albums = listAlbums(publicRepoDir);
  const match = findAlbumByTitleArtist(title, artistSlug, albums);
  if (match.status === 'ambiguous') {
    pdFail(
      'PD-AMBIGUOUS-ALBUM',
      `앨범 "${title}"과(와) 같은 제목의 앨범이 이 아티스트 이름으로 ${match.slugs.length}개 있어 어느 쪽인지 정할 수 없습니다 (${match.slugs.join(', ')}). User(개발 담당)에게 알려주세요.`,
    );
  }

  let slug;
  let isNew;
  if (match.status === 'found') {
    slug = match.slug;
    isNew = false;
  } else {
    const existing = existingSlugSet(publicRepoDir, 'albums', '.yaml');
    const typed = slugHint.trim() || combinedSlug([artistSlug, title]);
    const usedFallback = typed === '';
    const candidate = usedFallback ? firstAvailableSlug(fallbackSlug('album', `${artistSlug} ${title}`, releaseDate), existing) : typed;
    if (!isValidSlug(candidate)) {
      pdFail('PD-SLUG-INVALID', `앨범 주소 "${candidate}"을(를) 인터넷 주소로 쓸 수 없습니다. 소문자 영문·숫자·하이픈만 사용해 주세요.`);
    }
    if (!usedFallback && existing.has(candidate)) {
      pdFail(
        'PD-SLUG-COLLISION',
        `앨범 주소 "${candidate}"은(는) 이미 다른 앨범이 쓰고 있습니다 (그리고 제목이 정확히 일치하지 않아 같은 앨범으로 보지 않았습니다). "(선택) 앨범 주소" 칸에 다른 표기를 적어주세요.`,
      );
    }
    if (usedFallback) {
      notes.push(
        `앨범 "${title}"의 인터넷 주소를 자동으로 "${candidate}"(으)로 정했습니다 — 제목이 한글이라 자동 변환이 안 돼서 발매 연월을 바탕으로 붙인 주소입니다. 원하는 영문 표기가 있으면 User(개발 담당)에게 알려 바꿀 수 있습니다(다시 발행할 필요 없음).`,
      );
    }
    slug = candidate;
    isNew = true;
  }

  const reviewSlugs = existingSlugSet(publicRepoDir, 'reviews', '.md');
  if (reviewSlugs.has(slug)) {
    pdFail(
      'PD-REVIEW-EXISTS',
      `앨범 "${title}"에는 이미 평론이 있습니다(1앨범 1평론 규칙). 같은 앨범을 다시 다루려는 것이 아니라면 앨범명을 확인해 주세요. 이미 있는 평론을 고치고 싶다면 User(개발 담당)에게 알려주세요.`,
    );
  }

  return { slug, isNew };
}

/** Shared by both cover resolvers below: download + resize, or fail with a
 * PD-COVER-FETCH-FAILED whose recovery hint differs by caller (a first
 * publish vs an edit have different "what happens if you just leave this
 * empty" answers, so the hint is a parameter, not duplicated logic). */
async function fetchAndResizeCover(url, fetchImpl, emptyFieldHint) {
  try {
    const buffer = await downloadImage(url, fetchImpl);
    return await resizeCoverBuffer(buffer, sharp);
  } catch (err) {
    pdFail(
      'PD-COVER-FETCH-FAILED',
      `커버 이미지를 처리하지 못했습니다 (${err instanceof Error ? err.message : String(err)}). 사진을 다시 끌어다 놓고 저장해 주세요. ${emptyFieldHint}`,
    );
  }
}

async function resolveCover({ fieldText, albumIsNew, notes, fetchImpl }) {
  if (fieldText.trim() === '') return null;
  const url = extractImageUrl(fieldText);
  if (url === null) {
    pdFail(
      'PD-COVER-NOT-IMAGE',
      '"커버 이미지" 칸에 사진이 아닌 내용이 들어 있습니다. 사진 파일을 그 칸에 끌어다 놓으면 자동으로 업로드됩니다 — 다시 시도해 주세요. 사진 없이 발행하려면 그 칸을 비워두면 됩니다.',
    );
  }
  if (!albumIsNew) {
    // Never overwrite a curated cover on an existing album from a follow-up
    // review submission — see docs/publishing.md for why this is scoped out
    // rather than attempting an in-place YAML edit. (This is a DIFFERENT
    // situation from updateReview's own cover handling below: there, the
    // album is always THIS review's own, never a stranger's curated one.)
    notes.push('참고: 이미 있는 앨범이라 이번에 올린 커버 이미지는 반영되지 않았습니다 (기존 앨범 파일은 건드리지 않습니다).');
    return null;
  }
  return fetchAndResizeCover(url, fetchImpl, '급하면 그 칸을 비워두고 저장하면 기본 이미지로 우선 발행됩니다.');
}

/**
 * Cover resolution for the UPDATE path (docs/publishing.md §"수정"). Unlike
 * `resolveCover` above — which must never touch an EXISTING album's curated
 * cover when a review for that SAME album arrives from a different
 * submission — an edit always targets THIS review's OWN album, so a
 * non-empty cover field always replaces whatever is there now (placeholder
 * or not): that IS the feature ("나중에 넣어도 됩니다" — the form's own promise
 * to the writer, docs/publishing.md).
 */
async function resolveCoverForUpdate({ fieldText, fetchImpl }) {
  if (fieldText.trim() === '') return null;
  const url = extractImageUrl(fieldText);
  if (url === null) {
    pdFail(
      'PD-COVER-NOT-IMAGE',
      '"커버 이미지" 칸에 사진이 아닌 내용이 들어 있습니다. 사진 파일을 그 칸에 끌어다 놓으면 자동으로 업로드됩니다 — 다시 시도해 주세요. 사진을 바꾸지 않으려면 그 칸을 비워두면 됩니다.',
    );
  }
  return fetchAndResizeCover(url, fetchImpl, '급하면 그 칸을 비워두고 저장하면 커버는 지금 상태 그대로 유지됩니다.');
}

// `fetchImpl` defaults to the global fetch — tests inject a stub so the
// suite never makes a real network call (and so the one leg that IS
// verifiable offline, download→resize→write, still gets a real exercise
// against a real in-memory image instead of being skipped entirely).
async function publishReview({ issueBody, publicRepoDir, fetchImpl = fetch }) {
  const form = parseReviewForm(issueBody);
  const notes = [];

  // ── Resolve phase: figure out every decision and validate every value —
  // WRITE NOTHING YET. Mirrors scripts/album-add.ts's own resolve/commit
  // split (its module doc: "the interactive phase writes NOTHING… writes
  // happen in one commit phase at the end"). The reason is the same here:
  // a PD-* failure discovered halfway through (a bad genre label, a cover
  // that won't download) must never leave an orphan artist or album file
  // behind for the next run to trip over — E-113 would turn "genre typo"
  // into "orphan page blocks ALL publishing" on the very next build.
  const artist = resolveArtist({ name: form.artistName, slugHint: form.artistSlugHint }, publicRepoDir, notes);
  const album = resolveAlbum(
    { title: form.albumTitle, slugHint: form.albumSlugHint, artistSlug: artist.slug, releaseDate: form.releaseDate.trim() },
    publicRepoDir,
    notes,
  );

  const bodyMd = toMarkdownBody(form.bodyText);
  if (bodyMd.trim() === '') {
    pdFail('PD-MISSING-BODY', '평론 본문이 비어 있습니다. "글" 칸을 채워 주세요.');
  }

  // MULTI-GENRE (2026-09-08): a checkboxes field cannot enforce "at least one
  // of these boxes" the way a required dropdown enforced "exactly one" — the
  // Issue Form only guarantees each INDIVIDUAL option's own required flag,
  // and none of the genre options carry one (docs/publishing.md — completing
  // a gap the form itself cannot close, same class as PD-MISSING-BODY, not a
  // re-check of anything the eventual build already validates).
  if (album.isNew && form.genreLabels.length === 0) {
    pdFail('PD-GENRE-EMPTY', '장르가 하나도 선택되지 않았습니다. "장르" 항목에서 최소 1개를 선택해 주세요 (여러 개 선택 가능합니다).');
  }
  const buckets = album.isNew ? resolveGenreBuckets(form.genreLabels, publicRepoDir) : null;
  if (album.isNew && buckets.status !== 'found') {
    pdFail(
      'PD-GENRE-UNKNOWN',
      `장르 "${buckets.label}"을(를) 사이트 설정(config/genres.yaml)에서 찾지 못했습니다. 이슈 폼의 장르 목록이 사이트 설정과 어긋난 것 같습니다 — User(개발 담당)에게 알려주세요.`,
    );
  }

  const coverBuffer = await resolveCover({ fieldText: form.coverField, albumIsNew: album.isNew, notes, fetchImpl });
  const coverPath = coverBuffer ? `covers/${album.slug}.jpg` : undefined;

  // ── Commit phase: every value above is final — only file writes below. ──
  if (artist.isNew) {
    mkdirSync(join(publicRepoDir, 'content', 'artists'), { recursive: true });
    writeFileSync(join(publicRepoDir, 'content', 'artists', `${artist.slug}.md`), artistFile({ name: form.artistName }), 'utf8');
  }

  if (album.isNew) {
    mkdirSync(join(publicRepoDir, 'content', 'albums'), { recursive: true });
    writeFileSync(
      join(publicRepoDir, 'content', 'albums', `${album.slug}.yaml`),
      albumFile({
        title: form.albumTitle,
        artistSlugs: [artist.slug],
        releaseDate: form.releaseDate.trim(),
        buckets: buckets.ids,
        cover: coverPath,
        coverSource: coverPath ? '독자 제공 (발행 데스크, 축소본)' : undefined,
      }),
      'utf8',
    );
    if (coverBuffer) {
      mkdirSync(join(publicRepoDir, 'public', 'covers'), { recursive: true });
      writeFileSync(join(publicRepoDir, 'public', 'covers', `${album.slug}.jpg`), coverBuffer);
    }
  }

  mkdirSync(join(publicRepoDir, 'content', 'reviews'), { recursive: true });
  writeFileSync(
    join(publicRepoDir, 'content', 'reviews', `${album.slug}.md`),
    reviewFile({ albumSlug: album.slug, score: form.score.trim(), date: todayKst(), body: bodyMd }),
    'utf8',
  );

  const site = readSiteConfig(publicRepoDir);
  return {
    ok: true,
    action: 'publish',
    kind: 'review',
    slug: album.slug,
    url: `${site.base_url}/reviews/${album.slug}/`,
    notes,
    // Only set when THIS run created a brand-new artist file — the one
    // piece of ground truth report-comment.mjs's derived-E-113 filter needs
    // and cannot safely guess at from the build report alone (see its own
    // doc comment for why: guessing would risk hiding a REAL orphan).
    createdArtistSlug: artist.isNew ? artist.slug : undefined,
  };
}

/** "앨범명 (아티스트명)" or bare "앨범명" -> a storyAlbumRefSchema entry.
 * Never fails: an unresolved mention just becomes a {text} entry, which is
 * a fully valid, designed state (SS-9) — the ladder for that mention lights
 * up automatically once the album IS reviewed, with no edit needed. */
function resolveStoryAlbumLine(line, publicRepoDir) {
  const artists = listArtists(publicRepoDir);
  const albums = listAlbums(publicRepoDir);
  const parenMatch = /^(.+?)\s*\(([^()]+)\)\s*$/.exec(line);
  const title = parenMatch ? parenMatch[1].trim() : line;
  const artistName = parenMatch ? parenMatch[2].trim() : undefined;

  if (artistName) {
    const artistMatch = findArtistByName(artistName, artists);
    if (artistMatch.status === 'found') {
      const albumMatch = findAlbumByTitleArtist(title, artistMatch.slug, albums);
      if (albumMatch.status === 'found') return { ref: albumMatch.slug };
    }
  }
  return artistName ? { text: title, artist: artistName } : { text: title };
}

async function publishStory({ issueBody, publicRepoDir }) {
  const form = parseStoryForm(issueBody);

  if (form.title.trim() === '') pdFail('PD-MISSING-TITLE', '이야기 제목이 비어 있습니다.');
  const bodyMd = toMarkdownBody(form.bodyText);
  if (bodyMd.trim() === '') pdFail('PD-MISSING-BODY', '이야기 본문이 비어 있습니다. "글" 칸을 채워 주세요.');

  const existing = existingSlugSet(publicRepoDir, 'stories', '.md');
  const base = slugify(form.title) || `story-${todayKst()}`;
  const slug = firstAvailableSlug(base, existing);

  const albums = form.albumLines.map((line) => resolveStoryAlbumLine(line, publicRepoDir));

  mkdirSync(join(publicRepoDir, 'content', 'stories'), { recursive: true });
  writeFileSync(
    join(publicRepoDir, 'content', 'stories', `${slug}.md`),
    storyFile({ title: form.title, date: todayKst(), body: bodyMd, albums }),
    'utf8',
  );

  const site = readSiteConfig(publicRepoDir);
  return { ok: true, action: 'publish', kind: 'story', slug, url: `${site.base_url}/stories/${slug}/`, notes: [] };
}

/**
 * Apply an EDIT of an already-published review issue (docs/publishing.md
 * §"수정"). Exactly three things may ever change here — body, score, cover
 * — the decision-maker's explicit scope. Everything that would move the
 * review's IDENTITY (which album, which artist, which genre bucket, which
 * release date) is compared against the ORIGINAL publish
 * (resolve-published.mjs) and REJECTED with a PD-* explanation instead of
 * silently applying: undernote never moves a slug/URL once published (R-9),
 * and a bucket/date change would retroactively reclassify content the
 * archive/lists already derived from the old value (R-2/R-8,
 * exceptions.md). `date:` itself is likewise frozen — an edit changes what
 * the review SAYS, never WHEN it counts as published (R-1's tie-break, and
 * the archive's publication-year axis, both key off it).
 */
async function updateReview({ issueBody, issueNumber, publicRepoDir, fetchImpl = fetch, git = undefined }) {
  const form = parseReviewForm(issueBody);
  const original = resolveOriginalPublication({ issueNumber, publicRepoDir, git, parseYaml });
  if (original === null || original.kind !== 'review') {
    // Structurally should be unreachable: MODE=update only ever runs when
    // the `published` label is already on the issue, which this workflow
    // itself only ever adds right after the ORIGINAL publish commit lands.
    // Not a PD-* — the writer has no field to fix here; only the developer
    // can (see this file's own module doc on the PD-* vs thrown-error split).
    throw new Error(`발행 이력을 찾지 못했습니다 (issue #${issueNumber}) — published 라벨은 있는데 대응하는 발행 커밋이 없습니다.`);
  }

  const changed = [];
  if (normalizeName(form.albumTitle) !== normalizeName(original.albumTitle)) {
    changed.push(`앨범명 "${original.albumTitle}" → "${form.albumTitle}"`);
  }
  if (normalizeName(form.artistName) !== normalizeName(original.artistName)) {
    changed.push(`아티스트명 "${original.artistName}" → "${form.artistName}"`);
  }
  if (form.releaseDate.trim() !== original.releaseDate) {
    changed.push(`발매일 "${original.releaseDate}" → "${form.releaseDate.trim()}"`);
  }
  // MULTI-GENRE (2026-09-08): `form.genreLabels` is zero or more checked
  // labels (was a single dropdown value); resolve the whole set the same way
  // publishReview does. `buckets.label` below is whichever label failed to
  // resolve — resolveGenreBuckets stops and reports the first one, mirroring
  // publishReview's own PD-GENRE-UNKNOWN (config drift is config drift,
  // whether hit while creating or editing).
  const buckets = resolveGenreBuckets(form.genreLabels, publicRepoDir);
  if (buckets.status !== 'found') {
    pdFail(
      'PD-GENRE-UNKNOWN',
      `장르 "${buckets.label}"을(를) 사이트 설정(config/genres.yaml)에서 찾지 못했습니다. 이슈 폼의 장르 목록이 사이트 설정과 어긋난 것 같습니다 — User(개발 담당)에게 알려주세요.`,
    );
  } else {
    // A SET comparison, not an array-order comparison: `original.bucketIds`
    // came from whatever order the ORIGINAL publish happened to write (which
    // may not match `buckets.ids`' current resolution order — e.g. if
    // config/genres.yaml's bucket order, or the Issue Form's checkbox order,
    // changed since). [rock, folk] and [folk, rock] are the same identity;
    // only an actual addition or removal may lock the edit.
    const before = new Set(original.bucketIds);
    const after = new Set(buckets.ids);
    const added = buckets.ids.filter((id) => !before.has(id));
    const removed = original.bucketIds.filter((id) => !after.has(id));
    if (added.length > 0 || removed.length > 0) {
      const parts = [];
      if (added.length > 0) parts.push(`추가됨: ${added.join(', ')}`);
      if (removed.length > 0) parts.push(`제외됨: ${removed.join(', ')}`);
      changed.push(`장르 (${parts.join(', ')})`);
    }
  }

  if (changed.length > 0) {
    pdFail(
      'PD-IDENTITY-LOCKED',
      [
        '앨범명·아티스트명·장르·발매일은 이 화면에서 고칠 수 없습니다 — 이 값들은 글의 인터넷 주소나 분류를 바꾸기 때문입니다.',
        `바뀐 항목: ${changed.join(', ')}`,
        '이 칸들을 처음 저장했을 때의 값으로 되돌리고, 본문·점수·커버만 고쳐서 다시 저장해 주세요.',
        '정말 앨범명 등을 바꿔야 한다면 User(개발 담당)에게 이 글의 번호를 알려주세요 — 그건 직접 손봐야 합니다.',
      ].join('\n'),
    );
  }

  const bodyMd = toMarkdownBody(form.bodyText);
  if (bodyMd.trim() === '') pdFail('PD-MISSING-BODY', '평론 본문이 비어 있습니다. "글" 칸을 채워 주세요.');

  const notes = [];
  const coverBuffer = await resolveCoverForUpdate({ fieldText: form.coverField, fetchImpl });

  // ── Commit phase ──
  writeFileSync(
    join(publicRepoDir, 'content', 'reviews', `${original.slug}.md`),
    reviewFile({ albumSlug: original.slug, score: form.score.trim(), date: original.originalDate, body: bodyMd }),
    'utf8',
  );
  if (coverBuffer) {
    const albumPath = join(publicRepoDir, 'content', 'albums', `${original.slug}.yaml`);
    writeFileSync(
      albumPath,
      updateAlbumCover(readFileSync(albumPath, 'utf8'), {
        cover: `covers/${original.slug}.jpg`,
        coverSource: '독자 제공 (발행 데스크, 수정 — 축소본)',
      }),
      'utf8',
    );
    mkdirSync(join(publicRepoDir, 'public', 'covers'), { recursive: true });
    writeFileSync(join(publicRepoDir, 'public', 'covers', `${original.slug}.jpg`), coverBuffer);
    notes.push('커버 이미지를 새로 올린 사진으로 바꿨습니다.');
  }

  const site = readSiteConfig(publicRepoDir);
  return { ok: true, action: 'update', kind: 'review', slug: original.slug, url: `${site.base_url}/reviews/${original.slug}/`, notes };
}

/**
 * Apply an EDIT of an already-published story issue. By the same "never
 * move a slug/URL" rule as updateReview, `제목` (title — the story's own
 * slug source) is locked; body and the album-mentions list are free to
 * change (neither affects any URL — a mention only ever renders as text or
 * a link to an ALBUM's own page, never creates one of its own).
 */
async function updateStory({ issueBody, issueNumber, publicRepoDir, git = undefined }) {
  const form = parseStoryForm(issueBody);
  const original = resolveOriginalPublication({ issueNumber, publicRepoDir, git, parseYaml });
  if (original === null || original.kind !== 'story') {
    throw new Error(`발행 이력을 찾지 못했습니다 (issue #${issueNumber}) — published 라벨은 있는데 대응하는 발행 커밋이 없습니다.`);
  }

  if (form.title.trim() !== original.title) {
    pdFail(
      'PD-IDENTITY-LOCKED',
      [
        '제목은 이 화면에서 고칠 수 없습니다 — 이야기의 인터넷 주소가 제목에서 만들어지기 때문입니다.',
        `바뀐 항목: 제목 "${original.title}" → "${form.title.trim()}"`,
        '제목 칸을 처음 저장했을 때의 값으로 되돌리고, 본문과 "언급한 앨범들"만 고쳐서 다시 저장해 주세요.',
        '정말 제목을 바꿔야 한다면 User(개발 담당)에게 이 글의 번호를 알려주세요.',
      ].join('\n'),
    );
  }

  const bodyMd = toMarkdownBody(form.bodyText);
  if (bodyMd.trim() === '') pdFail('PD-MISSING-BODY', '이야기 본문이 비어 있습니다. "글" 칸을 채워 주세요.');

  const albums = form.albumLines.map((line) => resolveStoryAlbumLine(line, publicRepoDir));
  writeFileSync(
    join(publicRepoDir, 'content', 'stories', `${original.slug}.md`),
    storyFile({ title: form.title, date: original.originalDate, body: bodyMd, albums }),
    'utf8',
  );

  const site = readSiteConfig(publicRepoDir);
  return { ok: true, action: 'update', kind: 'story', slug: original.slug, url: `${site.base_url}/stories/${original.slug}/`, notes: [] };
}

/**
 * Take an already-published review down (docs/publishing.md §"삭제"):
 * delete the review, and — per the decision-maker's explicit policy — its
 * album/cover and artist file too, but ONLY when nothing else in the repo
 * still needs them (planReviewTakedown, takedown.mjs). Refuses outright,
 * BEFORE touching any file, if the review is frozen into a confirmed
 * year-end snapshot (R-2) — deleting it anyway would only surface later as
 * an opaque E-110 build failure with no actionable next step for the writer.
 */
async function takedownReview({ issueNumber, publicRepoDir, git = undefined }) {
  const original = resolveOriginalPublication({ issueNumber, publicRepoDir, git, parseYaml });
  if (original === null || original.kind !== 'review') {
    throw new Error(`발행 이력을 찾지 못했습니다 (issue #${issueNumber}).`);
  }
  const lockedYears = lockedSnapshotYears(original.slug, publicRepoDir);
  if (lockedYears.length > 0) {
    pdFail(
      'PD-TAKEDOWN-LOCKED',
      `이 글은 ${lockedYears.join(', ')}년 확정 연말 리스트에 실려 있어 내릴 수 없습니다 — 확정된 리스트는 어떤 이유로도 바뀌지 않는다는 이 매거진의 원칙 때문입니다. 정말 내려야 한다면 User(개발 담당)에게 이 글의 번호를 알려주세요.`,
    );
  }

  const plan = planReviewTakedown({ slug: original.slug, publicRepoDir });
  for (const rel of plan.deleteFiles) {
    const abs = join(publicRepoDir, rel);
    if (existsSync(abs)) rmSync(abs);
  }

  const notes = [];
  if (plan.deleteAlbum) notes.push('평론뿐 아니라 앨범 페이지도 함께 내렸습니다 (더는 이 앨범을 다루는 다른 글이 없습니다).');
  if (plan.deleteArtists.length > 0) notes.push(`아티스트 페이지도 함께 내렸습니다: ${plan.deleteArtists.join(', ')}.`);
  return { ok: true, action: 'takedown', kind: 'review', slug: original.slug, url: null, notes };
}

/** Symmetric take-down for a story (docs/publishing.md §"삭제") — no
 * snapshot lock applies (a snapshot never references a story, only album
 * slugs via reviews — src/lib/schema/snapshot.ts), so this is simpler than
 * takedownReview: delete the story, then any artist that becomes
 * unreachable as a result (planStoryTakedown, takedown.mjs). */
async function takedownStory({ issueNumber, publicRepoDir, git = undefined }) {
  const original = resolveOriginalPublication({ issueNumber, publicRepoDir, git, parseYaml });
  if (original === null || original.kind !== 'story') {
    throw new Error(`발행 이력을 찾지 못했습니다 (issue #${issueNumber}).`);
  }

  const plan = planStoryTakedown({ slug: original.slug, publicRepoDir });
  for (const rel of plan.deleteFiles) {
    const abs = join(publicRepoDir, rel);
    if (existsSync(abs)) rmSync(abs);
  }

  const notes = [];
  if (plan.deleteArtists.length > 0) notes.push(`아티스트 페이지도 함께 내렸습니다: ${plan.deleteArtists.join(', ')}.`);
  return { ok: true, action: 'takedown', kind: 'story', slug: original.slug, url: null, notes };
}

async function main() {
  const publicRepoDir = process.env.PUBLIC_REPO_DIR;
  const mode = process.env.MODE || 'publish'; // 'publish' | 'update' | 'takedown'
  const issueKind = process.env.ISSUE_KIND; // 'review' | 'story'
  const issueBody = process.env.ISSUE_BODY ?? '';
  const issueNumber = process.env.ISSUE_NUMBER ?? '';
  const resultPath = process.env.PUBLISH_RESULT_PATH ?? join(process.cwd(), 'publish-result.json');

  if (!publicRepoDir || !existsSync(publicRepoDir)) {
    throw new Error(`PUBLIC_REPO_DIR가 없거나 존재하지 않습니다: "${publicRepoDir}"`);
  }

  try {
    const isStory = issueKind === 'story';
    let result;
    if (mode === 'update') {
      result = isStory ? await updateStory({ issueBody, issueNumber, publicRepoDir }) : await updateReview({ issueBody, issueNumber, publicRepoDir });
    } else if (mode === 'takedown') {
      result = isStory ? await takedownStory({ issueNumber, publicRepoDir }) : await takedownReview({ issueNumber, publicRepoDir });
    } else {
      result = isStory ? await publishStory({ issueBody, publicRepoDir }) : await publishReview({ issueBody, publicRepoDir });
    }
    writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');
  } catch (err) {
    if (err instanceof PdError) {
      writeFileSync(resultPath, JSON.stringify({ ok: false, code: err.code, message: err.message }, null, 2), 'utf8');
      process.exitCode = 1;
      return;
    }
    // Not a PD-* — an infrastructure/bug failure. Deliberately no result
    // file: the workflow treats "no parsable result" as formatInfraErrorComment.
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

export {
  publishReview,
  publishStory,
  updateReview,
  updateStory,
  takedownReview,
  takedownStory,
  resolveArtist,
  resolveAlbum,
  resolveStoryAlbumLine,
  todayKst,
};
