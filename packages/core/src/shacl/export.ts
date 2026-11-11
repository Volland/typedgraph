import { compactElements, compactSections, DEFAULT_BASE_IRI, iriOf, TGS_VERSION, type EdgeRule, type PropertySchema, type SchemaSet } from '../schema/schema.js';
import { KIND_DATATYPE, RDF, SH, TGS, XSD } from './vocab.js';

export interface ShaclExportOptions {
  /** Base IRI for declarations without a `uri` (default `urn:tgs:`). */
  base?: string;
  /** Body of a schema note, exported as the template of its `schema:` type. */
  body?: (path: string) => string | null;
}

/** An object in a Turtle statement: a ready term, or a nested blank node. */
type Obj = string | Entry[];
type Entry = [predicate: string, object: Obj];

/**
 * Export a schema set as one SHACL document in Turtle. Output is
 * deterministic: shapes are ordered by name, property shapes by `sh:order`.
 */
// @tg: implements:: [[shacl#Export]] {since: "2026-10-06"}
// @lat: [[shacl#Export]]
// @tg: implements:: [[openspec:shacl-interop#Edge mapping]]
// @tg: implements:: [[openspec:shacl-interop#Edge type shapes]]
// @tg: implements:: [[openspec:shacl-interop#Export schemas as SHACL]]
// @tg: implements:: [[openspec:shacl-interop#Lossless round trip]]
// @tg: implements:: [[openspec:shacl-interop#Node type mapping]]
// @tg: implements:: [[openspec:shacl-interop#Typed Graph annotations]]
// @tg: implements:: [[openspec:document-elements#SHACL exchange of descriptions and elements]]
export function exportShacl(set: SchemaSet, opts: ShaclExportOptions = {}): string {
  const base = opts.base ?? DEFAULT_BASE_IRI;
  const prefixes = set.prefixes;
  const term = (iri: string) => compact(iri, base, prefixes);
  const typeIri = (name: string) => term(iriOf(set.schemas.get(name) ?? { uri: null }, name, base, prefixes));
  const edgeIri = (name: string) => term(iriOf(set.edgeTypes.get(name) ?? { uri: null }, name, base, prefixes));
  const shapeIri = (name: string, suffix: string) => term(base + encodeURIComponent(name) + suffix);
  const classes = (names: string[]): Entry[] =>
    names.length === 1 ? [[term(`${SH}class`), typeIri(names[0]!)]] : [[term(`${SH}or`), `( ${names.map((n) => `[ ${term(`${SH}class`)} ${typeIri(n)} ]`).join(' ')} )`]];

  const propertyShape = (p: PropertySchema, order: number): Entry[] => {
    const e: Entry[] = [
      [term(`${SH}path`), term(iriOf(p, p.name, base, prefixes))],
      [term(`${SH}name`), literal(p.name)],
    ];
    if (p.kind === 'link') e.push([term(`${SH}nodeKind`), term(`${SH}IRI`)]);
    else e.push([term(`${SH}datatype`), term(KIND_DATATYPE[p.kind])]);
    if (p.kind === 'list') e.push([term(`${TGS}kind`), literal('list')]);
    if (p.required) e.push([term(`${SH}minCount`), '1']);
    if (!p.many) e.push([term(`${SH}maxCount`), '1']);
    if (p.default !== null && p.default !== undefined) {
      if (isScalar(p.default)) e.push([term(`${SH}defaultValue`), literal(p.default)]);
      else e.push([term(`${TGS}default`), literal(stableJson(p.default))]);
    }
    if (p.values) e.push([term(`${SH}in`), `( ${p.values.map((v) => literal(isScalar(v) ? v : stableJson(v))).join(' ')} )`]);
    if (p.description) e.push([term(`${SH}description`), literal(p.description)]);
    e.push([term(`${SH}order`), String(order)]);
    return e;
  };

  const edgeShape = (r: EdgeRule, order: number): Entry[] => {
    const e: Entry[] = [
      [term(`${SH}path`), edgeIri(r.type)],
      [term(`${SH}name`), literal(r.type)],
    ];
    if (r.targets?.length) e.push(...classes(r.targets));
    else e.push([term(`${SH}nodeKind`), term(`${SH}IRI`)], [term(`${TGS}edge`), 'true']);
    if (r.required) e.push([term(`${SH}minCount`), '1']);
    if (!r.many) e.push([term(`${SH}maxCount`), '1']);
    if (r.description) e.push([term(`${SH}description`), literal(r.description)]);
    e.push([term(`${SH}order`), String(order)]);
    return e;
  };

  const blocks: string[] = [];
  for (const t of [...set.schemas.values()].sort((a, b) => cmp(a.type, b.type))) {
    const e: Entry[] = [
      ['a', term(`${SH}NodeShape`)],
      [term(`${SH}targetClass`), typeIri(t.type)],
      [term(`${SH}name`), literal(t.type)],
      [term(`${TGS}note`), literal(t.path)],
    ];
    if (t.description) e.push([term(`${SH}description`), literal(t.description)]);
    if (t.edges) e.push([term(`${TGS}edgesClosed`), 'true']);
    if (t.template) e.push([term(`${TGS}template`), literal(t.template)]);
    const body = t.bodyIsTemplate ? opts.body?.(t.path)?.trim() : '';
    if (body) e.push([term(`${TGS}templateBody`), literal(body)]);
    if (t.style) e.push([term(`${TGS}visualization`), literal(stableJson(t.style))]);
    // Declaration order matters for elements and sections, and is itself deterministic, so keys are not sorted.
    if (t.sections?.length) e.push([term(`${TGS}sections`), literal(JSON.stringify(compactSections(t.sections)))]);
    if (t.elements?.length) e.push([term(`${TGS}elements`), literal(JSON.stringify(compactElements(t.elements)))]);
    let order = 0;
    for (const p of t.properties) e.push([term(`${SH}property`), propertyShape(p, order++)]);
    for (const r of t.edges ?? []) e.push([term(`${SH}property`), edgeShape(r, order++)]);
    blocks.push(statement(shapeIri(t.type, 'Shape'), e));
  }
  for (const et of [...set.edgeTypes.values()].sort((a, b) => cmp(a.type, b.type))) {
    const e: Entry[] = [
      ['a', term(`${SH}NodeShape`)],
      [term(`${SH}name`), literal(et.type)],
      [term(`${TGS}note`), literal(et.path)],
    ];
    if (et.description) e.push([term(`${SH}description`), literal(et.description)]);
    if (et.style) e.push([term(`${TGS}visualization`), literal(stableJson(et.style))]);
    e.push([term(`${SH}property`), [[term(`${SH}path`), term(`${RDF}predicate`)], [term(`${SH}hasValue`), edgeIri(et.type)]]]);
    if (et.from?.length) e.push([term(`${SH}property`), [[term(`${SH}path`), term(`${RDF}subject`)], ...classes(et.from)]]);
    if (et.to?.length) e.push([term(`${SH}property`), [[term(`${SH}path`), term(`${RDF}object`)], ...classes(et.to)]]);
    let order = 0;
    for (const p of et.properties) e.push([term(`${SH}property`), propertyShape(p, order++)]);
    blocks.push(statement(shapeIri(et.type, 'EdgeShape'), e));
  }

  const head = [`# Typed Graph Schema (TGS ${TGS_VERSION}) exported as SHACL`, `@prefix : <${base}> .`];
  for (const p of Object.keys(prefixes).sort()) head.push(`@prefix ${p}: <${prefixes[p]}> .`);
  return `${head.join('\n')}\n${blocks.map((b) => `\n${b}\n`).join('')}`;
}

function statement(subject: string, entries: Entry[]): string {
  return `${subject}\n${body(entries, 1)} .`;
}

function body(entries: Entry[], depth: number): string {
  const pad = '    '.repeat(depth);
  return entries
    .map(([p, o]) => `${pad}${p} ${typeof o === 'string' ? o : `[\n${body(o, depth + 1)}\n${pad}]`}`)
    .join(' ;\n');
}

const PN_LOCAL = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Shorten an IRI to `:local` (base), `prefix:local`, or `<iri>`. */
export function compact(iri: string, base: string, prefixes: Record<string, string>): string {
  if (iri.startsWith(base) && PN_LOCAL.test(iri.slice(base.length))) return `:${iri.slice(base.length)}`;
  let best: [string, string] | null = null;
  for (const [p, ns] of Object.entries(prefixes)) {
    if (iri.startsWith(ns) && PN_LOCAL.test(iri.slice(ns.length)) && (!best || ns.length > best[1].length || (ns.length === best[1].length && p < best[0]))) best = [p, ns];
  }
  if (best) return `${best[0]}:${iri.slice(best[1].length)}`;
  return `<${Array.from(iri, (c) => (c.charCodeAt(0) <= 0x20 || '<>"{}|^`\\'.includes(c) ? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}` : c)).join('')}>`;
}

function isScalar(v: unknown): v is string | number | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

/** A Turtle literal for a scalar: numbers and booleans bare, everything else a string. */
function literal(v: unknown): string {
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number' && Number.isFinite(v)) return /^-?\d+(\.\d+)?$/.test(String(v)) ? String(v) : `"${v}"^^<${XSD}double>`;
  const s = String(v).replace(/[\\"\n\r\t]/g, (c) => ({ '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t' })[c]!);
  return `"${s}"`;
}

/** JSON with object keys sorted, so annotations are byte-stable. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
