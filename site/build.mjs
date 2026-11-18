// Bundle the live demo into site/assets/demo.js and publish the TGS spec pages. The rest of the site is static.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

await build({
  entryPoints: ['site/src/demo.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  outfile: 'site/assets/demo.js',
  logLevel: 'info',
});

// The ontology gallery visuals read the real ontology notes (types and examples) at build time.
const ontologies = {};
for (const id of readdirSync('ontologies').filter((f) => !f.startsWith('.') && statSync(join('ontologies', f)).isDirectory())) {
  ontologies[id] = ['Types', 'Examples'].flatMap((dir) => {
    try {
      return readdirSync(join('ontologies', id, dir)).filter((f) => f.endsWith('.md')).sort().map((f) => ({ path: `${dir}/${f}`, text: readFileSync(join('ontologies', id, dir, f), 'utf8') }));
    } catch {
      return [];
    }
  });
}
await build({
  entryPoints: ['site/src/ontology-map.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  define: { __ONTOLOGIES__: JSON.stringify(ontologies), __REQUIRES__: readFileSync('ontologies/requires.json', 'utf8') },
  outfile: 'site/assets/ontology-map.js',
  logLevel: 'info',
});

await import('./build-spec.mjs');
