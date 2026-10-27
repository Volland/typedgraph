import { markdownTarget, type Graph, type GraphEdge, type GraphNode, type ResolvedEdgeStyle, type ResolvedNodeStyle } from '@obsigraph/core';
import { nodeCaption, nodeElement, type EdgeElement, type GraphElements } from './elements';

/** A node, its incident edges in both directions, and its direct neighbors. */
// @tg: implements:: [[visualization#Surfaces]] {since: "2026-10-04"}
// @lat: [[visualization#Surfaces]]
// @tg: implements:: [[openspec:graph-ui#Neighborhood view-state]]
export function neighborhood(graph: Graph, id: string): GraphElements {
  const center = graph.node(id);
  if (!center) return edgeNoteNeighborhood(graph, id);
  const nodes = new Map([[id, nodeElement(center)]]);
  const edges: EdgeElement[] = [];
  for (const e of [...graph.outEdges(id), ...graph.inEdges(id)]) {
    const otherId = e.source === id ? e.target : e.source;
    const other = graph.node(otherId);
    if (!other) continue;
    if (!nodes.has(otherId)) nodes.set(otherId, nodeElement(other));
    if (!edges.some((x) => x.id === e.id)) edges.push(edgeElement(e));
  }
  return { nodes: [...nodes.values()], edges };
}

export interface ProjectElements {
  elements: GraphElements;
  /** Nodes in the graph, whether drawn or not. */
  total: number;
  /** Nodes left out by the limit. */
  omitted: number;
}

/**
 * Every node and edge of the graph. Over `limit` nodes it keeps the most connected ones
 * (ties by id, so the choice is stable) and only the edges between them.
 */
// @tg: implements:: [[vscode#Whole project graph]] {since: "2026-10-14"}
// @lat: [[vscode#Whole project graph]]
// @tg: implements:: [[openspec:vscode-extension#Whole project graph]]
export function projectElements(graph: Graph, limit: number): ProjectElements {
  const all = [...graph.nodes()];
  let kept = all;
  if (all.length > limit) {
    const degree = new Map(all.map((n) => [n.id, 0]));
    for (const e of graph.edges()) {
      if (degree.has(e.source)) degree.set(e.source, degree.get(e.source)! + 1);
      if (degree.has(e.target)) degree.set(e.target, degree.get(e.target)! + 1);
    }
    kept = [...all].sort((a, b) => degree.get(b.id)! - degree.get(a.id)! || (a.id < b.id ? -1 : 1)).slice(0, Math.max(0, limit));
  }
  const ids = new Set(kept.map((n) => n.id));
  const edges: EdgeElement[] = [];
  for (const e of graph.edges()) if (ids.has(e.source) && ids.has(e.target)) edges.push(edgeElement(e));
  return { elements: { nodes: kept.map(nodeElement), edges }, total: all.length, omitted: all.length - kept.length };
}

/** An edge note is drawn as the edge it declares, between its endpoints. */
// @lat: [[edge-syntax#Edge notes]]
// @tg: implements:: [[openspec:graph-ui#Edge note neighborhood]]
function edgeNoteNeighborhood(graph: Graph, path: string): GraphElements {
  const nodes = new Map<string, GraphElements['nodes'][number]>();
  const edges: EdgeElement[] = [];
  for (const e of graph.declaredEdges(path)) {
    if (e.file !== path) continue;
    for (const end of [e.source, e.target]) {
      const n = graph.node(end);
      if (n && !nodes.has(end)) nodes.set(end, nodeElement(n));
    }
    edges.push(edgeElement(e));
  }
  return { nodes: [...nodes.values()], edges };
}

/** Union of element sets; the first occurrence of an id wins. */
// @tg: implements:: [[openspec:graph-ui#Neighborhood view-state]]
export function mergeElements(...sets: GraphElements[]): GraphElements {
  const nodes = new Map<string, GraphElements['nodes'][number]>();
  const edges = new Map<string, EdgeElement>();
  for (const s of sets) {
    for (const n of s.nodes) if (!nodes.has(n.id)) nodes.set(n.id, n);
    for (const e of s.edges) if (!edges.has(e.id)) edges.set(e.id, e);
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

export interface Details {
  title: string;
  rows: [string, string][];
  /**
   * Keys of rows that describe the graph rather than the note: labels, stub flag, path, style
   * origins, edge sign, id and heading, and properties the schema does not declare.
   */
  technical: ReadonlySet<string>;
  /** Property values as written, by row key, so links in them can be drawn as links. */
  values: Readonly<Record<string, unknown>>;
  /** Note that relative links in `values` resolve from, or null. */
  source: string | null;
}

/** A piece of a property value: plain text or a link to a note. */
export type ValuePart = { text: string } | { link: { target: string; subpath: string | null; label: string } };

// `[[Target#Sub|alias]]` or `[text](dest)`; same shapes the edge parser reads.
const VALUE_LINK = /\[\[([^\]|#\r\n]*)(?:#([^\]|\r\n]*))?(?:\|([^\]\r\n]*))?\]\]|\[((?:[^[\]\r\n]|\[[^\]\r\n]*\])*)\]\(\s*(<[^>\n]*>|[^)\s]*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;

/**
 * Split a property value into lines of text and link parts: a list gives one line per item, a
 * string with links gives text and link parts, anything else gives its plain text. An empty
 * `[[]]` and a markdown link that is not a note stay text.
 */
// @tg: implements:: [[visualization#Details panel]] {since: "2026-10-13"}
// @lat: [[visualization#Details panel]]
// @tg: implements:: [[openspec:graph-view#Details panel]]
export function valueLines(value: unknown, source: string | null = null): ValuePart[][] {
  if (Array.isArray(value)) return value.length ? value.flat(Infinity).map((v) => valueParts(v, source)) : [[{ text: '[]' }]];
  return [valueParts(value, source)];
}

function valueParts(v: unknown, source: string | null): ValuePart[] {
  if (typeof v !== 'string') return [{ text: show(v) }];
  const parts: ValuePart[] = [];
  let last = 0;
  for (const m of v.matchAll(VALUE_LINK)) {
    const link =
      m[4] === undefined
        ? m[1]!.trim()
          ? { target: m[1]!.trim(), subpath: m[2]?.trim() || null, label: m[3]?.trim() || m[1]!.trim() }
          : null
        : (() => {
            const t = markdownTarget(m[5]!, source);
            return t ? { ...t, label: m[4]!.trim() || t.target } : null;
          })();
    if (!link) continue;
    if (m.index! > last) parts.push({ text: v.slice(last, m.index) });
    parts.push({ link });
    last = m.index! + m[0].length;
  }
  if (last < v.length) parts.push({ text: v.slice(last) });
  return parts.length ? parts : [{ text: v }];
}

/** Properties that always count as note properties, even when a schema does not declare them. */
const NOTE_KEYS = new Set(['type', 'types', 'aliases', 'alias', 'tags', 'tag', 'path']);

const isTechnical = (key: string, declared: ReadonlySet<string> | undefined): boolean => !!declared && !declared.has(key) && !NOTE_KEYS.has(key);

/** Rows naming each resolved style attribute and the source that supplied it. */
// @tg: implements:: [[visualization#Styling]] {since: "2026-10-04"}
// @lat: [[visualization#Styling]]
export function styleRows(style: ResolvedNodeStyle | ResolvedEdgeStyle): [string, string][] {
  return Object.entries(style.origin).map(([attr, origin]) => {
    const value = (style as unknown as Record<string, unknown>)[attr];
    return [`style.${attr}`, `${value ?? '—'} · ${origin}`];
  });
}

/**
 * Rows for a selected node. `declared` names the properties the node's schema declares: the rest
 * are technical. Without it every property of the note counts as a note property.
 */
// @tg: implements:: [[openspec:graph-view#Selection details]]
// @tg: implements:: [[openspec:graph-view#Details panel]]
export function nodeDetails(n: GraphNode, style?: ResolvedNodeStyle, declared?: ReadonlySet<string>): Details {
  const rows: [string, string][] = [
    ['labels', n.labels.join(', ') || '—'],
    ['stub', String(n.stub)],
  ];
  const technical = new Set(['labels', 'stub']);
  const values: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n.props)) {
    if (k === 'title') continue;
    rows.push([k, show(v)]);
    values[k] = v;
    if (isTechnical(k, declared)) technical.add(k);
  }
  if (style) for (const r of styleRows(style)) (rows.push(r), technical.add(r[0]));
  return { title: nodeCaption(n), rows, technical, values, source: n.stub ? null : n.id };
}

/** Rows for a selected edge; `declared` names the edge type's declared properties, as for `nodeDetails`. */
// @tg: implements:: [[openspec:graph-view#Selection details]]
// @tg: implements:: [[openspec:graph-view#Details panel]]
export function edgeDetails(e: GraphEdge, graph: Graph, style?: ResolvedEdgeStyle, declared?: ReadonlySet<string>): Details {
  const title = (id: string) => {
    const n = graph.node(id);
    return n ? nodeCaption(n) : id;
  };
  const rows: [string, string][] = [
    ['type', e.type],
    ['sign', e.sign < 0 ? '-1 (negative)' : '+1'],
    ['id', e.id],
    ['from', title(e.source)],
    ['to', title(e.target)],
  ];
  const technical = new Set(['sign', 'id']);
  const values: Record<string, unknown> = {};
  if (e.file) (rows.push(['note', e.file]), technical.add('note'));
  if (e.heading) (rows.push(['heading', e.heading]), technical.add('heading'));
  for (const [k, v] of Object.entries(e.props)) {
    if (k === 'id') continue;
    rows.push([k, show(v)]);
    values[k] = v;
    if (isTechnical(k, declared)) technical.add(k);
  }
  if (style) for (const r of styleRows(style)) (rows.push(r), technical.add(r[0]));
  return { title: `${title(e.source)} ${e.sign < 0 ? '−' : ''}${e.type} → ${title(e.target)}`, rows, technical, values, source: e.file ?? e.source };
}

function edgeElement(e: GraphEdge): EdgeElement {
  return { id: e.id, source: e.source, target: e.target, type: e.type, sign: e.sign };
}

function show(v: unknown): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}
