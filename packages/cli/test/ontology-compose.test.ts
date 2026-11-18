import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { Graph, schemasFromGraph, splitFrontmatter, validateSchemas, type NoteInput } from '@obsigraph/core';
import { run, type Io } from '../src/cli.mjs';
import '../src/commands/index.mjs';
import { moveToCore } from '../src/core-ontology.mjs';
import { SPEC_IDS, specOntology } from '../src/specs.mjs';

const TEMPLATES = join(__dirname, '../templates/ontology');
const GALLERY = join(__dirname, '../../../ontologies');
/** The code ontology exactly as tg 0.29 wrote it, with `contradicts` declared in it. */
const OLD_CODE_TYPES = readFileSync(join(__dirname, 'fixtures/ontology-0.29/code-types.md'), 'utf8');

async function tg(cwd: string, args: string[]) {
  let out = '';
  let err = '';
  const io: Io = { cwd, out: (t) => (out += t), err: (t) => (err += t), env: {}, stdin: () => '' };
  const code = await run(args, io);
  return { code, out, err };
}

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tg-compose-'));
  mkdirSync(join(dir, 'lat.md'));
  writeFileSync(join(dir, 'lat.md', 'lat.md'), '# Project\n\nIndex.\n');
  return dir;
}

const note = (path: string, text: string): NoteInput => {
  const { yaml } = splitFrontmatter(text);
  return { path, text, frontmatter: yaml === null ? null : (parseYaml(yaml) as Record<string, unknown>) };
};

/** Every schema note of the gallery; the core, code and team notes are the files tg writes, so they share its paths. */
const galleryTypes = (): NoteInput[] =>
  readdirSync(GALLERY)
    .filter((id) => !id.startsWith('.') && existsSync(join(GALLERY, id, 'Types')))
    .flatMap((id) => readdirSync(join(GALLERY, id, 'Types')).map((f) => note(`Types/${f}`, readFileSync(join(GALLERY, id, 'Types', f), 'utf8'))));

// @tg: verifies:: [[tests/ontology-gallery#Composes with tg schemas]] {since: "2026-11-18", level: unit}
// @lat: [[tests/ontology-gallery#Composes with tg schemas]]
// @tg: verifies:: [[openspec:ontology-gallery#Gallery and tg share their files#Everything composes]]
it('composes the core, code, spec and team ontologies tg writes with every gallery ontology, with no duplicate', () => {
  const byPath = new Map<string, NoteInput>();
  for (const n of galleryTypes()) byPath.set(n.path, n);
  for (const f of ['core-types.md', 'code-types.md', 'team-types.md']) byPath.set(`Types/${f}`, note(`Types/${f}`, readFileSync(join(TEMPLATES, f), 'utf8')));
  byPath.set('Types/spec-types.md', note('Types/spec-types.md', specOntology(SPEC_IDS)!));
  const graph = new Graph(() => null);
  for (const n of byPath.values()) graph.upsertNote(n);
  const set = schemasFromGraph(graph, 'Types/');
  expect([...set.diagnostics, ...validateSchemas(graph, set)].map((d) => `${d.path} ${d.message}`)).toEqual([]);
  for (const t of ['Decision', 'Member', 'TeamAgent', 'Agent', 'Person', 'Stakeholder', 'Capability']) expect(set.schemas.has(t), t).toBe(true);
  expect(set.edgeTypes.has('contradicts')).toBe(true);
});

// @tg: verifies:: [[tests/tg-agent#Shared core ontology#Core installed]] {since: "2026-11-18", level: integration}
// @lat: [[tests/tg-agent#Shared core ontology#Core installed]]
// @tg: verifies:: [[openspec:tg-agent-integration#Shared core ontology#Core installed]]
it('writes the shared core with tg init, and a tg project takes gallery types and two-label sections cleanly', async () => {
  const dir = project();
  await tg(dir, ['init', '--write']);
  expect(readFileSync(join(dir, 'Types/core-types.md'), 'utf8')).toBe(readFileSync(join(GALLERY, 'core/Types/core-types.md'), 'utf8'));
  expect(readFileSync(join(dir, 'Types/code-types.md'), 'utf8')).not.toMatch(/^ {2}contradicts:/m);
  writeFileSync(join(dir, 'Types/team-types.md'), (await tg(dir, ['gen', 'team-types.md'])).out);
  for (const id of ['agents', 'okf', 'requirements']) cpSync(join(GALLERY, id, 'Types'), join(dir, 'Types'), { recursive: true });
  writeFileSync(join(dir, 'lat.md/people.md'), '---\ntype: [Person, Member]\n---\n# People\n\nThe team.\n\n## Alice\n\n@alice, tech lead.\n');
  writeFileSync(join(dir, 'lat.md/agents.md'), '---\ntype: [Agent, TeamAgent]\n---\n# Agents\n\nThe agents.\n\n## Bot\n\nA coding agent.\n\n- acts_for:: [[people#Alice]] {autonomy: ask-first}\n');
  writeFileSync(
    join(dir, 'lat.md/decisions.md'),
    '---\ntype: Decision\n---\n# Decisions\n\nChoices.\n\n## Retry three times\n\nRetry a failed charge three times.\n\n- decided_by:: [[people#Alice]] {role: driver}\n- proposed_by:: [[agents#Bot]]\n- -contradicts:: [[decisions#Cache tokens]] {reason: "a cached token can expire mid-retry", ticket: "PAY-88"}\n\n## Cache tokens\n\nCache provider tokens for ten minutes.\n',
  );
  writeFileSync(join(dir, 'lat.md/lat.md'), `${readFileSync(join(dir, 'lat.md/lat.md'), 'utf8')}- [[people]] — people\n- [[agents]] — agents\n- [[decisions]] — decisions\n`);
  const onto = await tg(dir, ['ontology', 'check']);
  expect(onto.out + onto.err).not.toMatch(/declared in both/);
  expect(onto.code).toBe(0);
  expect((await tg(dir, ['check'])).code).toBe(0);
});

// @tg: verifies:: [[tests/tg-agent#Shared core ontology#Contradicts moves to the core]] {since: "2026-11-18", level: integration}
// @lat: [[tests/tg-agent#Shared core ontology#Contradicts moves to the core]]
// @tg: verifies:: [[openspec:tg-agent-integration#Shared core ontology#Contradicts moves to the core]]
it('moves an unchanged contradicts declaration to the shared core on upgrade, and keeps a changed one', async () => {
  const dir = project();
  await tg(dir, ['init', '--write']);
  writeFileSync(join(dir, 'Types/code-types.md'), OLD_CODE_TYPES);
  writeFileSync(join(dir, 'Types/core-types.md'), '');
  const up = await tg(dir, ['upgrade', '--yes', '--no-update-check']);
  expect(up.code).toBe(0);
  const code = readFileSync(join(dir, 'Types/code-types.md'), 'utf8');
  expect(code).not.toMatch(/^ {2}contradicts:/m);
  expect(code).toMatch(/^ {6}contradicts: \[Decision, Requirement, Constraint\]/m);
  expect(readFileSync(join(dir, 'Types/core-types.md'), 'utf8')).toBe(readFileSync(join(TEMPLATES, 'core-types.md'), 'utf8'));
  const check = await tg(dir, ['ontology', 'check']);
  expect(check.out + check.err).not.toMatch(/declared in both/);

  const custom = OLD_CODE_TYPES.replace('      reason: text\n', '      reason: text\n      severity: {values: [low, high]}\n');
  expect(moveToCore(custom)).toEqual({ text: null, moved: [], kept: ['contradicts'] });
  const kept = project();
  await tg(kept, ['init', '--write']);
  writeFileSync(join(kept, 'Types/code-types.md'), custom);
  const r = await tg(kept, ['upgrade', '--yes', '--no-update-check']);
  expect(r.out).toContain("declares its own 'contradicts' with changes of yours");
  expect(readFileSync(join(kept, 'Types/code-types.md'), 'utf8')).toContain('severity: {values: [low, high]}');
});
