/**
 * Sandbox helpers — every build-mutation E2E runs in a COPY of the repo
 * (content/config/src/public/scripts + junction to the real node_modules).
 * The repo itself is never mutated (W5 sandbox discipline).
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '..', '..');
export const SANDBOX_ROOT = resolve(HERE, '..', '.sandbox');

export function removeSandbox(dir) {
  const nm = join(dir, 'node_modules');
  // Junction removal first — rmdirSync deletes the LINK only (verified: the
  // real node_modules survives). rmSync also does not follow junctions, this
  // is belt-and-suspenders.
  if (existsSync(nm)) rmdirSync(nm);
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Astro's content-layer cache lives in node_modules/.astro and Vite's dep
 * cache in node_modules/.vite — both SHARED through the junction. Without
 * per-sandbox cache dirs, parallel sandbox builds cross-contaminate (measured:
 * ladder build rendered rich-sandbox cover routes). Idempotent injection.
 */
function isolateCaches(dir) {
  const configPath = join(dir, 'astro.config.ts');
  const config = readFileSync(configPath, 'utf8');
  if (config.includes('.astro-cache')) return;
  writeFileSync(
    configPath,
    config.replace(
      'export default defineConfig({',
      "export default defineConfig({\n  cacheDir: './.astro-cache',\n  vite: { cacheDir: './.vite-cache' },",
    ),
    'utf8',
  );
}

export function makeSandbox(name) {
  const dir = join(SANDBOX_ROOT, name);
  removeSandbox(dir);
  mkdirSync(dir, { recursive: true });
  for (const d of ['content', 'config', 'src', 'public', 'scripts']) {
    cpSync(join(REPO, d), join(dir, d), { recursive: true });
  }
  for (const f of ['astro.config.ts', 'tsconfig.json', 'package.json']) {
    cpSync(join(REPO, f), join(dir, f));
  }
  isolateCaches(dir);
  mkdirSync(join(dir, 'reports'), { recursive: true });
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'), 'junction');
  return dir;
}

/** Deploy base path of a sandbox, e.g. "/undernote" (or "" at domain root) —
 * read from config/site.yaml#base_url, the single source astro.config uses.
 * Tests must build expected URLs through this so a base change (custom
 * domain → "/") cannot break the suite. */
export function basePathOf(dir) {
  const m = readFileSync(join(dir, 'config', 'site.yaml'), 'utf8').match(/^base_url:\s*"?([^"\s]+)"?/m);
  if (!m) throw new Error(`config/site.yaml에 base_url이 없습니다: ${dir}`);
  return new URL(m[1]).pathname.replace(/\/+$/, '');
}

/** Clone an EXISTING sandbox (same code baseline) instead of the live repo —
 * used by the latency scale build so a concurrently-edited working tree
 * cannot change the measurement target mid-wave. */
export function makeSandboxFrom(sourceDir, name) {
  const dir = join(SANDBOX_ROOT, name);
  removeSandbox(dir);
  mkdirSync(dir, { recursive: true });
  for (const d of ['content', 'config', 'src', 'public', 'scripts']) {
    cpSync(join(sourceDir, d), join(dir, d), { recursive: true });
  }
  for (const f of ['astro.config.ts', 'tsconfig.json', 'package.json']) {
    cpSync(join(sourceDir, f), join(dir, f));
  }
  isolateCaches(dir);
  mkdirSync(join(dir, 'reports'), { recursive: true });
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'), 'junction');
  return dir;
}

const runEnv = { ...process.env, TZ: 'Asia/Seoul', ASTRO_TELEMETRY_DISABLED: '1' };

/** Real `astro build` in the sandbox. Returns { status, out, ms }. */
export function build(dir) {
  const started = Date.now();
  const res = spawnSync(process.execPath, [join(dir, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'build'], {
    cwd: dir,
    env: runEnv,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  return { status: res.status, out: `${res.stdout ?? ''}\n${res.stderr ?? ''}`, ms: Date.now() - started };
}

/** Run scripts/finalize.ts inside the sandbox (node 24 native TS). */
export function finalize(dir, year, prefaceText) {
  writeFileSync(join(dir, 'preface-draft.md'), prefaceText, 'utf8');
  const res = spawnSync(
    process.execPath,
    [join(dir, 'scripts', 'finalize.ts'), '--year', String(year), '--preface', join(dir, 'preface-draft.md'), '--yes'],
    { cwd: dir, env: runEnv, encoding: 'utf8' },
  );
  return { status: res.status, out: `${res.stdout ?? ''}\n${res.stderr ?? ''}` };
}

/** dist HTML for a site path like "/reviews/foo/" (or "/404.html"). */
export function readPage(dir, urlPath) {
  const file = urlPath.endsWith('.html')
    ? join(dir, 'dist', urlPath)
    : join(dir, 'dist', urlPath.replace(/^\//, ''), 'index.html');
  return readFileSync(file, 'utf8');
}

export function pageExists(dir, urlPath) {
  return existsSync(join(dir, 'dist', urlPath.replace(/^\//, ''), 'index.html'));
}

/** All dist page paths ("/", "/about/", ... plus "/404.html"). */
export function distPagePaths(dir) {
  const root = join(dir, 'dist');
  const pages = [];
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === 'index.html') {
        const rel = full.slice(root.length).replaceAll('\\', '/').replace(/index\.html$/, '');
        pages.push(rel === '' ? '/' : rel);
      } else if (entry === '404.html') pages.push('/404.html');
    }
  };
  walk(root);
  return pages.sort();
}

export function readBuildReport(dir) {
  return readFileSync(join(dir, 'reports', 'build-report.md'), 'utf8');
}
