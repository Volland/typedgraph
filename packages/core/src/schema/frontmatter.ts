/** A closing fence starts at column 0; an indented `---` or `...` is content of a block scalar. */
const CLOSE = /^(?:---|\.\.\.)[ \t]*$/;

/** Split a note into its YAML frontmatter source and body. */
export function splitFrontmatter(text: string): { yaml: string | null; body: string } {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return { yaml: null, body: text };
  const close = lines.findIndex((l, i) => i > 0 && CLOSE.test(l));
  if (close < 0) return { yaml: null, body: text };
  return { yaml: lines.slice(1, close).join('\n'), body: lines.slice(close + 1).join('\n').replace(/^\n+/, '') };
}

/**
 * Serialize flat frontmatter values to YAML. Supports scalars and lists of
 * scalars, which is all a type template produces. With `emptyNull`, a null
 * value is written as an empty key (`born:`), a placeholder to fill in.
 */
export function toYaml(data: Record<string, unknown>, opts: { emptyNull?: boolean } = {}): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (v === null && opts.emptyNull) {
      out.push(`${key(k)}:`);
      continue;
    }
    if (Array.isArray(v)) {
      if (v.length === 0) out.push(`${key(k)}: []`);
      else out.push(`${key(k)}:`, ...v.map((x) => `  - ${scalar(x)}`));
    } else {
      out.push(`${key(k)}: ${scalar(v)}`);
    }
  }
  return out.join('\n');
}

/** A mapping key, quoted when it is not a plain word. */
export function key(k: string): string {
  return /^[\p{L}_][\p{L}\p{N}_ -]*$/u.test(k) && !k.endsWith(' ') ? k : JSON.stringify(k);
}

/** A scalar, quoted whenever YAML could read it as another type or as structure. */
export function scalar(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  // Quote anything YAML could read as another type or as structure.
  const plain = /^[\p{L}\p{N}_./ -]*$/u.test(s) && s.trim() === s && s !== '' &&
    !/^(true|false|null|yes|no|on|off|~|[-+]?\d[\d._]*([eE][-+]?\d+)?)$/i.test(s) && !s.startsWith('-');
  return plain ? s : JSON.stringify(s);
}
