/**
 * ESM host build for dsh-notification-gotify.
 *
 * The host half is plain ESM for Node, externalizing @deepseek-ai/dsh-* plus
 * cordis while bundling schemastery (the Loader validates Config against the
 * schema). There is no client bundle: notifications are pushed from the host
 * process, so the browser half is gone.
 */
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

mkdirSync('lib', { recursive: true })

const dshExternal = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-*']

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  sourcemap: true,
  external: dshExternal,
  logLevel: 'info',
})

execFileSync('node_modules/.bin/tsc', ['-p', 'tsconfig.json'], { stdio: 'inherit' })
