/**
 * Foreground static server for a sandbox's dist — used instead of
 * `astro preview` because Astro 7's preview daemonizes (detaches and exits),
 * which Playwright's webServer treats as "exited early". Serves 404.html
 * with a real 404 status, like GitHub Pages does.
 *
 * Sandbox name is an optional 3rd arg (default 'rich', unchanged behaviour
 * for the shared webServer in playwright.config.ts and every existing
 * caller) — added 2026-09-10 so a spec that needs LIVE browser rendering
 * against a purpose-built content set (not the shared rich fixture) can
 * serve its own sandbox on its own port without a second server
 * implementation (browser.carousel-boundary.spec.ts).
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SANDBOX = resolve(HERE, '..', '.sandbox', process.argv[3] ?? 'rich');
const ROOT = join(SANDBOX, 'dist');
const PORT = Number(process.argv[2] ?? 4180);

// Mount dist under the deploy base path, exactly like GitHub Pages does —
// read from the sandbox's site.yaml (same source astro.config uses).
const baseMatch = readFileSync(join(SANDBOX, 'config', 'site.yaml'), 'utf8').match(/^base_url:\s*"?([^"\s]+)"?/m);
const BASE = baseMatch ? new URL(baseMatch[1]).pathname.replace(/\/+$/, '') : '';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

function fileFor(urlPath) {
  let clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replaceAll('\\', '/');
  if (clean.includes('..')) return null;
  if (BASE) {
    if (clean === BASE || clean === `${BASE}/`) clean = '/';
    else if (clean.startsWith(`${BASE}/`)) clean = clean.slice(BASE.length);
    else return null; // outside the base — 404, like GitHub Pages
  }
  let file = join(ROOT, clean);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

/**
 * Serve one file, or end the response — NEVER throw out of the request
 * handler. Measured harness defect, 2026-09-07 (Matthias): the previous
 * `createReadStream(...).pipe(res)` had no 'error' listener anywhere, so a
 * single unreadable file emitted an unhandled 'error' event and KILLED THE
 * WHOLE SERVER PROCESS. Every navigation after that point failed with
 * `chrome-error://chromewebdata/`, which reads like a product defect and is
 * not one. The reproducer is in 11-qa/test-flow.md §플레이크: rename
 * `.sandbox/rich/dist` away (what a SECOND `npm run e2e` does while this one
 * is running) and issue one request. A test server that dies on a missing
 * file cannot tell anyone which file was missing.
 */
function send(res, status, type, file) {
  res.writeHead(status, { 'content-type': type });
  const stream = createReadStream(file);
  stream.on('error', (err) => {
    console.error(`static server: ${file} 읽기 실패 — ${err.code ?? err.message}`);
    stream.destroy();
    res.end(); // the request fails; the server does not
  });
  res.on('error', () => stream.destroy()); // client went away mid-body
  stream.pipe(res);
}

const server = createServer((req, res) => {
  try {
    const file = fileFor(req.url ?? '/');
    if (file) send(res, 200, TYPES[extname(file)] ?? 'application/octet-stream', file);
    else send(res, 404, 'text/html; charset=utf-8', join(ROOT, '404.html'));
  } catch (err) {
    // fileFor touches the filesystem; a sandbox deleted under us throws here.
    console.error(`static server: 요청 처리 실패 ${req.url} — ${err.code ?? err.message}`);
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('static server error');
  }
});

// Same rule one level up: a socket-level error (client reset) must not take
// the process with it.
server.on('clientError', (_err, socket) => socket.destroy());
process.on('uncaughtException', (err) => console.error(`static server: uncaught — ${err.stack ?? err}`));

server.listen(PORT, '127.0.0.1', () =>
  console.log(`static server: http://127.0.0.1:${PORT}${BASE}/ ← ${ROOT}`),
);
