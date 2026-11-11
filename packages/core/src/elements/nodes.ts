import type { LatIndex } from '../latmd/index.js';
import type { SpecIndex } from '../openspec/index.js';
import { mergeSchemas, type ElementSchema, type SchemaSet } from '../schema/schema.js';
import { flattenElements, type ElementOccurrence } from './scan.js';

/** Label every element node has, besides the types its declaration names. */
export const ELEMENT_LABEL = 'Element';
/** Longest inner text kept on an element node. */
const MAX_TEXT = 500;
/** Graph properties of an element node; an attribute of the same name is stored as `attr_<name>`. */
const RESERVED = new Set(['tag', 'element', 'file', 'line', 'endLine', 'text', 'title', 'type', 'types', 'owner', 'description', 'section', 'path', 'stub']);

/** A graph node for one element of a document file. */
export interface ElementNode {
  /** `<doc>#^<id>`, or `<doc>#^<tag>-<n>` for a node without an `id`. */
  id: string;
  labels: string[];
  props: Record<string, unknown>;
  /** The section, spec requirement or scenario, or element node it sits in. */
  owner: string;
  /** Project-relative path of the file, with extension. */
  file: string;
  line: number;
  endLine: number;
  decl: ElementSchema | null;
  occurrence: ElementOccurrence;
}

/** The element declarations a node with these labels has, merged in label order. */
export function elementDeclarations(labels: string[], set: SchemaSet | null | undefined): ElementSchema[] {
  if (!set) return [];
  return mergeSchemas(labels, set.schemas)?.elements ?? [];
}

/** The declaration of `tag` in a list, ignoring case. */
export function findElementDecl(tag: string, decls: ElementSchema[]): ElementSchema | null {
  const t = tag.toLowerCase();
  return decls.find((d) => d.tag.toLowerCase() === t) ?? null;
}

/**
 * Resolve a tag against the declarations in scope (TGS 0.5 section 4.4): the
 * nested `elements` of each declared element around the occurrence, innermost
 * first, then the type's own `elements`. Returns the declaration and the index
 * of the list it was found in, or null for an undeclared tag. Undeclared
 * elements add no list, so a wrapper such as `<details>` is transparent.
 */
// @tg: implements:: [[openspec:document-elements#Element scope]]
export function resolveElementDecl(tag: string, chain: ElementSchema[][]): { decl: ElementSchema; level: number } | null {
  for (let level = 0; level < chain.length; level++) {
    const decl = findElementDecl(tag, chain[level]!);
    if (decl) return { decl, level };
  }
  return null;
}

/**
 * True when an occurrence becomes a node: it has an `id` (an author asking for
 * an address), or its declaration says so (`node: true`, or a `type` and no
 * `node: false`). Everything else stays text in its section.
 */
// @tg: implements:: [[openspec:document-elements#Element nodes]]
export function isElementNode(e: ElementOccurrence, decl: ElementSchema | null): boolean {
  if (e.attrs.id?.trim()) return true;
  if (!decl) return false;
  return decl.node ?? decl.types.length > 0;
}

interface Walk {
  doc: string;
  file: string;
  /** Declarations that apply at the top level of this part of the file. */
  decls: (e: ElementOccurrence) => ElementSchema[];
  /** Owner of an element that has no node element around it. */
  owner: (e: ElementOccurrence) => string | null;
  /** Ids already given to nodes, lowercased. */
  used: Set<string>;
  /** Every explicit id in the document, lowercased, so a generated id never takes one. */
  reserved: Set<string>;
  counts: Map<string, number>;
  out: ElementNode[];
}

/** `nested` holds the `elements` of the declared elements around the list, innermost first. */
function walk(list: ElementOccurrence[], w: Walk, parentNode: ElementNode | null, nested: ElementSchema[][]): void {
  for (const e of list) {
    const decl = resolveElementDecl(e.tag, [...nested, w.decls(e)])?.decl ?? null;
    let node: ElementNode | null = null;
    const owner = parentNode?.id ?? w.owner(e);
    if (owner && isElementNode(e, decl)) {
      const name = e.attrs.id?.trim();
      let id: string | null = name ? `${w.doc}#^${name}` : null;
      // A repeated id names the first element only; the repeat stays text.
      if (id && w.used.has(id.toLowerCase())) id = null;
      else if (!name) {
        const key = e.tag.toLowerCase();
        let n = w.counts.get(key) ?? 0;
        do id = `${w.doc}#^${e.tag}-${++n}`;
        while (w.used.has(id.toLowerCase()) || w.reserved.has(id.toLowerCase()));
        w.counts.set(key, n);
      }
      if (id) {
        w.used.add(id.toLowerCase());
        const props: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(e.attrs)) props[RESERVED.has(k) ? `attr_${k}` : k] = v;
        const text = e.text.length > MAX_TEXT ? `${e.text.slice(0, MAX_TEXT)}…` : e.text;
        Object.assign(props, { tag: e.tag, element: id, file: w.file, line: e.line, endLine: e.endLine, text, owner, title: e.attrs.title?.trim() || name || e.tag, ...(decl?.description ? { description: decl.description } : {}) });
        node = { id, labels: [ELEMENT_LABEL, ...(decl?.types ?? []).filter((t) => t !== ELEMENT_LABEL)], props, owner, file: w.file, line: e.line, endLine: e.endLine, decl, occurrence: e };
        w.out.push(node);
      }
    }
    walk(e.children, w, node ?? parentNode, decl?.elements.length ? [decl.elements, ...nested] : nested);
  }
}

/** Element nodes of the lattice: each owned by the innermost section around it, or by the node element it is nested in. */
// @tg: implements:: [[openspec:document-elements#Element nodes]]
export function latElementNodes(index: LatIndex, set: SchemaSet | null | undefined): ElementNode[] {
  const out: ElementNode[] = [];
  for (const [filePath, parsed] of index.files) {
    if (!parsed.elements.length) continue;
    const doc = filePath.replace(/\.md$/, '');
    const decls = elementDeclarations(parsed.frontmatter.types ?? [], set);
    const reserved = new Set(flattenElements(parsed.elements).flatMap((e) => (e.attrs.id?.trim() ? [`${doc}#^${e.attrs.id.trim()}`.toLowerCase()] : [])));
    const innermost = (line: number) => parsed.flat.filter((s) => s.startLine <= line && line <= s.endLine).sort((a, b) => b.depth - a.depth)[0]?.id ?? parsed.flat[0]?.id ?? null;
    walk(parsed.elements, { doc, file: filePath, decls: () => decls, owner: (e) => innermost(e.line), used: new Set(), reserved, counts: new Map(), out }, null, []);
  }
  return out;
}

/** Element nodes of the spec files: each owned by the requirement or scenario above it, or by the node element it is nested in. */
// @tg: implements:: [[openspec:document-elements#Elements in spec files]]
export function specElementNodes(specs: SpecIndex, set: SchemaSet | null | undefined): ElementNode[] {
  const labels = new Map<string, string[]>();
  for (const r of specs.requirements()) {
    labels.set(r.id, [r.kind === 'decision' ? 'Decision' : 'Requirement', ...(r.labels ?? [])]);
    for (const sc of r.scenarios) labels.set(sc.id, ['Scenario', ...(sc.labels ?? [])]);
  }
  const out: ElementNode[] = [];
  const byFile = new Map<string, { doc: string; roots: ElementOccurrence[]; owner: Map<ElementOccurrence, string> }>();
  for (const e of specs.elements()) {
    const f = byFile.get(e.file) ?? { doc: e.doc, roots: [] as ElementOccurrence[], owner: new Map<ElementOccurrence, string>() };
    if (!e.parent) f.roots.push(e.element);
    f.owner.set(e.element, e.owner);
    byFile.set(e.file, f);
  }
  const used = new Set<string>();
  const reserved = new Set(specs.elements().flatMap((e) => (e.id ? [e.id.toLowerCase()] : [])));
  const counts = new Map<string, Map<string, number>>();
  for (const [file, f] of byFile) {
    const c = counts.get(f.doc) ?? new Map<string, number>();
    counts.set(f.doc, c);
    walk(f.roots, { doc: f.doc, file, decls: (e) => elementDeclarations(labels.get(f.owner.get(e) ?? '') ?? [], set), owner: (e) => f.owner.get(e) ?? null, used, reserved, counts: c, out }, null, []);
  }
  return out;
}
