import type { PropertySchema } from '@obsigraph/core';

/** How a property is edited in the details pane. */
export type FieldKind = 'text' | 'longtext' | 'number' | 'boolean' | 'date' | 'datetime' | 'list' | 'enum' | 'enum-list';

export interface FieldSpec {
  kind: FieldKind;
  /** Allowed values for `enum` and `enum-list`, as the schema lists them. */
  options: unknown[];
}

const LONG_TEXT = 80;

/**
 * Pick the editor of a property. The schema decides when it declares the property: an enum list gives
 * a dropdown (or checkboxes for a list property), a kind gives the matching input. Without a
 * declaration the current value's type decides.
 */
// @tg: implements:: [[visualization#Editable details]] {since: "2026-10-24"}
// @lat: [[visualization#Editable details]]
// @tg: implements:: [[openspec:graph-view#Editable details]] {since: "2026-10-24"}
export function fieldSpec(value: unknown, declared?: Pick<PropertySchema, 'kind' | 'many' | 'values'>): FieldSpec {
  if (declared?.values && declared.values.length > 0) {
    return { kind: declared.many || declared.kind === 'list' || Array.isArray(value) ? 'enum-list' : 'enum', options: declared.values };
  }
  if (declared?.many || declared?.kind === 'list' || Array.isArray(value)) return { kind: 'list', options: [] };
  if (declared?.kind === 'number' || typeof value === 'number') return { kind: 'number', options: [] };
  if (declared?.kind === 'boolean' || typeof value === 'boolean') return { kind: 'boolean', options: [] };
  if (declared?.kind === 'date') return { kind: 'date', options: [] };
  if (declared?.kind === 'datetime') return { kind: 'datetime', options: [] };
  const long = typeof value === 'string' && (value.includes('\n') || value.length > LONG_TEXT);
  return { kind: long ? 'longtext' : 'text', options: [] };
}

/** The text a text-like input starts with. */
export function formatInput(spec: FieldSpec, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (spec.kind === 'list') return Array.isArray(value) ? value.map(String).join(', ') : String(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** The enum options currently chosen, as the strings the controls use. */
export function chosenOptions(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

export type Coerced = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * Turn what the user entered into the value to write to the frontmatter. An empty entry becomes
 * `null` (an empty list for a list), which is how an empty property is written.
 */
export function coerceInput(spec: FieldSpec, raw: string | boolean | string[]): Coerced {
  const pick = (s: string): unknown => spec.options.find((o) => String(o) === s) ?? s;
  switch (spec.kind) {
    case 'boolean':
      return { ok: true, value: raw === true || raw === 'true' };
    case 'number': {
      const t = String(raw).trim();
      if (t === '') return { ok: true, value: null };
      const n = Number(t);
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: `"${t}" is not a number` };
    }
    case 'list': {
      const items = String(raw)
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      return { ok: true, value: items };
    }
    case 'enum-list':
      return { ok: true, value: (Array.isArray(raw) ? raw : [String(raw)]).filter(Boolean).map(pick) };
    case 'enum': {
      const s = String(raw);
      return { ok: true, value: s === '' ? null : pick(s) };
    }
    default: {
      const s = String(raw);
      return { ok: true, value: s.trim() === '' ? null : s };
    }
  }
}
