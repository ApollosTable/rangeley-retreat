# Rangeley Retreat — Pixel-Perfect Clone

**Date:** 2026-05-24
**Owner:** Blake Corbit (+ business partner)
**Source:** https://rangeleyretreat.com (Wix)
**Target:** https://rangeley.cloudnomad.us (staging) → rangeleyretreat.com (after DNS swap)

## Purpose

Move the vacation rental site off Wix to a self-hosted static site, preserving the current visual exactly so guests don't notice the swap. Make the routinely-changed content (rates, gallery, blog, reviews) editable without touching HTML.

## Non-Goals

- Redesign or visual modernization.
- Functional booking form on day one — form stays visually present but inert until the backend choice is made with the business partner.
- Wix-specific dynamic features beyond what the static rendering shows.

## Scope

**Pages (9):** Home, Rangeley Maine Lodging, Gallery, Rates, Booking Request, Reviews, Our Story, Blog, Old Gallery.

**Features preserved visually:**
- Hero imagery, headers, footers, fonts, colors, spacing exactly as Wix renders.
- Photo gallery layout.
- Reviews section.
- Social links (Facebook, Instagram).
- Contact email: Rangeleyretreat@gmail.com.

**Features deferred:**
- Booking form submission backend (Formspree / Web3Forms / Netlify Forms / mailto — decision pending with partner).
- Any Wix-side analytics or A/B tooling.

## Stack

- **Astro** — static-first framework. Outputs plain HTML/CSS that matches what we scrape. Supports content collections (blog as Markdown), data files (JSON for rates/reviews), components (header/footer reuse).
- **Node 20+**, **pnpm or npm**.
- **Playwright** — used once during scrape to render Wix pages and capture HTML + assets.
- **Hosting:** GitHub repo `rangeley-retreat` → deploy to Netlify or Cloudflare Pages → custom domain `rangeley.cloudnomad.us`.

Why Astro: outputs the closest thing to hand-written HTML, no client-side framework runtime bloat, easy to keep a "scraped" page side-by-side with a "componentized" page during the transition.

## Architecture

```
rangeley-retreat/
├── docs/superpowers/specs/        # this spec + future specs
├── scripts/
│   └── scrape.mjs                  # Playwright scraper (one-shot tool)
├── scraped/                        # raw output from scrape, gitignored except for assets we keep
├── public/
│   ├── images/                     # gallery + property photos (committed)
│   ├── fonts/                      # any Wix-served fonts pulled local
│   └── favicon.ico
├── src/
│   ├── data/
│   │   ├── property.json           # BR/BA/sqft/address/maxGuests
│   │   ├── rates.json              # seasons, nightly, weekly, fees
│   │   ├── reviews.json            # author/text/rating/date
│   │   └── social.json             # FB/IG URLs, email, phone
│   ├── content/
│   │   └── blog/                   # *.md posts, Astro content collection
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── PropertyFacts.astro     # reads property.json
│   │   ├── RatesTable.astro        # reads rates.json
│   │   ├── Gallery.astro           # globs public/images/gallery/
│   │   └── Reviews.astro           # reads reviews.json
│   ├── layouts/
│   │   └── BaseLayout.astro        # wraps scraped <head>, fonts, header, footer
│   └── pages/
│       ├── index.astro             # Home
│       ├── rangeley-maine-lodging.astro
│       ├── gallery.astro
│       ├── rates.astro
│       ├── booking-request.astro
│       ├── reviews.astro
│       ├── our-story.astro
│       ├── blog/
│       │   ├── index.astro
│       │   └── [slug].astro
│       └── old-gallery.astro
├── astro.config.mjs
├── package.json
└── README.md
```

## Scrape → Componentize Flow

1. **Scrape** (one-shot): Playwright loads each of the 9 pages in headless Chromium, waits for network idle, captures rendered HTML + all linked CSS / JS / images / fonts. Output to `scraped/`.
2. **Localize assets**: rewrite `static.wixstatic.com/...` and other CDN URLs to local paths under `/public/images/`, `/public/fonts/`.
3. **Wrap as Astro pages**: each scraped page becomes a `.astro` file with the body HTML preserved verbatim. Common chrome (head, header, footer) moves into `BaseLayout.astro`.
4. **Componentize**: identify the markup blocks holding rates, property facts, gallery, reviews, blog post lists. Replace literal text/markup with `<RatesTable />`, `<PropertyFacts />`, etc., reading from `src/data/*.json` or content collections. The surrounding wrapper markup stays untouched so the visual is unchanged.
5. **Verify**: side-by-side comparison with live Wix site at staging URL.

## Data Shapes (initial)

```json
// property.json
{
  "bedrooms": 4,
  "bathrooms": 2,
  "maxGuests": 11,
  "sqft": 2700,
  "livingAreas": 2,
  "address": "69 Harold Ross Road, Dallas Plantation, Maine"
}
```

```json
// rates.json  (shape TBD after we see the live Rates page; keep flexible)
{
  "seasons": [
    { "name": "Peak Summer", "start": "06-15", "end": "09-15", "nightly": 0, "weekly": 0 }
  ],
  "fees": { "cleaning": 0, "petFee": 0 }
}
```

```json
// reviews.json
[
  { "author": "Name", "date": "2025-08-12", "rating": 5, "text": "..." }
]
```

```json
// social.json
{
  "email": "Rangeleyretreat@gmail.com",
  "facebook": "https://facebook.com/...",
  "instagram": "https://instagram.com/...",
  "phone": null
}
```

Blog posts: `src/content/blog/*.md` with frontmatter `{ title, date, summary, cover? }`.

## Booking Form (deferred)

The form's HTML and styling are preserved exactly. Its `action` attribute is set to `#` and a small visible note may be added in dev/staging but removed before DNS swap. **Action item for business partner:** decide between Formspree, Web3Forms, Netlify Forms, or a `mailto:` fallback. The form's existing field names are kept so any backend choice can wire up without markup changes.

## Deployment

- GitHub repo: `rangeley-retreat` (private until ready).
- Build command: `npm run build` → static output in `dist/`.
- Hosting candidate: Netlify or Cloudflare Pages — both free for this scale, both support `rangeley.cloudnomad.us` via DNS CNAME.
- DNS: cloudnomad.us subdomain points at the host. Later, swap rangeleyretreat.com's DNS over.

## Risks / Notes

- **Wix CDN fonts and CSS:** some fonts are licensed through Wix's account. If a font is Google Fonts under the hood, swap to the canonical source. If it's a paid Wix-only font, may need a visually-equivalent substitute. Flag during scrape.
- **JavaScript-driven interactions:** Wix bundles a large client runtime. We're keeping the rendered HTML/CSS but dropping most of the Wix JS. Any feature that depended on it (lightboxes, scroll animations) needs manual re-implementation or graceful loss. Decide case-by-case during verification.
- **Old Gallery page:** included for parity, but consider whether it should redirect to current Gallery — discuss with partner.
- **Image rights:** photos are presumably Blake's/partner's own. Confirm before committing to a public repo.

## Open Questions (for partner, not blocking)

1. Booking form backend choice.
2. Public vs private GitHub repo.
3. Old Gallery — keep or redirect?
4. Any planned content changes coinciding with the move (rates update, new photos)?
