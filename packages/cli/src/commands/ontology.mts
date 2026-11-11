import { buildLatGraph, checkDocuments, DEFAULT_SCHEMA_FOLDER, ELEMENT_LABEL, normalizeFolder, readSchemaNote, schemaSetFromNotes, type ElementSchema, type Graph, type GraphNode, type PropertySchema, type SchemaSet, type SectionSchema } from '@obsigraph/core';
import { EXIT_ERROR, EXIT_FINDINGS, EXIT_OK, register, type Command, type Ctx } from '../cli.mjs';
import { NoLatDir, Project } from '../project.mjs';
import { readSchemaNotes } from './schema.mjs';

const USAGE = 'ontology [check] [--schema-folder Types] [--json]';
// Split so tg check does not read the help text as an annotation.
const TG = '@' + 'tg:';

/** Edges the graph makes itself; they are not ontology edges. */
const STRUCTURAL = new Set(['contains', 'references']);
/** Properties tg adds on its own: a pinned id, and the test name of a test-call annotation. */
const BUILTIN_PROPS = new Set(['id', 'test']);
/** Labels every node of a kind has; they say nothing about its type in the ontology. */
const GENERIC_LABELS = new Set(['Section', ELEMENT_LABEL]);

function load(ctx: Ctx, flags: Map<string, string | true>): { set: SchemaSet; folder: string } {
  const flag = flags.get('schema-folder');
  const folder = normalizeFolder(typeof flag === 'string' ? flag : DEFAULT_SCHEMA_FOLDER);
  const notes = readSchemaNotes(ctx.root, folder);
  return { set: schemaSetFromNotes(notes.map((n) => readSchemaNote(n.path, n.frontmatter))), folder };
}

const show = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));

function describeProperty(p: PropertySchema): string {
  const bits = [p.many ? `${p.kind}[]` : p.kind];
  if (p.values) bits.push(p.values.map(show).join('|'));
  if (p.default !== null && p.default !== undefined) bits.push(`default ${show(p.default)}`);
  if (p.required) bits.push('required');
  return `${p.name} (${bits.join(', ')})`;
}

const propJson = (p: PropertySchema) => ({ name: p.name, kind: p.kind, many: p.many, values: p.values, default: p.default, required: p.required, description: p.description ?? null });

function elementJson(e: ElementSchema): Record<string, unknown> {
  return { tag: e.tag, description: e.description, types: e.types, required: e.required, many: e.many, node: e.node, attributes: e.attributes.map(propJson), elements: e.elements.map(elementJson) };
}

const sectionJson = (h: SectionSchema) => ({ heading: h.heading, description: h.description, required: h.required });

/** `<tag id outcome=a|b>` with the rules that apply to it, for the listing. */
function describeElement(e: ElementSchema): string {
  const attrs = e.attributes.map((a) => `${a.name}${a.values ? `=${a.values.map(show).join('|')}` : ''}${a.required ? '!' : ''}`);
  const bits = [e.types.length ? `node ${e.types.join('+')}` : e.node === true ? 'node' : null, e.required ? 'required' : null, e.many ? null : 'one'].filter(Boolean);
  return `<${[e.tag, ...attrs].join(' ')}>${bits.length ? `  (${bits.join(', ')})` : ''}${e.description ? ` — ${e.description}` : ''}`;
}

function elementLines(list: ElementSchema[], indent: string): string[] {
  return list.flatMap((e) => [`${indent}${describeElement(e)}`, ...elementLines(e.elements, `${indent}  `)]);
}

/** Every edge name the ontology declares: edge types plus the edges allowed on node types. */
function declaredEdgeNames(set: SchemaSet): Set<string> {
  const names = new Set(set.edgeTypes.keys());
  for (const t of set.schemas.values()) for (const e of t.edges ?? []) names.add(e.type);
  return names;
}

/** The ontology as plain data, for `--json` and the MCP tool. */
// @tg: implements:: [[openspec:tg-cli#Ontology listing]]
// @tg: implements:: [[openspec:document-elements#Ontology listing explains documents]]
export function ontologyJson(set: SchemaSet, folder: string) {
  return {
    folder,
    types: [...set.schemas.values()].map((t) => ({
      type: t.type,
      note: t.path,
      template: t.template,
      description: t.description ?? null,
      properties: t.properties.map(propJson),
      edges: t.edges?.map((e) => ({ type: e.type, targets: e.targets, many: e.many, required: e.required, description: e.description ?? null })) ?? null,
      elements: (t.elements ?? []).map(elementJson),
      sections: (t.sections ?? []).map(sectionJson),
    })),
    edgeTypes: [...set.edgeTypes.values()].map((e) => ({
      type: e.type,
      note: e.path,
      from: e.from,
      to: e.to,
      description: e.description ?? null,
      properties: e.properties.map(propJson),
    })),
    diagnostics: set.diagnostics,
  };
}

// @tg: implements:: [[openspec:tg-cli#Ontology listing]]
// @tg: implements:: [[openspec:document-elements#Ontology listing explains documents]]
function runList(ctx: Ctx, set: SchemaSet, folder: string): number {
  if (ctx.json) {
    ctx.out(`${JSON.stringify(ontologyJson(set, folder), null, 2)}\n`);
    return EXIT_OK;
  }
  if (set.schemas.size + set.edgeTypes.size === 0) {
    ctx.out(`No ontology declared: ${folder} has no schema notes. Run tg init to install the code ontology, or add schema notes to ${folder}.\n`);
    return EXIT_OK;
  }
  const out: string[] = [`Ontology from ${folder}: ${set.schemas.size} type${set.schemas.size === 1 ? '' : 's'}, ${set.edgeTypes.size} edge type${set.edgeTypes.size === 1 ? '' : 's'}`, '', 'Types'];
  const props = (list: PropertySchema[]) =>
    list.some((p) => p.description) ? ['    properties:', ...list.map((p) => `      ${describeProperty(p)}${p.description ? ` — ${p.description}` : ''}`)] : [`    properties: ${list.map(describeProperty).join('; ')}`];
  let documents = false;
  for (const t of set.schemas.values()) {
    out.push(`  ${t.type}  (${t.path})`);
    if (t.description) out.push(`    ${t.description}`);
    if (t.properties.length) out.push(...props(t.properties));
    if (t.edges) out.push(`    edges: ${t.edges.length ? t.edges.map((e) => `${e.type} → ${e.targets?.join('|') ?? 'any'}`).join('; ') : 'none'}`);
    if (t.sections?.length) out.push('    sections:', ...t.sections.map((h) => `      ## ${h.heading}${h.required ? '  (required)' : ''}${h.description ? ` — ${h.description}` : ''}`));
    if (t.elements?.length) out.push('    elements:', ...elementLines(t.elements, '      '));
    documents ||= !!(t.sections?.length || t.elements?.length);
  }
  out.push('', 'Edge types');
  for (const e of set.edgeTypes.values()) {
    out.push(`  ${e.type}: ${e.from?.join('|') ?? 'any'} → ${e.to?.join('|') ?? 'any'}  (${e.path})`);
    if (e.description) out.push(`    ${e.description}`);
    if (e.properties.length) out.push(...props(e.properties));
  }
  out.push('', `Write edges as \`- type:: [[target]] {property: value}\` in a doc section, or \`// ${TG} type:: [[target]]\` above code. A leading - on the type marks disagreement.`);
  if (documents)
    out.push(
      'Write an element as a tag on its own line, with blank lines around its content, inside a section of its type: `<tag id="name" attr="value">` ... `</tag>`. An `id` makes it addressable as `[[file#^name]]`, and a typed edge line inside it starts at the element.',
    );
  ctx.out(`${out.join('\n')}\n`);
  return EXIT_OK;
}

export interface OntologyFinding {
  kind: 'unknown-edge' | 'wrong-source' | 'wrong-target' | 'undeclared-property' | 'value-not-allowed' | 'missing-element' | 'too-many-elements' | 'missing-attribute' | 'attribute-value-not-allowed' | 'unclosed-element' | 'missing-section';
  file: string;
  line: number;
  edge: string;
  message: string;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]!;
}

/** The declared name closest to `name`: same letters ignoring case and separators, else within three edits. */
export function suggestEdgeName(name: string, declared: Iterable<string>): string | null {
  const names = [...declared];
  const same = names.find((n) => squash(n) === squash(name));
  if (same) return same;
  let best: string | null = null;
  let bestD = 4;
  for (const n of names) {
    const dist = distance(squash(name), squash(n));
    if (dist < bestD) [best, bestD] = [n, dist];
  }
  return best;
}

/** Ontology types of a node: its labels without the generic `Section`. */
const typesOf = (n: GraphNode | undefined): string[] => (n ? n.labels.filter((l) => !GENERIC_LABELS.has(l)) : []);

function where(graph: Graph, sourceId: string, line: number): { file: string; line: number } {
  const n = graph.node(sourceId);
  const file = String(n?.props.file ?? n?.props.path ?? sourceId);
  return { file, line };
}

/** Typed edges in docs and code that the ontology does not allow. */
// @tg: implements:: [[openspec:tg-cli#Ontology check]]
export function checkOntology(graph: Graph, set: SchemaSet): OntologyFinding[] {
  if (set.schemas.size + set.edgeTypes.size === 0) return [];
  const declared = declaredEdgeNames(set);
  const out: OntologyFinding[] = [];
  for (const e of graph.edges()) {
    if (STRUCTURAL.has(e.type)) continue;
    const at = where(graph, e.source, e.line);
    const push = (kind: OntologyFinding['kind'], message: string) => out.push({ kind, ...at, edge: e.type, message });
    if (!declared.has(e.type)) {
      const hint = suggestEdgeName(e.type, declared);
      push('unknown-edge', `edge type '${e.type}' is not in the ontology${hint ? `; did you mean '${hint}'?` : ''}`);
      continue;
    }
    const et = set.edgeTypes.get(e.type);
    if (!et) continue;
    const from = typesOf(graph.node(e.source));
    const to = typesOf(graph.node(e.target));
    if (et.from && from.length && !from.some((t) => et.from!.includes(t))) push('wrong-source', `'${e.type}' starts at ${et.from.join(' or ')}, not ${from.join(', ')}`);
    if (et.to && to.length && !to.some((t) => et.to!.includes(t))) push('wrong-target', `'${e.type}' ends at ${et.to.join(' or ')}, not ${to.join(', ')}`);
    const props = new Map(et.properties.map((p) => [p.name, p]));
    for (const [k, v] of Object.entries(e.props)) {
      if (BUILTIN_PROPS.has(k)) continue;
      const p = props.get(k);
      if (!p) {
        push('undeclared-property', `'${e.type}' declares no property '${k}'${props.size ? ` (declared: ${[...props.keys()].join(', ')})` : ''}`);
        continue;
      }
      if (p.values && !(Array.isArray(v) ? v : [v]).every((x) => p.values!.some((a) => String(a) === String(x)))) push('value-not-allowed', `'${e.type}' property '${k}' is ${show(v)}; allowed: ${p.values.map(show).join(', ')}`);
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.message.localeCompare(b.message));
}

// @tg: implements:: [[openspec:tg-cli#Ontology check]]
// @tg: implements:: [[openspec:document-elements#Document shape validation]]
function runCheck(ctx: Ctx, set: SchemaSet, folder: string): number {
  let project: Project;
  try {
    project = new Project(ctx.root);
  } catch (e) {
    if (e instanceof NoLatDir) {
      ctx.err(`${e.message}\n`);
      return EXIT_ERROR;
    }
    throw e;
  }
  const graph = buildLatGraph(project.index(), { code: { mode: 'annotated', files: project.codeSources() }, specs: project.specIndex(), schemas: set }).graph;
  const documents = checkDocuments(project.index(), project.specIndex(), set).map((d): OntologyFinding => ({ kind: d.kind, file: d.file, line: d.line, edge: '', message: d.message }));
  const findings = [...checkOntology(graph, set), ...documents].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.message.localeCompare(b.message));
  if (ctx.json) {
    ctx.out(`${JSON.stringify({ folder, findings }, null, 2)}\n`);
  } else if (set.schemas.size + set.edgeTypes.size === 0) {
    ctx.out(`No ontology declared in ${folder}; nothing to check.\n`);
  } else if (!findings.length) {
    ctx.out(`All typed edges agree with the ontology in ${folder}.\n`);
  } else {
    for (const f of findings) ctx.out(`- ${f.file}:${f.line}: ${f.message}\n`);
    ctx.out(`\n${findings.length} finding${findings.length === 1 ? '' : 's'}. Run tg ontology to see the declared types and edges.\n`);
  }
  return findings.length ? EXIT_FINDINGS : EXIT_OK;
}

export const ontology: Command = {
  name: 'ontology',
  summary: 'List the types and edge types of the project ontology (Types/), or check written typed edges against it',
  usage: USAGE,
  flags: { 'schema-folder': 'string' },
  noProject: true,
  run(ctx, args, flags) {
    const sub = args[0];
    if (sub !== undefined && sub !== 'check') {
      ctx.err(`usage: tg ${USAGE}\n`);
      return EXIT_ERROR;
    }
    const { set, folder } = load(ctx, flags);
    return sub === 'check' ? runCheck(ctx, set, folder) : runList(ctx, set, folder);
  },
};

register(ontology);
