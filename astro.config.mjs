import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://rangeley.cloudnomad.us',
  build: {
    format: 'directory',
  },
  trailingSlash: 'ignore',
});
