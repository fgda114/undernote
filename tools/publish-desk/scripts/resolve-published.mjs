/**
 * Recovers "what did issue #N originally publish" straight from the PUBLIC
 * repo's own git history — the only durable record this pipeline keeps of
 * the issue-number -> slug mapping (docs/publishing.md §"이슈 번호를 어떻게
 * 다시 찾는가"). No separate index file is kept in the private repo on
 * purpose: the "Commit and push" step in .github/workflows/publish.yml
 * already writes `(issue #N)` into every commit message, and the workflow
 * checks that repo out on every single run anyway — reading its log costs
 * nothing extra and, being derived from the one thing that is genuinely
 * permanent (a pushed commit), can never drift out of sync with itself the
 * way a hand-maintained JSON index could after a failed/partial run.
 *
 * Convention this module depends on (owned by the SAME package — the
 * "Commit and push" step): the FIRST commit that ever published issue N is
 * always a two-paragraph message —
 *
 *   발행: <title>
 *
 *   Issue-Number: <N>
 *
 * — authored by this workflow's own commit identity ("undernote publish
 * desk"). A LATER edit commits `수정: <title>` (same `Issue-Number:` trailer
 * form) instead — a different first-line prefix, on purpose, so this lookup
 * always resolves to exactly one commit no matter how many times an issue
 * has since been edited.
 *
 * The issue NUMBER lives on its OWN paragraph, not inlined into the title
 * line, and is matched with `^Issue-Number: N$` (start/end of line, exactly
 * — see MATCH_TRAILER below): a writer's issue TITLE is untrusted, writer-
 * controlled text that lands verbatim in the first line, so it must never be
 * able to satisfy the number match no matter what it contains. Before this
 * split, the issue number was matched as a bare substring `(issue #N)`
 * sharing the FIRST line with the title — a title containing the literal
 * text "(issue #3)" (accidentally or on purpose) made THAT COMMIT match
 * issue #3's lookup too, and `.pop()` (oldest match wins) could then return
 * the wrong commit entirely, with `updateReview` overwriting an unrelated
 * album's review file (code review MJ-1, reproduced against a throwaway
 * repo). A title can only ever occupy the commit message's first line
 * (GitHub issue titles cannot contain a newline), so it can never reach a
 * `^Issue-Number: N$`-anchored second paragraph.
 *
 * Known weakness (reported honestly, not glossed over — see this package's
 * own report to the team lead): if a DEVELOPER later hand-edits the album or
 * artist file outside this pipeline (e.g. fixing a typo directly), the
 * "original" values read here stay the OLD (pre-fix) ones, because they are
 * read from the git blob at the ORIGINAL commit, not from HEAD. A
 * legitimate no-op edit that happens to match the developer's corrected
 * value would then be misreported as "identity changed". This is considered
 * acceptable: it fails CLOSED (asks a human instead of silently applying
 * something), and is rare enough (a developer bypassing the writer's own
 * pipeline) not to warrant a second, separate mutable index that could
 * itself drift.
 */
import { execFileSync } from 'node:child_process';

const PUBLISH_COMMIT_AUTHOR = 'undernote publish desk';
const PUBLISH_PREFIX = '발행: ';

/** `N` must be the exact numeric issue number, never writer-controlled text
 * (it comes from `github.event.issue.number`, an integer GitHub assigns —
 * never rendered from the issue body/title). No escaping is needed: a
 * decimal integer contains no BRE metacharacters. */
function issueNumberTrailer(issueNumber) {
  return `^Issue-Number: ${issueNumber}$`;
}

/** Default git runner — shells out to a real `git` in `cwd`. Tests inject a
 * stub (no real repository needed for the decision-logic cases) plus a
 * separate suite that runs this against a REAL throwaway `git init` fixture
 * (resolve-published.test.mjs) so the actual git plumbing — not just the
 * string wiring around it — is proven too. */
function defaultGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseFrontmatterText(raw, parseYaml) {
  const match = FRONTMATTER_RE.exec(raw);
  return match ? (parseYaml(match[1]) ?? {}) : {};
}

/**
 * @returns {string|null} the commit SHA that first published `issueNumber`,
 * or null if no such commit exists — every publish attempt for this issue
 * failed the build (nothing was ever actually committed), or it was never a
 * publish issue at all. Callers must treat null as "nothing to update/take
 * down" (a PD-* condition the writer can act on, or in practice unreachable
 * given the `published` label can only exist if a publish commit landed),
 * never as an infrastructure fault.
 */
export function findOriginalPublishCommit({ issueNumber, publicRepoDir, git = defaultGit }) {
  // NOT --fixed-strings: `^`/`$` below must be read as regex anchors (git's
  // default grep mode is POSIX basic regex with each embedded newline in the
  // commit message treated as its own line boundary — verified against a
  // real repo in resolve-published.test.mjs). Both patterns stay literal
  // otherwise: `PUBLISH_PREFIX` is fixed Korean text with no BRE
  // metacharacters, and `issueNumberTrailer` only ever interpolates a
  // decimal integer (see its own doc comment) — neither needs escaping.
  const out = git(
    [
      'log',
      '--format=%H',
      `--author=${PUBLISH_COMMIT_AUTHOR}`,
      '--grep',
      `^${PUBLISH_PREFIX}`,
      '--grep',
      issueNumberTrailer(issueNumber),
      '--all-match',
    ],
    publicRepoDir,
  ).trim();
  if (out === '') return null;
  // `git log` lists newest-first; the original publish is definitionally
  // the OLDEST match (in the — structurally near-impossible — case more
  // than one line comes back at all).
  return out.split('\n').filter(Boolean).pop();
}

function changedFiles(sha, publicRepoDir, git) {
  return git(['show', '--name-only', '--format=', sha], publicRepoDir)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function showFile(sha, path, publicRepoDir, git) {
  return git(['show', `${sha}:${path}`], publicRepoDir);
}

/**
 * Recover the original publish: which kind, which slug, the frozen `date:`
 * a later edit must never move, and — for a review — the identity fields
 * (album title, artist name, release date, bucket id) the update path
 * refuses to let change (docs/publishing.md).
 *
 * @param {(raw: string) => unknown} parseYaml - injected (not imported here)
 *   so this module never pulls in the `yaml` package a second time;
 *   publish.mjs already has it.
 * @returns {null | { kind: 'review', slug, sha, originalDate, albumTitle,
 *   artistName, artistSlug, releaseDate, bucketIds } |
 *   { kind: 'story', slug, sha, originalDate, title }}
 */
export function resolveOriginalPublication({ issueNumber, publicRepoDir, git = defaultGit, parseYaml }) {
  const sha = findOriginalPublishCommit({ issueNumber, publicRepoDir, git });
  if (sha === null) return null;

  const files = changedFiles(sha, publicRepoDir, git);
  const reviewFile = files.find((f) => /^content\/reviews\/[^/]+\.md$/.test(f));
  const storyFile = files.find((f) => /^content\/stories\/[^/]+\.md$/.test(f));

  if (reviewFile) {
    const slug = reviewFile.slice('content/reviews/'.length, -'.md'.length);
    const review = parseFrontmatterText(showFile(sha, reviewFile, publicRepoDir, git), parseYaml);
    // The album file need not have been ADDED in this same commit (a review
    // for a pre-existing album never touches content/albums/) — `git show`
    // still resolves it as long as the file existed in the tree at `sha`,
    // which it always does when this review references it (E-102).
    const album = parseYaml(showFile(sha, `content/albums/${slug}.yaml`, publicRepoDir, git)) ?? {};
    const artistSlug = Array.isArray(album.artists) ? album.artists[0] : undefined;
    let artistName = '';
    if (artistSlug) {
      try {
        artistName = String(
          parseFrontmatterText(showFile(sha, `content/artists/${artistSlug}.md`, publicRepoDir, git), parseYaml)?.name ?? '',
        );
      } catch {
        // Artist file since renamed/removed by something outside this
        // pipeline — an empty name can never match a real submitted name,
        // so this degrades to "treat as changed" (fail closed), never to a
        // false pass.
      }
    }
    return {
      kind: 'review',
      slug,
      sha,
      originalDate: String(review.date ?? ''),
      albumTitle: String(album.title ?? ''),
      artistName,
      artistSlug: artistSlug ?? '',
      releaseDate: String(album.release_date ?? ''),
      // MULTI-GENRE (2026-09-08): `buckets` is an array (album.ts schema —
      // was singular `bucket` before). Read here exactly as written, in
      // whatever order the ORIGINAL publish stored it; the update path
      // (publish.mjs#updateReview) is responsible for comparing this against
      // a re-submission as a SET, never by array position — nothing here
      // guarantees the two orders ever line up (e.g. config/genres.yaml's
      // own bucket order, or the Issue Form's checkbox order, may both
      // change over the life of a published album).
      bucketIds: Array.isArray(album.buckets) ? album.buckets.map(String) : [],
    };
  }

  if (storyFile) {
    const slug = storyFile.slice('content/stories/'.length, -'.md'.length);
    const story = parseFrontmatterText(showFile(sha, storyFile, publicRepoDir, git), parseYaml);
    return { kind: 'story', slug, sha, originalDate: String(story.date ?? ''), title: String(story.title ?? '') };
  }

  return null;
}
