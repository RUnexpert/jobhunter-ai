import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const database =
  process.env.TEST_DATABASE_URL ??
  'postgresql://jobhunter:jobhunter_test_password@127.0.0.1:55432/jobhunter_test';
const redis = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:56379/15';
if (!new URL(database).pathname.endsWith('_test'))
  throw new Error('Use a dedicated database whose name ends with _test');
if (new URL(redis).port !== '56379') throw new Error('Use isolated test Redis on port 56379');
const env = {
  ...process.env,
  DATABASE_URL: database,
  TEST_DATABASE_URL: database,
  REDIS_URL: redis,
  TEST_REDIS_URL: redis,
};
const root = fileURLToPath(new URL('../', import.meta.url));
for (const [entry, args] of [
  ['prisma/build/index.js', ['generate']],
  ['prisma/build/index.js', ['migrate', 'deploy']],
  ['vitest/vitest.mjs', ['run', '--config', 'vitest.integration.config.ts']],
]) {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../node_modules/' + entry, import.meta.url)), ...args],
    { cwd: root, env, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
