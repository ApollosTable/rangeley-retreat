#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const URL = process.argv[2] || 'https://rangeley.cloudnomad.us';
const OUT = resolve('./scraped/diag');

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
// Ignore HTTPS errors so we can diagnose even while the Let's Encrypt
// cert is still provisioning on GitHub Pages.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(`CONSOLE: ${m.text().slice(0, 250)}`); });
page.on('requestfailed', (r) => errs.push(`FAIL: ${r.failure()?.errorText} ${r.url().slice(0, 250)}`));
page.on('response', (r) => { if (r.status() >= 400) errs.push(`HTTP${r.status()}: ${r.url().slice(0, 250)}`); });

try {
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(8000);
  const slug = URL.replace(/^https?:\/\//, '').replace(/[\/?&]/g, '_').slice(0, 80);
  await page.screenshot({ path: `${OUT}/live-${slug}.png`, fullPage: true });
  console.log(`screenshot: scraped/diag/live-${slug}.png`);
} catch (e) {
  console.log('NAV ERROR:', e.message);
}
console.log(`\nerrors (${errs.length}):`);
errs.slice(0, 50).forEach((e) => console.log('  ' + e));
await browser.close();
