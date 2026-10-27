import type { EdgeTypeSchema, TypeSchema } from '@obsigraph/core';

export interface SchemaInfo {
  properties: { name: string; type: string; cardinality: string; values: string[]; default: string | null }[];
  /** Edge types the type may have, with the types they may point at (null: any) and the cardinality (null: not declared by the type). */
  outgoing: { type: string; targets: string[] | null; cardinality: string | null }[];
  /** True when the schema lists no edge rules, so any edge type is allowed. */
  unrestricted: boolean;
  /** Edge types other types may point at this one with, and from which types (null: any). */
  incoming: { type: string; from: string[] | null }[];
}

const cardinality = (required: boolean, many: boolean): string => `${required ? '1' : '0'}..${many ? '*' : '1'}`;

const show = (v: unknown): string => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));

/**
 * What a type's schema declares, for the details pane: its properties with data type, cardinality, allowed
 * values and default, the edge types it may have with the types at the other end, and which other types may
 * point at it. Edge types come from the type's own edge rules, from the other types' rules and from the
 * `edgeTypes` declarations (`from` and `to`), wherever in the vault they are written.
 */
// @tg: implements:: [[visualization#Editable details]] {since: "2026-10-24"}
// @lat: [[visualization#Editable details]]
// @tg: implements:: [[openspec:graph-view#Editable details]] {since: "2026-10-24"}
export function schemaInfo(schema: TypeSchema, all: Iterable<TypeSchema>, edgeTypes: Iterable<EdgeTypeSchema> = []): SchemaInfo {
  const names = schema.type.split('+');
  const mine = (list: string[] | null): boolean => !!list && list.some((t) => names.includes(t));
  const declared = new Map<string, EdgeTypeSchema>();
  for (const e of edgeTypes) declared.set(e.type, e);

  const outgoing = new Map<string, { type: string; targets: string[] | null; cardinality: string | null }>();
  for (const r of schema.edges ?? []) outgoing.set(r.type, { type: r.type, targets: r.targets ?? declared.get(r.type)?.to ?? null, cardinality: cardinality(r.required, r.many) });
  // Edge types that name this type as a source; any source counts too when the type has no edge rules of its own.
  for (const e of declared.values()) {
    if (outgoing.has(e.type)) continue;
    if (mine(e.from) || (schema.edges === null && e.from === null)) outgoing.set(e.type, { type: e.type, targets: e.to, cardinality: null });
  }

  const incoming = new Map<string, Set<string> | null>();
  const add = (type: string, from: string | null) => {
    if (from === null) return void incoming.set(type, null);
    const set = incoming.get(type);
    if (set === null) return;
    incoming.set(type, (set ?? new Set<string>()).add(from));
  };
  for (const other of all) {
    for (const r of other.edges ?? []) if (mine(r.targets ?? declared.get(r.type)?.to ?? null)) add(r.type, other.type);
  }
  for (const e of declared.values()) {
    if (!mine(e.to)) continue;
    if (e.from === null) add(e.type, null);
    else for (const f of e.from) add(e.type, f);
  }

  return {
    properties: schema.properties.map((p) => ({
      name: p.name,
      type: p.values && p.values.length > 0 ? 'enum' : p.kind,
      cardinality: cardinality(p.required, p.many || p.kind === 'list'),
      values: (p.values ?? []).map(show),
      default: p.default === null || p.default === undefined || p.default === '' ? null : show(p.default),
    })),
    outgoing: [...outgoing.values()],
    unrestricted: schema.edges === null,
    incoming: [...incoming].map(([type, from]) => ({ type, from: from && [...from] })).sort((a, b) => a.type.localeCompare(b.type)),
  };
}
