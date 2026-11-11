import { markdownTarget, type Diagnostic } from '../edges/parse.js';
import { titleOf, type Graph } from '../graph/graph.js';
import { toYaml } from './frontmatter.js';
import { ID_KINDS, type IdKind, type IdRule } from './ids.js';

export type PropertyKind = 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'link' | 'list';
// @tg: implements:: [[openspec:schema-notes#Property declarations]]
export const PROPERTY_KINDS: readonly PropertyKind[] = ['text', 'number', 'boolean', 'date', 'datetime', 'link', 'list'];

export interface PropertySchema {
  name: string;
  kind: PropertyKind;
  default: unknown;
  required: boolean;
  /** The value is a list; always true for kind `list`. */
  many: boolean;
  /** Allowed values (enum); null means any. */
  values: unknown[] | null;
  /** IRI or CURIE as written; null means base IRI plus name. */
  uri: string | null;
  /** What the property means, for people and agents (TGS 0.4). */
  description?: string | null;
}

/** One allowed outgoing edge type of a node type. */
export interface EdgeRule {
  type: string;
  /** Allowed target types; null means any target. */
  targets: string[] | null;
  many: boolean;
  required: boolean;
  description?: string | null;
}

/**
 * A block-level XML element a document of a type may contain (TGS 0.4): what
 * the tag means, its attributes, nested elements, and whether it becomes a
 * graph node.
 */
export interface ElementSchema {
  /** Tag name as declared; matched case-insensitively. */
  tag: string;
  description: string | null;
  /** Labels an element node gets besides `Element`. */
  types: string[];
  /** At least one is required in each document (or parent element). */
  required: boolean;
  /** More than one is allowed. */
  many: boolean;
  /** `true` makes every occurrence a node, `false` only those with an `id`; null means a node when `types` is non-empty or it has an `id`. */
  node: boolean | null;
  /** Attribute declarations, in the form of `properties`. */
  attributes: PropertySchema[];
  /** Elements allowed inside this one. */
  elements: ElementSchema[];
}

/** A heading a document of a type has (TGS 0.4). */
export interface SectionSchema {
  heading: string;
  description: string | null;
  required: boolean;
}

export interface TypeSchema {
  type: string;
  /** Path of the schema note. */
  path: string;
  properties: PropertySchema[];
  /** Allowed outgoing edges; null means unrestricted. */
  edges: EdgeRule[] | null;
  /** Raw `visualization` block (alias `style`), interpreted by the visualization config. */
  style: Record<string, unknown> | null;
  uri: string | null;
  /** Template link as written (`[[...]]`, markdown link or path). */
  template: string | null;
  /** Declared under `schema:` (or implied by the note title), so the note body is the template. */
  bodyIsTemplate: boolean;
  /** Identifiers generated for new notes of this type. */
  ids: IdRule[];
  /** What the type means, for people and agents (TGS 0.4). */
  description?: string | null;
  /** Block-level XML elements a document of this type may contain (TGS 0.4). */
  elements?: ElementSchema[];
  /** Headings a document of this type has (TGS 0.4). */
  sections?: SectionSchema[];
}

export interface EdgeTypeSchema {
  type: string;
  path: string;
  /** Allowed source types; null means any. */
  from: string[] | null;
  /** Allowed target types; null means any. */
  to: string[] | null;
  properties: PropertySchema[];
  uri: string | null;
  style: Record<string, unknown> | null;
  description?: string | null;
}

/** Everything one schema note declares. */
export interface SchemaNote {
  path: string;
  types: TypeSchema[];
  edgeTypes: EdgeTypeSchema[];
  prefixes: Record<string, string>;
  diagnostics: Diagnostic[];
}

export interface SchemaSet {
  schemas: Map<string, TypeSchema>;
  edgeTypes: Map<string, EdgeTypeSchema>;
  /** Built-in prefixes plus those declared in schema notes. */
  prefixes: Record<string, string>;
  diagnostics: Diagnostic[];
}

export const DEFAULT_SCHEMA_FOLDER = 'Types/';
/** The Typed Graph Schema version this reader implements. */
// @tg: implements:: [[openspec:tgs-spec#Versioning]]
// @tg: implements:: [[openspec:tgs-spec#AsciiDoc notes in TGS 0.3]] {confidence: partial}
// @tg: implements:: [[openspec:tgs-spec#TGS 0.6 published]]
export const TGS_VERSION = '0.6';
// @tg: implements:: [[openspec:tgs-spec#Namespace IRI]]
export const TGS_NAMESPACE = 'https://typedgraph.org/ns/tgs#';
/** Namespaces the `tgs:` terms had before TGS 0.6; SHACL import reads them as {@link TGS_NAMESPACE}. */
export const TGS_FORMER_NAMESPACES: readonly string[] = ['https://volland.github.io/obsigraph/ns/tgs#'];
export const DEFAULT_BASE_IRI = 'urn:tgs:';
// @tg: implements:: [[openspec:schema-notes#Identifiers]]
export const BUILTIN_PREFIXES: Readonly<Record<string, string>> = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  sh: 'http://www.w3.org/ns/shacl#',
  schema: 'https://schema.org/',
  foaf: 'http://xmlns.com/foaf/0.1/',
  tgs: TGS_NAMESPACE,
};
const IRI_SCHEMES = new Set(['http', 'https', 'urn', 'mailto', 'tag', 'did', 'file']);

const TYPE_KEYS = new Set(['properties', 'edges', 'visualization', 'style', 'uri', 'template', 'id', 'description', 'elements', 'sections']);
const EDGE_TYPE_KEYS = new Set(['from', 'to', 'properties', 'uri', 'visualization', 'style', 'description']);
const ELEMENT_KEYS = new Set(['description', 'type', 'required', 'many', 'node', 'attributes', 'elements']);

// @tg: implements:: [[openspec:tgs-spec#Host independence]]
export function normalizeFolder(folder: string): string {
  const f = folder.trim().replace(/^\/+/, '');
  return f === '' ? '' : f.endsWith('/') ? f : `${f}/`;
}

/** True when `path` is a markdown note directly inside the schema folder. */
// @tg: implements:: [[openspec:schema-notes#Schema notes are discovered by location]]
export function isSchemaPath(path: string, folder: string): boolean {
  const f = normalizeFolder(folder);
  if (!f || !path.startsWith(f) || !path.endsWith('.md')) return false;
  return !path.slice(f.length).includes('/');
}

/** Report a declaration problem; the code defaults to `invalid-declaration`. */
type Diag = (message: string, code?: string) => void;

/**
 * Read every declaration in a schema note: the type named by the title
 * (`schema:`), types under `schemas:`, edge types under `edgeTypes:` and
 * prefixes. A note with none of these keys declares an empty title type.
 */
// @lat: [[graph-model#Schema notes]]
// @tg: implements:: [[openspec:schema-notes#Schema notes are discovered by location]]
// @tg: implements:: [[openspec:tgs-spec#Versioning]]
export function readSchemaNote(path: string, frontmatter: Record<string, unknown> | null | undefined): SchemaNote {
  const fm = frontmatter ?? {};
  const out: SchemaNote = { path, types: [], edgeTypes: [], prefixes: {}, diagnostics: [] };
  const diag: Diag = (message, code = 'invalid-declaration') => out.diagnostics.push({ path, line: 0, column: 0, message, code });

  let strict = false;
  if (fm.tgs !== undefined) {
    const v = typeof fm.tgs === 'number' && Number.isInteger(fm.tgs) ? `${fm.tgs}.0` : String(fm.tgs);
    const m = /^(\d+)\.(\d+)$/.exec(v);
    if (!m) diag(`\`tgs\` must be a version such as "${TGS_VERSION}"`);
    else if (Number(m[1]) !== 0) {
      diag(`TGS version ${v} is not supported (this reader implements ${TGS_VERSION}); schema ignored`, 'unsupported-version');
      return out;
    } else if (Number(m[2]) > 2) strict = true;
  }

  const has = (k: string) => fm[k] !== undefined;
  if (has('schema') || !(has('schemas') || has('edgeTypes') || has('prefixes'))) {
    const raw = fm.schema;
    if (raw !== undefined && raw !== null && !isRecord(raw)) diag('`schema` must be a mapping');
    out.types.push(readTypeBlock(titleOf(path), path, isRecord(raw) ? raw : {}, true, diag, strict));
  }
  if (has('schemas')) {
    if (!isRecord(fm.schemas)) diag('`schemas` must be a mapping from type name to schema');
    else
      for (const [name, raw] of Object.entries(fm.schemas)) {
        const d: Diag = (m, c) => diag(`Type '${name}': ${m}`, c);
        if (raw !== null && !isRecord(raw)) d('schema must be a mapping');
        out.types.push(readTypeBlock(name, path, isRecord(raw) ? raw : {}, false, d, strict));
      }
  }
  if (has('edgeTypes')) {
    if (!isRecord(fm.edgeTypes)) diag('`edgeTypes` must be a mapping from edge type name to declaration');
    else
      for (const [name, raw] of Object.entries(fm.edgeTypes)) {
        const d: Diag = (m, c) => diag(`Edge type '${name}': ${m}`, c);
        if (raw !== null && !isRecord(raw)) d('declaration must be a mapping');
        out.edgeTypes.push(readEdgeTypeBlock(name, path, isRecord(raw) ? raw : {}, d, strict));
      }
  }
  if (has('prefixes')) {
    if (!isRecord(fm.prefixes)) diag('`prefixes` must be a mapping from prefix to IRI');
    else
      for (const [p, iri] of Object.entries(fm.prefixes)) {
        if (typeof iri === 'string' && iri) out.prefixes[p] = iri;
        else diag(`Prefix '${p}' must map to an IRI`);
      }
  }
  return out;
}

/**
 * Read the schema of the type named by a note's title. Kept for callers
 * that only care about the single-type form; see {@link readSchemaNote}.
 */
export function readSchema(path: string, frontmatter: Record<string, unknown> | null | undefined): { schema: TypeSchema; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const raw = frontmatter?.schema;
  const diag: Diag = (message, code = 'invalid-declaration') => diagnostics.push({ path, line: 0, column: 0, message, code });
  if (raw !== undefined && raw !== null && !isRecord(raw)) diag('`schema` must be a mapping');
  const schema = readTypeBlock(titleOf(path), path, isRecord(raw) ? raw : {}, true, diag, false);
  return { schema, diagnostics };
}

// @tg: implements:: [[openspec:document-elements#Descriptions]]
function readTypeBlock(type: string, path: string, decl: Record<string, unknown>, bodyIsTemplate: boolean, diag: Diag, strict: boolean): TypeSchema {
  if (strict) for (const k of Object.keys(decl)) if (!TYPE_KEYS.has(k)) diag(`Unknown key '${k}' (newer TGS version?)`, 'unknown-key');
  // `visualization` is the documented key; `style` is accepted as an alias.
  const vis = decl.visualization ?? decl.style;
  if (vis !== undefined && !isRecord(vis)) diag('`visualization` must be a mapping');
  const properties = readProperties(decl.properties, diag);
  const ids = readIds(decl.id, diag);
  const elements = readElements(decl.elements, diag, strict);
  const sections = readSections(decl.sections, diag);
  // An id property that is not declared is a plain text property.
  for (const r of ids) if (!properties.some((p) => p.name === r.property)) properties.push({ name: r.property, kind: 'text', default: null, required: false, many: false, values: null, uri: null });
  return {
    type,
    path,
    properties,
    ids,
    edges: readEdges(decl.edges, diag),
    style: isRecord(vis) ? vis : null,
    uri: readString(decl.uri, '`uri`', diag),
    template: readString(decl.template, '`template`', diag),
    bodyIsTemplate,
    ...described(readString(decl.description, '`description`', diag)),
    ...(elements.length ? { elements } : {}),
    ...(sections.length ? { sections } : {}),
  };
}

/** `{description}` when there is one, else nothing, so undescribed declarations read exactly as before TGS 0.4. */
function described(description: string | null): { description?: string } {
  return description ? { description } : {};
}

/**
 * Read `elements`: a mapping from tag name to declaration, or a list of tag
 * names. A declaration may be null (a tag with no rules) or a description string.
 */
// @tg: implements:: [[openspec:document-elements#Element declarations]]
function readElements(raw: unknown, diag: Diag, strict: boolean): ElementSchema[] {
  if (raw === undefined || raw === null) return [];
  const out: ElementSchema[] = [];
  const entries: [string, unknown][] = Array.isArray(raw)
    ? raw.flatMap((x): [string, unknown][] => (typeof x === 'string' ? [[x, null]] : (diag('Each entry in a list of `elements` must be a tag name'), [])))
    : isRecord(raw)
      ? Object.entries(raw)
      : (diag('`elements` must be a mapping from tag name to declaration'), []);
  for (const [tag, v] of entries) {
    const d: Diag = (m, c) => diag(`Element '${tag}': ${m}`, c);
    if (!/^[A-Za-z][\w.-]*$/.test(tag)) {
      d('is not a valid tag name; ignored');
      continue;
    }
    if (out.some((e) => e.tag.toLowerCase() === tag.toLowerCase())) {
      d('is declared twice; the first wins');
      continue;
    }
    const decl: Record<string, unknown> = typeof v === 'string' ? { description: v } : isRecord(v) ? v : {};
    if (v !== null && v !== undefined && typeof v !== 'string' && !isRecord(v)) d('declaration must be a mapping or a description');
    if (strict) for (const k of Object.keys(decl)) if (!ELEMENT_KEYS.has(k)) d(`Unknown key '${k}' (newer TGS version?)`, 'unknown-key');
    if (decl.node !== undefined && typeof decl.node !== 'boolean') d('`node` must be true or false');
    out.push({
      tag,
      description: readString(decl.description, '`description`', d),
      types: readNames(decl.type, '`type`', d) ?? [],
      required: decl.required === true,
      many: decl.many !== false,
      node: typeof decl.node === 'boolean' ? decl.node : null,
      attributes: readProperties(decl.attributes, d),
      elements: readElements(decl.elements, d, strict),
    });
  }
  return out;
}

/** Read an `elements` value (as written in YAML, or from a `tgs:elements` annotation) into declarations. */
export function readElementDeclarations(raw: unknown, report: (message: string) => void = () => {}): ElementSchema[] {
  return readElements(raw, (m) => report(m), false);
}

/** Read a `sections` value into declarations. */
export function readSectionDeclarations(raw: unknown, report: (message: string) => void = () => {}): SectionSchema[] {
  return readSections(raw, (m) => report(m));
}

/** Element declarations as TGS YAML, using shorthands where they are lossless: a description string, or null for a bare tag. */
export function compactElements(list: ElementSchema[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const e of list) {
    const o: Record<string, unknown> = {};
    if (e.description) o.description = e.description;
    if (e.types.length) o.type = e.types.length === 1 ? e.types[0] : e.types;
    if (e.required) o.required = true;
    if (!e.many) o.many = false;
    if (e.node !== null) o.node = e.node;
    if (e.attributes.length) o.attributes = compactProperties(e.attributes);
    if (e.elements.length) o.elements = compactElements(e.elements);
    const keys = Object.keys(o);
    out[e.tag] = keys.length === 0 ? null : keys.length === 1 && keys[0] === 'description' ? o.description : o;
  }
  return out;
}

/** Section declarations as TGS YAML. */
export function compactSections(list: SectionSchema[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const h of list) out[h.heading] = h.required ? { ...(h.description ? { description: h.description } : {}), required: true } : (h.description ?? null);
  return out;
}

/** Property declarations as TGS YAML: a kind shorthand where nothing else is set. */
export function compactProperties(props: PropertySchema[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of props) {
    const o: Record<string, unknown> = {};
    if (p.kind !== 'text') o.kind = p.kind;
    if (p.default !== null && p.default !== undefined) o.default = p.default;
    if (p.required) o.required = true;
    if (p.many && p.kind !== 'list') o.many = true;
    if (p.values) o.values = p.values;
    if (p.uri) o.uri = p.uri;
    if (p.description) o.description = p.description;
    const keys = Object.keys(o);
    out[p.name] = keys.length === 0 ? 'text' : keys.length === 1 && keys[0] === 'kind' ? o.kind : o;
  }
  return out;
}

/** Read `sections`: a mapping from heading to declaration (or description), or a list of headings. */
// @tg: implements:: [[openspec:document-elements#Section declarations]]
function readSections(raw: unknown, diag: Diag): SectionSchema[] {
  if (raw === undefined || raw === null) return [];
  const entries: [string, unknown][] = Array.isArray(raw)
    ? raw.flatMap((x): [string, unknown][] => (typeof x === 'string' ? [[x, null]] : (diag('Each entry in a list of `sections` must be a heading'), [])))
    : isRecord(raw)
      ? Object.entries(raw)
      : (diag('`sections` must be a mapping from heading to declaration'), []);
  const out: SectionSchema[] = [];
  for (const [heading, v] of entries) {
    const d: Diag = (m, c) => diag(`Section '${heading}': ${m}`, c);
    const decl: Record<string, unknown> = typeof v === 'string' ? { description: v } : isRecord(v) ? v : {};
    if (out.some((s) => s.heading.toLowerCase() === heading.toLowerCase())) continue;
    out.push({ heading, description: readString(decl.description, '`description`', d), required: decl.required === true });
  }
  return out;
}

/** Read the `id` key: a kind, a mapping, or a list of mappings that each name their property. */
// @tg: implements:: [[openspec:typed-note-creation#Id rules]]
function readIds(raw: unknown, diag: Diag): IdRule[] {
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const rules: IdRule[] = [];
  for (const item of list) {
    const spec: Record<string, unknown> = isRecord(item) ? item : { kind: item };
    const kind = typeof spec.kind === 'string' ? (spec.kind.toLowerCase() as IdKind) : null;
    if (!kind || !ID_KINDS.includes(kind)) {
      diag(`\`id\` kind '${String(spec.kind)}' is not one of: ${ID_KINDS.join(', ')}; ignored`);
      continue;
    }
    for (const k of Object.keys(spec)) if (!['kind', 'property', 'auto', 'filename'].includes(k)) diag(`Unknown key '${k}' in \`id\``);
    if (Array.isArray(raw) && typeof spec.property !== 'string') {
      diag('Each `id` in a list must name its `property`; ignored');
      continue;
    }
    const property = typeof spec.property === 'string' && spec.property.trim() ? spec.property.trim() : 'id';
    if (rules.some((r) => r.property === property)) {
      diag(`\`id\` property '${property}' is declared twice; the first wins`);
      continue;
    }
    rules.push({ kind, property, auto: typeof spec.auto === 'boolean' ? spec.auto : kind !== 'luhmann', filename: spec.filename === true });
  }
  return rules;
}

// @tg: implements:: [[openspec:schema-notes#Edge type declarations]]
function readEdgeTypeBlock(type: string, path: string, decl: Record<string, unknown>, diag: Diag, strict: boolean): EdgeTypeSchema {
  if (strict) for (const k of Object.keys(decl)) if (!EDGE_TYPE_KEYS.has(k)) diag(`Unknown key '${k}' (newer TGS version?)`, 'unknown-key');
  const vis = decl.visualization ?? decl.style;
  if (vis !== undefined && !isRecord(vis)) diag('`visualization` must be a mapping');
  return {
    type,
    path,
    from: readNames(decl.from, '`from`', diag),
    to: readNames(decl.to, '`to`', diag),
    properties: readProperties(decl.properties, diag),
    uri: readString(decl.uri, '`uri`', diag),
    style: isRecord(vis) ? vis : null,
    ...described(readString(decl.description, '`description`', diag)),
  };
}

// @tg: implements:: [[openspec:schema-notes#Property declarations]]
function readProperties(props: unknown, diag: Diag): PropertySchema[] {
  const properties: PropertySchema[] = [];
  const add = (name: string, spec: unknown) => {
    const s = isRecord(spec) ? spec : { kind: spec ?? undefined };
    let kind = typeof s.kind === 'string' ? (s.kind.toLowerCase() as PropertyKind) : s.kind === undefined ? 'text' : (String(s.kind) as PropertyKind);
    if (!PROPERTY_KINDS.includes(kind)) {
      diag(`Property '${name}' has unknown kind '${String(s.kind)}'; treated as text`, 'unknown-kind');
      kind = 'text';
    }
    if (properties.some((p) => p.name === name)) return;
    let values: unknown[] | null = null;
    if (Array.isArray(s.values)) values = s.values;
    else if (s.values !== undefined) diag(`Property '${name}': \`values\` must be a list`);
    properties.push({
      name,
      kind,
      default: s.default ?? null,
      required: s.required === true,
      many: kind === 'list' || s.many === true,
      values,
      uri: readString(s.uri, `Property '${name}': \`uri\``, diag),
      ...described(readString(s.description, `Property '${name}': \`description\``, diag)),
    });
  };
  if (Array.isArray(props)) {
    for (const p of props) {
      if (typeof p === 'string') add(p, 'text');
      else if (isRecord(p) && typeof p.name === 'string') add(p.name, p);
      else diag('Each entry in `properties` needs a `name`');
    }
  } else if (isRecord(props)) {
    for (const [name, spec] of Object.entries(props)) add(name, spec);
  } else if (props !== undefined && props !== null) {
    diag('`properties` must be a mapping or a list');
  }
  return properties;
}

// @tg: implements:: [[openspec:schema-notes#Allowed edge types]]
function readEdges(raw: unknown, diag: Diag): EdgeRule[] | null {
  if (raw === undefined || raw === null) return null;
  if (Array.isArray(raw)) return raw.map((t) => ({ type: String(t), targets: null, many: true, required: false }));
  if (!isRecord(raw)) {
    diag('`edges` must be a list or a mapping of edge types');
    return null;
  }
  return Object.entries(raw).map(([type, v]) => {
    const d: Diag = (m, c) => diag(`Edge '${type}': ${m}`, c);
    if (isRecord(v)) return { type, targets: readNames(v.target, '`target`', d), many: v.many !== false, required: v.required === true, ...described(readString(v.description, '`description`', d)) };
    return { type, targets: readNames(v, 'target', d), many: true, required: false };
  });
}

// @tg: implements:: [[openspec:schema-notes#Edge type declarations]]
function readNames(raw: unknown, what: string, diag: Diag): string[] | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) return raw;
  diag(`${what} must be a type name or a list of type names`);
  return null;
}

function readString(raw: unknown, what: string, diag: Diag): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  diag(`${what} must be a non-empty string`);
  return null;
}

/**
 * Expand an IRI or CURIE. A known prefix wins over an IRI scheme of the same
 * name; `scheme://` and well-known schemes such as `urn:` are kept as written.
 */
// @tg: implements:: [[openspec:schema-notes#Identifiers]]
export function expandIri(value: string, prefixes: Record<string, string>): { iri: string } | { error: string } {
  const m = /^([A-Za-z][\w.-]*):(.*)$/s.exec(value);
  if (!m) return { error: `'${value}' is not an IRI or CURIE` };
  const [, prefix, local] = m as unknown as [string, string, string];
  if (local.startsWith('//')) return { iri: value };
  if (Object.hasOwn(prefixes, prefix)) return { iri: prefixes[prefix] + local };
  if (IRI_SCHEMES.has(prefix.toLowerCase())) return { iri: value };
  return { error: `unknown prefix '${prefix}'` };
}

/** IRI of a declaration: its `uri` expanded, or the base IRI plus its encoded name. */
export function iriOf(decl: { uri: string | null }, name: string, base: string, prefixes: Record<string, string>): string {
  if (decl.uri) {
    const r = expandIri(decl.uri, prefixes);
    if ('iri' in r) return r.iri;
  }
  return base + encodeURIComponent(name);
}

/** Collect schemas from every note in the schema folder; the first declaration by path wins. */
export function schemasFromGraph(graph: Graph, folder: string): SchemaSet {
  const notes: SchemaNote[] = [];
  for (const n of graph.nodes()) {
    if (n.stub || !isSchemaPath(n.id, folder)) continue;
    notes.push(readSchemaNote(n.id, n.props));
  }
  return schemaSetFromNotes(notes);
}

/** Merge schema notes into one set, reporting duplicates and bad identifiers. */
// @tg: implements:: [[openspec:schema-notes#Duplicate type declarations]]
export function schemaSetFromNotes(notes: SchemaNote[]): SchemaSet {
  const set: SchemaSet = { schemas: new Map(), edgeTypes: new Map(), prefixes: { ...BUILTIN_PREFIXES }, diagnostics: [] };
  const userPrefix = new Map<string, string>();
  const dup = (what: string, name: string, first: string, path: string) =>
    set.diagnostics.push({ path, line: 0, column: 0, message: `${what} '${name}' is declared in both ${first} and ${path}; using ${first}`, code: 'duplicate-declaration' });
  for (const note of [...notes].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    set.diagnostics.push(...note.diagnostics);
    for (const t of note.types) {
      const prev = set.schemas.get(t.type);
      if (prev) dup('Type', t.type, prev.path, note.path);
      else set.schemas.set(t.type, t);
    }
    for (const e of note.edgeTypes) {
      const prev = set.edgeTypes.get(e.type);
      if (prev) dup('Edge type', e.type, prev.path, note.path);
      else set.edgeTypes.set(e.type, e);
    }
    for (const [p, iri] of Object.entries(note.prefixes)) {
      const first = userPrefix.get(p);
      if (first !== undefined) {
        if (set.prefixes[p] !== iri) dup('Prefix', p, first, note.path);
        continue;
      }
      userPrefix.set(p, note.path);
      set.prefixes[p] = iri;
    }
  }
  const check = (uri: string | null, subject: string, path: string) => {
    if (!uri) return;
    const r = expandIri(uri, set.prefixes);
    if ('error' in r) set.diagnostics.push({ path, line: 0, column: 0, message: `${subject} has uri '${uri}': ${r.error}`, code: r.error.startsWith('unknown prefix') ? 'unknown-prefix' : 'invalid-declaration' });
  };
  for (const t of set.schemas.values()) {
    check(t.uri, `Type '${t.type}'`, t.path);
    for (const p of t.properties) check(p.uri, `Property '${p.name}' of type '${t.type}'`, t.path);
  }
  for (const e of set.edgeTypes.values()) {
    check(e.uri, `Edge type '${e.type}'`, e.path);
    for (const p of e.properties) check(p.uri, `Property '${p.name}' of edge type '${e.type}'`, e.path);
  }
  return set;
}

/** Names of the allowed edge types, or null when unrestricted. */
export function edgeNames(schema: { edges: EdgeRule[] | null }): string[] | null {
  return schema.edges ? schema.edges.map((r) => r.type) : null;
}

/**
 * Merge the schemas of a multi-label node in label order: the first
 * declaration of a property wins; allowed edges are the union of the rules
 * declared (targets unioned, any target if one rule allows any), or
 * unrestricted when no schema declares edges.
 */
export function mergeSchemas(labels: string[], schemas: Map<string, TypeSchema>): TypeSchema | null {
  const found = labels.map((l) => schemas.get(l)).filter((s): s is TypeSchema => !!s);
  if (found.length === 0) return null;
  const properties: PropertySchema[] = [];
  for (const s of found) for (const p of s.properties) if (!properties.some((q) => q.name === p.name)) properties.push(p);
  let edges: EdgeRule[] | null = null;
  for (const s of found) {
    if (!s.edges) continue;
    edges ??= [];
    for (const r of s.edges) {
      const prev = edges.find((e) => e.type === r.type);
      if (!prev) edges.push({ ...r, targets: r.targets && [...r.targets] });
      else {
        prev.targets = prev.targets && r.targets ? [...new Set([...prev.targets, ...r.targets])] : null;
        prev.many ||= r.many;
        prev.required ||= r.required;
      }
    }
  }
  const elements: ElementSchema[] = [];
  const sections: SectionSchema[] = [];
  for (const s of found) {
    for (const e of s.elements ?? []) if (!elements.some((x) => x.tag.toLowerCase() === e.tag.toLowerCase())) elements.push(e);
    for (const h of s.sections ?? []) if (!sections.some((x) => x.heading.toLowerCase() === h.heading.toLowerCase())) sections.push(h);
  }
  const first = found[0]!;
  return { ...first, type: found.map((s) => s.type).join('+'), properties, edges, ...(elements.length ? { elements } : {}), ...(sections.length ? { sections } : {}) };
}

const present = (v: unknown) => v !== undefined && v !== null && v !== '';
const inValues = (values: unknown[], x: unknown) => values.some((a) => a === x || String(a) === String(x));
const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

/**
 * Advisory validation: required and enum properties, list values, allowed,
 * required and single edges, edge endpoints and edge properties. Never
 * removes anything from the graph.
 */
// @lat: [[graph-model#Schema notes]]
// @tg: implements:: [[openspec:schema-notes#Allowed edge types]]
// @tg: implements:: [[openspec:schema-notes#Edge endpoint validation]]
// @tg: implements:: [[openspec:schema-notes#Edge property validation]]
// @tg: implements:: [[openspec:schema-notes#Required property validation]]
// @tg: implements:: [[openspec:schema-notes#Value and cardinality validation]]
export function validateSchemas(graph: Graph, set: SchemaSet): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (set.schemas.size === 0 && set.edgeTypes.size === 0) return out;
  const at = (path: string, line: number, code: string, message: string) => out.push({ path, line, column: 0, message, code });
  for (const n of graph.nodes()) {
    if (n.stub) continue;
    const labels = n.labels.join(', ');
    const schema = mergeSchemas(n.labels, set.schemas);
    const outEdges = graph.outEdges(n.id);
    if (schema) {
      for (const p of schema.properties) {
        const v = n.props[p.name];
        if (!present(v)) {
          if (p.required) at(n.id, 0, 'missing-property', `Missing required property '${p.name}' for type ${labels}`);
          continue;
        }
        if (!p.many && Array.isArray(v)) at(n.id, 0, 'unexpected-list', `Property '${p.name}' holds a list but is not declared many for type ${labels}`);
        if (p.values) for (const x of Array.isArray(v) ? v : [v]) if (!inValues(p.values, x)) at(n.id, 0, 'value-not-allowed', `Property '${p.name}' value '${show(x)}' is not one of: ${p.values.map(show).join(', ')}`);
      }
      if (schema.edges) {
        const names = schema.edges.map((r) => r.type);
        for (const e of outEdges) {
          if (!names.includes(e.type)) at(e.file ?? n.id, e.line, 'edge-not-allowed', `Edge type '${e.type}' is not allowed for ${labels} (allowed: ${names.join(', ') || 'none'})`);
        }
        for (const r of schema.edges) {
          const own = outEdges.filter((e) => e.type === r.type);
          if (r.required && own.length === 0) at(n.id, 0, 'missing-edge', `Missing required edge '${r.type}' for type ${labels}`);
          if (!r.many && own.length > 1) at(own[1]!.file ?? n.id, own[1]!.line, 'too-many-edges', `Edge type '${r.type}' allows one edge for ${labels}, found ${own.length}`);
        }
      }
    }
    for (const e of outEdges) {
      const et = set.edgeTypes.get(e.type);
      const targets = schema?.edges?.find((r) => r.type === e.type)?.targets ?? et?.to ?? null;
      if (targets) {
        const t = graph.node(e.target);
        if (t && !t.stub && t.labels.length && !t.labels.some((l) => targets.includes(l))) {
          at(e.file ?? n.id, e.line, 'wrong-target-type', `Edge '${e.type}' expects target type ${targets.join(' or ')}, found ${t.labels.join(', ')}`);
        }
      }
      if (!et) continue;
      if (et.from && n.labels.length && !n.labels.some((l) => et.from!.includes(l))) {
        at(e.file ?? n.id, e.line, 'wrong-source-type', `Edge '${e.type}' expects source type ${et.from.join(' or ')}, found ${labels}`);
      }
      for (const p of et.properties) {
        const v = e.props[p.name];
        if (!present(v)) {
          if (p.required) at(e.file ?? n.id, e.line, 'missing-edge-property', `Missing required property '${p.name}' on edge '${e.type}'`);
          continue;
        }
        if (p.values) for (const x of Array.isArray(v) ? v : [v]) if (!inValues(p.values, x)) at(e.file ?? n.id, e.line, 'edge-value-not-allowed', `Edge property '${p.name}' value '${show(x)}' is not one of: ${p.values.map(show).join(', ')}`);
      }
    }
  }
  return out;
}

/**
 * Resolve a `template` link to a vault path: a wikilink through `resolve`, a
 * markdown link relative to the schema note, otherwise a vault-relative path.
 */
// @tg: implements:: [[openspec:tgs-spec#Host independence]]
export function templatePath(link: string, fromPath: string, resolve: (link: string, from: string) => string | null): string | null {
  const s = link.trim();
  const wiki = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/.exec(s);
  if (wiki) return resolve(wiki[1]!.trim(), fromPath);
  const md = /^\[[^\]]*\]\(([^)]+)\)$/.exec(s);
  if (md) return markdownTarget(md[1]!, fromPath)?.target ?? null;
  const p = s.replace(/^\/+/, '');
  if (!p) return null;
  return /\.[^/]+$/.test(p) ? p : `${p}.md`;
}

/** Template body generated from a schema: a notes heading and one placeholder line per declared edge. */
export function generateTemplateBody(schema: TypeSchema): string {
  const lines = ['## Notes', ''];
  if (schema.edges?.length) lines.push('## Relations', '', ...schema.edges.map((r) => `- ${r.type}::`), '');
  return lines.join('\n');
}

/**
 * Pick the template body for a new note: the linked template note, else the
 * body of a `schema:` note, else one generated from the schema.
 */
export function chooseTemplate(schema: TypeSchema, sources: { linkedBody: string | null; schemaBody: string }): { body: string; generated: boolean } {
  if (sources.linkedBody !== null) return { body: sources.linkedBody, generated: false };
  if (schema.bodyIsTemplate && sources.schemaBody.trim()) return { body: sources.schemaBody, generated: false };
  return { body: generateTemplateBody(schema), generated: true };
}

/** The properties a new note of a type starts with: `type`, generated ids, defaults and, with `placeholders`, an empty key for each declared property. */
export function newNoteProperties(schema: TypeSchema, opts: { placeholders?: boolean; ids?: Record<string, string> } = {}): Record<string, unknown> {
  const fm: Record<string, unknown> = { type: schema.type, ...opts.ids };
  for (const p of schema.properties) {
    if (p.name in fm) continue;
    if (p.default !== null && p.default !== undefined) fm[p.name] = p.default;
    else if (opts.placeholders) fm[p.name] = p.many ? [] : null;
  }
  return fm;
}

/**
 * Content for a new note created from a type: `type`, defaults, then the
 * template body. With `placeholders`, every declared property gets a key.
 */
// @lat: [[graph-model#Schema notes]]
export function renderNoteFromType(schema: TypeSchema, templateBody: string, opts: { placeholders?: boolean; ids?: Record<string, string> } = {}): string {
  const fm = newNoteProperties(schema, opts);
  const body = templateBody.trim();
  return `---\n${toYaml(fm, { emptyNull: true })}\n---\n${body ? `\n${body}\n` : ''}`;
}

/** Scaffold for a new schema note. */
// @tg: implements:: [[openspec:tgs-spec#Machine-readable schema]]
export function scaffoldSchemaNote(): string {
  return [
    '---',
    'schema:',
    '  properties:',
    '    status: {kind: text, default: active}',
    '  # edges: {knows: Person, worksAt: Company}',
    '---',
    '',
    '## Notes',
    '',
  ].join('\n');
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
