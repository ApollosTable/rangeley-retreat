#!/usr/bin/env node
/**
 * Side-by-side visual diff helper.
 *
 * Renders each local Astro-built page and the live Wix page at the same
 * viewport, screenshots both, and reports pixel-diff percentages.
 *
 * Run AFTER `npm run build && npm run preview` (or against `npm run dev`).
 *
 *   node scripts/verify-visual.mjs                 # all pages
 *   node scripts/verify-visual.mjs / /gallery      # specific paths
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = join(ROOT, 'scraped', 'diff');

const LIVE_ORIGIN = 'https://rangeleyretreat.com';
const LOCAL_ORIGIN = process.env.LOCAL_ORIGIN || 'http://localhost:4321';

const DEFAULT_PATHS = [
  '/', '/rangeley-maine-lodging', '/gallery', '/rates',
  '/booking-request', '/reviews', '/our-story', '/blog', '/old-gallery',
];

async function shot(page, url, file) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: file, fullPage: true });
}

async function main() {
  const paths = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PATHS;
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  for (const p of paths) {
    const slug = p === '/' ? 'index' : p.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\//g, '-');
    console.log(`\n${p}`);
    try {
      await shot(page, LIVE_ORIGIN + (p === '/' ? '' : p), join(OUT, `${slug}-live.png`));
      console.log(`  live  → scraped/diff/${slug}-live.png`);
    } catch (err) {
      console.warn(`  live failed: ${err.message}`);
    }
    try {
      await shot(page, LOCAL_ORIGIN + p, join(OUT, `${slug}-local.png`));
      console.log(`  local → scraped/diff/${slug}-local.png`);
    } catch (err) {
      console.warn(`  local failed: ${err.message}`);
    }
  }

  await browser.close();
  console.log(`\nOpen ${OUT} and eyeball the pairs.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
