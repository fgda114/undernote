/**
 * OG card generation time, isolated from the rest of the build.
 *
 * `astro build` prints a `(+NNNms)` figure for every prerendered route, so the
 * cost of satori+resvg is recoverable from the build's own output instead of
 * being guessed at: the /og/ routes are summed and compared against everything
 * else. This is the profile the W6 latency report recommended as the first
 * step for Finding L-1 (build time) and never had.
 *
 * Usage: node lib/measure-og-time.mjs [sandbox=rich]
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { SANDBOX_ROOT, makeSandboxFrom } from './sandbox.mjs';

const source = join(SANDBOX_ROOT, process.argv[2] ?? 'rich');
const dir = makeSandboxFrom(source, 'ogtime');

const started = Date.now();
const res = spawnSync(
  process.execPath,
  [join(dir, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'build'],
  { cwd: dir, env: { ...process.env, TZ: 'Asia/Seoul', ASTRO_TELEMETRY_DISABLED: '1', FORCE_COLOR: '0' }, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
);
const wall = Date.now() - started;
// Astro colours its own output regardless of FORCE_COLOR and the escapes
// sit between the route name and its timing — strip them before parsing.
const out = `${res.stdout ?? ''}
${res.stderr ?? ''}`.replace(/[[0-9;]*m/g, '');
if (res.status !== 0) {
  console.error(out.slice(-3000));
  throw new Error(`빌드 실패 (exit ${res.status})`);
}

// "├─ /undernote/og/reviews/foo.png (+412ms)"
const rows = [...out.matchAll(/([^\s│├└─]+\.(?:png|html|webp))\s+\(\+([\d.]+)(m?s)\)/g)].map((m) => ({
  route: m[1],
  ms: m[3] === 's' ? parseFloat(m[2]) * 1000 : parseFloat(m[2]),
}));

const group = (pred) => {
  const set = rows.filter(pred);
  return { count: set.length, ms: Math.round(set.reduce((a, r) => a + r.ms, 0)), max: Math.round(Math.max(0, ...set.map((r) => r.ms))) };
};
const og = group((r) => r.route.includes('/og/'));
const html = group((r) => r.route.endsWith('.html'));
const covers = group((r) => r.route.endsWith('.webp'));
const other = group((r) => !r.route.includes('/og/') && !r.route.endsWith('.html') && !r.route.endsWith('.webp'));

console.log(JSON.stringify({
  sandbox: process.argv[2] ?? 'rich',
  wall_ms: wall,
  routes_parsed: rows.length,
  og_cards: og,
  html_pages: html,
  cover_derivatives: covers,
  other_routes: other,
  og_share_of_route_time: og.ms + html.ms + other.ms > 0 ? +(og.ms / (og.ms + html.ms + other.ms)).toFixed(3) : null,
  slowest_og: rows.filter((r) => r.route.includes('/og/')).sort((a, b) => b.ms - a.ms).slice(0, 5),
}, null, 2));
