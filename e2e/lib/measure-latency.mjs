/**
 * Latency/NFR measurement — real numbers only:
 *  1. Per page type: first-visit transfer (HTML/CSS/font/image bytes) measured
 *     in headless Chromium against the rich dist; HTML gzip size via zlib
 *     (GitHub Pages serves text gzipped; woff2/webp are pre-compressed).
 *  2. Derived cover sizes vs the 100KB/640px budget (ADR-0008).
 *  3. Build times: rich (8 reviews, from setup) + 300-doc scale sandbox vs
 *     the "<60s at 300 items" design budget.
 *
 * Usage: node lib/measure-latency.mjs [--skip-scale]
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { SANDBOX_ROOT, basePathOf, build, makeSandboxFrom } from './sandbox.mjs';
import { writeScaleContent } from './rich-content.mjs';

const richDir = join(SANDBOX_ROOT, 'rich');
const PORT = 4185;
const BASE = basePathOf(richDir); // deploy base path, e.g. "/undernote"

const PAGE_TYPES = {
  '홈 (normal)': '/',
  '평론': '/reviews/aurora-line-first-light/',
  '평론 (커버 없음)': '/reviews/ember-field-ash/',
  '리스트 (연간 진행형)': '/list/2026/',
  '리스트 (월말정산)': '/list/2026/08/',
  '아카이브 허브': '/archive/',
  '아카이브 (연도)': '/archive/2026/',
  '아티스트': '/artists/shared-artist/',
  '이야기': '/stories/fixture-story/',
  '소개': '/about/',
  '404': '/404.html',
};

function startServer() {
  const child = spawn(process.execPath, [join(SANDBOX_ROOT, '..', 'lib', 'static-server.mjs'), String(PORT)], {
    stdio: 'ignore',
  });
  return child;
}

async function waitFor(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server not up: ${url}`);
}

async function measurePages() {
  const server = startServer();
  await waitFor(`http://127.0.0.1:${PORT}${BASE}/`);
  const browser = await chromium.launch();
  const results = {};
  try {
    for (const [label, path] of Object.entries(PAGE_TYPES)) {
      const context = await browser.newContext(); // fresh context = cold cache
      const page = await context.newPage();
      const byType = { document: 0, stylesheet: 0, font: 0, image: 0, other: 0 };
      let htmlBody = null;
      page.on('response', async (res) => {
        try {
          const body = await res.body();
          const type = res.request().resourceType();
          const key = byType[type] !== undefined ? type : 'other';
          byType[key] += body.length;
          if (type === 'document' && htmlBody === null) htmlBody = body;
        } catch {}
      });
      await page.goto(`http://127.0.0.1:${PORT}${BASE}${path}`, { waitUntil: 'networkidle' });
      const total = Object.values(byType).reduce((a, b) => a + b, 0);
      results[label] = {
        path,
        html_raw: byType.document,
        html_gzip: htmlBody ? gzipSync(htmlBody).length : null,
        css: byType.stylesheet,
        font: byType.font,
        image: byType.image,
        other: byType.other,
        total_raw: total,
        total_gzip_html: htmlBody ? total - byType.document + gzipSync(htmlBody).length : total,
      };
      await context.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
  return results;
}

function fileSizes(dir, filter) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(filter)
    .map((f) => ({ file: f, bytes: statSync(join(dir, f)).size }));
}

async function main() {
  const skipScale = process.argv.includes('--skip-scale');

  console.log('1/3 지면 유형별 초기 전송 실측 (Chromium cold cache)...');
  const pages = await measurePages();

  console.log('2/3 정적 산출물 크기 (커버 파생 · 폰트 · OG)...');
  const covers = fileSizes(join(richDir, 'dist', 'covers', 'derived'), (f) => f.endsWith('.webp'));
  const fonts = fileSizes(join(richDir, 'dist', 'fonts'), (f) => f.endsWith('.woff2'));
  const ogReviews = fileSizes(join(richDir, 'dist', 'og', 'reviews'), (f) => f.endsWith('.png'));

  let scale = null;
  if (!skipScale) {
    console.log('3/3 300건 스케일 빌드 시간 측정 (수 분 소요)...');
    // Clone the rich sandbox (already contains the rich content set) so the
    // scale build shares the exact code baseline of every other measurement.
    const dir = makeSandboxFrom(richDir, 'scale');
    writeScaleContent(dir, { albums: 100, artists: 50, stories: 50 });
    const result = build(dir);
    const distPages = result.status === 0
      ? (await import('./sandbox.mjs')).distPagePaths(dir).length
      : null;
    scale = {
      status: result.status,
      ms: result.ms,
      docs: '100 albums + 100 reviews + 50 stories + 50 artists + rich 8 + fixtures',
      dist_pages: distPages,
      tail: result.status === 0 ? undefined : result.out.slice(-2000),
    };
    console.log(`   스케일 빌드: exit ${result.status} · ${result.ms}ms · ${distPages} pages`);
  }

  const richMetrics = JSON.parse(readFileSync(join(SANDBOX_ROOT, 'build-metrics.json'), 'utf8'));
  const out = { measured_at: new Date().toISOString(), pages, covers, fonts, og_reviews_sample: ogReviews.slice(0, 3), og_reviews_count: ogReviews.length, rich_build_ms: richMetrics.rich_build_ms, scale };
  writeFileSync(join(SANDBOX_ROOT, 'latency-metrics.json'), JSON.stringify(out, null, 2), 'utf8');

  console.log('\n=== 지면 유형별 초기 전송 (bytes) ===');
  for (const [label, m] of Object.entries(pages)) {
    console.log(
      `${label.padEnd(16)} html ${String(m.html_raw).padStart(7)} (gzip ${m.html_gzip}) · font ${String(m.font).padStart(8)} · img ${String(m.image).padStart(7)} · total ${String(m.total_raw).padStart(8)} (총 gzip-html ${m.total_gzip_html})`,
    );
  }
  console.log('\ncovers/derived:', covers.length, 'files, max', Math.max(0, ...covers.map((c) => c.bytes)), 'bytes');
  console.log('fonts:', fonts.map((f) => `${f.file}=${f.bytes}`).join(' '));
  console.log('결과 저장: .sandbox/latency-metrics.json');
}

await main();
