import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['tests/**/*.integration.test.ts'],
    environment: 'node',
    env: {
      REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:56379/15',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgresql://jobhunter@127.0.0.1:55432/jobhunter_test',
    },
    fileParallelism: false,
  },
});
