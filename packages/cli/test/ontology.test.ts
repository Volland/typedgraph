import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { run, type Io } from '../src/cli.mjs';
import '../src/commands/index.mjs';
import { TG_RULES } from '../src/commands/openspec-config.mjs';

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'tg-onto-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

async function tg(cwd: string, args: string[]) {
  let out = '';
  const io: Io = { cwd, out: (t) => (out += t), err: (t) => (out += t), env: {}, stdin: () => '' };
  const code = await run(args, io);
  return { code, out };
}

const rows = (out: string) => (JSON.parse(out) as { rows: unknown[][] }).rows;

const doc = (type: string, title: string, body: string) => `---\ntype: ${type}\n---\n# ${title}\n\nIndex of ${title.toLowerCase()}.\n\n${body}`;
const DOCS = {
  'lat.md/lat.md': '# Project\n\nIndex.\n\n- [[decisions]] — decisions\n- [[constraints]] — constraints\n- [[glossary]] — terms\n',
  'lat.md/constraints.md': doc('Constraint', 'Constraints', '## GDPR\n\nPersonal data stays in the EU.\n'),
  'lat.md/glossary.md': doc('Concept', 'Glossary', '## Session\n\nA signed-in period of use.\n'),
};
const ONTOLOGY = {
  'Types/code-types.md': `---
schemas:
  Decision:
    properties:
      status: {values: [proposed, accepted]}
  Constraint: {}
  Concept: {}
edgeTypes:
  motivated_by:
    from: Decision
    to: [Constraint, Concept, Decision]
    properties:
      since: text
      weight: {values: [primary, secondary]}
  supersedes:
    from: Decision
    to: Decision
---
# Code types

The ontology.
`,
};

function decisions(body: string): Record<string, string> {
  return { ...DOCS, 'lat.md/decisions.md': doc('Decision', 'Decisions', `## Regional storage\n\nWe store data in Frankfurt.\n\n${body}`) };
}

// @tg: verifies:: [[tests/tg-ontology#Typed edges in docs#Decision motivated by a constraint]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-ontology#Typed edges in docs#Decision motivated by a constraint]]
// @tg: verifies:: [[openspec:tg-cli#Typed edges in docs#Decision motivated by a constraint]]
it('turns a typed edge line in a doc into a named edge with properties, replacing the plain reference', async () => {
  const dir = project(decisions('- motivated_by:: [[constraints#GDPR]] {since: 2}\n'));
  expect((await tg(dir, ['check'])).out).toContain('All checks passed');
  const typed = await tg(dir, ['cypher', '--json', 'MATCH (d)-[r:motivated_by]->(c) RETURN d.title, c.title, r.since']);
  expect(rows(typed.out)).toEqual([['Regional storage', 'GDPR', 2]]);
  const plain = await tg(dir, ['cypher', '--json', "MATCH (d {title: 'Regional storage'})-[r:references]->(c {title: 'GDPR'}) RETURN count(r)"]);
  expect(rows(plain.out)).toEqual([[0]]);
});

// @tg: verifies:: [[tests/tg-ontology#Typed edges in docs#Negative edge to a requirement]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-ontology#Typed edges in docs#Negative edge to a requirement]]
// @tg: verifies:: [[openspec:tg-cli#Typed edges in docs#Negative edge to a requirement]]
it('makes a negative typed edge to an OpenSpec requirement', async () => {
  const dir = project({
    ...decisions('- -contradicts:: [[openspec:auth#Token expiry]] {ticket: "PLAT-481"}\n'),
    'openspec/specs/auth/spec.md': '# auth\n\n## Requirements\n\n### Requirement: Token expiry\nTokens SHALL expire.\n\n#### Scenario: Old token\n- **WHEN** a token is old\n- **THEN** it is rejected\n',
  });
  const r = await tg(dir, ['cypher', '--json', 'MATCH (d)-[r:contradicts]->(q:Requirement) RETURN d.title, q.name, r.sign, r.ticket']);
  expect(rows(r.out)).toEqual([['Regional storage', 'Token expiry', -1, 'PLAT-481']]);
});

// @tg: verifies:: [[tests/tg-ontology#Typed edges in docs#Code fence ignored]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-ontology#Typed edges in docs#Code fence ignored]]
// @tg: verifies:: [[openspec:tg-cli#Typed edges in docs#Code fence ignored]]
it('ignores typed edge lines inside code fences', async () => {
  const dir = project(decisions('```markdown\n- motivated_by:: [[constraints#GDPR]]\n```\n'));
  const r = await tg(dir, ['cypher', '--json', 'MATCH ()-[r:motivated_by]->() RETURN count(r)']);
  expect(rows(r.out)).toEqual([[0]]);
});

// @tg: verifies:: [[tests/tg-ontology#Ontology listing#Code ontology listed]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-ontology#Ontology listing#Code ontology listed]]
// @tg: verifies:: [[openspec:tg-cli#Ontology listing#Code ontology listed]]
it('lists the ontology tg init installs', async () => {
  const dir = project({});
  await tg(dir, ['init', '--agent', 'claude']);
  const r = await tg(dir, ['ontology', '--json']);
  const o = JSON.parse(r.out) as { types: { type: string; properties: { name: string }[] }[]; edgeTypes: { type: string; from: string[]; to: string[] }[] };
  expect(o.types).toHaveLength(6);
  expect(o.types.find((t) => t.type === 'Decision')!.properties.map((p) => p.name)).toContain('status');
  // Ten from the code ontology, three (contradicts, derived_from, cites) from the shared core.
  expect(o.edgeTypes).toHaveLength(13);
  expect(o.edgeTypes.find((e) => e.type === 'contradicts')).toMatchObject({ from: null, to: null });
  expect(o.edgeTypes.find((e) => e.type === 'motivated_by')).toMatchObject({ from: ['Decision'], to: ['Constraint', 'Concept', 'Decision'] });
  const text = await tg(dir, ['ontology']);
  expect(text.out).toContain('motivated_by: Decision → Constraint|Concept|Decision');
});

// @tg: verifies:: [[tests/tg-ontology#Ontology listing#No ontology]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-ontology#Ontology listing#No ontology]]
// @tg: verifies:: [[openspec:tg-cli#Ontology listing#No ontology]]
it('says when no ontology is declared', async () => {
  const r = await tg(project(DOCS), ['ontology']);
  expect(r.code).toBe(0);
  expect(r.out).toContain('No ontology declared');
  expect(r.out).toContain('tg init');
});

// @tg: verifies:: [[tests/tg-ontology#Ontology check#Unknown edge name]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-ontology#Ontology check#Unknown edge name]]
// @tg: verifies:: [[openspec:tg-cli#Ontology check#Unknown edge name]]
it('reports an undeclared edge name with the closest declared one', async () => {
  const dir = project({ ...ONTOLOGY, ...decisions('- motivatedBy:: [[constraints#GDPR]]\n') });
  const r = await tg(dir, ['ontology', 'check']);
  expect(r.code).toBe(1);
  expect(r.out).toContain("lat.md/decisions.md:12: edge type 'motivatedBy' is not in the ontology; did you mean 'motivated_by'?");
});

// @tg: verifies:: [[tests/tg-ontology#Ontology check#Wrong endpoint type]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-ontology#Ontology check#Wrong endpoint type]]
// @tg: verifies:: [[openspec:tg-cli#Ontology check#Wrong endpoint type]]
it('reports an edge whose source type the edge type does not allow, and undeclared or out-of-range properties', async () => {
  const dir = project({
    ...ONTOLOGY,
    ...decisions('- motivated_by:: [[constraints#GDPR]] {weight: decisive, owner: "ops"}\n'),
    'lat.md/glossary.md': doc('Concept', 'Glossary', '## Session\n\nA signed-in period of use.\n\n- supersedes:: [[decisions#Regional storage]]\n'),
  });
  const r = await tg(dir, ['ontology', 'check', '--json']);
  const messages = (JSON.parse(r.out) as { findings: { kind: string; message: string }[] }).findings.map((f) => `${f.kind}: ${f.message}`);
  expect(messages).toContain("wrong-source: 'supersedes' starts at Decision, not Concept");
  expect(messages).toContain("value-not-allowed: 'motivated_by' property 'weight' is decisive; allowed: primary, secondary");
  expect(messages).toContain("undeclared-property: 'motivated_by' declares no property 'owner' (declared: since, weight)");
  expect(r.code).toBe(1);
});

// @tg: verifies:: [[tests/tg-ontology#Ontology check#Clean ontology use]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-ontology#Ontology check#Clean ontology use]]
// @tg: verifies:: [[openspec:tg-cli#Ontology check#Clean ontology use]]
it('passes when every typed edge fits, ignoring references and @lat links', async () => {
  const AT = '@';
  const dir = project({
    ...ONTOLOGY,
    ...decisions('- motivated_by:: [[constraints#GDPR]] {since: "2.3", weight: primary}\n\nSee also [[glossary#Session]].\n'),
    'src/store.ts': `// ${AT}lat: [[decisions#Regional storage]]\nexport function store() {}\n`,
  });
  const r = await tg(dir, ['ontology', 'check']);
  expect(r.out).toContain('All typed edges agree with the ontology');
  expect(r.code).toBe(0);
  expect((await tg(project(decisions('- madeUp:: [[constraints#GDPR]]\n')), ['ontology', 'check'])).out).toContain('No ontology declared');
});

// @tg: verifies:: [[tests/tg-ontology#Ontology-aware guidance#Instructions teach the ontology]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-ontology#Ontology-aware guidance#Instructions teach the ontology]]
// @tg: verifies:: [[openspec:tg-agent-integration#Ontology-aware guidance#Instructions teach the ontology]]
it('teaches the ontology in the generated instructions and skills', async () => {
  const dir = project({});
  const claude = (await tg(dir, ['gen', 'claude.md'])).out;
  expect(claude).toContain('tg ontology');
  expect(claude).toMatch(/- motivated_by:: \[\[constraints#Session limit\]\] \{[^}]+\}/);
  expect(claude).toContain('- [ ] Run `tg ontology check`');
  for (const skill of ['skill.md', 'graph-skill.md', 'trace-skill.md', 'impact-skill.md', 'audit-skill.md']) expect((await tg(dir, ['gen', skill])).out).toContain('tg ontology');
  for (const patch of ['openspec-propose.md', 'openspec-apply.md', 'openspec-archive.md', 'openspec-explore.md']) expect((await tg(dir, ['gen', patch])).out).toContain('tg ontology');
});

// @tg: verifies:: [[tests/tg-ontology#Ontology-aware guidance#OpenSpec rules teach typed records]] {since: "2026-10-14", level: unit}
// @lat: [[tests/tg-ontology#Ontology-aware guidance#OpenSpec rules teach typed records]]
// @tg: verifies:: [[openspec:tg-agent-integration#Ontology-aware guidance#OpenSpec rules teach typed records]]
it('asks OpenSpec for Decision sections with motivated_by edges and an ontology check', () => {
  expect(TG_RULES.design!.join(' ')).toContain('`Decision` section');
  expect(TG_RULES.design!.join(' ')).toContain('motivated_by');
  expect(TG_RULES.tasks!.join(' ')).toContain('tg ontology check');
});
