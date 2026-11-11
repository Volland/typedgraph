import { describe, expect, it } from 'vitest';
import {
  buildLatGraph,
  checkDocuments,
  checkLattice,
  flattenElements,
  Graph,
  LatIndex,
  noteDocumentDiagnostics,
  readSchemaNote,
  scanElements,
  schemaSetFromNotes,
  SpecIndex,
  type CheckInput,
  type SchemaSet,
} from '../src/index.js';
import { exportShacl, importShacl } from '../src/shacl.js';

const ONTOLOGY: Record<string, unknown> = {
  tgs: '0.4',
  schemas: {
    Decision: {
      description: 'A choice that was made',
      properties: { status: { values: ['proposed', 'accepted'], description: 'Where it is' } },
      elements: {
        option: { description: 'An option considered', attributes: { id: 'text', outcome: { values: ['chosen', 'rejected'], required: true } } },
        summary: { description: 'The decision in one sentence', required: true, many: false },
      },
    },
    Constraint: { description: 'A rule nobody here chose' },
    Requirement: {
      elements: {
        rule: { type: 'Requirement', description: 'One precise rule' },
        example: { description: 'A worked case', elements: { input: 'What goes in', output: { description: 'What comes out', required: true } } },
      },
    },
    ADR: { sections: { 'Context and Problem Statement': { required: true, description: 'The forces at play' } } },
    Skill: { elements: { when_to_use: { required: true, description: 'When an agent should load the skill' } } },
  },
  edgeTypes: { motivated_by: { description: 'The reason behind a decision', from: 'Decision', to: ['Constraint', 'Decision'] } },
};

const ontology = (fm: Record<string, unknown> = ONTOLOGY): SchemaSet => schemaSetFromNotes([readSchemaNote('Types/types.md', fm)]);

const doc = (type: string, title: string, body: string) => `---\ntype: ${type}\n---\n# ${title}\n\nAbout ${title.toLowerCase()}.\n\n${body}`;

const DECISIONS = doc(
  'Decision',
  'Decisions',
  [
    '## Short-lived tokens',
    '',
    'Tokens expire after 15 minutes; see [[decisions#^redis]].',
    '',
    '<summary>',
    'Tokens are short-lived.',
    '</summary>',
    '',
    '<option id="redis" outcome="rejected">',
    '',
    'Keep sessions in Redis.',
    '',
    '- motivated_by:: [[constraints#Session limit]]',
    '',
    '</option>',
    '',
    '<details>',
    'Background reading.',
    '</details>',
    '',
  ].join('\n'),
);
const CONSTRAINTS = doc('Constraint', 'Constraints', '## Session limit\n\nSessions end after 15 minutes.\n');
const REQUIREMENTS = doc('Requirement', 'Requirements', '## Login\n\nUsers sign in with a password.\n\n<rule>\nLock the account after five failures.\n</rule>\n\n<rule id="length">\nPasswords have at least 12 characters.\n</rule>\n');

function lattice(extra: Record<string, string> = {}): LatIndex {
  const files: Record<string, string> = { 'lat.md/decisions.md': DECISIONS, 'lat.md/constraints.md': CONSTRAINTS, 'lat.md/requirements.md': REQUIREMENTS, ...extra };
  return new LatIndex(Object.entries(files).map(([path, text]) => ({ path, text })));
}

function check(index: LatIndex, specs?: SpecIndex | null): string[] {
  const input: CheckInput = { index, annotations: [], latEntries: [], latDirName: 'lat.md', readLatFile: () => null, checkSourceLink: () => null, ...(specs !== undefined ? { specs } : {}) };
  return checkLattice(input, ['md', 'sections']).map((f) => f.message);
}

describe('schema', () => {
  // @lat: [[tests/document-elements#Schema#Descriptions read]]
  // @tg: verifies:: [[openspec:document-elements#Descriptions#Type and property described]] {level: unit}
  it('reads descriptions on types, properties, edges and edge types', () => {
    const set = ontology({ schemas: { ...(ONTOLOGY.schemas as object), Team: { edges: { owns: { target: 'Decision', description: 'What the team decides' } } } }, edgeTypes: ONTOLOGY.edgeTypes });
    expect(set.diagnostics).toEqual([]);
    const d = set.schemas.get('Decision')!;
    expect(d.description).toBe('A choice that was made');
    expect(d.properties[0]!.description).toBe('Where it is');
    expect(set.schemas.get('Team')!.edges![0]!.description).toBe('What the team decides');
    expect(set.edgeTypes.get('motivated_by')!.description).toBe('The reason behind a decision');
  });

  // @lat: [[tests/document-elements#Schema#Undescribed declarations unchanged]]
  // @tg: verifies:: [[openspec:document-elements#Descriptions#No description, no key]] {level: unit}
  it('leaves the new keys out when nothing is declared', () => {
    const t = readSchemaNote('Types/Person.md', { tgs: '0.3', schema: { properties: { name: 'text' }, edges: { knows: { target: 'Person' } } } }).types[0]!;
    expect(Object.keys(t)).not.toContain('description');
    expect(Object.keys(t)).not.toContain('elements');
    expect(Object.keys(t)).not.toContain('sections');
    expect(Object.keys(t.properties[0]!)).not.toContain('description');
    expect(Object.keys(t.edges![0]!)).not.toContain('description');
  });

  // @lat: [[tests/document-elements#Schema#Element declarations read]]
  // @tg: verifies:: [[openspec:document-elements#Element declarations#Element declared with attributes]] {level: unit}
  it('reads element declarations with attributes, nesting, type and cardinality', () => {
    const set = ontology();
    const option = set.schemas.get('Decision')!.elements!.find((e) => e.tag === 'option')!;
    expect(option.description).toBe('An option considered');
    expect(option.attributes.map((a) => [a.name, a.values, a.required])).toEqual([
      ['id', null, false],
      ['outcome', ['chosen', 'rejected'], true],
    ]);
    const summary = set.schemas.get('Decision')!.elements!.find((e) => e.tag === 'summary')!;
    expect([summary.required, summary.many]).toEqual([true, false]);
    const req = set.schemas.get('Requirement')!.elements!;
    expect(req.find((e) => e.tag === 'rule')!.types).toEqual(['Requirement']);
    expect(req.find((e) => e.tag === 'example')!.elements.map((e) => [e.tag, e.description, e.required])).toEqual([
      ['input', 'What goes in', false],
      ['output', 'What comes out', true],
    ]);
  });

  // @lat: [[tests/document-elements#Schema#Element shorthands]]
  // @tg: verifies:: [[openspec:document-elements#Element declarations#Shorthand forms]] {level: unit}
  it('reads a description string, a null and a list of tags', () => {
    const map = readSchemaNote('Types/A.md', { schema: { elements: { example: 'One worked case', note: null } } }).types[0]!.elements!;
    expect(map.map((e) => [e.tag, e.description, e.many, e.node])).toEqual([
      ['example', 'One worked case', true, null],
      ['note', null, true, null],
    ]);
    expect(readSchemaNote('Types/A.md', { schema: { elements: ['input', 'output'] } }).types[0]!.elements!.map((e) => e.tag)).toEqual(['input', 'output']);
  });

  // @lat: [[tests/document-elements#Schema#Element declaration problems]]
  it('reports bad tag names, repeats and unknown keys under 0.4', () => {
    const note = readSchemaNote('Types/A.md', { tgs: '0.4', schema: { elements: { '9bad': null, Example: { colour: 'red' }, example: null } } });
    expect(note.types[0]!.elements!.map((e) => e.tag)).toEqual(['Example']);
    expect(note.diagnostics.map((d) => d.code)).toEqual(['invalid-declaration', 'unknown-key', 'invalid-declaration']);
  });

  // @lat: [[tests/document-elements#Schema#Section declarations read]]
  // @tg: verifies:: [[openspec:document-elements#Section declarations#Required heading declared]] {level: unit}
  it('reads section declarations', () => {
    const t = readSchemaNote('Types/A.md', { schema: { sections: { Context: { required: true, description: 'The forces at play' }, Notes: 'Anything else' } } }).types[0]!;
    expect(t.sections).toEqual([
      { heading: 'Context', description: 'The forces at play', required: true },
      { heading: 'Notes', description: 'Anything else', required: false },
    ]);
  });
});

describe('scanner', () => {
  // @lat: [[tests/document-elements#Scanner#Nested elements with attributes]]
  // @tg: verifies:: [[openspec:document-elements#Elements in Markdown#Nested elements with attributes]] {level: unit}
  it('reads nested elements, attributes and one-line elements', () => {
    const [ex] = scanElements(['---', 'a: <b>', '---', '<example id="a" level=basic>', '  <input>x</input>', '  <output>', '  y', '  </output>', '</example>'].join('\n'));
    expect(ex).toMatchObject({ tag: 'example', attrs: { id: 'a', level: 'basic' }, line: 4, endLine: 9 });
    expect(ex!.children.map((c) => [c.tag, c.text, c.line, c.endLine])).toEqual([
      ['input', 'x', 5, 5],
      ['output', 'y', 6, 8],
    ]);
  });

  // @lat: [[tests/document-elements#Scanner#Placeholders and code skipped]]
  // @tg: verifies:: [[openspec:document-elements#Elements in Markdown#Placeholders and code are not elements]] {level: unit}
  it('skips placeholders, code fences, autolinks and deeply indented tags', () => {
    const text = ['<insert summary — key points>', '<https://example.com>', '```', '<example>', '</example>', '```', '    <indented>', '    </indented>'].join('\n');
    expect(scanElements(text)).toEqual([]);
  });

  // @lat: [[tests/document-elements#Scanner#Unclosed tag]]
  // @tg: verifies:: [[openspec:document-elements#Elements in Markdown#Unclosed tag]] {level: unit}
  it('makes an unclosed tag empty and keeps its content with the parent', () => {
    const [decision] = scanElements(['<decision>', '<option>', 'An idea', '<note>n</note>', '</decision>'].join('\n'));
    expect(decision!.endLine).toBe(5);
    expect(decision!.children.map((c) => [c.tag, c.unclosed ?? false, c.text])).toEqual([
      ['option', true, ''],
      ['note', false, 'n'],
    ]);
    expect(decision!.text).toContain('An idea');
    expect(flattenElements(scanElements('<a>\n<b>\n</b>\n</a>')).map((e) => e.tag)).toEqual(['a', 'b']);
  });
});

describe('addressing', () => {
  // @lat: [[tests/document-elements#Addressing#Element link resolves]]
  // @tg: verifies:: [[openspec:document-elements#Addressing by id#Link to an element]] {level: unit}
  it('resolves file#^id with a short or full file name', () => {
    const index = lattice({ 'lat.md/notes.md': '# Notes\n\nSee [[decisions#^redis]] and [[lat.md/decisions#^REDIS]].\n' });
    expect(index.resolve('decisions#^redis')).toMatchObject({ kind: 'element', id: 'lat.md/decisions#^redis' });
    expect(check(index)).toEqual([]);
  });

  // @lat: [[tests/document-elements#Addressing#Missing element id suggests]]
  // @tg: verifies:: [[openspec:document-elements#Addressing by id#Missing element id]] {level: unit}
  it('reports a missing id with the nearest one', () => {
    const index = lattice({ 'lat.md/notes.md': '# Notes\n\nSee [[decisions#^redsi]].\n' });
    expect(check(index)).toEqual(["broken link [[decisions#^redsi]] — no element with that id — did you mean '[[lat.md/decisions#^redis]]'?"]);
  });

  // @lat: [[tests/document-elements#Addressing#Repeated id reported]]
  // @tg: verifies:: [[openspec:document-elements#Addressing by id#Repeated id]] {level: unit}
  it('reports an id used twice in one file', () => {
    const index = lattice({ 'lat.md/notes.md': '# Notes\n\nTwo.\n\n<option id="x">\none\n</option>\n\n<option id="x">\ntwo\n</option>\n' });
    const messages = check(index);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('element id "x" is used twice in lat.md/notes.md');
  });

  // @lat: [[tests/document-elements#Addressing#Spec element resolves]]
  it('resolves elements in ADRs and OpenSpec specs by any alias of the document', () => {
    const specs = new SpecIndex([
      { path: 'docs/adr/0003-use-postgres.md', text: '# Use Postgres\n\n## Decision Outcome\n\nPostgres.\n\n<option id="mysql" outcome="rejected">\nNo.\n</option>\n' },
      { path: 'openspec/specs/auth/spec.md', text: '# Auth\n\n### Requirement: Login\nThe system SHALL sign users in.\n\n<rule id="lockout">\nLock after five failures.\n</rule>\n\n#### Scenario: Locked\n- WHEN five failures\n' },
    ]);
    expect(specs.element('adr:3#^mysql')).toMatchObject({ id: 'adr:0003#^mysql', owner: 'adr:0003' });
    expect(specs.element('adr:ADR-0003#^MYSQL')?.id).toBe('adr:0003#^mysql');
    expect(specs.element('openspec:auth#^lockout')).toMatchObject({ owner: 'openspec:auth#Login' });
    expect(specs.element('openspec:auth#^nope')).toBeNull();
    const index = lattice({ 'lat.md/notes.md': '---\nspecs: ["adr:0003"]\n---\n# Notes\n\nNotes.\n' });
    expect(check(index, specs)).toEqual([]);
  });
});

describe('graph', () => {
  const graphOf = (index = lattice(), specs: SpecIndex | null = null) => buildLatGraph(index, { schemas: ontology(), specs }).graph;

  // @lat: [[tests/document-elements#Graph#Element node and its edges]]
  // @tg: verifies:: [[openspec:document-elements#Element nodes#Element node and its edges]] {level: unit}
  it('hangs an element node off its section and starts edges inside it at the element', () => {
    const g = graphOf();
    const id = 'lat.md/decisions#^redis';
    const node = g.node(id)!;
    expect(node.labels).toEqual(['Element']);
    expect(node.props).toMatchObject({ tag: 'option', element: id, outcome: 'rejected', file: 'lat.md/decisions.md', owner: 'lat.md/decisions#Decisions#Short-lived tokens', description: 'An option considered' });
    const section = 'lat.md/decisions#Decisions#Short-lived tokens';
    expect(g.outEdges(section).filter((e) => e.type === 'contains').map((e) => e.target)).toContain(id);
    expect(g.outEdges(id).map((e) => [e.type, e.target])).toEqual([['motivated_by', 'lat.md/constraints#Constraints#Session limit']]);
    expect(g.outEdges(section).some((e) => e.type === 'motivated_by')).toBe(false);
    // The section's own link to the element is a reference.
    expect(g.outEdges(section).filter((e) => e.type === 'references').map((e) => e.target)).toContain(id);
  });

  // @lat: [[tests/document-elements#Graph#Typed element without id]]
  // @tg: verifies:: [[openspec:document-elements#Element nodes#Typed element without id]] {level: unit}
  it('makes a typed element a node with a generated id and its type label', () => {
    const g = graphOf();
    expect(g.node('lat.md/requirements#^rule-1')?.labels).toEqual(['Element', 'Requirement']);
    expect(g.node('lat.md/requirements#^length')?.labels).toEqual(['Element', 'Requirement']);
  });

  // @lat: [[tests/document-elements#Graph#Undeclared element stays text]]
  // @tg: verifies:: [[openspec:document-elements#Element nodes#Undeclared element stays text]] {level: unit}
  it('keeps undeclared and untyped elements without an id as text', () => {
    const g = graphOf();
    const elements = [...g.nodes()].filter((n) => n.labels.includes('Element')).map((n) => n.props.tag);
    expect(elements).not.toContain('details');
    expect(elements).not.toContain('summary');
  });

  // @lat: [[tests/document-elements#Graph#Elements in spec files]]
  // @tg: verifies:: [[openspec:document-elements#Elements in spec files#Elements in an OpenSpec requirement]] {level: unit}
  it('makes elements in spec files nodes of their requirement, with edges from inside them', () => {
    const specs = new SpecIndex([
      { path: 'openspec/specs/auth/spec.md', text: '# Auth\n\n### Requirement: Login\nThe system SHALL sign users in.\n\n<rule id="lockout">\n\nLock after five failures.\n\n- motivated_by:: [[constraints#Session limit]]\n\n</rule>\n' },
    ]);
    const g = graphOf(lattice(), specs);
    expect(g.outEdges('openspec:auth#Login').filter((e) => e.type === 'contains').map((e) => e.target)).toContain('openspec:auth#^lockout');
    expect(g.node('openspec:auth#^lockout')?.labels).toEqual(['Element', 'Requirement']);
    expect(g.outEdges('openspec:auth#^lockout').map((e) => [e.type, e.target])).toEqual([['motivated_by', 'lat.md/constraints#Constraints#Session limit']]);
  });
});

describe('validation', () => {
  // @lat: [[tests/document-elements#Validation#Missing required element]]
  // @tg: verifies:: [[openspec:document-elements#Document shape validation#Missing required element]] {level: unit}
  it('reports a typed section without a required element', () => {
    const index = lattice({ 'lat.md/skills.md': doc('Skill', 'Skills', '## Review\n\nReviews a diff.\n\n## Ship\n\nShips.\n\n<when_to_use>\nWhen asked to ship.\n</when_to_use>\n') });
    const findings = checkDocuments(index, null, ontology()).filter((f) => f.file === 'lat.md/skills.md');
    expect(findings.map((f) => [f.kind, f.scope, f.message])).toEqual([['missing-element', 'lat.md/skills#Skills#Review', "'Review' (Skill) has no <when_to_use>: When an agent should load the skill"]]);
  });

  // @lat: [[tests/document-elements#Validation#Attribute value not allowed]]
  // @tg: verifies:: [[openspec:document-elements#Document shape validation#Attribute value not allowed]] {level: unit}
  it('reports attribute values, repeats, unclosed tags and nested requirements', () => {
    const text = doc(
      'Decision',
      'More',
      '## Cache\n\nCaching.\n\n<summary>\na\n</summary>\n\n<summary>\nb\n</summary>\n\n<option id="x" outcome="maybe">\nx\n</option>\n\n<option>\n',
    );
    const req = doc('Requirement', 'Reqs', '## Sum\n\nAdds.\n\n<example>\n<input>1, 2</input>\n</example>\n');
    const kinds = checkDocuments(lattice({ 'lat.md/more.md': text, 'lat.md/reqs.md': req }), null, ontology()).filter((f) => f.file !== 'lat.md/decisions.md').map((f) => `${f.kind}@${f.line}`);
    expect(kinds).toEqual(['too-many-elements@16', 'attribute-value-not-allowed@20', 'unclosed-element@24', 'missing-attribute@24', 'missing-element@12']);
  });

  // @lat: [[tests/document-elements#Validation#Missing ADR heading]]
  // @tg: verifies:: [[openspec:document-elements#Document shape validation#Missing ADR heading]] {level: unit}
  it('reports a record without a required heading through its framework label', () => {
    const specs = new SpecIndex([
      { path: 'docs/adr/0001-a.md', text: '# A\n\n## Context and Problem Statement\n\nWhy.\n' },
      { path: 'docs/adr/0002-b.md', text: '# B\n\n## Decision Outcome\n\nB.\n' },
    ]);
    // Records are also Decisions, so they must hold the <summary> the test ontology requires of a Decision.
    const findings = checkDocuments(new LatIndex([]), specs, ontology());
    expect(findings.map((f) => [f.kind, f.file])).toEqual([
      ['missing-element', 'docs/adr/0001-a.md'],
      ['missing-section', 'docs/adr/0002-b.md'],
      ['missing-element', 'docs/adr/0002-b.md'],
    ]);
  });

  // @lat: [[tests/document-elements#Validation#Vault notes checked]]
  it('checks typed vault notes as whole documents', () => {
    const set = ontology();
    const g = new Graph(() => null);
    g.upsertNote({ path: 'Skills/Review.md', text: '---\ntype: Skill\n---\n# Review\n\nNo trigger.\n', frontmatter: { type: 'Skill' } });
    g.upsertNote({ path: 'Skills/Ship.md', text: '---\ntype: Skill\n---\n# Ship\n\n<when_to_use>\nShipping.\n</when_to_use>\n', frontmatter: { type: 'Skill' } });
    expect(noteDocumentDiagnostics(g, set).map((d) => [d.path, d.code, d.line])).toEqual([['Skills/Review.md', 'missing-element', 0]]);
  });
});

describe('element scope', () => {
  const RUNBOOK = ontology({
    tgs: '0.5',
    schema: {},
    schemas: {
      Runbook: {
        elements: {
          step: { attributes: { risk: { values: ['safe', 'disruptive'], required: true } }, elements: { check: { required: true, attributes: { expect: { required: true } } } } },
          rollback: { required: true, many: false },
        },
      },
      Requirement: { elements: { example: { elements: { input: 'What goes in', case: { type: 'Scenario' } } } } },
    },
  });

  // @lat: [[tests/document-elements#Element scope#Wrappers are transparent and counts are per container]]
  // @tg: verifies:: [[openspec:document-elements#Element scope#Counts per container]] {level: unit}
  it('counts a declared element at any depth, per document or per parent element', () => {
    const body = [
      '## Token service down',
      '',
      'Logins fail.',
      '',
      '<details>',
      '<rollback>',
      'Undo the deploy.',
      '</rollback>',
      '</details>',
      '',
      '<step risk="safe">',
      'Restart the service.',
      '</step>',
      '',
      '<step risk="safe">',
      '<check expect="200">curl /health</check>',
      '<rollback>',
      'Undo again.',
      '</rollback>',
      '</step>',
      '',
      '<check>outside any step</check>',
      '',
    ].join('\n');
    const findings = checkDocuments(lattice({ 'lat.md/runbooks.md': doc('Runbook', 'Runbooks', body) }), null, RUNBOOK).filter((f) => f.file === 'lat.md/runbooks.md');
    // The wrapped <rollback> counts for the document; the step without a <check> is reported at the step; the
    // <rollback> inside a step is the document's second; the top-level <check> is undeclared there, so it is text.
    expect(findings.map((f) => `${f.kind}@${f.line}`)).toEqual(['missing-element@18', 'too-many-elements@24']);
    expect(findings[0]!.message).toBe('<step> has no <check>');
  });

  // @lat: [[tests/document-elements#Element scope#Nested declarations reach through declared children]]
  // @tg: verifies:: [[openspec:document-elements#Element scope#Innermost declaration wins]] {level: unit}
  it('resolves a nested declaration inside a declared child of its parent', () => {
    const req = doc('Requirement', 'Reqs', '## Sum\n\nAdds.\n\n<example>\n<input>\n<case>\nOne plus two.\n</case>\n</input>\n</example>\n\n<case>\nOutside.\n</case>\n');
    const g = buildLatGraph(lattice({ 'lat.md/reqs.md': req }), { schemas: RUNBOOK, specs: null }).graph;
    const cases = [...g.nodes()].filter((n) => n.props.tag === 'case');
    expect(cases.map((n) => [n.id, n.labels])).toEqual([['lat.md/reqs#^case-1', ['Element', 'Scenario']]]);
  });
});

describe('SHACL', () => {
  // @lat: [[tests/document-elements#SHACL round trip]]
  // @tg: verifies:: [[openspec:document-elements#SHACL exchange of descriptions and elements#Round trip keeps elements]] {level: unit}
  it('exports descriptions, elements and sections and imports them unchanged', () => {
    const set = ontology();
    const ttl = exportShacl(set);
    expect(ttl).toContain('sh:description "A choice that was made"');
    expect(ttl).toContain('tgs:elements');
    const back = importShacl(ttl);
    expect(back.dropped).toEqual([]);
    for (const t of back.types) {
      const orig = set.schemas.get(t.type)!;
      expect([t.description, t.elements, t.sections, t.properties.map((p) => p.description)]).toEqual([orig.description, orig.elements, orig.sections, orig.properties.map((p) => p.description)]);
    }
    expect(back.edgeTypes[0]!.description).toBe('The reason behind a decision');
  });
});
