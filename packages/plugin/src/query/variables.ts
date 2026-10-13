/**
 * Note variables for `graph-query` blocks: `{{path}}` in the Cypher text is replaced by a value
 * of the note holding the block, written as a Cypher literal, before the query is parsed.
 *
 * Only identifier lookups are supported (`path`, `title`, `fm.status`); nothing is evaluated.
 */

/** Values a query may reference. Frontmatter is reachable as `fm` or `frontmatter`. */
export type NoteContext = Record<string, unknown>;

const VARIABLE = /\{\{\s*([A-Za-z_][\w-]*(?:\.[\w-]+)*)\s*\}\}/g;

/** The variables of the note at `path`: `path`, `name`, `title` (name without extension), `folder`, `extension` and `fm`. */
export function noteContext(path: string, frontmatter?: Record<string, unknown> | null): NoteContext {
  const slash = path.lastIndexOf('/');
  const name = path.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  const fm = frontmatter ?? {};
  return {
    path,
    name,
    title: dot > 0 ? name.slice(0, dot) : name,
    folder: slash < 0 ? '' : path.slice(0, slash),
    extension: dot > 0 ? name.slice(dot + 1) : '',
    fm,
    frontmatter: fm,
  };
}

function lookup(ctx: NoteContext, ref: string): unknown {
  let cur: unknown = ctx;
  for (const seg of ref.split('.')) {
    if (seg === '__proto__' || typeof cur !== 'object' || cur === null || !Object.prototype.hasOwnProperty.call(cur, seg)) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** A Cypher literal for `value`: strings are quoted, numbers and booleans plain, lists of those a list, anything else `null`. */
function literal(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => (Array.isArray(v) ? 'null' : literal(v))).join(', ')}]`;
  return 'null';
}

/** Replace each `{{name}}` with the value's Cypher literal; a name that resolves to nothing becomes `null`. Text without `{{` is returned as is. */
export function substituteVariables(query: string, ctx: NoteContext): string {
  return query.replace(VARIABLE, (_m, ref: string) => literal(lookup(ctx, ref)));
}
