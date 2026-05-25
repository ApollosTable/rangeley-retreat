#!/usr/bin/env node
/**
 * Quick diagnostic — screenshots live cloudnomad deployment vs Wix original
 * and dumps the home page HTML for inspection.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = join(ROOT, 'scraped', 'diag');

const PAIRS = [
  { name: 'home',     wix: 'https://rangeleyretreat.com', new: 'https://rangeley.cloudnomad.us' },
  { name: 'lodging',  wix: 'https://rangeleyretreat.com/rangeley-maine-lodging', new: 'https://rangeley.cloudnomad.us/rangeley-maine-lodging' },
  { name: 'gallery',  wix: 'https://rangeleyretreat.com/maine-vacation-rental-gallery', new: 'https://rangeley.cloudnomad.us/maine-vacation-rental-gallery' },
];

async function shot(page, url, file) {
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  ${file}`);
  } catch (err) {
    console.warn(`  FAIL ${url}: ${err.message}`);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Track console errors and failed requests on the new deploy only.
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('requestfailed', (req) => {
    errors.push(`requestfailed: ${req.url()} (${req.failure()?.errorText})`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push(`http ${res.status()}: ${res.url()}`);
  });

  for (const p of PAIRS) {
    console.log(`\n${p.name}`);
    errors.length = 0;
    await shot(page, p.wix, join(OUT, `${p.name}-wix.png`));
    errors.length = 0;
    await shot(page, p.new, join(OUT, `${p.name}-new.png`));
    if (errors.length) {
      await writeFile(join(OUT, `${p.name}-new-errors.txt`), errors.join('\n'));
      console.log(`  errors: ${errors.length}  → ${p.name}-new-errors.txt`);
    }
  }

  // Also dump live home page HTML for link inspection.
  await page.goto(PAIRS[0].new, { waitUntil: 'load' });
  const html = await page.content();
  await writeFile(join(OUT, 'home-new.html'), html);

  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
