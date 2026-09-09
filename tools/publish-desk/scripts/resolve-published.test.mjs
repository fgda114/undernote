import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { findOriginalPublishCommit, resolveOriginalPublication } from './resolve-published.mjs';

/**
 * A REAL throwaway git repository, shaped exactly like a `public/` checkout
 * after a few publish-desk runs — not a stub. This is what proves the git
 * PLUMBING (log --grep --all-match --author, show <sha>:<path>) behaves as
 * this module assumes, as distinct from the string-wiring around it.
 */
function makeGitFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), 'publish-desk-git-'));
  const run = (cmd) => execFileSync('sh', ['-c', cmd], { cwd: root, encoding: 'utf8' });
  run('git init -q -b main');
  run('git config user.email "actions@users.noreply.github.com"');
  run('git config user.name "undernote publish desk"');

  mkdirSync(join(root, 'content', 'artists'), { recursive: true });
  mkdirSync(join(root, 'content', 'albums'), { recursive: true });
  mkdirSync(join(root, 'content', 'reviews'), { recursive: true });
  mkdirSync(join(root, 'content', 'stories'), { recursive: true });

  // issue #7 — a review of a brand new artist/album.
  writeFileSync(join(root, 'content', 'artists', 'phoebe-bridgers.md'), '---\nname: Phoebe Bridgers\n---\n', 'utf8');
  writeFileSync(
    join(root, 'content', 'albums', 'phoebe-bridgers-lost-weekend.yaml'),
    'title: "Lost Weekend"\nartists: [phoebe-bridgers]\nrelease_date: "2026"\nbuckets: [rock]\n',
    'utf8',
  );
  writeFileSync(
    join(root, 'content', 'reviews', 'phoebe-bridgers-lost-weekend.md'),
    '---\nalbum: phoebe-bridgers-lost-weekend\nscore: "8.4"\ndate: 2026-09-06\neditorial_check: true\n---\n\n원래 본문\n',
    'utf8',
  );
  run('git add -A && git commit -q -m "발행: [평론] Lost Weekend (issue #7)"');

  // A LATER edit (issue #7 again) — must NOT be picked up as the original.
  writeFileSync(
    join(root, 'content', 'reviews', 'phoebe-bridgers-lost-weekend.md'),
    '---\nalbum: phoebe-bridgers-lost-weekend\nscore: "8.5"\ndate: 2026-09-06\neditorial_check: true\n---\n\n고친 본문\n',
    'utf8',
  );
  run('git add -A && git commit -q -m "수정: [평론] Lost Weekend (issue #7)"');

  // issue #12 — a story.
  writeFileSync(
    join(root, 'content', 'stories', '93-summer.md'),
    '---\ntitle: "93년 여름"\ndate: 2026-09-08\nalbums: []\n---\n\n이야기 본문\n',
    'utf8',
  );
  run('git add -A && git commit -q -m "발행: [이야기] 93년 여름 (issue #12)"');

  // issue #1 — an UNRELATED number that happens to be a numeric PREFIX of
  // #12's digits reversed is not a risk here, but #1 vs #12 (both share the
  // digit "1") IS the realistic collision this repo's fixed-string grep must
  // not fall into: "(issue #1)" must never match inside "(issue #12)".
  writeFileSync(join(root, 'content', 'stories', 'unrelated.md'), '---\ntitle: "무관한 글"\ndate: 2026-09-08\nalbums: []\n---\n\n본문\n', 'utf8');
  run('git add -A && git commit -q -m "발행: [이야기] 무관한 글 (issue #1)"');

  return root;
}

test('resolve-published: against a REAL git repository', async (t) => {
  const root = makeGitFixtureRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  await t.test('findOriginalPublishCommit finds the FIRST ("발행: ") commit, not the later "수정: " one', () => {
    const log = execFileSync('git', ['log', '--format=%H %s'], { cwd: root, encoding: 'utf8' });
    const originalSha = log.split('\n').find((l) => l.includes('(issue #7)') && l.includes('발행: '));
    const sha = findOriginalPublishCommit({ issueNumber: 7, publicRepoDir: root });
    assert.equal(sha, originalSha.split(' ')[0]);
  });

  await t.test('issue #1 never matches the "(issue #12)" commit (fixed-string, closing paren boundary)', () => {
    const sha1 = findOriginalPublishCommit({ issueNumber: 1, publicRepoDir: root });
    const sha12 = findOriginalPublishCommit({ issueNumber: 12, publicRepoDir: root });
    assert.notEqual(sha1, sha12);
  });

  await t.test('an issue number with no commit at all resolves to null', () => {
    assert.equal(findOriginalPublishCommit({ issueNumber: 999, publicRepoDir: root }), null);
  });

  await t.test('resolveOriginalPublication recovers a REVIEW\'s identity from the ORIGINAL commit, not HEAD', () => {
    const original = resolveOriginalPublication({ issueNumber: 7, publicRepoDir: root, parseYaml });
    assert.equal(original.kind, 'review');
    assert.equal(original.slug, 'phoebe-bridgers-lost-weekend');
    assert.equal(original.albumTitle, 'Lost Weekend');
    assert.equal(original.artistName, 'Phoebe Bridgers');
    assert.equal(original.artistSlug, 'phoebe-bridgers');
    assert.equal(original.releaseDate, '2026');
    assert.deepEqual(original.bucketIds, ['rock']);
    // date/score come from the ORIGINAL commit's blob — the score edit that
    // followed (8.4 -> 8.5) must not leak into what "original" means.
    assert.equal(original.originalDate, '2026-09-06');
  });

  await t.test('resolveOriginalPublication recovers a STORY\'s identity', () => {
    const original = resolveOriginalPublication({ issueNumber: 12, publicRepoDir: root, parseYaml });
    assert.equal(original.kind, 'story');
    assert.equal(original.slug, '93-summer');
    assert.equal(original.title, '93년 여름');
    assert.equal(original.originalDate, '2026-09-08');
  });

  await t.test('an unknown issue number resolves to null (not an infra fault)', () => {
    assert.equal(resolveOriginalPublication({ issueNumber: 999, publicRepoDir: root, parseYaml }), null);
  });
});

test('resolveOriginalPublication: reused-existing-album case (no content/albums/ write in the publish commit)', () => {
  const root = mkdtempSync(join(tmpdir(), 'publish-desk-git-reuse-'));
  const run = (cmd) => execFileSync('sh', ['-c', cmd], { cwd: root, encoding: 'utf8' });
  run('git init -q -b main');
  run('git config user.email "actions@users.noreply.github.com"');
  run('git config user.name "undernote publish desk"');

  mkdirSync(join(root, 'content', 'artists'), { recursive: true });
  mkdirSync(join(root, 'content', 'albums'), { recursive: true });
  mkdirSync(join(root, 'content', 'reviews'), { recursive: true });

  // The album/artist were created by an EARLIER, unrelated commit (e.g.
  // album-add.ts, or a different issue) — not part of THIS publish commit.
  writeFileSync(join(root, 'content', 'artists', 'boygenius.md'), '---\nname: boygenius\n---\n', 'utf8');
  writeFileSync(
    join(root, 'content', 'albums', 'boygenius-the-record.yaml'),
    'title: "the record"\nartists: [boygenius]\nrelease_date: "2023"\nbuckets: [rock]\n',
    'utf8',
  );
  run('git add -A && git commit -q -m "content: seed"');

  writeFileSync(
    join(root, 'content', 'reviews', 'boygenius-the-record.md'),
    '---\nalbum: boygenius-the-record\nscore: "8.5"\ndate: 2026-09-08\neditorial_check: true\n---\n\n본문\n',
    'utf8',
  );
  run('git add -A && git commit -q -m "발행: [평론] the record (issue #20)"');

  try {
    const original = resolveOriginalPublication({ issueNumber: 20, publicRepoDir: root, parseYaml });
    assert.equal(original.kind, 'review');
    assert.equal(original.slug, 'boygenius-the-record');
    // Resolved from the tree AT that commit even though album.yaml was not
    // itself part of the commit's diff.
    assert.equal(original.albumTitle, 'the record');
    assert.equal(original.artistName, 'boygenius');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findOriginalPublishCommit: injected git stub — author mismatch is never matched', () => {
  const calls = [];
  const stubGit = (args) => {
    calls.push(args);
    return ''; // no real commit, e.g. someone forged a commit message without our author identity
  };
  const sha = findOriginalPublishCommit({ issueNumber: 3, publicRepoDir: '/fake', git: stubGit });
  assert.equal(sha, null);
  assert.ok(calls[0].includes('--author=undernote publish desk'));
});
