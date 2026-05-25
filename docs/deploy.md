# Deployment

## Staging — `rangeley.cloudnomad.us`

Two host options, both free for this site's volume. Pick whichever matches where
`cloudnomad.us` already lives.

### Option A — Cloudflare Pages

Best if `cloudnomad.us`'s DNS is already on Cloudflare.

1. `gh repo create rangeley-retreat --public --source=. --remote=origin --push`
2. In Cloudflare → Pages → "Connect to Git" → pick the repo.
3. Build settings:
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Build output: `dist`
   - Node version: `20`
4. Custom domain → `rangeley.cloudnomad.us`. Cloudflare adds the CNAME automatically since the zone is in the same account.

### Option B — Netlify

`netlify.toml` is already in the repo — Netlify will pick it up.

1. Push the repo to GitHub (see step 1 above).
2. netlify.com → "Add new site" → "Import from Git" → pick the repo.
3. Domain settings → Add custom domain → `rangeley.cloudnomad.us`.
4. Add the CNAME record at the cloudnomad.us DNS provider pointing to the Netlify subdomain Netlify gives you.

## Production swap — `rangeleyretreat.com`

Once you're happy with the staging site:

1. In the chosen host, add `rangeleyretreat.com` and `www.rangeleyretreat.com` as custom domains.
2. At the rangeleyretreat.com registrar (currently pointing at Wix), update the DNS records to point at the new host (CNAME / A records given by Cloudflare Pages or Netlify).
3. **Cancel the Wix subscription** only after the new DNS has fully propagated (24–48h to be safe).

## Build locally

```bash
npm install
npm run build
npm run preview
```

`npm run preview` serves `dist/` at http://localhost:4321.

## Rescrape (if you ever need to refresh the visuals from Wix)

```bash
npm run scrape
```

Re-runs the Playwright scraper. Asset downloads are cached, so subsequent runs
only fetch new files.
