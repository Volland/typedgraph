import { key, scalar as quoted, splitFrontmatter } from '../schema/frontmatter.js';
import { compactElements, compactProperties, compactSections, normalizeFolder, readSchemaNote, type EdgeRule, type PropertySchema } from '../schema/schema.js';
import { titleOf } from '../graph/graph.js';
import type { ImportedEdgeType, ImportedType, ShaclImport } from './import.js';

/** A schema note that already exists in the vault. */
export interface ExistingNote {
  path: string;
  text: string;
  frontmatter: Record<string, unknown> | null;
}

export interface ImportPlanOptions {
  /** Schema folder (default `Types/`). */
  folder?: string;
  /** `auto` groups by `tgs:note`, else one note per type; `single` puts everything in one note. */
  layout?: 'auto' | 'per-type' | 'single';
  /** Note name for the single layout (default `Shapes`). */
  into?: string;
  /** Also update notes that declare types missing from the import. */
  force?: boolean;
}

export interface ImportWrite {
  path: string;
  text: string;
  created: boolean;
  types: string[];
  edgeTypes: string[];
}

export interface ImportPlan {
  writes: ImportWrite[];
  /** Notes left unchanged because they also declare types not in the import. */
  conflicts: { path: string; message: string }[];
  /** Notes whose content would not change. */
  unchanged: string[];
  /** Things the chosen layout cannot keep, such as template bodies in a `schemas:` note. */
  warnings: string[];
}

const SCHEMA_KEYS = ['prefixes', 'schema', 'schemas', 'edgeTypes'] as const;

/**
 * Place imported declarations into schema notes. Existing declarations are
 * updated where they live; a note is only rewritten in its schema keys, and
 * one that declares types missing from the import is left alone unless forced.
 */
// @tg: implements:: [[shacl#Import]] {since: "2026-10-06"}
// @lat: [[shacl#Import]]
// @tg: implements:: [[openspec:shacl-interop#Import SHACL into schema notes]]
// @tg: implements:: [[openspec:shacl-interop#Imports never clobber silently]]
// @tg: implements:: [[openspec:shacl-interop#Layouts that cannot keep a template are reported]]
export function planImport(imp: ShaclImport, existing: ExistingNote[], opts: ImportPlanOptions = {}): ImportPlan {
  const folder = normalizeFolder(opts.folder ?? 'Types/');
  const layout = opts.layout ?? 'auto';
  const into = `${folder}${opts.into ?? 'Shapes'}.md`;
  const declaredType = new Map<string, string>();
  const declaredEdge = new Map<string, string>();
  const declaredIn = new Map<string, { types: string[]; edgeTypes: string[] }>();
  for (const n of [...existing].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const r = readSchemaNote(n.path, n.frontmatter);
    for (const t of r.types) if (!declaredType.has(t.type)) declaredType.set(t.type, n.path);
    for (const e of r.edgeTypes) if (!declaredEdge.has(e.type)) declaredEdge.set(e.type, n.path);
    declaredIn.set(n.path, { types: r.types.map((t) => t.type), edgeTypes: r.edgeTypes.map((e) => e.type) });
  }

  const fromNote = (note: string | null) => (note ? `${folder}${note.slice(note.lastIndexOf('/') + 1)}` : null);
  const typePath = new Map<string, string>();
  for (const t of imp.types) {
    typePath.set(t.type, declaredType.get(t.type) ?? (layout === 'single' ? into : (layout === 'auto' && fromNote(t.note)) || `${folder}${t.type}.md`));
  }
  const edgePath = new Map<string, string>();
  for (const e of imp.edgeTypes) {
    const owner = e.from?.map((f) => typePath.get(f) ?? declaredType.get(f)).find(Boolean);
    edgePath.set(e.type, declaredEdge.get(e.type) ?? (layout === 'single' ? into : (layout === 'auto' && fromNote(e.note)) || owner || `${folder}Edge types.md`));
  }

  const groups = new Map<string, { types: ImportedType[]; edgeTypes: ImportedEdgeType[] }>();
  const group = (p: string) => groups.get(p) ?? (groups.set(p, { types: [], edgeTypes: [] }), groups.get(p)!);
  for (const t of imp.types) group(typePath.get(t.type)!).types.push(t);
  for (const e of imp.edgeTypes) group(edgePath.get(e.type)!).edgeTypes.push(e);
  const paths = [...groups.keys()].sort();
  // Each prefix goes to the first note that uses it, else to the first note.
  const prefixesFor = new Map<string, Record<string, string>>();
  for (const [p, iri] of Object.entries(imp.prefixes)) {
    const uses = (uri: string | null) => !!uri && uri.startsWith(`${p}:`);
    const user = paths.find((path) => {
      const g = groups.get(path)!;
      return [...g.types, ...g.edgeTypes].some((d) => uses(d.uri) || d.properties.some((q) => uses(q.uri)));
    });
    const target = user ?? paths[0]!;
    prefixesFor.set(target, { ...prefixesFor.get(target), [p]: iri });
  }

  const plan: ImportPlan = { writes: [], conflicts: [], unchanged: [], warnings: [] };
  const byPath = new Map(existing.map((n) => [n.path, n]));
  for (const path of paths) {
    const g = groups.get(path)!;
    const old = byPath.get(path);
    const names = { types: g.types.map((t) => t.type), edgeTypes: g.edgeTypes.map((e) => e.type) };
    if (old) {
      const d = declaredIn.get(path)!;
      const others = [...d.types.filter((t) => !names.types.includes(t)), ...d.edgeTypes.filter((e) => !names.edgeTypes.includes(e))];
      if (others.length && !opts.force) {
        plan.conflicts.push({ path, message: `${path} also declares ${others.join(', ')}, which the import does not contain; left unchanged (use --force to update it anyway)` });
        continue;
      }
    }
    const title = titleOf(path);
    // Only a new note named after its type receives the body; an existing note keeps its own.
    const oldBody = old ? splitFrontmatter(old.text).body.trim() : null;
    for (const t of g.types) {
      const body = t.templateBody?.trim();
      if (!body || (t.type === title && (oldBody === null || oldBody === body))) continue;
      const why = t.type !== title ? `${path} declares several types and its body is documentation` : `${path} already exists and its body is left unchanged`;
      plan.warnings.push(`${t.type}: template body not kept, because ${why} (import with --layout per-type to keep it${old ? ', after moving the existing note aside' : ''})`);
    }
    const fm = old?.frontmatter ?? {};
    const decl: Record<string, unknown> = {};
    for (const k of SCHEMA_KEYS) if (fm[k] !== undefined) decl[k] = clone(fm[k]);
    const own = prefixesFor.get(path);
    if (own) decl.prefixes = { ...(isRecord(decl.prefixes) ? decl.prefixes : {}), ...own };
    const schemas = isRecord(decl.schemas) ? decl.schemas : {};
    for (const t of g.types) {
      if (t.type === title && !(t.type in schemas)) decl.schema = compactType(t);
      else schemas[t.type] = compactType(t);
    }
    if (Object.keys(schemas).length) decl.schemas = schemas;
    if (g.edgeTypes.length) {
      const edgeTypes = isRecord(decl.edgeTypes) ? decl.edgeTypes : {};
      for (const e of g.edgeTypes) edgeTypes[e.type] = compactEdgeType(e);
      decl.edgeTypes = edgeTypes;
    }
    const yaml = emitYaml(Object.fromEntries(SCHEMA_KEYS.filter((k) => decl[k] !== undefined).map((k) => [k, decl[k]])));
    let text: string;
    if (old) text = replaceSchemaKeys(old.text, yaml);
    else {
      const body = g.types.find((t) => t.type === title)?.templateBody?.trim();
      text = `---\n${yaml}\n---\n${body ? `\n${body}\n` : ''}`;
    }
    if (old && old.text === text) plan.unchanged.push(path);
    else plan.writes.push({ path, text, created: !old, ...names });
  }
  return plan;
}

/** A type as TGS YAML, using shorthands wherever they are lossless. */
export function compactType(t: Omit<ImportedType, 'note' | 'templateBody'>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (t.uri) o.uri = t.uri;
  if (t.description) o.description = t.description;
  if (t.properties.length) o.properties = compactProps(t.properties);
  if (t.edges) o.edges = compactEdges(t.edges);
  if (t.sections?.length) o.sections = compactSections(t.sections);
  if (t.elements?.length) o.elements = compactElements(t.elements);
  if (t.template) o.template = t.template;
  if (t.style) o.visualization = t.style;
  return o;
}

/** An edge type as TGS YAML. */
export function compactEdgeType(e: Omit<ImportedEdgeType, 'note'>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (e.uri) o.uri = e.uri;
  if (e.description) o.description = e.description;
  if (e.from) o.from = e.from.length === 1 ? e.from[0] : e.from;
  if (e.to) o.to = e.to.length === 1 ? e.to[0] : e.to;
  if (e.properties.length) o.properties = compactProps(e.properties);
  if (e.style) o.visualization = e.style;
  return o;
}

function compactProps(props: PropertySchema[]): Record<string, unknown> {
  return compactProperties(props);
}

function compactEdges(rules: EdgeRule[]): unknown {
  const plain = (r: EdgeRule) => r.many && !r.required && !r.description;
  if (rules.every((r) => plain(r) && !r.targets)) return rules.map((r) => r.type);
  const out: Record<string, unknown> = {};
  for (const r of rules) {
    const target = r.targets ? (r.targets.length === 1 ? r.targets[0] : r.targets) : undefined;
    if (plain(r)) out[r.type] = target ?? null;
    else {
      const o: Record<string, unknown> = {};
      if (target !== undefined) o.target = target;
      if (!r.many) o.many = false;
      if (r.required) o.required = true;
      if (r.description) o.description = r.description;
      out[r.type] = o;
    }
  }
  return out;
}

/**
 * Emit YAML for schema declarations: nested mappings as blocks, and leaf
 * mappings and lists of scalars in flow style when short, as people write them.
 */
export function emitYaml(data: Record<string, unknown>, depth = 0): string {
  const pad = '  '.repeat(depth);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const flow = flowOf(v);
    if (flow !== null && (flow.length <= 72 || !isRecord(v) || !Object.keys(v).length)) lines.push(`${pad}${key(k)}: ${flow}`);
    else if (isRecord(v)) lines.push(`${pad}${key(k)}:`, emitYaml(v, depth + 1));
    else if (Array.isArray(v)) lines.push(`${pad}${key(k)}:`, ...v.map((x) => `${pad}  - ${flowOf(x) ?? JSON.stringify(x)}`));
    else lines.push(`${pad}${key(k)}: ${scalar(v)}`);
  }
  return lines.join('\n');
}

/** Flow-style text for a scalar, a list of scalars, or a mapping of those; null when nested deeper. */
function flowOf(v: unknown): string | null {
  if (v === null || typeof v !== 'object') return scalar(v);
  if (Array.isArray(v)) return v.every((x) => x === null || typeof x !== 'object') ? `[${v.map(flowScalar).join(', ')}]` : null;
  const parts: string[] = [];
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (x === undefined) continue;
    if (x !== null && typeof x === 'object' && !(Array.isArray(x) && x.every((y) => y === null || typeof y !== 'object'))) return null;
    parts.push(`${key(k)}: ${Array.isArray(x) ? `[${x.map(flowScalar).join(', ')}]` : flowScalar(x)}`);
  }
  return `{${parts.join(', ')}}`;
}

/** Scalars in flow context also need quoting for flow indicators. */
function flowScalar(v: unknown): string {
  const s = scalar(v);
  return typeof v === 'string' && !s.startsWith('"') && /[,[\]{}]/.test(s) ? JSON.stringify(v) : s;
}

/**
 * Replace the schema keys (`schema`, `schemas`, `edgeTypes`, `prefixes`) in a
 * note's frontmatter, keeping every other line and the body byte-for-byte.
 */
export function replaceSchemaKeys(text: string, yaml: string): string {
  if (splitFrontmatter(text).yaml === null) return `---\n${yaml}\n---\n${text.startsWith('\n') ? '' : '\n'}${text}`;
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const close = lines.findIndex((l, i) => i > 0 && (l.trim() === '---' || l.trim() === '...'));
  const fm = lines.slice(1, close);
  const kept: string[] = [];
  let insertAt = -1;
  let skipping = false;
  for (const line of fm) {
    const top = /^([A-Za-z_][\w-]*)\s*:/.exec(line);
    if (top || (line !== '' && !/^\s/.test(line))) skipping = !!top && (SCHEMA_KEYS as readonly string[]).includes(top[1]!);
    if (skipping) {
      if (insertAt < 0) insertAt = kept.length;
      continue;
    }
    kept.push(line);
  }
  if (insertAt < 0) insertAt = kept.length;
  kept.splice(insertAt, 0, ...yaml.split('\n'));
  return [lines[0], ...kept, ...lines.slice(close)].join(nl);
}

/** Like the frontmatter scalar, but leaves CURIEs and IRIs such as `schema:Person` unquoted. */
function scalar(v: unknown): string {
  if (typeof v === 'string' && /^[A-Za-z][\w.-]*:[\w./#%?=&~+-]+$/.test(v) && !/:\s/.test(v)) return v;
  return quoted(v);
}

function clone<T>(v: T): T {
  return v === null || typeof v !== 'object' ? v : (JSON.parse(JSON.stringify(v)) as T);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
