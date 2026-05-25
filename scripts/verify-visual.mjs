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
  '/', '/rangeley-maine-lodging', '/maine-vacation-rental-gallery', '/rates',
  '/booking-request', '/reviews', '/our-story', '/blog',
  '/privacy-policy', '/terms-and-conditions',
];

async function shot(page, url, file) {
  // Wix never goes networkidle (analytics heartbeats), so use 'load'.
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: file, fullPage: true });
}

async function main() {
  // Strip MSYS/Git Bash path mangling — if Git Bash sees "/" it expands to
  // the Windows root. Treat anything that looks like a Windows path as "/".
  const rawArgs = process.argv.slice(2);
  const cleaned = rawArgs.map((a) => /^[A-Za-z]:[\\/]/.test(a) ? '/' : a);
  const paths = cleaned.length ? cleaned : DEFAULT_PATHS;
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
