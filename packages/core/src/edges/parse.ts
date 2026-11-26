import { parseProps, PropsSyntaxError, type Props } from './props.js';
import { frontmatterClose } from '../schema/frontmatter.js';

export type Sign = 1 | -1;

export interface ParsedEdge {
  /** Edge type with any sign prefix stripped. */
  type: string;
  sign: Sign;
  /** Link path as written, without `#subpath` or `|alias`. */
  target: string;
  subpath: string | null;
  alias: string | null;
  props: Props;
  /** Zero-based line number in the note. */
  line: number;
  /** Nearest preceding heading text, or null at top level. */
  heading: string | null;
}

export interface Diagnostic {
  path: string | null;
  line: number;
  column: number;
  message: string;
  /** Stable finding code such as `edge-syntax` or a TGS diagnostic name; see `severityOf`. */
  code?: string;
}

export interface ParseResult {
  edges: ParsedEdge[];
  diagnostics: Diagnostic[];
}

export interface ParseOptions {
  /** Also turn plain links in prose into untyped `links_to` edges, as OKF consumers read them. */
  linkEdges?: boolean;
  /**
   * Also turn links in frontmatter property values into edges typed by the property name, so
   * `requirement: "[[Login]]"` reads as `requirement:: [[Login]]`. See `frontmatterEdges`.
   */
  frontmatterEdges?: boolean;
}

/** Edge type given to plain links when link edges are on. */
export const LINK_EDGE_TYPE = 'links_to';

// Optional list marker or blockquote, optional sign, type, `::`, then the value.
const EDGE_LINE = /^\s*(?:(?:[-*+]|\d+[.)])\s+|>\s*)*([+-]?)([\p{L}_][\p{L}\p{N}_-]*)::\s*(.*)$/u;
const LINK = /\[\[([^\]|#]*)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/y;
// `[text](dest)` or `[text](<dest with spaces>)`, with an optional title.
const MD_LINK = /\[((?:[^[\]]|\[[^\]]*\])*)\]\(\s*(<[^>\n]*>|[^)\s]*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/y;
const PROSE_LINK = /(!?)(?:\[\[([^\]|#\r\n]*)(?:#([^\]|\r\n]*))?(?:\|([^\]\r\n]*))?\]\]|\[((?:[^[\]\r\n]|\[[^\]\r\n]*\])*)\]\(\s*(<[^>\n]*>|[^)\s]*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\))/g;
const INLINE_CODE = /(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/**
 * Extract typed, signed edges from a note body.
 *
 * Recognized form: `[+-]?type:: [[Target]] {props}`; several comma-separated
 * links share the type and props. Lines in fenced code or frontmatter are skipped.
 */
// @lat: [[edge-syntax#Inline edge form]]
// @tg: implements:: [[openspec:edge-parsing#Inline edge form]]
// @tg: implements:: [[openspec:edge-parsing#Links in property values]]
// @tg: implements:: [[openspec:edge-parsing#Malformed property blocks]]
// @tg: implements:: [[openspec:edge-parsing#Markdown link targets]]
// @tg: implements:: [[openspec:edge-parsing#Non-edge text is ignored]]
// @tg: implements:: [[openspec:edge-parsing#Sign prefix]]
// @tg: implements:: [[openspec:edge-parsing#Source heading is recorded]]
// @tg: implements:: [[openspec:edge-parsing#Weight is independent of sign]]
export function parseEdges(text: string, path: string | null = null, options: ParseOptions = {}): ParseResult {
  const edges: ParsedEdge[] = [];
  const diagnostics: Diagnostic[] = [];
  const lines = text.split(/\r?\n/);

  let fence: string | null = null;
  let heading: string | null = null;
  let start = 0;

  // Skip YAML frontmatter.
  const fmClose = frontmatterClose(lines);
  if (fmClose > 0) start = fmClose + 1;

  for (let n = start; n < lines.length; n++) {
    const line = lines[n]!;

    const f = FENCE.exec(line);
    if (f) {
      if (fence === null) fence = f[1]!;
      else if (f[1] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const h = HEADING.exec(line);
    if (h) {
      heading = h[2]!;
      continue;
    }

    const m = EDGE_LINE.exec(line);
    const links = m ? scanLinks(m[3]!, path) : null;
    if (!m || !links || links.links.length === 0) {
      if (options.linkEdges) edges.push(...proseLinks(line, path, n, heading));
      continue;
    }

    const [, signChar, type, value] = m as unknown as [string, string, string, string];
    const valueStart = line.length - value.length;

    let props: Props = {};
    let rest = value.slice(links.end).trimStart();
    if (rest.startsWith('{')) {
      const restOffset = value.length - rest.length;
      try {
        props = parseProps(rest).props;
      } catch (err) {
        if (!(err instanceof PropsSyntaxError)) throw err;
        diagnostics.push({
          path,
          line: n,
          column: valueStart + restOffset + err.offset,
          message: `Malformed edge property block: ${err.message}`,
          code: 'edge-syntax',
        });
      }
    }

    // @lat: [[edge-syntax#Sign]]
    const sign: Sign = signChar === '-' ? -1 : 1;
    for (const link of links.links) {
      edges.push({ type, sign, ...link, props: { ...props }, line: n, heading });
    }
  }

  return { edges, diagnostics };
}

type LinkParts = Pick<ParsedEdge, 'target' | 'subpath' | 'alias'>;

function scanLinks(value: string, path: string | null): {
  links: LinkParts[];
  end: number;
} {
  const links: LinkParts[] = [];
  let i = 0;
  for (;;) {
    while (value[i] === ' ' || value[i] === '\t') i++;
    LINK.lastIndex = i;
    MD_LINK.lastIndex = i;
    const m = LINK.exec(value);
    if (m) {
      const target = m[1]!.trim();
      if (target) links.push({ target, subpath: m[2]?.trim() || null, alias: m[3]?.trim() || null });
      i = LINK.lastIndex;
    } else {
      const md = MD_LINK.exec(value);
      if (!md) break;
      const link = markdownTarget(md[2]!, path);
      if (link) links.push({ ...link, alias: md[1]!.trim() || null });
      i = MD_LINK.lastIndex;
    }
    let j = i;
    while (value[j] === ' ' || value[j] === '\t') j++;
    if (value[j] !== ',') break;
    i = j + 1;
  }
  return { links, end: i };
}

/** Properties whose links never become edges: Obsidian's own and the note's type. */
export const FRONTMATTER_EDGE_SKIP: ReadonlySet<string> = new Set(['tags', 'aliases', 'cssclasses', 'type', 'types']);

/**
 * Edges for the links in a note's frontmatter: each property whose value is, or lists, a wikilink
 * or markdown link yields one edge per link, typed by the property name and recorded at line 0
 * with no heading. Values without links (text, numbers, `[[]]` placeholders) yield nothing, and
 * so do `tags`, `aliases`, `cssclasses`, `type` and `types`.
 */
// @lat: [[edge-syntax#Frontmatter edges]]
// @tg: implements:: [[openspec:edge-parsing#Frontmatter link edges]]
export function frontmatterEdges(frontmatter: Record<string, unknown> | null | undefined, path: string | null = null): ParsedEdge[] {
  const edges: ParsedEdge[] = [];
  for (const [type, value] of Object.entries(frontmatter ?? {})) {
    if (FRONTMATTER_EDGE_SKIP.has(type)) continue;
    for (const v of Array.isArray(value) ? value.flat(Infinity) : [value]) {
      if (typeof v !== 'string') continue;
      for (const link of scanLinks(v, path).links) edges.push({ type, sign: 1, ...link, props: {}, line: 0, heading: null });
    }
  }
  return edges;
}

/**
 * Normalize a markdown link destination to a vault path with `.md`: percent
 * escapes decoded, `#anchor` split off, `./` and `../` resolved against the
 * source note's folder, a leading `/` meaning the vault root. Null for URLs
 * with a scheme, pure anchors and links to files that are not notes.
 */
// @lat: [[edge-syntax#Markdown link targets]]
// @tg: implements:: [[openspec:edge-parsing#Markdown link targets]]
export function markdownTarget(dest: string, sourcePath: string | null): { target: string; subpath: string | null } | null {
  let raw = dest.trim();
  if (raw.startsWith('<') && raw.endsWith('>')) raw = raw.slice(1, -1).trim();
  if (!raw || SCHEME.test(raw)) return null;
  const hash = raw.indexOf('#');
  const pathPart = hash === -1 ? raw : raw.slice(0, hash);
  const anchor = hash === -1 ? null : raw.slice(hash + 1);
  if (!pathPart || pathPart.endsWith('/')) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    decoded = pathPart;
  }
  const base = decoded.slice(decoded.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  if (dot > 0 && !['.md', '.adoc'].includes(base.slice(dot).toLowerCase())) return null;
  const segments: string[] = [];
  if (!decoded.startsWith('/') && sourcePath?.includes('/')) segments.push(...sourcePath.slice(0, sourcePath.lastIndexOf('/')).split('/'));
  for (const seg of decoded.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') segments.pop();
    else segments.push(seg);
  }
  if (!segments.length) return null;
  const target = segments.join('/');
  let sub: string | null = null;
  if (anchor) {
    try {
      sub = decodeURIComponent(anchor).trim() || null;
    } catch {
      sub = anchor.trim() || null;
    }
  }
  return { target: dot > 0 ? target : `${target}.md`, subpath: sub };
}

/** Plain wikilinks and markdown links to notes in a prose line, as untyped edges; images and code spans are skipped. */
// @lat: [[graph-model#Plain link edges]]
// @tg: implements:: [[openspec:graph-model#Plain link edges]]
function proseLinks(line: string, path: string | null, n: number, heading: string | null): ParsedEdge[] {
  const text = line.replace(INLINE_CODE, (c) => ' '.repeat(c.length));
  const out: ParsedEdge[] = [];
  for (const m of text.matchAll(PROSE_LINK)) {
    if (m[1]) continue;
    let link: LinkParts | null = null;
    if (m[5] === undefined) {
      const target = m[2]?.trim();
      if (target) link = { target, subpath: m[3]?.trim() || null, alias: m[4]?.trim() || null };
    } else {
      const t = markdownTarget(m[6]!, path);
      if (t) link = { ...t, alias: m[5].trim() || null };
    }
    if (link) out.push({ type: LINK_EDGE_TYPE, sign: 1, ...link, props: {}, line: n, heading });
  }
  return out;
}
