import { Parser, type Quad, type Term } from 'n3';
import { BUILTIN_PREFIXES, DEFAULT_BASE_IRI, readElementDeclarations, readSectionDeclarations, type EdgeRule, type EdgeTypeSchema, type PropertyKind, type PropertySchema, type TypeSchema } from '../schema/schema.js';
import { compact } from './export.js';
import { DATATYPE_KIND, localName, RDF, SH, TGS, XSD } from './vocab.js';

export interface ShaclImportOptions {
  /** Base IRI that names declarations without a `uri` (default `urn:tgs:`). */
  base?: string;
}

/** A SHACL construct outside the TGS subset, skipped by the import. */
export interface DroppedConstruct {
  shape: string;
  construct: string;
}

/** Declarations read from SHACL, before they are placed into notes. */
export interface ShaclImport {
  types: ImportedType[];
  edgeTypes: ImportedEdgeType[];
  /** Prefixes declared in the Turtle file that are not built in. */
  prefixes: Record<string, string>;
  dropped: DroppedConstruct[];
}

export interface ImportedType extends Omit<TypeSchema, 'path' | 'bodyIsTemplate' | 'ids'> {
  /** Value of `tgs:note`, if any. */
  note: string | null;
  /** Value of `tgs:templateBody`, if any. */
  templateBody: string | null;
}

export interface ImportedEdgeType extends Omit<EdgeTypeSchema, 'path'> {
  note: string | null;
}

type Index = Map<string, Map<string, Term[]>>;

const key = (t: Term) => (t.termType === 'BlankNode' ? `_:${t.value}` : t.value);

/** Predicates the import understands on a node shape and on a property shape. */
const NODE_KNOWN = new Set([`${RDF}type`, `${SH}targetClass`, `${SH}name`, `${SH}property`, `${TGS}note`, `${TGS}edgesClosed`, `${TGS}template`, `${TGS}templateBody`, `${TGS}visualization`, `${SH}description`, `${TGS}elements`, `${TGS}sections`]);
const PROP_KNOWN = new Set([`${RDF}type`, `${SH}path`, `${SH}name`, `${SH}datatype`, `${SH}nodeKind`, `${SH}class`, `${SH}node`, `${SH}or`, `${SH}minCount`, `${SH}maxCount`, `${SH}defaultValue`, `${SH}in`, `${SH}order`, `${SH}hasValue`, `${TGS}kind`, `${TGS}edge`, `${TGS}default`, `${SH}description`]);

/**
 * Read SHACL shapes in Turtle into TGS declarations. Node shapes with a
 * target class become types; shapes constraining `rdf:predicate` with
 * `sh:hasValue` become edge types; everything else is reported as dropped.
 */
// @tg: implements:: [[shacl#Import]] {since: "2026-10-06"}
// @lat: [[shacl#Import]]
// @tg: implements:: [[openspec:shacl-interop#Drop report]]
// @tg: implements:: [[openspec:shacl-interop#Import SHACL into schema notes]]
// @tg: implements:: [[openspec:shacl-interop#Lossless round trip]]
// @tg: implements:: [[openspec:shacl-interop#Reverse mapping]]
// @tg: implements:: [[openspec:shacl-interop#Typed Graph annotations]]
// @tg: implements:: [[openspec:document-elements#SHACL exchange of descriptions and elements]]
export function importShacl(turtle: string, opts: ShaclImportOptions = {}): ShaclImport {
  const base = opts.base ?? DEFAULT_BASE_IRI;
  const declared: Record<string, string> = {};
  const quads: Quad[] = new Parser().parse(turtle, null, (prefix: string, iri: { value: string }) => {
    declared[prefix] = iri.value;
  });
  const index: Index = new Map();
  const objectsOfProperty = new Set<string>();
  for (const q of quads) {
    const s = key(q.subject);
    let preds = index.get(s);
    if (!preds) index.set(s, (preds = new Map<string, Term[]>()));
    const list = preds.get(q.predicate.value) ?? [];
    list.push(q.object);
    preds.set(q.predicate.value, list);
    if (q.predicate.value === `${SH}property`) objectsOfProperty.add(key(q.object));
  }
  const get = (node: string | Term, pred: string): Term[] => index.get(typeof node === 'string' ? node : key(node))?.get(pred) ?? [];
  const one = (node: string | Term, pred: string): Term | undefined => get(node, pred)[0];
  const list = (node: Term | undefined): Term[] => {
    const out: Term[] = [];
    let cur = node;
    while (cur && !(cur.termType === 'NamedNode' && cur.value === `${RDF}nil`) && out.length < 10000) {
      const first = one(cur, `${RDF}first`);
      if (first) out.push(first);
      cur = one(cur, `${RDF}rest`);
    }
    return out;
  };

  const userPrefixes: Record<string, string> = {};
  for (const [p, iri] of Object.entries(declared)) if (p && BUILTIN_PREFIXES[p] !== iri && iri !== base) userPrefixes[p] = iri;
  const allPrefixes = { ...BUILTIN_PREFIXES, ...userPrefixes };
  const uriFor = (iri: string, name: string): string | null => {
    if (iri === base + encodeURIComponent(name)) return null;
    const c = compact(iri, base, allPrefixes);
    return c.startsWith('<') ? iri : c.startsWith(':') ? iri : c;
  };

  const dropped: DroppedConstruct[] = [];
  const drop = (shape: string, construct: string) => dropped.push({ shape, construct });
  const short = (iri: string) => {
    const c = compact(iri, base, allPrefixes);
    return c.startsWith('<') ? c.slice(1, -1) : c;
  };

  const isNodeShape = (s: string) =>
    !objectsOfProperty.has(s) &&
    (get(s, `${RDF}type`).some((t) => t.value === `${SH}NodeShape`) || get(s, `${SH}targetClass`).length > 0 || get(s, `${SH}property`).length > 0);
  const shapes = [...index.keys()].filter(isNodeShape);

  const predicateShape = (s: string) => get(s, `${SH}property`).find((ps) => one(ps, `${SH}path`)?.value === `${RDF}predicate` && one(ps, `${SH}hasValue`));
  const edgeShapes = shapes.filter((s) => predicateShape(s));
  const typeShapes = shapes.filter((s) => !predicateShape(s));

  const str = (t: Term | undefined) => (t?.termType === 'Literal' ? t.value : null);
  const shapeName = (s: string) => str(one(s, `${SH}name`));

  // Names first, so edges can refer to types and edge types by name.
  const classToType = new Map<string, string>();
  const shapeToType = new Map<string, string>();
  for (const s of typeShapes) {
    const cls = get(s, `${SH}targetClass`)[0];
    if (!cls) continue;
    const name = shapeName(s) ?? localName(cls.value);
    classToType.set(cls.value, name);
    shapeToType.set(s, name);
  }
  const predicateToEdge = new Map<string, string>();
  for (const s of edgeShapes) {
    const pred = one(predicateShape(s)!, `${SH}hasValue`)!.value;
    predicateToEdge.set(pred, shapeName(s) ?? localName(pred));
  }
  const typeName = (cls: string) => classToType.get(cls) ?? localName(cls);

  const label = (s: string) => shapeName(s) ?? (s.startsWith('_:') ? 'anonymous shape' : short(s));

  /** Class names from `sh:class`, `sh:node` or `sh:or` of those; null when the shape has none. */
  const targetsOf = (ps: Term, where: string): string[] | null => {
    const out: string[] = [];
    for (const c of get(ps, `${SH}class`)) out.push(typeName(c.value));
    for (const n of get(ps, `${SH}node`)) {
      const t = shapeToType.get(key(n));
      if (t) out.push(t);
      else drop(where, `sh:node ${short(n.value)} (not a typed node shape)`);
    }
    for (const or of get(ps, `${SH}or`)) {
      for (const alt of list(or)) {
        const cls = get(alt, `${SH}class`);
        const extra = [...(index.get(key(alt))?.keys() ?? [])].filter((p) => p !== `${SH}class`);
        if (cls.length === 1 && extra.length === 0) out.push(typeName(cls[0]!.value));
        else drop(where, 'sh:or (alternative other than a single sh:class)');
      }
    }
    return out.length ? [...new Set(out)] : null;
  };

  const intOf = (t: Term | undefined) => (t?.termType === 'Literal' && /^\d+$/.test(t.value) ? Number(t.value) : null);
  const reportUnknown = (node: Term | string, known: Set<string>, where: string) => {
    for (const p of index.get(typeof node === 'string' ? node : key(node))?.keys() ?? []) if (!known.has(p)) drop(where, short(p));
  };

  /** Read property shapes into properties and edges, in `sh:order` then path order. */
  const readPropertyShapes = (s: string, owner: string, skipPaths: Set<string>) => {
    const props: PropertySchema[] = [];
    const edges: EdgeRule[] = [];
    const entries = get(s, `${SH}property`)
      .map((ps) => ({ ps, order: intOf(one(ps, `${SH}order`)) ?? Number.MAX_SAFE_INTEGER, path: one(ps, `${SH}path`) }))
      .sort((a, b) => a.order - b.order || (a.path?.value ?? '').localeCompare(b.path?.value ?? ''));
    for (const { ps, path } of entries) {
      if (!path || path.termType !== 'NamedNode') {
        drop(owner, 'sh:path (property path other than a single IRI)');
        continue;
      }
      if (skipPaths.has(path.value)) continue;
      const name = str(one(ps, `${SH}name`)) ?? predicateToEdge.get(path.value) ?? localName(path.value);
      const where = `${owner}.${name}`;
      reportUnknown(ps, PROP_KNOWN, where);
      if (one(ps, `${SH}hasValue`)) drop(where, 'sh:hasValue');
      const min = intOf(one(ps, `${SH}minCount`));
      const max = intOf(one(ps, `${SH}maxCount`));
      if (max !== null && max > 1) drop(where, `sh:maxCount ${max} (read as many)`);
      const targets = targetsOf(ps, where);
      const isEdge = targets !== null || one(ps, `${TGS}edge`)?.value === 'true';
      if (isEdge) {
        edges.push({ type: name, targets, many: max !== 1, required: (min ?? 0) >= 1, ...described(one(ps, `${SH}description`)) });
        continue;
      }
      let kind: PropertyKind = 'text';
      const dt = one(ps, `${SH}datatype`);
      if (dt) {
        const k = DATATYPE_KIND[dt.value];
        if (k) kind = k;
        else drop(where, `sh:datatype ${short(dt.value)} (read as text)`);
      } else if (one(ps, `${SH}nodeKind`)?.value === `${SH}IRI`) kind = 'link';
      if (str(one(ps, `${TGS}kind`)) === 'list') kind = 'list';
      let def: unknown = null;
      const dv = one(ps, `${SH}defaultValue`);
      if (dv) def = literalValue(dv);
      const jd = str(one(ps, `${TGS}default`));
      if (jd !== null) def = parseJson(jd, () => drop(where, 'tgs:default (invalid JSON)'));
      const inList = one(ps, `${SH}in`);
      props.push({
        name,
        kind,
        default: def,
        required: (min ?? 0) >= 1,
        many: kind === 'list' || max !== 1,
        values: inList ? list(inList).map(literalValue) : null,
        uri: uriFor(path.value, name),
        ...described(one(ps, `${SH}description`)),
      });
    }
    return { props, edges };
  };

  const json = (s: string, pred: string, where: string) => {
    const v = str(one(s, pred));
    if (v === null) return null;
    const parsed = parseJson(v, () => drop(where, `${short(pred)} (invalid JSON)`));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  };

  const types: ImportedType[] = [];
  for (const s of typeShapes) {
    const name = shapeToType.get(s);
    if (!name) {
      drop(label(s), 'node shape without sh:targetClass');
      continue;
    }
    const classes = get(s, `${SH}targetClass`);
    if (classes.length > 1) drop(name, 'sh:targetClass (only the first is kept)');
    reportUnknown(s, NODE_KNOWN, name);
    const { props, edges } = readPropertyShapes(s, name, new Set());
    const closed = one(s, `${TGS}edgesClosed`)?.value === 'true';
    types.push({
      type: name,
      properties: props,
      edges: closed || edges.length ? edges : null,
      style: json(s, `${TGS}visualization`, name),
      uri: uriFor(classes[0]!.value, name),
      template: str(one(s, `${TGS}template`)),
      note: str(one(s, `${TGS}note`)),
      templateBody: str(one(s, `${TGS}templateBody`)),
      ...described(one(s, `${SH}description`)),
      ...nonEmpty('elements', readElementDeclarations(json(s, `${TGS}elements`, name) ?? undefined, (m) => drop(name, `tgs:elements (${m})`))),
      ...nonEmpty('sections', readSectionDeclarations(json(s, `${TGS}sections`, name) ?? undefined, (m) => drop(name, `tgs:sections (${m})`))),
    });
  }

  const edgeTypes: ImportedEdgeType[] = [];
  for (const s of edgeShapes) {
    const pred = one(predicateShape(s)!, `${SH}hasValue`)!.value;
    const name = predicateToEdge.get(pred)!;
    reportUnknown(s, NODE_KNOWN, name);
    const ends = (path: string) => {
      const ps = get(s, `${SH}property`).find((p) => one(p, `${SH}path`)?.value === path);
      return ps ? targetsOf(ps, `${name}.${localName(path)}`) : null;
    };
    const { props } = readPropertyShapes(s, name, new Set([`${RDF}predicate`, `${RDF}subject`, `${RDF}object`]));
    edgeTypes.push({
      type: name,
      from: ends(`${RDF}subject`),
      to: ends(`${RDF}object`),
      properties: props,
      uri: uriFor(pred, name),
      style: json(s, `${TGS}visualization`, name),
      note: str(one(s, `${TGS}note`)),
      ...described(one(s, `${SH}description`)),
    });
  }

  const byName = <T extends { type: string }>(a: T, b: T) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0);
  return { types: types.sort(byName), edgeTypes: edgeTypes.sort(byName), prefixes: userPrefixes, dropped };
}

/** `{description}` from an `sh:description`, or nothing. */
function described(t: Term | undefined): { description?: string } {
  return t?.value ? { description: t.value } : {};
}

function nonEmpty<K extends string, T>(k: K, list: T[]): Partial<Record<K, T[]>> {
  return list.length ? ({ [k]: list } as Record<K, T[]>) : {};
}

function literalValue(t: Term): unknown {
  if (t.termType !== 'Literal') return t.value;
  const dt = (t as Term & { datatype?: { value: string } }).datatype?.value;
  if (dt === `${XSD}boolean`) return t.value === 'true';
  if (dt && DATATYPE_KIND[dt] === 'number') {
    const n = Number(t.value);
    return Number.isFinite(n) ? n : t.value;
  }
  return t.value;
}

function parseJson(s: string, onError: () => void): unknown {
  try {
    return JSON.parse(s);
  } catch {
    onError();
    return null;
  }
}
