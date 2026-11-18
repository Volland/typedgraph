// Package the ontology gallery for the website: site/ontologies/<id>.zip for each ontology
// (its Types/, Templates/, Examples/, README, the shared core and the ontologies it builds on, from
// ontologies/requires.json), all.zip with every ontology composed into one vault, and the schema notes as
// single downloadable files. Needs the `zip` command.
// @tg: implements:: [[openspec:ontology-gallery#Gallery downloads]]
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SRC = 'ontologies';
const OUT = 'site/ontologies';
const ids = readdirSync(SRC).filter((f) => !f.startsWith('.') && statSync(join(SRC, f)).isDirectory()).sort();
const requires = JSON.parse(readFileSync(join(SRC, 'requires.json'), 'utf8'));
const CORE = 'core/Types/core-types.md';
const picks = ids.filter((id) => id !== 'core');

function zip(stage, name) {
  const out = join(process.cwd(), OUT, `${name}.zip`);
  rmSync(out, { force: true });
  const r = spawnSync('zip', ['-qr', out, '.'], { cwd: stage });
  if (r.status !== 0) throw new Error(`zip failed for ${name}: ${r.stderr ?? r.error}`);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'ontologies-'));

for (const id of picks) {
  const stage = join(tmp, id);
  // What it builds on comes first, so its own files win where a name is shared (the README).
  for (const dep of requires[id] ?? []) {
    for (const dir of ['Types', 'Templates', 'Examples']) if (existsSync(join(SRC, dep, dir))) cpSync(join(SRC, dep, dir), join(stage, dir), { recursive: true });
  }
  cpSync(join(SRC, id), stage, { recursive: true });
  cpSync(join(SRC, CORE), join(stage, 'Types/core-types.md'));
  zip(stage, id);
  mkdirSync(join(OUT, id), { recursive: true });
  for (const f of readdirSync(join(SRC, id, 'Types'))) cpSync(join(SRC, id, 'Types', f), join(OUT, id, f));
}

const all = join(tmp, 'all');
mkdirSync(join(all, 'Types'), { recursive: true });
cpSync(join(SRC, 'core/Types'), join(all, 'Types'), { recursive: true });
for (const id of picks) {
  cpSync(join(SRC, id, 'Types'), join(all, 'Types'), { recursive: true });
  if (existsSync(join(SRC, id, 'Templates'))) cpSync(join(SRC, id, 'Templates'), join(all, 'Templates'), { recursive: true });
  if (existsSync(join(SRC, id, 'Examples'))) cpSync(join(SRC, id, 'Examples'), join(all, 'Examples', id), { recursive: true });
  cpSync(join(SRC, id, 'README.md'), join(all, 'Examples', id, 'README.md'));
}
cpSync(join(SRC, 'README.md'), join(all, 'README.md'));
zip(all, 'all');
mkdirSync(join(OUT, 'core'), { recursive: true });
cpSync(join(SRC, CORE), join(OUT, 'core/core-types.md'));
rmSync(tmp, { recursive: true, force: true });
console.log(`Packaged ${picks.length} ontologies and all.zip into ${OUT}`);
