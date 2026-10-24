import type { TypeSchema } from '@obsigraph/core';

export interface SchemaInfo {
  properties: { name: string; type: string; cardinality: string }[];
  /** Edge types the type may have, with the types they may point at (null: any, or no edge rules at all). */
  outgoing: { type: string; targets: string[] | null; cardinality: string }[];
  /** True when the schema lists no edge rules, so any edge type is allowed. */
  unrestricted: boolean;
  /** Edge types other types may point at this one with, and from which types. */
  incoming: { type: string; from: string[] }[];
}

const cardinality = (required: boolean, many: boolean): string => `${required ? '1' : '0'}..${many ? '*' : '1'}`;

/**
 * What a type's schema declares, for the details pane: its properties with data type and cardinality,
 * the edge types it may have with the types at the other end, and which other types may point at it.
 */
// @tg: implements:: [[visualization#Editable details]] {since: "2026-10-24"}
// @lat: [[visualization#Editable details]]
// @tg: implements:: [[openspec:graph-view#Editable details]] {since: "2026-10-24"}
export function schemaInfo(schema: TypeSchema, all: Iterable<TypeSchema>): SchemaInfo {
  const names = schema.type.split('+');
  const incoming = new Map<string, Set<string>>();
  for (const other of all) {
    for (const r of other.edges ?? []) {
      if (r.targets && r.targets.some((t) => names.includes(t))) {
        const from = incoming.get(r.type) ?? new Set<string>();
        from.add(other.type);
        incoming.set(r.type, from);
      }
    }
  }
  return {
    properties: schema.properties.map((p) => ({
      name: p.name,
      type: p.values && p.values.length > 0 ? `enum (${p.values.join(', ')})` : p.kind,
      cardinality: cardinality(p.required, p.many || p.kind === 'list'),
    })),
    outgoing: (schema.edges ?? []).map((r) => ({ type: r.type, targets: r.targets, cardinality: cardinality(r.required, r.many) })),
    unrestricted: schema.edges === null,
    incoming: [...incoming].map(([type, from]) => ({ type, from: [...from] })).sort((a, b) => a.type.localeCompare(b.type)),
  };
}
