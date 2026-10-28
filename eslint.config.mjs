import { defineConfig } from 'eslint/config';
import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';
export default defineConfig([
  ...next,
  ...ts,
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
]);
