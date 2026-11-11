import type { LatIndex } from '../latmd/index.js';
import type { Section } from '../latmd/markdown.js';
import type { SpecIndex } from '../openspec/index.js';
import { mergeSchemas, type ElementSchema, type PropertySchema, type SchemaSet, type TypeSchema } from '../schema/schema.js';
import { resolveElementDecl } from './nodes.js';
import { scanHeadings, type ElementOccurrence } from './scan.js';
import type { Graph } from '../graph/graph.js';
import type { Diagnostic } from '../edges/parse.js';

export type DocumentFindingKind = 'missing-element' | 'too-many-elements' | 'missing-attribute' | 'attribute-value-not-allowed' | 'unclosed-element' | 'missing-section';

/** A place where a document does not have the shape its type declares. */
export interface DocumentFinding {
  kind: DocumentFindingKind;
  /** Project-relative path with extension. */
  file: string;
  /** 1-based line. */
  line: number;
  /** The section, requirement or record whose type declares the shape. */
  scope: string;
  message: string;
}

/** One typed part of a document: a lat.md section below the title, or a spec requirement or record. */
interface Scope {
  id: string;
  labels: string[];
  file: string;
  line: number;
  endLine: number;
  /** Top-level elements inside the range. */
  elements: ElementOccurrence[];
  headings: string[];
}

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

/** Last line of a section including its subsections. */
function subtreeEnd(s: Section): number {
  return s.children.length ? subtreeEnd(s.children[s.children.length - 1]!) : s.endLine;
}

/** The elements of a tree that lie in a range and are not nested in another element of that range. */
function topIn(list: ElementOccurrence[], line: number, endLine: number): ElementOccurrence[] {
  const out: ElementOccurrence[] = [];
  for (const e of list) {
    if (e.line >= line && e.line <= endLine) out.push(e);
    else if (e.line < line && e.endLine >= line) out.push(...topIn(e.children, line, endLine));
  }
  return out;
}

function latScopes(index: LatIndex): Scope[] {
  const out: Scope[] = [];
  for (const [filePath, parsed] of index.files) {
    const types = parsed.frontmatter.types ?? [];
    if (!types.length) continue;
    // Sections below the title carry the file's type; the outermost of them is one document of that type.
    for (const s of parsed.flat) {
      const parent = parsed.flat.find((p) => p.children.includes(s));
      if (s.depth === 1 || (parent && parent.depth > 1)) continue;
      const endLine = subtreeEnd(s);
      const headings: string[] = [];
      const collect = (x: Section) => x.children.forEach((c) => (headings.push(c.heading), collect(c)));
      collect(s);
      out.push({ id: s.id, labels: types, file: filePath, line: s.startLine, endLine, elements: topIn(parsed.elements, s.startLine, endLine), headings });
    }
  }
  return out;
}

function specScopes(specs: SpecIndex): Scope[] {
  const out: Scope[] = [];
  const byFile = new Map<string, ElementOccurrence[]>();
  for (const e of specs.elements()) if (!e.parent) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e.element]);
  const reqs = specs.requirements();
  for (const r of reqs) {
    const text = specs.fileText(r.file);
    if (text === null) continue;
    const next = reqs.filter((x) => x.file === r.file && x.line > r.line).map((x) => x.line).sort((a, b) => a - b)[0];
    const start = r.kind === 'decision' ? 1 : r.line;
    const endLine = next ? next - 1 : text.split(/\r?\n/).length;
    const headings = scanHeadings(text).filter((h) => h.line > r.line && h.line <= endLine).map((h) => h.text);
    out.push({ id: r.id, labels: [r.kind === 'decision' ? 'Decision' : 'Requirement', ...(r.labels ?? [])], file: r.file, line: r.line, endLine, elements: topIn(byFile.get(r.file) ?? [], start, endLine), headings });
  }
  return out;
}

function checkAttributes(e: ElementOccurrence, attrs: PropertySchema[], push: (kind: DocumentFindingKind, line: number, message: string) => void): void {
  for (const a of attrs) {
    const v = e.attrs[a.name];
    if (v === undefined || v === '') {
      if (a.required) push('missing-attribute', e.line, `<${e.tag}> needs the attribute '${a.name}'${a.description ? ` (${a.description})` : ''}`);
      continue;
    }
    if (a.values && !a.values.some((x) => String(x) === v)) push('attribute-value-not-allowed', e.line, `<${e.tag}> attribute '${a.name}' is '${v}'; allowed: ${a.values.map(show).join(', ')}`);
  }
}

/**
 * The declarations of one container, the document or a declared element with
 * nested `elements`, with the lines of the occurrences each one governs.
 */
interface Container {
  decls: ElementSchema[];
  lines: Map<ElementSchema, number[]>;
  line: number;
  where: string;
}

/**
 * Walk a tree with the declarations in scope (innermost container first) and
 * record each declared occurrence in the container whose list declared it, so
 * count rules hold per document for a type's elements and per parent element
 * for nested ones, at any depth.
 */
function walkTree(list: ElementOccurrence[], chain: Container[], all: Container[], push: (kind: DocumentFindingKind, line: number, message: string) => void): void {
  for (const e of list) {
    const hit = resolveElementDecl(e.tag, chain.map((c) => c.decls));
    if (!hit) {
      walkTree(e.children, chain, all, push);
      continue;
    }
    const { decl } = hit;
    const owner = chain[hit.level]!;
    owner.lines.set(decl, [...(owner.lines.get(decl) ?? []), e.line]);
    if (e.unclosed) push('unclosed-element', e.line, `<${e.tag}> is never closed with </${e.tag}>, so it holds no text`);
    checkAttributes(e, decl.attributes, push);
    if (!decl.elements.length) {
      walkTree(e.children, chain, all, push);
      continue;
    }
    const inner: Container = { decls: decl.elements, lines: new Map(), line: e.line, where: `<${e.tag}>` };
    all.push(inner);
    walkTree(e.children, [inner, ...chain], all, push);
  }
}

/** `required` and `many: false` of each container's declarations. */
function checkCounts(all: Container[], push: (kind: DocumentFindingKind, line: number, message: string) => void): void {
  for (const c of all)
    for (const d of c.decls) {
      const lines = c.lines.get(d) ?? [];
      if (d.required && lines.length === 0) push('missing-element', c.line, `${c.where} has no <${d.tag}>${d.description ? `: ${d.description}` : ''}`);
      if (!d.many && lines.length > 1) push('too-many-elements', lines[1]!, `${c.where} allows one <${d.tag}>, found ${lines.length}`);
    }
}

/** Check one typed part against its effective schema. */
function checkScope(scope: Scope, set: SchemaSet, out: DocumentFinding[]): void {
  const schema: TypeSchema | null = mergeSchemas(scope.labels, set.schemas);
  if (!schema || (!schema.elements?.length && !schema.sections?.length)) return;
  const push = (kind: DocumentFindingKind, line: number, message: string) => out.push({ kind, file: scope.file, line, scope: scope.id, message });
  const name = `'${scope.id.slice(scope.id.lastIndexOf('#') + 1)}' (${schema.type})`;
  for (const h of schema.sections ?? []) {
    if (h.required && !scope.headings.some((x) => x.toLowerCase() === h.heading.toLowerCase())) push('missing-section', scope.line, `${name} has no '${h.heading}' heading${h.description ? `: ${h.description}` : ''}`);
  }
  const doc: Container = { decls: schema.elements ?? [], lines: new Map(), line: scope.line, where: name };
  const all = [doc];
  walkTree(scope.elements, [doc], all, push);
  checkCounts(all, push);
}

const byPlace = (a: DocumentFinding, b: DocumentFinding) => a.file.localeCompare(b.file) || a.line - b.line || a.message.localeCompare(b.message);

/**
 * Document findings for the notes of a vault graph: each typed Markdown note is
 * one document of its type; lines are 0-based like other diagnostics; a missing element or
 * heading is a note-level finding at line 0.
 */
// @tg: implements:: [[openspec:document-elements#Document shape validation]]
export function noteDocumentDiagnostics(graph: Graph, set: SchemaSet): Diagnostic[] {
  if (set.schemas.size === 0) return [];
  const out: DocumentFinding[] = [];
  for (const n of graph.nodes()) {
    if (n.stub || !n.labels.length) continue;
    const outline = graph.outline(n.id);
    if (!outline) continue;
    checkScope({ id: n.id, labels: n.labels, file: n.id, line: 0, endLine: Number.MAX_SAFE_INTEGER, elements: outline.elements, headings: outline.headings }, set, out);
  }
  return out.sort(byPlace).map((f) => ({ path: f.file, line: f.line > 0 ? f.line - 1 : 0, column: 0, message: f.message, code: f.kind }));
}

/**
 * Check every typed part of the documents against the `elements` and
 * `sections` its type declares: required and single elements and headings,
 * attribute values, and declared elements left unclosed. Advisory, like all
 * schema validation.
 */
// @tg: implements:: [[openspec:document-elements#Document shape validation]]
export function checkDocuments(index: LatIndex, specs: SpecIndex | null | undefined, set: SchemaSet | null | undefined): DocumentFinding[] {
  if (!set || set.schemas.size === 0) return [];
  const out: DocumentFinding[] = [];
  for (const scope of [...latScopes(index), ...(specs ? specScopes(specs) : [])]) checkScope(scope, set, out);
  return out.sort(byPlace);
}
