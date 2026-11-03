// Bundles run.mts like the CLI (esbuild, workspace sources) and runs it with the given arguments.
import { build } from 'esbuild';

const outfile = 'eval/search/.out/run.mjs';
await build({
  entryPoints: ['eval/search/run.mts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  // createRequire lets bundled CommonJS dependencies (yaml) require node builtins from ESM.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  loader: { '.md': 'text' },
  logLevel: 'warning',
});
await import(new URL(`../../${outfile}`, import.meta.url).href);
