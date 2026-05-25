#!/usr/bin/env node
/**
 * Stages scraped HTML for the Astro build.
 *
 * Astro's src/pages/*.html pipeline runs the HTML through Vite's HTML plugin,
 * which crashes on Wix-generated markup ("Cannot overwrite a zero-length
 * range"). Instead we stage scraped pages into public/<slug>/index.html, where
 * Astro copies files verbatim without parsing them. That keeps the markup
 * pixel-identical to the scrape.
 *
 * Slug → route mapping is read from scraped/manifest.json.
 */
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const RAW = join(ROOT, 'scraped', 'raw');
const MANIFEST = join(ROOT, 'scraped', 'manifest.json');
const PUBLIC = join(ROOT, 'public');
const STAGED_MARKER = join(PUBLIC, '.scraped-pages.json');

// Pages we've taken over with our own Astro implementations — don't overwrite.
const ASTRO_OWNED = new Set([
  // 'gallery',  // <-- example: once we Astro-ify the gallery, list it here.
]);

// Slugs to skip entirely (Wix scaffolding pages that aren't linked from nav).
const SKIP = new Set(['blank']);

function relOutFor(p) {
  // "/" → "index.html"; "/foo" → "foo/index.html"
  if (p === '/' || p === '') return 'index.html';
  return p.replace(/^\/+/, '').replace(/\/+$/, '') + '/index.html';
}

async function main() {
  if (!existsSync(MANIFEST)) {
    console.error('No scraped/manifest.json — run `npm run scrape` first.');
    process.exit(1);
  }
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));

  // Remove files staged by a previous run so deletions in scrape propagate.
  if (existsSync(STAGED_MARKER)) {
    const prev = JSON.parse(await readFile(STAGED_MARKER, 'utf8'));
    for (const rel of prev.files || []) {
      const p = join(PUBLIC, rel);
      await rm(p, { force: true });
      // Try to remove the directory if empty.
      try { await rm(dirname(p), { recursive: false }); } catch {}
    }
  }

  const staged = [];
  let copied = 0;
  for (const { path, slug } of manifest.pages) {
    if (SKIP.has(slug)) continue;
    if (ASTRO_OWNED.has(slug)) {
      console.log(`  skip ${slug} (Astro-owned)`);
      continue;
    }
    const src = join(RAW, `${slug}.html`);
    if (!existsSync(src)) {
      console.warn(`  missing ${src}`);
      continue;
    }
    const html = await readFile(src, 'utf8');
    const rel = relOutFor(path);
    const out = join(PUBLIC, rel);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, html, 'utf8');
    staged.push(rel.split(/[\\/]/).join('/'));
    console.log(`  staged public/${rel.split(/[\\/]/).join('/')}`);
    copied++;
  }

  await writeFile(STAGED_MARKER, JSON.stringify({ files: staged }, null, 2));
  console.log(`\n${copied} pages staged.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
