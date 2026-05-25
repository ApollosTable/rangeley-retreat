# Rangeley Retreat

Self-hosted static clone of [rangeleyretreat.com](https://rangeleyretreat.com), moving off Wix.

## Status

Early scaffolding. See `docs/superpowers/specs/2026-05-24-rangeley-retreat-clone-design.md` for the design.

## Stack

Astro static site. Scraped from the live Wix site, then componentized so rates / gallery / blog / reviews can be edited without touching HTML.

## Commands

```bash
npm install            # first time
npm run scrape         # one-shot: pull current rangeleyretreat.com pages locally
npm run dev            # local dev server (http://localhost:4321)
npm run build          # static build -> dist/
npm run preview        # preview the built site
```

## Editing Content

- **Rates** — `src/data/rates.json`
- **Property facts** — `src/data/property.json`
- **Reviews** — `src/data/reviews.json`
- **Social / contact** — `src/data/social.json`
- **Gallery images** — drop files in `public/images/gallery/`
- **Blog posts** — Markdown files in `src/content/blog/`

## Deploy

Staging: `rangeley.cloudnomad.us` (Cloudflare Pages or Netlify — TBD).
Production: `rangeleyretreat.com` after DNS swap.

## For the business partner

The booking request form on the cloned site is **visually identical but not yet functional**. Form submissions don't go anywhere until we pick a backend. Options on the table:

- **Formspree** — free tier, drop-in.
- **Web3Forms** — similar to Formspree.
- **Netlify Forms** — only if we host on Netlify; free tier covers low volume.
- **`mailto:`** — opens the user's email client; lowest tech, worse UX.

Let Blake know which you prefer.
