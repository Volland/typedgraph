import { frontmatterEdges, markdownTarget, parseEdges, type Diagnostic, type ParsedEdge, type ParseOptions, type Sign } from '../edges/parse.js';
import type { Props } from '../edges/props.js';
import { noteFormat, parseAsciidoc, type AsciidocSection } from '../asciidoc/parse.js';
import type { YamlParser } from '../asciidoc/meta.js';
import { scanElements, scanHeadings, type ElementOccurrence } from '../elements/scan.js';

export interface GraphNode {
  /** Note path for real nodes, link text for stubs. */
  id: string;
  labels: string[];
  props: Record<string, unknown>;
  stub: boolean;
}

export interface GraphEdge {
  id: string;
  type: string;
  sign: Sign;
  source: string;
  target: string;
  props: Props;
  heading: string | null;
  line: number;
  /** Path of the edge note that declares this edge; absent when `source` wrote it. */
  file?: string;
}

/** The parts of a Markdown note a type can declare: its heading texts and its block-level XML elements. */
export interface NoteOutline {
  headings: string[];
  elements: ElementOccurrence[];
}

export interface NoteInput {
  path: string;
  text: string;
  frontmatter?: Record<string, unknown> | null;
  /** Pre-parsed edges added to those parsed from `text`; their targets are resolved like written links. */
  edges?: ParsedEdge[];
}

export interface GraphOptions extends ParseOptions {
  /** YAML parser for AsciiDoc property blocks and `:tg-*:` values; without one a small flat reader is used. */
  parseYaml?: YamlParser;
}

/** Resolve link text written in `sourcePath` to an existing note path, or null. */
export type LinkResolver = ((link: string, sourcePath: string) => string | null) & {
  /** The note paths a link matches when it matches more than one format (`X.md` and `X.adoc`); such a link resolves to nothing. */
  ambiguous?: (link: string, sourcePath: string) => string[] | null;
};

/** Resolve a link with a `#subpath` (e.g. `src/a.ts#login`) to a node id, or null to fall back to the plain resolver. */
export type SubpathResolver = (link: string, subpath: string, sourcePath: string) => string | null;

interface FileState {
  parsed: ParsedEdge[];
  diagnostics: Diagnostic[];
  edgeIds: string[];
  /** Source link of an edge note; its one parsed edge starts here instead of at the file. */
  from?: { target: string; subpath: string | null };
  /** Targets that resolved to edge notes, kept so the links re-resolve when those change. */
  skipped: string[];
}

/**
 * In-memory property graph: one node per note, stub nodes for unresolved
 * links, typed edges with derived or pinned IDs. Updates are per file.
 */
// @lat: [[graph-model]]
// @tg: implements:: [[openspec:graph-model#Plain link edges]]
export class Graph {
  private readonly nodeMap = new Map<string, GraphNode>();
  private readonly edgeMap = new Map<string, GraphEdge>();
  private readonly files = new Map<string, FileState>();
  private readonly out = new Map<string, Set<string>>();
  private readonly in = new Map<string, Set<string>>();
  /** Target node id -> source paths with at least one edge to it. */
  private readonly incoming = new Map<string, Set<string>>();
  private readonly stubRefs = new Map<string, number>();
  /** Stub ids by the file name a note needs to satisfy them, so a new note re-resolves only links that can reach it. */
  private readonly stubsByName = new Map<string, Set<string>>();
  private readonly listeners = new Set<(paths: string[]) => void>();
  /** Edge notes missing a field: no edge, no node, but still not a link target. */
  private readonly incompleteEdgeNotes = new Set<string>();
  /** AsciiDoc notes' sections, for resolving `#id` fragments of cross references. */
  private readonly adocSections = new Map<string, AsciidocSection[]>();
  /** Headings and XML elements of Markdown notes, for checking documents against their type. */
  private readonly outlines = new Map<string, NoteOutline>();

  constructor(
    private readonly resolve: LinkResolver,
    private readonly resolveSub?: SubpathResolver,
    /** `linkEdges` also turns plain links in prose into `links_to` edges; `frontmatterEdges` turns links in frontmatter properties into edges. */
    private readonly options: GraphOptions = {},
  ) {}

  // ---- queries -----------------------------------------------------------

  /** Headings and XML elements of a Markdown note, or undefined for AsciiDoc notes, edge notes and nodes built without text. */
  outline(path: string): NoteOutline | undefined {
    return this.outlines.get(path);
  }

  get size(): { nodes: number; edges: number } {
    return { nodes: this.nodeMap.size, edges: this.edgeMap.size };
  }
  nodes(): IterableIterator<GraphNode> {
    return this.nodeMap.values();
  }
  edges(): IterableIterator<GraphEdge> {
    return this.edgeMap.values();
  }
  node(id: string): GraphNode | undefined {
    return this.nodeMap.get(id);
  }
  edge(id: string): GraphEdge | undefined {
    return this.edgeMap.get(id);
  }
  outEdges(nodeId: string): GraphEdge[] {
    return [...(this.out.get(nodeId) ?? [])].map((id) => this.edgeMap.get(id)!);
  }
  inEdges(nodeId: string): GraphEdge[] {
    return [...(this.in.get(nodeId) ?? [])].map((id) => this.edgeMap.get(id)!);
  }
  /** Resolve link text written in `sourcePath` to a node id (real note or existing stub). */
  resolveLink(link: string, sourcePath: string): string | null {
    const target = link.trim();
    const resolved = this.resolve(target, sourcePath);
    if (resolved && this.nodeMap.has(resolved)) return resolved;
    const stub = stubId(target);
    return this.nodeMap.get(stub)?.stub ? stub : null;
  }

  /**
   * The section of an AsciiDoc note that an id or heading path names: an explicit or generated id
   * (`_typed_links`), a heading path (`Metagraphs#Definition`) or a lone heading. Returns its canonical
   * id (`book/ch03.adoc#Metagraphs`), or null.
   */
  // @tg: implements:: [[openspec:asciidoc-notes#Sections and id aliases]] {confidence: partial}
  resolveSection(path: string, fragment: string): string | null {
    const sections = this.adocSections.get(path);
    if (!sections) return null;
    const f = fragment.trim();
    const byAlias = sections.find((s) => s.aliases.includes(f));
    if (byAlias) return byAlias.id;
    const lower = f.toLowerCase();
    const byPath = sections.find((s) => s.headingPath.join('#').toLowerCase() === lower);
    if (byPath) return byPath.id;
    const byHeading = sections.filter((s) => s.heading.toLowerCase() === lower);
    return byHeading.length === 1 ? byHeading[0]!.id : null;
  }

  /** Edges written in the note at `path`, including the one an edge note declares. */
  declaredEdges(path: string): GraphEdge[] {
    return (this.files.get(path)?.edgeIds ?? []).map((id) => this.edgeMap.get(id)!);
  }

  diagnostics(): Diagnostic[] {
    return [...this.files.values()].flatMap((f) => f.diagnostics);
  }

  /** Subscribe to change notifications; returns an unsubscribe function. */
  onChange(fn: (paths: string[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---- updates -----------------------------------------------------------

  /** Add or replace a note and its outgoing edges. */
  // @lat: [[graph-model#Nodes]]
  // @tg: implements:: [[openspec:graph-model#Frontmatter title]]
  // @tg: implements:: [[openspec:graph-model#Incremental updates]]
  // @tg: implements:: [[openspec:graph-model#Node properties]]
  // @tg: implements:: [[openspec:graph-model#One note is one node]]
  upsertNote(note: NoteInput): void {
    const isNew = !this.files.has(note.path);
    const wasEdgeNote = this.files.get(note.path)?.from !== undefined || this.isIncompleteEdgeNote(note.path);
    this.dropEdges(note.path);
    if (isEdgeNote(note.frontmatter)) {
      this.upsertEdgeNote(note, isNew, wasEdgeNote);
      return;
    }
    this.incompleteEdgeNotes.delete(note.path);
    const adoc = noteFormat(note.path) === 'adoc' ? parseAsciidoc(note.text, note.path, { parseYaml: this.options.parseYaml, linkEdges: this.options.linkEdges }) : null;
    if (adoc) this.adocSections.set(note.path, adoc.sections);
    else this.adocSections.delete(note.path);
    if (!adoc && note.text) this.outlines.set(note.path, { headings: scanHeadings(note.text).map((h) => h.text), elements: /^ {0,3}</m.test(note.text) ? scanElements(note.text) : [] });
    else this.outlines.delete(note.path);
    // A host that cannot read AsciiDoc metadata hands none; the parsed properties stand in.
    const frontmatter = note.frontmatter ?? adoc?.meta ?? null;
    this.nodeMap.set(note.path, {
      id: note.path,
      labels: labelsOf(frontmatter),
      // A frontmatter `title` (OKF's display name) wins over the document title and the file name.
      props: { ...(frontmatter ?? {}), path: note.path, title: frontmatterTitle(frontmatter) ?? adoc?.title ?? titleOf(note.path) },
      stub: false,
    });
    const { edges: parsed, diagnostics } = adoc ? { edges: adoc.edges, diagnostics: adoc.warnings } : parseEdges(note.text, note.path, this.options);
    const fromFrontmatter = this.options.frontmatterEdges ? frontmatterEdges(frontmatter, note.path) : [];
    const edges = fromFrontmatter.length || note.edges?.length ? [...parsed, ...fromFrontmatter, ...(note.edges ?? [])] : parsed;
    this.files.set(note.path, { parsed: edges, diagnostics, edgeIds: [], skipped: [] });
    this.addEdges(note.path);

    const touched = new Set([note.path]);
    // A new note may satisfy links that were stubs before; a former edge note, links that were refused.
    if (isNew) this.reresolve(this.sourcesOfStubs(note.path), touched);
    if (wasEdgeNote) this.reresolve(new Set(this.incoming.get(note.path) ?? []), touched);
    this.emit(touched);
  }

  /** An edge note contributes one edge from `from` to `to` and no node. */
  // @lat: [[edge-syntax#Edge notes]]
  // @tg: implements:: [[openspec:graph-model#Edge notes]]
  private upsertEdgeNote(note: NoteInput, isNew: boolean, wasEdgeNote: boolean): void {
    this.outlines.delete(note.path);
    const fm = note.frontmatter ?? {};
    const wasNode = this.nodeMap.has(note.path);
    this.nodeMap.delete(note.path);
    const from = endpointLink(fm.from, note.path);
    const to = endpointLink(fm.to, note.path);
    const rawType = typeof fm.edgeType === 'string' ? fm.edgeType.trim() : '';
    const sign: Sign = rawType.startsWith('-') ? -1 : 1;
    const type = rawType.replace(/^[+-]/, '').trim();
    const missing = [!from && 'from', !to && 'to', !type && 'edgeType'].filter((x): x is string => !!x);
    const diagnostics: Diagnostic[] = [];
    const parsed: ParsedEdge[] = [];
    if (missing.length) {
      diagnostics.push({ path: note.path, line: 0, column: 0, message: `Edge note is missing ${missing.join(', ')}; it declares no edge`, code: 'edge-note' });
      this.incompleteEdgeNotes.add(note.path);
    } else {
      this.incompleteEdgeNotes.delete(note.path);
      const props: Props = {};
      for (const [k, v] of Object.entries(fm)) if (!EDGE_NOTE_KEYS.has(k)) props[k] = v as Props[string];
      parsed.push({ type, sign, target: to!.target, subpath: to!.subpath, alias: null, props, line: 0, heading: null });
    }
    this.files.set(note.path, { parsed, diagnostics, edgeIds: [], from: from && !missing.length ? from : undefined, skipped: [] });
    this.addEdges(note.path);

    const touched = new Set([note.path]);
    if (isNew) this.reresolve(this.sourcesOfStubs(note.path), touched);
    // Links to a former node now refuse it.
    if (wasNode && !wasEdgeNote) this.reresolve(new Set(this.incoming.get(note.path) ?? []), touched);
    this.emit(touched);
  }

  private isIncompleteEdgeNote(path: string): boolean {
    return this.incompleteEdgeNotes.has(path);
  }

  // @tg: implements:: [[openspec:graph-model#Incremental updates]]
  removeNote(path: string): void {
    if (!this.files.has(path)) return;
    this.dropEdges(path);
    this.files.delete(path);
    this.outlines.delete(path);
    this.nodeMap.delete(path);
    this.incompleteEdgeNotes.delete(path);
    this.adocSections.delete(path);
    const touched = new Set([path]);
    // Edges that pointed at the removed note now resolve to stubs.
    this.reresolve(new Set(this.incoming.get(path) ?? []), touched);
    this.emit(touched);
  }

  renameNote(oldPath: string, note: NoteInput): void {
    this.removeNote(oldPath);
    this.upsertNote(note);
  }

  // ---- internals ---------------------------------------------------------

  /**
   * Notes with a link to a stub that a new note at `path` may now satisfy. A link resolves only to a note
   * whose file name matches its last segment, so only stubs with that name qualify; scanning every stub
   * made each new note cost the whole vault and indexing quadratic.
   */
  // @tg: implements:: [[openspec:graph-model#Incremental updates]]
  private sourcesOfStubs(path: string): Set<string> {
    const out = new Set<string>();
    for (const stub of this.stubsByName.get(nameKey(path)) ?? []) for (const s of this.incoming.get(stub) ?? []) out.add(s);
    return out;
  }

  private reresolve(sources: Set<string>, touched: Set<string>): void {
    for (const src of sources) {
      if (!this.files.has(src)) continue;
      this.dropEdges(src);
      this.addEdges(src);
      touched.add(src);
    }
  }

  // @lat: [[edge-syntax#Edge identity]]
  // @tg: implements:: [[openspec:edge-parsing#Source heading is recorded]]
  // @tg: implements:: [[openspec:graph-model#Derived edge IDs]]
  private addEdges(path: string): void {
    const file = this.files.get(path)!;
    const ordinals = new Map<string, number>();
    let source = path;
    if (file.from) {
      const src = this.endpoint(file.from.target, file.from.subpath, path, 0, file);
      if (src === null) return;
      source = src;
    }
    for (const p of file.parsed) {
      const target = this.endpoint(p.target, p.subpath, path, p.line, file);
      if (target === null) {
        if (file.from) this.releaseEndpoint(source);
        continue;
      }
      const key = `${source}#${p.type}#${target}`;
      const n = ordinals.get(key) ?? 0;
      ordinals.set(key, n + 1);
      const pinned = p.props.id;
      // An edge note's path is a stable id that no derived id can take.
      const id = typeof pinned === 'string' || typeof pinned === 'number' ? String(pinned) : file.from ? path : `${key}#${n}`;
      const edge: GraphEdge = {
        id,
        type: p.type,
        sign: p.sign,
        source,
        target,
        props: p.props,
        heading: p.heading,
        line: p.line,
      };
      if (file.from) edge.file = path;
      if (this.edgeMap.has(id)) {
        file.diagnostics.push({ path, line: p.line, column: 0, message: `Duplicate edge id '${id}' ignored`, code: 'edge-syntax' });
        this.releaseEndpoint(target);
        if (file.from) this.releaseEndpoint(source);
        continue;
      }
      this.edgeMap.set(id, edge);
      file.edgeIds.push(id);
      setAdd(this.out, source, id);
      setAdd(this.in, target, id);
      setAdd(this.incoming, target, path);
      if (file.from) setAdd(this.incoming, source, path);
    }
  }

  /**
   * Resolve one endpoint written in `path` to a node id, creating a stub when
   * it matches no note. Returns null, with a diagnostic, for an edge note.
   */
  // @tg: implements:: [[openspec:graph-model#Links to edge notes]]
  private endpoint(link: string, subpath: string | null, path: string, line: number, file: FileState): string | null {
    const sub = subpath ? this.resolveSub?.(link, subpath, path) : null;
    const resolved = sub && this.nodeMap.has(sub) ? sub : this.resolve(link, path);
    const ambiguous = resolved ? null : this.resolve.ambiguous?.(link, path);
    if (ambiguous) {
      file.diagnostics.push({ path, line, column: 0, message: `Ambiguous link '${link}' matches ${ambiguous.join(' and ')}; write the extension, e.g. [[${ambiguous[0]}]]`, code: 'ambiguous-link' });
    }
    if (resolved && (this.files.get(resolved)?.from !== undefined || this.incompleteEdgeNotes.has(resolved))) {
      file.diagnostics.push({ path, line, column: 0, message: `'${link}' is an edge note, not a node; no edge is created`, code: 'edge-note' });
      file.skipped.push(resolved);
      setAdd(this.incoming, resolved, path);
      return null;
    }
    return resolved ?? this.ensureStub(link);
  }

  /** Undo the stub reference `endpoint` took, if it made one. */
  private releaseEndpoint(id: string): void {
    if (this.stubRefs.has(id)) this.releaseStub(id);
  }

  private dropEdges(path: string): void {
    const file = this.files.get(path);
    if (!file) return;
    // Diagnostics added during edge building (duplicate ids, refused links) are rebuilt with the edges.
    file.diagnostics = file.diagnostics.filter((d) => !d.message.startsWith('Duplicate edge id') && !(d.code === 'edge-note' && d.message.includes('is an edge note')) && d.code !== 'ambiguous-link');
    for (const t of file.skipped) setDel(this.incoming, t, path);
    file.skipped = [];
    for (const id of file.edgeIds) {
      const e = this.edgeMap.get(id);
      if (!e) continue;
      this.edgeMap.delete(id);
      setDel(this.out, e.source, id);
      setDel(this.in, e.target, id);
      setDel(this.incoming, e.target, path);
      if (this.stubRefs.has(e.target)) this.releaseStub(e.target);
      if (e.file) {
        setDel(this.incoming, e.source, path);
        if (this.stubRefs.has(e.source)) this.releaseStub(e.source);
      }
    }
    file.edgeIds = [];
  }

  // @lat: [[graph-model#Nodes]]
  // @tg: implements:: [[openspec:graph-model#Stub nodes for unresolved links]]
  private ensureStub(link: string): string {
    const id = stubId(link);
    if (!this.stubRefs.has(id)) setAdd(this.stubsByName, nameKey(id), id);
    this.stubRefs.set(id, (this.stubRefs.get(id) ?? 0) + 1);
    if (!this.nodeMap.has(id)) {
      this.nodeMap.set(id, { id, labels: [], props: { title: titleOf(id), path: null }, stub: true });
    }
    return id;
  }

  // @tg: implements:: [[openspec:graph-model#Stub nodes for unresolved links]]
  private releaseStub(id: string): void {
    const n = (this.stubRefs.get(id) ?? 0) - 1;
    if (n > 0) {
      this.stubRefs.set(id, n);
      return;
    }
    this.stubRefs.delete(id);
    setDel(this.stubsByName, nameKey(id), id);
    if (this.nodeMap.get(id)?.stub) this.nodeMap.delete(id);
  }

  private emit(paths: Set<string>): void {
    const list = [...paths];
    for (const fn of this.listeners) fn(list);
  }
}

// @lat: [[graph-model#Node types]]
// @tg: implements:: [[openspec:graph-model#Frontmatter title]]
// @tg: implements:: [[openspec:graph-model#Node labels from frontmatter]]
export function labelsOf(frontmatter: Record<string, unknown> | null | undefined): string[] {
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
  // `types` is where an OKF export keeps the full list, since OKF's `type` is a single string.
  const raw = [...list(frontmatter?.type), ...list(frontmatter?.types)];
  return [...new Set(raw.filter((x): x is string | number => typeof x === 'string' || typeof x === 'number').map(String).map((s) => s.trim()).filter(Boolean))];
}

/** Frontmatter keys an edge note uses itself; all others become edge properties. */
const EDGE_NOTE_KEYS = new Set(['type', 'types', 'from', 'to', 'edgeType']);

/** A note whose frontmatter `type` is `edge`, or a list containing it. */
// @tg: implements:: [[openspec:graph-model#Edge notes]]
export function isEdgeNote(frontmatter: Record<string, unknown> | null | undefined): boolean {
  const t = frontmatter?.type;
  return (Array.isArray(t) ? t : [t]).some((x) => typeof x === 'string' && x.trim().toLowerCase() === 'edge');
}

const WIKILINK = /^\[\[([^\]|#]*)(?:#([^\]|]*))?(?:\|[^\]]*)?\]\]$/;
const MDLINK = /^\[[^\]]*\]\((.*)\)$/;

/**
 * Endpoint of an edge note from a frontmatter value: `[[X]]`, `[t](x.md)` or
 * bare link text. Unquoted `[[X]]` in YAML arrives as `[["X"]]` and is accepted.
 */
function endpointLink(v: unknown, sourcePath: string): { target: string; subpath: string | null } | null {
  while (Array.isArray(v) && v.length === 1) v = v[0];
  if (typeof v !== 'string' || !v.trim()) return null;
  const raw = v.trim();
  const wiki = WIKILINK.exec(raw);
  if (wiki) return wiki[1]!.trim() ? { target: wiki[1]!.trim(), subpath: wiki[2]?.trim() || null } : null;
  const md = MDLINK.exec(raw);
  if (md) return markdownTarget(md[1]!, sourcePath);
  return { target: raw, subpath: null };
}

function frontmatterTitle(frontmatter: Record<string, unknown> | null | undefined): string | null {
  const t = frontmatter?.title;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

export function titleOf(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.(?:md|adoc)$/, '');
}

/** Node id of a stub: the link text without a note extension. */
function stubId(link: string): string {
  return link.replace(/\.(?:md|adoc)$/, '');
}

/**
 * The file name a link or note path is matched by: last path segment, without a `#` fragment or note
 * extension, case-folded. A link and the note it resolves to always share it (resolution is by name or
 * by path suffix, case-insensitively); unrelated names may share it too, which only costs a re-resolve.
 */
function nameKey(id: string): string {
  const path = id.split('#')[0]!.trim();
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.(?:md|adoc)$/i, '').normalize('NFC').toLowerCase();
}

function setAdd<K, V>(m: Map<K, Set<V>>, k: K, v: V): void {
  let s = m.get(k);
  if (!s) m.set(k, (s = new Set()));
  s.add(v);
}
function setDel<K, V>(m: Map<K, Set<V>>, k: K, v: V): void {
  const s = m.get(k);
  if (!s) return;
  s.delete(v);
  if (s.size === 0) m.delete(k);
}
