#!/usr/bin/env node
/**
 * Rewrites internal Wix URLs in scraped HTML so the cloned site stays inside
 * its own domain. Idempotent — safe to run repeatedly.
 *
 * - href="https://(www.)?rangeleyretreat.com/path"  →  href="/path"
 * - href="https://(www.)?rangeleyretreat.com"       →  href="/"
 * - action="..."  (forms) same rewrite
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const RAW = join(ROOT, 'scraped', 'raw');

function rewrite(html) {
  return html
    .replace(/(\b(?:href|action)\s*=\s*["'])https?:\/\/(?:www\.)?rangeleyretreat\.com(\/[^"']*)(["'])/gi, '$1$2$3')
    .replace(/(\b(?:href|action)\s*=\s*["'])https?:\/\/(?:www\.)?rangeleyretreat\.com(["'])/gi, '$1/$2');
}

async function main() {
  const files = (await readdir(RAW)).filter((f) => f.endsWith('.html'));
  let total = 0;
  for (const f of files) {
    const p = join(RAW, f);
    const before = await readFile(p, 'utf8');
    const after = rewrite(before);
    if (before !== after) {
      await writeFile(p, after);
      const diff = (before.match(/rangeleyretreat\.com/gi) || []).length - (after.match(/rangeleyretreat\.com/gi) || []).length;
      console.log(`  ${f}: rewrote ${diff} link(s)`);
      total += diff;
    }
  }
  console.log(`\n${total} link(s) rewritten.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
