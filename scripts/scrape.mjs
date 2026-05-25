#!/usr/bin/env node
/**
 * One-shot scraper for rangeleyretreat.com.
 *
 * Loads each page with Playwright, waits for network to settle, snapshots the
 * rendered DOM, then downloads every referenced asset (CSS / JS / images /
 * fonts) and rewrites the HTML to point at local paths.
 *
 * Output:
 *   scraped/raw/<slug>.html      — rewritten HTML (gitignored)
 *   scraped/manifest.json        — list of pages + assets
 *   public/_wix/...              — downloaded assets, mirroring URL paths
 *
 * Re-run is safe: assets are content-hashed by URL and cached.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const RAW_DIR = join(ROOT, 'scraped', 'raw');
const PUBLIC_DIR = join(ROOT, 'public');
const ASSET_DIR = join(PUBLIC_DIR, '_wix');

const ORIGIN = 'https://rangeleyretreat.com';

// Seed pages — the scraper will also crawl any internal links it discovers
// from the home page's navigation.
const SEED_PATHS = [
  '/',
  '/rangeley-maine-lodging',
  '/maine-vacation-rental-gallery',
  '/rates',
  '/booking-request',
  '/reviews',
  '/our-story',
  '/blog',
  '/privacy-policy',
  '/terms-and-conditions',
];

// Hosts we'll mirror locally. Any asset URL whose host matches one of these
// gets downloaded and rewritten to /_wix/<host>/<path>.
const MIRROR_HOSTS = new Set([
  'static.wixstatic.com',
  'static.parastorage.com',
  'rangeleyretreat.com',
  'www.rangeleyretreat.com',
]);

const ASSET_ATTRS = [
  ['link[href]', 'href'],
  ['script[src]', 'src'],
  ['img[src]', 'src'],
  ['img[srcset]', 'srcset'],
  ['source[src]', 'src'],
  ['source[srcset]', 'srcset'],
  ['video[src]', 'src'],
  ['video[poster]', 'poster'],
  ['audio[src]', 'src'],
  ['iframe[src]', 'src'],
  ['use[href]', 'href'],
];

function slugFor(path) {
  if (path === '/' || path === '') return 'index';
  return path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\//g, '-') || 'index';
}

function assetLocalPath(absUrl) {
  const u = new URL(absUrl);
  // Strip query strings for filesystem; preserve in a hash so distinct
  // query-string variants don't collide.
  const qhash = u.search ? '-' + createHash('sha1').update(u.search).digest('hex').slice(0, 8) : '';
  // Decode URL path → filesystem path (browsers/servers decode %7E etc.
  // before looking up files; the file on disk must match the decoded name).
  let p;
  try { p = decodeURIComponent(u.pathname); } catch { p = u.pathname; }
  if (p.endsWith('/')) p += 'index';
  // Insert query hash before extension.
  const dot = p.lastIndexOf('.');
  if (dot > p.lastIndexOf('/') && qhash) {
    p = p.slice(0, dot) + qhash + p.slice(dot);
  } else {
    p = p + qhash;
  }
  return join(ASSET_DIR, u.host, p);
}

function assetWebPath(absUrl) {
  const u = new URL(absUrl);
  const local = assetLocalPath(absUrl);
  return '/' + local.slice(PUBLIC_DIR.length + 1).split(/[\\/]/).join('/');
}

async function ensureDir(p) {
  await mkdir(dirname(p), { recursive: true });
}

async function downloadAsset(absUrl, downloaded) {
  if (downloaded.has(absUrl)) return downloaded.get(absUrl);
  const u = new URL(absUrl);
  if (!MIRROR_HOSTS.has(u.host)) return null;
  const local = assetLocalPath(absUrl);
  const webPath = assetWebPath(absUrl);
  if (existsSync(local)) {
    downloaded.set(absUrl, webPath);
    return webPath;
  }
  try {
    const res = await fetch(absUrl, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; rangeley-retreat-clone)' },
    });
    if (!res.ok) {
      console.warn(`  asset ${res.status} ${absUrl}`);
      downloaded.set(absUrl, null);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await ensureDir(local);
    await writeFile(local, buf);

    // If it's a CSS file, recurse into url(...) references.
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/css') || absUrl.endsWith('.css')) {
      const css = buf.toString('utf8');
      const rewritten = await rewriteCss(css, absUrl, downloaded);
      await writeFile(local, rewritten, 'utf8');
    }

    downloaded.set(absUrl, webPath);
    return webPath;
  } catch (err) {
    console.warn(`  asset failed ${absUrl}: ${err.message}`);
    downloaded.set(absUrl, null);
    return null;
  }
}

async function rewriteCss(css, baseUrl, downloaded) {
  const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  const importRe = /@import\s+(?:url\()?\s*(['"])([^'"]+)\1\s*\)?\s*;/g;
  const replacements = [];
  const collect = (re) => {
    let m;
    while ((m = re.exec(css))) {
      replacements.push({ start: m.index, end: m.index + m[0].length, raw: m[0], target: m[2] });
    }
  };
  collect(urlRe);
  collect(importRe);
  if (replacements.length === 0) return css;
  // Resolve and download.
  const resolved = await Promise.all(replacements.map(async (r) => {
    if (r.target.startsWith('data:')) return r;
    try {
      const abs = new URL(r.target, baseUrl).toString();
      const local = await downloadAsset(abs, downloaded);
      return { ...r, local };
    } catch {
      return r;
    }
  }));
  // Apply replacements right-to-left.
  resolved.sort((a, b) => b.start - a.start);
  let out = css;
  for (const r of resolved) {
    if (!r.local) continue;
    const replaced = r.raw.replace(r.target, r.local);
    out = out.slice(0, r.start) + replaced + out.slice(r.end);
  }
  return out;
}

async function rewriteSrcset(value, baseUrl, downloaded) {
  // Wix outputs srcset URLs whose Wix-CDN transform path contains literal
  // `, ` separators (e.g. `.../v1/fill/w_39, h_39, al_c, ...`). A naive split
  // on `,` shreds those URLs. Instead parse `<URL> <descriptor>` pairs by
  // anchoring on the descriptor (digits + x|w), which can't appear inside
  // a Wix path.
  const pairRe = /(\S.+?)\s+(\d+(?:\.\d+)?[xw])(?=\s*,|\s*$)/g;
  const pairs = [];
  let m;
  while ((m = pairRe.exec(value))) {
    pairs.push({ url: m[1].trim(), descriptor: m[2] });
  }
  if (pairs.length === 0) {
    // Fall back to whitespace-split (single URL, optional descriptor).
    const [url, ...rest] = value.trim().split(/\s+/);
    pairs.push({ url, descriptor: rest.join(' ') });
  }
  const out = [];
  for (const { url, descriptor } of pairs) {
    try {
      const abs = new URL(url, baseUrl).toString();
      const local = await downloadAsset(abs, downloaded);
      out.push((local || url) + (descriptor ? ' ' + descriptor : ''));
    } catch {
      out.push(url + (descriptor ? ' ' + descriptor : ''));
    }
  }
  return out.join(', ');
}

function rewriteInternalLinks(html) {
  // Anchor hrefs to either rangeleyretreat.com host go to relative paths so
  // the cloned site stays inside its own domain.
  return html.replace(
    /(href\s*=\s*["'])https?:\/\/(?:www\.)?rangeleyretreat\.com(["'])/gi,
    '$1/$2'
  ).replace(
    /(href\s*=\s*["'])https?:\/\/(?:www\.)?rangeleyretreat\.com(\/[^"']*)(["'])/gi,
    '$1$2$3'
  );
}

async function scrapePage(browser, path, pageUrl, downloaded) {
  console.log(`\n→ ${pageUrl}`);
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  // Wix runs analytics/heartbeat traffic indefinitely, so networkidle never
  // resolves. Use 'load' (initial fetch + subresources) then wait for hydration.
  const response = await page.goto(pageUrl, { waitUntil: 'load', timeout: 60000 });
  if (!response || !response.ok()) {
    console.warn(`  status ${response ? response.status() : 'no response'}`);
    await ctx.close();
    return { html: null, links: [] };
  }
  // Give Wix's hydration time. We also wait for one of the key body
  // classes Wix applies once it finishes booting.
  try {
    await page.waitForFunction(
      () => document.body && document.body.getAttribute('data-hk') !== null
        || document.querySelectorAll('[data-mesh-id]').length > 5,
      { timeout: 15000 }
    );
  } catch {
    // Best-effort; continue even if signal didn't fire.
  }
  await page.waitForTimeout(3500);
  // Force-render below-the-fold lazy images by scrolling.
  await page.evaluate(async () => {
    await new Promise((res) => {
      let y = 0;
      const step = () => {
        window.scrollBy(0, 800);
        y += 800;
        if (y < document.body.scrollHeight) setTimeout(step, 150);
        else res();
      };
      step();
    });
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);

  // Discover internal links from the nav. Wix uses both apex and www hosts
  // depending on the page — accept either.
  const links = await page.evaluate(() => {
    const internalHosts = new Set(['rangeleyretreat.com', 'www.rangeleyretreat.com']);
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    return anchors
      .map((a) => a.href)
      .filter((h) => {
        try { return internalHosts.has(new URL(h).host); } catch { return false; }
      })
      .map((h) => new URL(h).pathname);
  });

  // Inline the full rendered HTML.
  let html = await page.content();
  await ctx.close();

  // Parse and rewrite asset references via regex (cheap, good enough for static rewrite).
  for (const [selector, attr] of ASSET_ATTRS) {
    // Build a regex for matching attribute=value in the rendered HTML.
    // We use a permissive matcher and resolve relative URLs.
    const tagName = selector.split('[')[0];
    const re = new RegExp(
      `<${tagName}\\b[^>]*?\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`,
      'gi'
    );
    const matches = [];
    let m;
    while ((m = re.exec(html))) {
      const full = m[0];
      const value = m[2] !== undefined ? m[2] : m[3];
      const start = m.index;
      const end = m.index + full.length;
      matches.push({ start, end, full, value, quote: m[2] !== undefined ? '"' : "'" });
    }
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      if (!m.value) continue;
      let newValue;
      if (attr === 'srcset') {
        newValue = await rewriteSrcset(m.value, pageUrl, downloaded);
      } else if (m.value.startsWith('data:') || m.value.startsWith('#') || m.value.startsWith('javascript:')) {
        continue;
      } else {
        try {
          const abs = new URL(m.value, pageUrl).toString();
          const u = new URL(abs);
          if (!MIRROR_HOSTS.has(u.host)) continue;
          const local = await downloadAsset(abs, downloaded);
          if (!local) continue;
          newValue = local;
        } catch {
          continue;
        }
      }
      const replaced = m.full.replace(
        new RegExp(`${attr}\\s*=\\s*${m.quote}[^${m.quote}]*${m.quote}`),
        `${attr}=${m.quote}${newValue}${m.quote}`
      );
      html = html.slice(0, m.start) + replaced + html.slice(m.end);
    }
  }

  // Rewrite internal cross-page links to relative paths.
  html = rewriteInternalLinks(html);

  // Save.
  const slug = slugFor(path);
  const out = join(RAW_DIR, `${slug}.html`);
  await ensureDir(out);
  await writeFile(out, html, 'utf8');
  console.log(`  saved scraped/raw/${slug}.html`);

  return { html, links };
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(ASSET_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const downloaded = new Map();
  const visited = new Set();
  const queue = [...SEED_PATHS];
  const manifest = [];

  while (queue.length) {
    const path = queue.shift();
    const normalized = path.replace(/\/+$/, '') || '/';
    if (visited.has(normalized)) continue;
    visited.add(normalized);
    const url = ORIGIN + (normalized === '/' ? '' : normalized);
    try {
      const { html, links } = await scrapePage(browser, normalized, url, downloaded);
      if (!html) continue;
      manifest.push({ path: normalized, slug: slugFor(normalized) });
      // Only follow links discovered on the home page — keeps scope tight.
      if (normalized === '/') {
        for (const l of links) {
          if (!visited.has(l) && !queue.includes(l) && !l.startsWith('/blog/')) {
            queue.push(l);
          }
        }
      }
    } catch (err) {
      console.error(`  ${url} failed: ${err.message}`);
    }
  }

  await browser.close();

  await writeFile(
    join(ROOT, 'scraped', 'manifest.json'),
    JSON.stringify({ scrapedAt: new Date().toISOString(), pages: manifest }, null, 2)
  );

  console.log(`\nDone. ${manifest.length} pages, ${downloaded.size} asset URLs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
