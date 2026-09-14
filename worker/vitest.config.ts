import path from 'node:path';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [cloudflareTest({ wrangler: { configPath: path.join(import.meta.dirname, 'wrangler.jsonc') } })],
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
