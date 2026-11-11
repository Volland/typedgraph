import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import Ajv from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  DEFAULT_BASE_IRI,
  TGS_NAMESPACE,
  Graph,
  iriOf,
  noteDocumentDiagnostics,
  parseAsciidoc,
  readSchemaNote,
  scaffoldSchemaNote,
  schemasFromGraph,
  splitFrontmatter,
  validateSchemas,
  type Diagnostic,
  type NoteInput,
  type SchemaSet,
} from '../src/index.js';
import { exportShacl, importShacl } from '../src/shacl.js';

const SPEC = join(__dirname, '../../../spec/tgs');
const WRITE = process.env.TGS_WRITE_EXPECTED === '1';
const ajv = new Ajv({ strict: true, allowUnionTypes: true });
const validateJson = ajv.compile(JSON.parse(readFileSync(join(SPEC, 'tgs.schema.json'), 'utf8')));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
}

function loadVault(dir: string): NoteInput[] {
  return files(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const text = readFileSync(f, 'utf8');
      const { yaml } = splitFrontmatter(text);
      return { path: relative(dir, f), text, frontmatter: yaml === null ? null : (parseYaml(yaml) as Record<string, unknown>) };
    });
}

function graphOf(notes: NoteInput[]): Graph {
  const paths = new Set(notes.map((n) => n.path));
  const graph = new Graph((l) => [...paths].find((p) => p === `${l}.md` || p.endsWith(`/${l}.md`)) ?? null);
  for (const n of notes) graph.upsertNote(n);
  return graph;
}

/** Declarations in an implementation-neutral form: names, expanded IRIs and defaults applied. */
function declarations(set: SchemaSet) {
  const iri = (d: { uri: string | null }, name: string) => iriOf(d, name, DEFAULT_BASE_IRI, set.prefixes);
  const props = (ps: SchemaSet['schemas'] extends Map<string, infer T> ? (T extends { properties: infer P } ? P : never) : never) =>
    ps.map((p) => ({ name: p.name, iri: iri(p, p.name), kind: p.kind, required: p.required, many: p.many, values: p.values, default: p.default, ...(p.description ? { description: p.description } : {}) }));
  return {
    types: [...set.schemas.values()]
      .sort((a, b) => a.type.localeCompare(b.type))
      .map((t) => ({
        name: t.type,
        note: t.path,
        iri: iri(t, t.type),
        properties: props(t.properties),
        edges: t.edges,
        template: t.template,
        ...(t.ids.length ? { ids: t.ids } : {}),
        ...(t.description ? { description: t.description } : {}),
        ...(t.elements?.length ? { elements: t.elements } : {}),
        ...(t.sections?.length ? { sections: t.sections } : {}),
      })),
    edgeTypes: [...set.edgeTypes.values()]
      .sort((a, b) => a.type.localeCompare(b.type))
      .map((e) => ({ name: e.type, note: e.path, iri: iri(e, e.type), from: e.from, to: e.to, properties: props(e.properties), ...(e.description ? { description: e.description } : {}) })),
  };
}

const diagnosticsOf = (ds: Diagnostic[]) =>
  ds
    .map((d) => ({ path: d.path, line: d.line ? d.line + 1 : null, diagnostic: d.code }))
    .sort((a, b) => `${a.path}:${String(a.line).padStart(5, '0')}:${a.diagnostic}`.localeCompare(`${b.path}:${String(b.line).padStart(5, '0')}:${b.diagnostic}`));

const cases = readdirSync(join(SPEC, 'examples')).sort();

describe('TGS conformance examples', () => {
  // @tg: verifies:: [[tests/tgs-spec#Conformance examples pass]] {since: "2026-10-06", level: unit}
  // @lat: [[tests/tgs-spec#Conformance examples pass]]
  it.each(cases)('%s', (name) => {
    const dir = join(SPEC, 'examples', name);
    const notes = loadVault(join(dir, 'vault'));
    const graph = graphOf(notes);
    const set = schemasFromGraph(graph, 'Types/');
    const actual = { ...declarations(set), diagnostics: diagnosticsOf([...set.diagnostics, ...validateSchemas(graph, set), ...noteDocumentDiagnostics(graph, set)]) };
    const expectedPath = join(dir, 'expected.json');
    const shapesPath = join(dir, 'shapes.ttl');
    const bodies = new Map(notes.map((n) => [n.path, splitFrontmatter(n.text).body]));
    const ttl = exportShacl(set, { body: (p) => bodies.get(p) ?? null });
    if (WRITE) {
      const old = existsSync(expectedPath) ? (JSON.parse(readFileSync(expectedPath, 'utf8')) as { invalidAgainstJsonSchema?: string[] }) : {};
      writeFileSync(expectedPath, `${JSON.stringify({ invalidAgainstJsonSchema: old.invalidAgainstJsonSchema ?? [], ...actual }, null, 2)}\n`);
      if (name.includes('shacl')) writeFileSync(shapesPath, ttl);
    }
    const expected = JSON.parse(readFileSync(expectedPath, 'utf8')) as typeof actual & { invalidAgainstJsonSchema: string[] };
    expect(actual).toEqual({ types: expected.types, edgeTypes: expected.edgeTypes, diagnostics: expected.diagnostics });
    if (existsSync(shapesPath)) expect(ttl).toBe(readFileSync(shapesPath, 'utf8'));
    for (const n of notes.filter((x) => x.path.startsWith('Types/'))) {
      expect(validateJson(n.frontmatter ?? {}), `${name}/${n.path} against the JSON Schema`).toBe(!expected.invalidAgainstJsonSchema.includes(n.path));
    }
  });
});

describe('TGS JSON Schema', () => {
  // @tg: verifies:: [[tests/tgs-spec#Spec examples validate]] {since: "2026-10-06", level: unit}
  // @lat: [[tests/tgs-spec#Spec examples validate]]
  // @tg: verifies:: [[openspec:tgs-spec#Machine-readable schema#Examples validate]]
  it('accepts every YAML example in the specification and the scaffold', () => {
    const spec = readFileSync(join(SPEC, 'SPEC.md'), 'utf8');
    const blocks = [...spec.matchAll(/```yaml\n([\s\S]*?)```/g)].map((m) => m[1]!);
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    for (const block of blocks) {
      const yaml = block.replace(/^#.*\n/, '').replace(/^---\n/, '').replace(/\n---\n[\s\S]*$/, '\n');
      const parsed = parseYaml(yaml) as Record<string, unknown>;
      const fm = ['schema', 'schemas', 'edgeTypes', 'prefixes', 'tgs'].some((k) => k in parsed) ? parsed : { schema: parsed };
      expect(validateJson(fm), JSON.stringify(validateJson.errors)).toBe(true);
      expect(readSchemaNote('Types/Example.md', fm).diagnostics).toEqual([]);
    }
    expect(validateJson(parseYaml(splitFrontmatter(scaffoldSchemaNote()).yaml!))).toBe(true);
  });

  // @tg: verifies:: [[tests/tgs-spec#Invalid notes rejected]] {since: "2026-10-06", level: unit}
  // @lat: [[tests/tgs-spec#Invalid notes rejected]]
  // @tg: verifies:: [[openspec:tgs-spec#Machine-readable schema#Invalid note rejected]]
  it('rejects malformed declarations', () => {
    for (const bad of [{ schema: { edges: 5 } }, { schema: { properties: { a: { kind: 'emotion' } } } }, { schemas: { A: { inherits: 'B' } } }, { tgs: '1.0' }, { edgeTypes: { e: { from: 3 } } }]) {
      expect(validateJson(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  // @tg: verifies:: [[tests/tgs-spec#Namespace terms documented]] {since: "2026-10-06", level: unit}
  // @lat: [[tests/tgs-spec#Namespace terms documented]]
  // @tg: verifies:: [[openspec:tgs-spec#Namespace IRI#Namespace documented]]
  it('documents every tgs: term the SHACL export uses', () => {
    const ns = JSON.parse(readFileSync(join(SPEC, 'namespace.json'), 'utf8')) as { namespace: string; terms: { term: string }[] };
    const used = new Set<string>();
    const src = ['export.ts', 'import.ts'].map((f) => readFileSync(join(__dirname, '../src/shacl', f), 'utf8')).join('\n');
    for (const m of src.matchAll(/\$\{TGS\}(\w+)/g)) used.add(m[1]!);
    expect([...used].sort()).toEqual(ns.terms.map((t) => t.term).sort());
    expect(ns.namespace).toBe('https://typedgraph.org/ns/tgs#');
  });
});

describe('TGS AsciiDoc notes', () => {
  // @tg: verifies:: [[openspec:tgs-spec#AsciiDoc notes in TGS 0.3#AsciiDoc example]] {level: unit}
  // @lat: [[tests/tgs-spec#AsciiDoc example reads as documented]]
  it('reads the AsciiDoc example of the specification into the graph it shows', () => {
    const spec = readFileSync(join(SPEC, 'SPEC.md'), 'utf8');
    const block = /```asciidoc\n([\s\S]*?)```/.exec(spec)![1]!;
    const r = parseAsciidoc(block, 'book/ch03.adoc', { parseYaml });
    expect(r.title).toBe('Metagraphs');
    expect(r.meta).toEqual({ type: 'Chapter', status: 'draft', pages: 12 });
    expect(r.edges.map((e) => [e.type, e.target, e.props])).toEqual([
      ['cites', 'Pavlyshyn 2024', { page: 12, section: 'book/ch03.adoc#Definition' }],
      ['defines', 'Metagraph', { section: 'book/ch03.adoc#Definition' }],
    ]);
    expect(r.sections.find((x) => x.aliases.includes('definition'))?.id).toBe('book/ch03.adoc#Definition');
  });

  // @tg: verifies:: [[openspec:tgs-spec#AsciiDoc notes in TGS 0.3#Published 0.3]] {level: unit}
  // @lat: [[tests/tgs-spec#Version 0.3 published beside 0.2]]
  it('keeps 0.3, with AsciiDoc notes, beside 0.2 archived unchanged', () => {
    const v03 = readFileSync(join(SPEC, 'archive/v0.3/SPEC.md'), 'utf8');
    expect(v03).toContain('# Typed Graph Schema (TGS) 0.3');
    expect(v03).toContain('### 2.1 AsciiDoc notes');
    expect(JSON.parse(readFileSync(join(SPEC, 'archive/v0.3/tgs.schema.json'), 'utf8')).$id).toContain('/spec/tgs/v0.3/');
    const archived = readFileSync(join(SPEC, 'archive/v0.2/SPEC.md'), 'utf8');
    expect(archived).toContain('# Typed Graph Schema (TGS) 0.2');
    expect(archived).not.toContain('AsciiDoc');
  });

  // @tg: verifies:: [[openspec:document-elements#TGS 0.5 published#Published 0.5]] {level: unit}
  // @lat: [[tests/document-elements#TGS 0.5 published beside 0.4]]
  it('keeps 0.5, with element scope and the normal form, beside 0.4', () => {
    const v05 = readFileSync(join(SPEC, 'archive/v0.5/SPEC.md'), 'utf8');
    expect(v05).toContain('# Typed Graph Schema (TGS) 0.5');
    expect(v05).toContain('### 4.4 Nesting and scope');
    expect(v05).toContain('### 4.9 Normal form');
    expect(JSON.parse(readFileSync(join(SPEC, 'archive/v0.5/tgs.schema.json'), 'utf8')).$id).toContain('/spec/tgs/v0.5/');
    const v04 = readFileSync(join(SPEC, 'archive/v0.4/SPEC.md'), 'utf8');
    expect(v04).toContain('# Typed Graph Schema (TGS) 0.4');
    expect(v04).not.toContain('### 4.4 Nesting and scope');
  });

  // @tg: verifies:: [[openspec:tgs-spec#TGS 0.6 published#Published 0.6 at typedgraph.org]] {level: unit}
  // @lat: [[tests/tgs-spec#Version 0.6 published at typedgraph.org]]
  it('publishes 0.6 with every identifier under typedgraph.org', () => {
    const spec = readFileSync(join(SPEC, 'SPEC.md'), 'utf8');
    expect(spec).toContain('# Typed Graph Schema (TGS) 0.6');
    expect(spec).toContain('| **This version** | `https://typedgraph.org/spec/tgs/v0.6/` |');
    expect(spec).toContain('| **Namespace** | `https://typedgraph.org/ns/tgs#` (prefix `tgs:`) |');
    expect(JSON.parse(readFileSync(join(SPEC, 'tgs.schema.json'), 'utf8')).$id).toBe('https://typedgraph.org/spec/tgs/v0.6/tgs.schema.json');
    expect(TGS_NAMESPACE).toBe('https://typedgraph.org/ns/tgs#');
    expect(readFileSync(join(__dirname, '../../../site/build-spec.mjs'), 'utf8')).toContain("const VERSION = '0.6'");
    // 0.5 stays as published, with its former addresses.
    expect(readFileSync(join(SPEC, 'archive/v0.5/SPEC.md'), 'utf8')).toContain('`https://volland.github.io/obsigraph/spec/tgs/v0.5/`');
  });

  // @tg: verifies:: [[openspec:tgs-spec#Namespace IRI#Former namespace imported]] {level: unit}
  // @lat: [[tests/tgs-spec#Former namespace imports unchanged]]
  it('imports an export written with the former tgs: namespace as the same declarations', () => {
    const current = readFileSync(join(SPEC, 'examples/05-shacl/shapes.ttl'), 'utf8');
    expect(current).toContain('@prefix tgs: <https://typedgraph.org/ns/tgs#> .');
    const former = current.replaceAll('https://typedgraph.org/ns/tgs#', 'https://volland.github.io/obsigraph/ns/tgs#');
    const a = importShacl(current, { base: 'urn:tgs:' });
    const b = importShacl(former, { base: 'urn:tgs:' });
    expect(b).toEqual(a);
    expect(b.prefixes).not.toHaveProperty('tgs');
    expect(a.types.some((t) => t.template)).toBe(true);
  });
});
