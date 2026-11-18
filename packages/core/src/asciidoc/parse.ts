import { parseEdges, type Diagnostic, type ParsedEdge, LINK_EDGE_TYPE } from '../edges/parse.js';
import type { Props } from '../edges/props.js';
import { frontmatterClose, splitFrontmatter } from '../schema/frontmatter.js';
import { oneLineYaml, parseMapping, type YamlParser } from './meta.js';
import { scanLines, type ScannedLine } from './scan.js';

export interface AsciidocOptions {
  /** YAML parser for the leading block and `:tg-*:` values; without one a small flat-YAML reader is used. */
  parseYaml?: YamlParser;
  /** Also turn `xref:` and `<<…>>` references into `links_to` edges. */
  linkEdges?: boolean;
}

export interface AsciidocSection {
  /** `<path>#<H1>#<H2>`, the heading-path id. */
  id: string;
  heading: string;
  headingPath: string[];
  /** 1 for `==`, up to 5 for `======`. */
  level: number;
  /** Zero-based first line (the heading) and last line, inclusive. */
  startLine: number;
  endLine: number;
  /** Ids that resolve to this section: the explicit ids, or else the one Asciidoctor generates. */
  aliases: string[];
}

export interface AsciidocInclude {
  /** Path as written after attribute substitution. */
  path: string;
  /** Path relative to the project root, or null when the include is unresolved. */
  target: string | null;
  order: number;
  leveloffset?: string;
  tags?: string;
  lines?: string;
  line: number;
}

export interface AsciidocXref {
  /** Target as written. */
  raw: string;
  /** Resolved file path, or null for a reference inside the same file. */
  file: string | null;
  /** Fragment (section id), or null. */
  fragment: string | null;
  text: string | null;
  line: number;
}

export interface AsciidocChunk {
  headingPath: string[];
  /** Reader-visible text of the section, without its heading. */
  text: string;
}

export interface AsciidocParse {
  /** Merged properties: the leading block wins over `:tg-*:` attributes. Null when there are none. */
  meta: Record<string, unknown> | null;
  /** One-line error when the leading block is not valid YAML. */
  metaError: string | null;
  /** Keys set by both the leading block and an attribute with different values. */
  conflicts: string[];
  /** The document title (`= Title`), or null. */
  title: string | null;
  sections: AsciidocSection[];
  edges: ParsedEdge[];
  includes: AsciidocInclude[];
  xrefs: AsciidocXref[];
  chunks: AsciidocChunk[];
  warnings: Diagnostic[];
}

/** Format of a note file by extension; anything but `.adoc` is Markdown. */
export type NoteFormat = 'md' | 'adoc';
export function noteFormat(path: string): NoteFormat {
  return /\.adoc$/i.test(path) ? 'adoc' : 'md';
}

/**
 * Properties of a note as its host hands them to the graph: the parsed YAML frontmatter of a Markdown note,
 * or the merged leading comment block and `:tg-*:` attributes of an AsciiDoc note. `error` is a one-line
 * message when the YAML is invalid.
 */
// @tg: implements:: [[openspec:node-vault-loader#Read a note read-only]] {confidence: partial}
export function noteFrontmatter(path: string, text: string, parseYaml?: YamlParser): { frontmatter: Record<string, unknown> | null; error: string | null } {
  if (noteFormat(path) === 'adoc') {
    const r = parseAsciidoc(text, path, { parseYaml });
    return { frontmatter: r.meta, error: r.metaError };
  }
  const { yaml } = splitFrontmatter(text);
  if (yaml === null) return { frontmatter: null, error: null };
  try {
    return { frontmatter: parseMapping(yaml, parseYaml), error: null };
  } catch (e) {
    return { frontmatter: null, error: (e as Error).message };
  }
}

const EDGE_PREFIX = /^\/\/\s*@tg:\s*(.*)$/;
const VISIBLE_EDGE = /^\s*(?:[-*+]\s+)?[+-]?[\p{L}_][\p{L}\p{N}_-]*::\s*\[\[/u;
const XREF = /xref:([^\s[\]]+)\[([^\]]*)\]/g;
const SHORT_XREF = /<<([^,>\s][^,>]*?)(?:,\s*([^>]*))?>>/g;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Remove inline markup and entities the way Asciidoctor's title conversion does before it builds an id. */
function plainTitle(title: string): string {
  let t = title.replace(/\[\[[^\]]*\]\]/g, '').replace(/<[^>]+>/g, '');
  t = t.replace(/(\*\*|__|``|##)(.+?)\1/g, '$2');
  t = t.replace(/(^|[^\w])(\*|_|`|#)(\S(?:.*?\S)?)\2(?!\w)/g, '$1$3');
  t = t.replace(/\b(?:link|xref):\S*\[([^\]]*)\]/g, '$1').replace(/<<[^,>]*,\s*([^>]*)>>/g, '$1');
  return t.trim();
}

/** Generated section id as Asciidoctor builds it from a title, prefix and separator. */
// @tg: implements:: [[openspec:asciidoc-notes#Sections and id aliases]] {confidence: partial}
export function generateId(title: string, prefix: string, separator: string, taken: ReadonlySet<string>): string {
  let id = `${prefix}${plainTitle(title).toLowerCase().replace(/&(?:[a-z][a-z]+\d{0,2}|#\d{2,5}|#x[\da-f]{2,4});/gi, '').replace(/[^\p{L}\p{N}_ .-]+/gu, '')}`;
  if (separator === '') {
    id = id.replace(/ /g, '');
  } else {
    const set = separator === '-' || separator === '.' ? ' .-' : ` ${separator}.-`;
    const chars = set.split('').map((c) => c.replace(/[\\\]^-]/g, '\\$&')).join('');
    id = id.replace(new RegExp(`[${chars}]+`, 'g'), separator);
    if (id.endsWith(separator)) id = id.slice(0, -1);
    if (prefix === '' && id.startsWith(separator)) id = id.slice(1);
  }
  if (!taken.has(id)) return id;
  let n = 2;
  while (taken.has(`${id}${separator}${n}`)) n++;
  return `${id}${separator}${n}`;
}

interface BlockAttrs {
  ids: string[];
  discrete: boolean;
}

/** Ids and style from a `[...]` block attribute line: `[#id]`, `[discrete#id.role]`, `[id=x]`, `[source,ts,id=x]`. */
function readBlockAttrs(text: string, into: BlockAttrs): void {
  const inner = text.trim().slice(1, -1);
  const first = inner.split(',')[0]!.trim();
  const style = /^[^#.%=\s]*/.exec(first)![0];
  if (!first.includes('=') && (style === 'discrete' || style === 'float')) into.discrete = true;
  const hash = /#([^\s.#%,\]]+)/.exec(first);
  if (hash && !first.includes('=')) into.ids.push(hash[1]!);
  for (const m of inner.matchAll(/(?:^|,)\s*id=("[^"]*"|'[^']*'|[^,\s]*)/g)) into.ids.push(m[1]!.replace(/^["']|["']$/g, ''));
}

function dirOf(path: string): string[] {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')).split('/') : [];
}

/** Resolve `rel` against the folder of `from`, as Asciidoctor does for includes and xrefs. */
function relativeTo(from: string, rel: string): string | null {
  const segments = rel.startsWith('/') ? [] : dirOf(from);
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') segments.pop();
    else segments.push(seg);
  }
  return segments.length ? segments.join('/') : null;
}

function includeAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([\w-]+)=("[^"]*"|'[^']*'|[^,]*)/g)) out[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '');
  return out;
}

/** Text of a paragraph line as a reader sees it: cross references reduced to their text, anchors removed. */
function visible(line: string): string {
  return line
    .replace(XREF, (_m, t: string, text: string) => text.trim() || t.replace(/^.*#/, ''))
    .replace(SHORT_XREF, (_m, t: string, text: string | undefined) => (text ?? '').trim() || t.replace(/^.*#/, ''))
    .replace(/\[\[[^\]]+\]\]/g, '');
}

/**
 * Parse an AsciiDoc note: properties from the leading `////` block and `:tg-*:` header attributes, typed edges
 * from `// @tg:` comments and `////` blocks that start with `@tg`, sections with generated and explicit ids,
 * cross references, includes, and the visible text of each section. A line scanner with a delimiter stack does
 * all of it; nothing is rendered and nothing here needs Asciidoctor.
 */
// @tg: implements:: [[openspec:asciidoc-notes#AsciiDoc files are notes]]
// @tg: implements:: [[openspec:asciidoc-notes#Properties from a leading comment block]]
// @tg: implements:: [[openspec:asciidoc-notes#Properties from tg attributes]]
// @tg: implements:: [[openspec:asciidoc-notes#Typed edges only in comments]]
// @tg: implements:: [[openspec:asciidoc-notes#Comment anchoring to sections]]
// @tg: implements:: [[openspec:asciidoc-notes#Sections and id aliases]]
// @tg: implements:: [[openspec:asciidoc-notes#Native cross references become links]]
// @tg: implements:: [[openspec:asciidoc-notes#Includes become ordered edges]]
// @tg: implements:: [[openspec:asciidoc-notes#Rendering is unchanged by graph metadata]] {confidence: partial}
export function parseAsciidoc(text: string, path: string, options: AsciidocOptions = {}): AsciidocParse {
  const lines = scanLines(text.split(/\r?\n/));
  const warnings: Diagnostic[] = [];
  const edges: ParsedEdge[] = [];
  const includes: AsciidocInclude[] = [];
  const xrefs: AsciidocXref[] = [];
  const sections: AsciidocSection[] = [];
  const attrs = new Map<string, string>();
  const unsetAttrs = new Set<string>();
  const warn = (n: number, message: string, code: string) => warnings.push({ path, line: n, column: 0, message, code });

  // ---- leading property block ----
  let block: Record<string, unknown> | null = null;
  let metaError: string | null = null;
  const metaLines = new Set<number>();
  let first = 0;
  while (first < lines.length && lines[first]!.kind === 'blank') first++;
  if (lines[first]?.kind === 'comment-open' && lines[first]!.text.trim().startsWith('////')) {
    let close = first + 1;
    while (close < lines.length && lines[close]!.kind === 'comment-body') close++;
    const body = lines.slice(first + 1, close).map((l) => l.text);
    const head = body.find((l) => l.trim() !== '');
    if (head?.trim() !== '@tg') {
      for (let i = first; i <= Math.min(close, lines.length - 1); i++) metaLines.add(i);
      let yaml = body;
      const fence = yaml.findIndex((l) => l.trim() === '---');
      if (fence >= 0 && yaml.slice(0, fence).every((l) => !l.trim())) {
        const end = frontmatterClose(yaml, fence);
        if (end > fence) yaml = yaml.slice(fence + 1, end);
      }
      try {
        block = parseMapping(yaml.join('\n'), options.parseYaml);
      } catch (e) {
        metaError = (e as Error).message;
        warn(first, `The leading //// block is read as properties but is not valid YAML (${metaError}). Add a blank //// block first or move the banner below the title.`, 'frontmatter-yaml');
      }
    }
  }

  // ---- single pass ----
  type Pending = { edge: ParsedEdge };
  let pending: Pending[] = [];
  const attrProps: Record<string, unknown> = {};
  let title: string | null = null;
  let phase: 'pre' | 'title' | 'body' = 'pre';
  let blockAttrs: BlockAttrs = { ids: [], discrete: false };
  let current: AsciidocSection | null = null;
  const stack: AsciidocSection[] = [];
  const taken = new Set<string>();
  const sectionLines: string[][] = [[]];
  const chunkSections: { headingPath: string[]; index: number }[] = [{ headingPath: [], index: 0 }];
  let includeOrder = 0;

  const flush = () => {
    for (const p of pending) {
      if (current) p.edge.props.section = current.id;
      p.edge.heading = current?.heading ?? null;
      edges.push(p.edge);
    }
    pending = [];
  };
  const queueEdges = (payload: string, n: number) => {
    const r = parseEdges(payload, path);
    for (const d of r.diagnostics) warnings.push({ ...d, line: n });
    if (r.edges.length === 0 && r.diagnostics.length === 0) warn(n, `'@tg:' comment holds no edge: ${payload.trim()}`, 'edge-syntax');
    for (const e of r.edges) pending.push({ edge: { ...e, line: n, heading: null, props: { ...e.props } } });
  };
  const setAttr = (l: ScannedLine) => {
    if (l.unset) {
      attrs.delete(l.name!);
      unsetAttrs.add(l.name!);
    } else {
      attrs.set(l.name!, l.value ?? '');
      unsetAttrs.delete(l.name!);
    }
  };
  const idPrefix = () => (attrs.has('idprefix') ? attrs.get('idprefix')! : '_');
  const idSeparator = () => (attrs.has('idseparator') ? attrs.get('idseparator')!.slice(0, 1) : '_');

  let blockLines: ScannedLine[] | null = null;
  const closeBlock = () => {
    if (!blockLines) return;
    const head = blockLines.find((l) => l.text.trim() !== '');
    if (head?.text.trim() === '@tg') {
      const start = blockLines.indexOf(head);
      for (const l of blockLines.slice(start + 1)) if (l.text.trim()) queueEdges(l.text.trim(), l.n);
    }
    blockLines = null;
  };

  for (const l of lines) {
    if (metaLines.has(l.n)) continue;
    switch (l.kind) {
      case 'comment-open':
        blockLines = [];
        continue;
      case 'comment-body':
        blockLines?.push(l);
        continue;
      case 'comment-close':
        closeBlock();
        continue;
      case 'comment': {
        const m = EDGE_PREFIX.exec(l.text);
        if (m && !l.verbatim) queueEdges(m[1]!, l.n);
        continue;
      }
      case 'blank':
        if (phase === 'title') phase = 'body';
        if (current !== null || phase === 'body') sectionLines[sectionLines.length - 1]!.push(l.text);
        continue;
      case 'blockattr':
        if (!l.verbatim) readBlockAttrs(l.text, blockAttrs);
        continue;
      case 'anchor':
        blockAttrs.ids.push(l.id!);
        continue;
      default:
        break;
    }

    // Everything below is a content-like line: it settles pending comment edges and consumes block attributes.
    if (l.kind === 'attr' && (phase === 'pre' || phase === 'title')) {
      setAttr(l);
      if (!l.unset && l.name!.startsWith('tg-') && l.name!.length > 3) {
        attrProps[l.name!.slice(3)] = oneLineYaml(l.value ?? '', options.parseYaml);
      }
      flush();
      continue;
    }
    if (l.kind === 'attr') {
      setAttr(l);
      flush();
      continue;
    }

    if (l.kind === 'title' && l.level === 0 && title === null && sections.length === 0) {
      title = plainTitle(l.title!) || l.title!;
      phase = 'title';
      flush();
      blockAttrs = { ids: [], discrete: false };
      continue;
    }
    if (phase === 'pre') phase = 'body';

    if (l.kind === 'title' && l.level! >= 1 && !blockAttrs.discrete) {
      const level = l.level!;
      while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
      const inline = [...l.title!.matchAll(/\[\[([^\],\s]+)[^\]]*\]\]/g)].map((m) => m[1]!);
      const heading = l.title!.replace(/\s*\[\[[^\]]*\]\]/g, '').trim();
      const headingPath = [...stack.map((s) => s.heading), heading];
      const explicit = [...new Set([...blockAttrs.ids, ...inline])];
      let aliases = explicit;
      if (explicit.length === 0 && !unsetAttrs.has('sectids')) {
        aliases = [generateId(heading, idPrefix(), idSeparator(), taken)];
      }
      for (const a of aliases) taken.add(a);
      const section: AsciidocSection = { id: `${path}#${headingPath.join('#')}`, heading, headingPath, level, startLine: l.n, endLine: lines.length - 1, aliases };
      sections.push(section);
      stack.push(section);
      current = section;
      // Comments waiting above the heading belong to the section they introduce.
      flush();
      sectionLines.push([]);
      chunkSections.push({ headingPath, index: sectionLines.length - 1 });
      blockAttrs = { ids: [], discrete: false };
      continue;
    }

    // A non-section line: edges before it belong to the section it sits in.
    flush();
    blockAttrs = { ids: [], discrete: false };
    const body = sectionLines[sectionLines.length - 1]!;

    if (l.kind === 'include') {
      if (!l.inBlock) {
        const raw = l.target!;
        const missing: string[] = [];
        const resolved = raw.replace(/\{([\w-]+)\}/g, (m, name: string) => {
          const v = attrs.get(name.toLowerCase());
          if (v === undefined) missing.push(name);
          return v ?? m;
        });
        if (missing.length) {
          warn(l.n, `Unresolved include: attribute {${missing[0]}} is not set in the header of this file`, 'adoc-include');
        } else if (!SCHEME.test(resolved)) {
          const target = relativeTo(path, resolved);
          if (target) {
            const a = includeAttrs(l.attrs ?? '');
            const inc: AsciidocInclude = { path: resolved, target, order: ++includeOrder, line: l.n };
            const props: Props = { order: inc.order };
            for (const k of ['leveloffset', 'tags', 'lines'] as const) {
              if (a[k] !== undefined) {
                inc[k] = a[k];
                props[k] = a[k]!;
              }
            }
            includes.push(inc);
            edges.push({ type: 'includes', sign: 1, target, subpath: null, alias: null, props, line: l.n, heading: current?.heading ?? null });
          }
        }
      }
      continue;
    }

    if (l.kind === 'delim') continue;

    if (!l.verbatim) {
      if (VISIBLE_EDGE.test(l.text)) {
        warn(l.n, 'Edge syntax outside a comment renders as a description list; write it as `// @tg: …` to make it an edge', 'adoc-visible-edge');
      }
      for (const m of l.text.matchAll(XREF)) addXref(m[1]!, m[2]!, l.n);
      for (const m of l.text.matchAll(SHORT_XREF)) addXref(m[1]!, m[2] ?? null, l.n);
    }
    body.push(l.kind === 'title' ? l.title! : l.verbatim ? l.text : visible(l.text));
  }
  closeBlock();
  flush();

  function addXref(raw: string, label: string | null, n: number): void {
    const hash = raw.indexOf('#');
    const filePart = hash === -1 ? raw : raw.slice(0, hash);
    const fragment = hash === -1 ? null : raw.slice(hash + 1) || null;
    if (filePart && SCHEME.test(filePart)) return;
    // A path with an extension, or any path followed by `#id`, names a file; a bare word is an id in this file.
    const isFile = filePart !== '' && (/\.adoc$/i.test(filePart) || hash !== -1);
    const file = isFile ? relativeTo(path, /\.[A-Za-z0-9]+$/.test(filePart) ? filePart : `${filePart}.adoc`) : null;
    const x: AsciidocXref = { raw, file, fragment, text: label?.trim() || null, line: n };
    xrefs.push(x);
    if (options.linkEdges && file && file !== path) {
      const owner = [...sections].reverse().find((s) => s.startLine <= n && n <= s.endLine) ?? null;
      edges.push({ type: LINK_EDGE_TYPE, sign: 1, target: file, subpath: fragment, alias: x.text, props: {}, line: n, heading: owner?.heading ?? null });
    }
  }

  // ---- properties ----
  const conflicts: string[] = [];
  for (const [k, v] of Object.entries(attrProps)) {
    if (block && k in block && JSON.stringify(block[k]) !== JSON.stringify(v)) conflicts.push(k);
  }
  for (const k of conflicts) warn(0, `Property '${k}' is set by the leading block and by :tg-${k}:; the block wins`, 'adoc-meta-conflict');
  const merged: Record<string, unknown> = { ...attrProps, ...(block ?? {}) };
  const meta = block || Object.keys(attrProps).length ? merged : null;

  sections.forEach((s, i) => {
    const next = sections.slice(i + 1).find((o) => o.level <= s.level);
    s.endLine = next ? next.startLine - 1 : lines.length - 1;
  });

  const chunks: AsciidocChunk[] = chunkSections.map((c) => ({ headingPath: c.headingPath, text: sectionLines[c.index]!.join('\n').trim() }));
  return { meta, metaError, conflicts, title, sections, edges, includes, xrefs, chunks, warnings };
}
