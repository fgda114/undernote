/**
 * Foreground static server for the rich sandbox dist — used instead of
 * `astro preview` because Astro 7's preview daemonizes (detaches and exits),
 * which Playwright's webServer treats as "exited early". Serves 404.html
 * with a real 404 status, like GitHub Pages does.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '.sandbox', 'rich', 'dist');
const PORT = Number(process.argv[2] ?? 4180);

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
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replaceAll('\\', '/');
  if (clean.includes('..')) return null;
  let file = join(ROOT, clean);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

createServer((req, res) => {
  const file = fileFor(req.url ?? '/');
  if (file) {
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } else {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    createReadStream(join(ROOT, '404.html')).pipe(res);
  }
}).listen(PORT, '127.0.0.1', () => console.log(`static server: http://127.0.0.1:${PORT}/ ← ${ROOT}`));
