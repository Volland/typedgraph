import type { GraphElements, NodeElement } from './elements';

/** Value key of a property that is missing, null, blank or an empty list. */
export const EMPTY_VALUE = '(empty)';
/** Type name of nodes without a label, such as stubs. */
export const UNTYPED = '(no type)';
/** Properties with more distinct values than this are not offered as filters, unless one is already set. */
export const MAX_FILTER_VALUES = 60;

/** True for null, undefined, blank text, an empty list and an object without entries. */
export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.every(isEmptyValue);
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

/** The keys a value counts as for filtering: each item of a list on its own, `EMPTY_VALUE` for an empty one. */
export function valueKeys(v: unknown): string[] {
  if (isEmptyValue(v)) return [EMPTY_VALUE];
  if (Array.isArray(v)) return [...new Set(v.filter((x) => !isEmptyValue(x)).map(keyOf))];
  return [keyOf(v)];
}

function keyOf(v: unknown): string {
  return typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
}

/** The types of a node: its labels, or `UNTYPED`. */
export function typesOf(n: Pick<NodeElement, 'labels'>): string[] {
  return n.labels.length > 0 ? n.labels : [UNTYPED];
}

/**
 * What the user filtered out of a graph: whole node types, and per type the values a property must have.
 * A node is visible unless one of its types is hidden or fails a value filter. For one type, a property's
 * accepted values are alternatives (any one will do) and the properties of that type all have to pass.
 */
// @tg: implements:: [[visualization#Graph view filters]] {since: "2026-10-24"}
// @lat: [[visualization#Graph view filters]]
// @tg: implements:: [[openspec:graph-view#Graph view filters]] {since: "2026-10-24"}
export class ViewFilters {
  readonly hiddenTypes = new Set<string>();
  private readonly values = new Map<string, Map<string, Set<string>>>();

  get active(): boolean {
    return this.hiddenTypes.size > 0 || this.values.size > 0;
  }

  setTypeHidden(type: string, hidden: boolean): void {
    if (hidden) this.hiddenTypes.add(type);
    else this.hiddenTypes.delete(type);
  }

  /** Accepted values of a property for a type; an empty list removes the filter. */
  setValues(type: string, prop: string, accepted: Iterable<string>): void {
    const set = new Set(accepted);
    const props = this.values.get(type) ?? new Map<string, Set<string>>();
    if (set.size > 0) props.set(prop, set);
    else props.delete(prop);
    if (props.size > 0) this.values.set(type, props);
    else this.values.delete(type);
  }

  acceptedValues(type: string, prop: string): ReadonlySet<string> {
    return this.values.get(type)?.get(prop) ?? new Set();
  }

  /** Types that have value filters, with how many properties are filtered. */
  filteredProperties(type: string): string[] {
    return [...(this.values.get(type)?.keys() ?? [])];
  }

  clear(): void {
    this.hiddenTypes.clear();
    this.values.clear();
  }

  visible(n: Pick<NodeElement, 'labels' | 'props'>): boolean {
    for (const type of typesOf(n)) {
      if (this.hiddenTypes.has(type)) return false;
      const props = this.values.get(type);
      if (!props) continue;
      for (const [prop, accepted] of props) if (!valueKeys(n.props[prop]).some((k) => accepted.has(k))) return false;
    }
    return true;
  }
}

/** The elements without the removed nodes and the nodes the filters hide, and without the edges that lost an end. */
// @tg: implements:: [[visualization#Graph view filters]] {since: "2026-10-24"}
// @lat: [[visualization#Graph view filters]]
export function applyFilters(g: GraphElements, filters: ViewFilters, removed: ReadonlySet<string>): GraphElements {
  if (removed.size === 0 && !filters.active) return g;
  const nodes = g.nodes.filter((n) => !removed.has(n.id) && filters.visible(n));
  const keep = new Set(nodes.map((n) => n.id));
  return { nodes, edges: g.edges.filter((e) => keep.has(e.source) && keep.has(e.target)) };
}

/** Distinct nodes joined to `id` by an edge, in either direction, not counting `id` itself. */
export function neighborIds(g: GraphElements, id: string): Set<string> {
  const out = new Set<string>();
  for (const e of g.edges) {
    if (e.source === id && e.target !== id) out.add(e.target);
    else if (e.target === id && e.source !== id) out.add(e.source);
  }
  return out;
}

/** The neighbors of `id` that have no other neighbor in the graph: the ones that hang off it alone. */
// @tg: implements:: [[visualization#Remove and collapse]] {since: "2026-10-24"}
// @lat: [[visualization#Remove and collapse]]
// @tg: implements:: [[openspec:graph-view#Remove and collapse]] {since: "2026-10-24"}
export function collapseTargets(g: GraphElements, id: string): string[] {
  const adj = adjacency(g);
  return [...(adj.get(id) ?? [])].filter((n) => [...(adj.get(n) ?? [])].every((m) => m === id));
}

/** `id` and the nodes that hang off it alone: what "remove from view" takes out. */
// @tg: implements:: [[visualization#Remove and collapse]] {since: "2026-10-24"}
// @lat: [[visualization#Remove and collapse]]
export function removalTargets(g: GraphElements, id: string): string[] {
  return [id, ...collapseTargets(g, id)];
}

function adjacency(g: GraphElements): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const n of g.nodes) adj.set(n.id, new Set());
  for (const e of g.edges) {
    if (e.source === e.target) continue;
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }
  return adj;
}

/** Node types in the graph with how many nodes each has, most first. */
export function typeCounts(g: GraphElements): { type: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const n of g.nodes) for (const t of typesOf(n)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

/**
 * For the nodes of a type: each property with the values it has and how many nodes have each, so a
 * filter can offer them. Properties with only empty values, or with more than `MAX_FILTER_VALUES`
 * distinct ones, are left out unless `keep` names them.
 */
export function propertyValues(g: GraphElements, type: string, keep: readonly string[] = []): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  const seen = new Map<string, number>();
  let total = 0;
  for (const n of g.nodes) {
    if (!typesOf(n).includes(type)) continue;
    total++;
    for (const [prop, v] of Object.entries(n.props)) {
      const counts = out.get(prop) ?? new Map<string, number>();
      for (const k of valueKeys(v)) counts.set(k, (counts.get(k) ?? 0) + 1);
      out.set(prop, counts);
      seen.set(prop, (seen.get(prop) ?? 0) + 1);
    }
  }
  // A node without the property counts as having it empty, as the filter treats it.
  for (const [prop, counts] of out) {
    const missing = total - (seen.get(prop) ?? 0);
    if (missing > 0) counts.set(EMPTY_VALUE, (counts.get(EMPTY_VALUE) ?? 0) + missing);
  }
  for (const [prop, counts] of out) {
    if (keep.includes(prop)) continue;
    const onlyEmpty = counts.size === 1 && counts.has(EMPTY_VALUE);
    if (onlyEmpty || counts.size > MAX_FILTER_VALUES) out.delete(prop);
  }
  return out;
}
