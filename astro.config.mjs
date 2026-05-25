import { defineConfig } from 'astro/config';

// Site URL is the staging custom domain on cloudnomad.us. GitHub Pages
// serves from the repo root because of the CNAME below, so no `base` needed.
export default defineConfig({
  site: 'https://rangeley.cloudnomad.us',
  build: {
    format: 'directory',
    assets: '_astro',
  },
  trailingSlash: 'ignore',
});
