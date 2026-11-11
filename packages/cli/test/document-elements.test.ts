import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { run, type Io } from '../src/cli.mjs';
import '../src/commands/index.mjs';

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'tg-elements-'));
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

// Split so the repository's own scan does not read the fixtures as annotations.
const TG = '@' + 'tg:';

const TYPES = `---
tgs: "0.4"
schemas:
  Decision:
    description: A choice that was made.
    elements:
      option:
        description: An option that was considered.
        attributes:
          outcome: {values: [chosen, rejected]}
  Constraint:
    description: A rule nobody here chose.
  Skill:
    elements:
      when_to_use:
        required: true
        description: When an agent should load the skill.
        elements:
          trigger: {many: false, description: The words that load it.}
edgeTypes:
  motivated_by:
    description: The reason behind a decision.
    from: Decision
    to: Constraint
  implements:
    from: [CodeSymbol, CodeFile]
    to: [Decision]
---
# Types
`;

const FILES = {
  'Types/types.md': TYPES,
  'lat.md/lat.md': '# Docs\n\nIndex.\n\n- [[decisions]] — decisions\n- [[constraints]] — constraints\n- [[skills]] — skills\n',
  'lat.md/constraints.md': '---\ntype: Constraint\n---\n# Constraints\n\nRules.\n\n## Session limit\n\nSessions end after 15 minutes.\n',
  'lat.md/decisions.md':
    '---\ntype: Decision\n---\n# Decisions\n\nChoices.\n\n## Tokens\n\nShort-lived tokens.\n\n<option id="redis" outcome="maybe">\n\nSessions in Redis.\n\n- motivated_by:: [[constraints#Session limit]]\n\n</option>\n',
  'lat.md/skills.md': '---\ntype: Skill\n---\n# Skills\n\nSkills.\n\n## Review\n\nReviews diffs.\n',
  'docs/adr/0003-use-postgres.md': '---\nstatus: accepted\n---\n# Use Postgres\n\n## Decision Outcome\n\nPostgres.\n\n<option id="mysql" outcome="rejected">\nWeaker JSON.\n</option>\n',
  'src/store.ts': `// ${TG} implements:: [[adr:3#^mysql]]\nexport function store() {}\n// ${TG} implements:: [[decisions#^redis]]\nexport function cache() {}\n`,
};

// @lat: [[tests/document-elements#CLI#Listing shows elements]]
// @tg: verifies:: [[openspec:document-elements#Ontology listing explains documents#Listing shows elements]] {level: integration}
it('lists descriptions, elements and sections, and includes them in JSON', async () => {
  const dir = project(FILES);
  const r = await tg(dir, ['ontology']);
  expect(r.out).toContain('  Decision  (Types/types.md)\n    A choice that was made.');
  expect(r.out).toContain('      <option> — An option that was considered.\n        attributes:\n          outcome (text, chosen|rejected)');
  expect(r.out).toContain('      <when_to_use>  (required) — When an agent should load the skill.\n        elements:\n          <trigger>  (at most one) — The words that load it.');
  expect(r.out).toContain('motivated_by: Decision → Constraint  (Types/types.md)\n    The reason behind a decision.');
  const json = JSON.parse((await tg(dir, ['ontology', '--json'])).out) as { types: { type: string; description: string | null; elements: { tag: string }[] }[] };
  const decision = json.types.find((t) => t.type === 'Decision')!;
  expect(decision.description).toBe('A choice that was made.');
  expect(decision.elements.map((e) => e.tag)).toEqual(['option']);
});

// @lat: [[tests/document-elements#CLI#Element links checked]]
// @tg: verifies:: [[openspec:document-elements#Addressing by id#Element in an ADR]] {level: integration}
it('checks element links from code and reaches element nodes in cypher', async () => {
  const dir = project(FILES);
  const c = await tg(dir, ['check']);
  expect(c.out).toContain('All checks passed');
  const q = await tg(dir, ['cypher', '--json', 'MATCH (c:CodeSymbol)-[:implements]->(e:Element) RETURN c.symbol, e.element ORDER BY c.symbol']);
  expect((JSON.parse(q.out) as { rows: unknown[][] }).rows).toEqual([
    ['cache', 'lat.md/decisions#^redis'],
    ['store', 'adr:0003#^mysql'],
  ]);
  const broken = project({ ...FILES, 'src/store.ts': `// ${TG} implements:: [[adr:3#^mysq]]\nexport function store() {}\n` });
  const b = await tg(broken, ['check']);
  expect(b.code).toBe(1);
  expect(b.out).toContain('no element "mysq" in adr:3');
});

// @lat: [[tests/document-elements#CLI#Ontology check reports documents]]
it('reports document findings in tg ontology check', async () => {
  const dir = project(FILES);
  const r = await tg(dir, ['ontology', 'check']);
  expect(r.code).toBe(1);
  expect(r.out).toContain("lat.md/decisions.md:12: <option> attribute 'outcome' is 'maybe'; allowed: chosen, rejected");
  expect(r.out).toContain("lat.md/skills.md:8: 'Review' (Skill) has no <when_to_use>: When an agent should load the skill.");
  // The edge inside the option starts at the element, which the ontology lets through.
  expect(r.out).not.toContain('motivated_by');
});

// @lat: [[tests/document-elements#CLI#Validate checks typed notes]]
it('checks typed vault notes in tg validate', async () => {
  const dir = project({ 'Types/types.md': TYPES, 'Skills/Review.md': '---\ntype: Skill\n---\n# Review\n\nNo trigger.\n' });
  const r = await tg(dir, ['validate', '--json']);
  const findings = (JSON.parse(r.out) as { findings: { code: string; path: string }[] }).findings;
  expect(findings.map((f) => [f.code, f.path])).toEqual([['missing-element', 'Skills/Review.md']]);
});

// @lat: [[tests/document-elements#CLI#Code ontology describes itself]]
// @tg: verifies:: [[openspec:document-elements#Code ontology describes itself#Descriptions installed]] {level: integration}
it('installs a code ontology that describes every type and edge type', async () => {
  const dir = project({ 'lat.md/lat.md': '# Docs\n\nIndex.\n' });
  await tg(dir, ['init', '--write', '--spec', 'adr']);
  const json = JSON.parse((await tg(dir, ['ontology', '--json'])).out) as {
    types: { type: string; description: string | null; elements: { tag: string }[]; sections: { heading: string }[] }[];
    edgeTypes: { type: string; description: string | null }[];
    diagnostics: unknown[];
  };
  expect(json.diagnostics).toEqual([]);
  expect(json.types.filter((t) => !t.description).map((t) => t.type)).toEqual([]);
  expect(json.edgeTypes.filter((e) => !e.description).map((e) => e.type)).toEqual([]);
  expect(json.types.find((t) => t.type === 'Decision')!.elements.map((e) => e.tag)).toEqual(['option', 'consequence']);
  expect(json.types.find((t) => t.type === 'ADR')!.sections.map((s) => s.heading)).toContain('Considered Options');
  const check = await tg(dir, ['ontology', 'check']);
  expect(check.code).toBe(0);
});
