import { parseEdges, type ParsedEdge } from '../edges/parse.js';
import { toPosix } from './links.js';

export interface Section {
  /** `lat.md/dir/file#Heading#Sub`, relative to the project root, no `.md`. */
  id: string;
  heading: string;
  depth: number;
  /** Project-relative path without `.md`. */
  file: string;
  /** Project-relative path with `.md`. */
  filePath: string;
  children: Section[];
  /** 1-based. */
  startLine: number;
  endLine: number;
  firstParagraph: string;
}

export interface WikiRef {
  /** Link target as written, without alias. */
  target: string;
  alias: string | null;
  /** Id of the innermost section containing the link, or ''. */
  fromSection: string;
  file: string;
  /** 1-based. */
  line: number;
}

export interface Frontmatter {
  requireCodeMention?: boolean;
  /** Labels from `type: Decision` or `type: [A, B]`; they label the file's sections below the title. */
  types?: string[];
  /** OpenSpec capabilities or `capability#requirement` ids this file explains, from `openspec:`. */
  openspec?: string[];
  /** Spec ids of any framework this file explains, scheme included (`speckit:001-auth`, `adr:0003`), from `specs:`. */
  specs?: string[];
}

/** Every spec entry a file's frontmatter names: `openspec:` entries as written (OpenSpec by default) and `specs:` entries. */
export function specEntries(fm: Frontmatter | undefined): { entry: string; key: 'openspec' | 'specs' }[] {
  return [...(fm?.openspec ?? []).map((entry) => ({ entry, key: 'openspec' as const })), ...(fm?.specs ?? []).map((entry) => ({ entry, key: 'specs' as const }))];
}

export interface ParsedMarkdown {
  roots: Section[];
  flat: Section[];
  refs: WikiRef[];
  frontmatter: Frontmatter;
  /** Typed edge lines (`type:: [[target]] {props}`) outside code; `line` is 0-based as in `parseEdges`. */
  edges: ParsedEdge[];
}

// @tg: implements:: [[openspec:tg-trace#Docs frontmatter]]
// @tg: implements:: [[openspec:spec-frameworks#Docs name any framework]]
export function parseFrontmatter(content: string): Frontmatter {
  const m = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!m) return {};
  const out: Frontmatter = {};
  if (/require-code-mention:\s*true/i.test(m[1]!)) out.requireCodeMention = true;
  const types = listKey(m[1]!, 'type');
  if (types.length) out.types = types;
  const specs = listKey(m[1]!, 'openspec');
  if (specs.length) out.openspec = specs;
  const any = listKey(m[1]!, 'specs');
  if (any.length) out.specs = any;
  return out;
}

/** A top-level key as a list of names: a scalar, an inline list or a block list. */
function listKey(yaml: string, key: string): string[] {
  const lines = yaml.split('\n');
  const at = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (at === -1) return [];
  const clean = (v: string) => v.trim().replace(/^["']|["']$/g, '').trim();
  const rest = lines[at]!.slice(key.length + 1).replace(/\s+#.*$/, '').trim();
  let raw: string[];
  if (rest.startsWith('[')) raw = rest.replace(/^\[|\]$/g, '').split(',');
  else if (rest) raw = [rest];
  else {
    raw = [];
    for (const l of lines.slice(at + 1)) {
      const item = /^\s+-\s+(.*)$/.exec(l);
      if (!item) break;
      raw.push(item[1]!);
    }
  }
  return [...new Set(raw.map(clean).filter(Boolean))];
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const BULLET = /^ {0,3}(?:[-*+]|(\d{1,9})[.)])(?:[ \t]+|$)/;
const QUOTE = /^ {0,3}>/;
const HTML = /^ {0,3}<[A-Za-z/!?]/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const WIKI = /\[\[([^\]|\r\n]*[^\]|\s][^\]|\r\n]*)(?:\|([^\]\r\n]*[^\]\s][^\]\r\n]*))?\]\]/g;

function blank(line: string): boolean {
  return line.trim() === '';
}

/** Blank out inline code spans so wiki links inside them are ignored, keeping offsets and newlines. */
function blankCode(text: string): string {
  return text.replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Heading text as lat.md derives it: only plain text nodes count, so code, emphasis, links and wiki links drop out. */
function headingText(raw: string): string {
  let t = raw.trim().replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, '');
  t = t.replace(/!?\[\[[^\]]*\]\]/g, '').replace(/!?\[[^\]]*\]\([^)]*\)/g, '');
  t = t.replace(/\*\*[^*]+\*\*|__[^_]+__/g, '').replace(/\*[^*]+\*/g, '').replace(/(^|\W)_[^_]+_(?=\W|$)/g, '$1');
  return t.replace(/\\([!-/:-@[-`{-~])/g, '$1');
}

/** Paragraph text as lat.md's inlineText sees it: markers of emphasis and link syntax dropped, code and wiki links kept. */
function paragraphText(lines: string[]): string {
  let t = lines.map((l) => l.replace(/^[ \t]+/, '')).join('\n').replace(/[ \t]+$/g, '');
  t = t.replace(/\[\[([^\]|]*)(?:\|[^\]]*)?\]\]/g, '[[$1]]');
  t = t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
  t = t.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2').replace(/\*([^*]+)\*/g, '$1');
  return t;
}

/**
 * Parse one markdown file into its section tree, wiki-link references and
 * frontmatter options. `filePath` is relative to the project root.
 *
 * A line-based scanner covering what section ids and links need (ATX and
 * setext headings, fenced and indented code, lists, quotes, html), matching
 * lat.md's CommonMark parse on authored docs; not a general markdown parser.
 */
// @tg: implements:: [[openspec:lat-resolver#Section tree]]
export function parseMarkdown(filePath: string, text: string): ParsedMarkdown {
  const posix = toPosix(filePath);
  const file = posix.replace(/\.md$/, '');
  const lines = text.split(/\r?\n/);
  const frontmatter = parseFrontmatter(text.replace(/\r\n/g, '\n'));

  let i = 0;
  if (lines[0] === '---') {
    const close = lines.findIndex((l, idx) => idx > 0 && l === '---');
    if (close > 0) i = close + 1;
  }

  interface Heading {
    depth: number;
    text: string;
    line: number;
  }
  const headings: Heading[] = [];
  const paragraphs: { after: number; text: string }[] = []; // after = index into headings (-1 before the first)
  const linkBlocks: { start: number; lines: string[] }[] = [];

  const startsBlock = (l: string, inPara: boolean): boolean => {
    if (ATX.test(l) || FENCE.test(l) || QUOTE.test(l) || HTML.test(l)) return true;
    if (HR.test(l)) return true;
    const b = BULLET.exec(l);
    if (b && (!inPara || b[1] === undefined || b[1] === '1') && l.replace(BULLET, '').trim() !== '') return true;
    return false;
  };

  while (i < lines.length) {
    const line = lines[i]!;
    if (blank(line)) {
      i++;
      continue;
    }
    const f = FENCE.exec(line);
    if (f) {
      const mark = f[1]!;
      i++;
      while (i < lines.length) {
        const m = FENCE.exec(lines[i]!);
        if (m && m[1]![0] === mark[0] && m[1]!.length >= mark.length && lines[i]!.replace(FENCE, '').trim() === '') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    const a = ATX.exec(line);
    if (a) {
      headings.push({ depth: a[1]!.length, text: a[2] ?? '', line: i + 1 });
      linkBlocks.push({ start: i + 1, lines: [a[2] ?? ''] });
      i++;
      continue;
    }
    if (HR.test(line)) {
      i++;
      continue;
    }
    if (/^( {4}|\t)/.test(line)) {
      while (i < lines.length && (blank(lines[i]!) || /^( {4}|\t)/.test(lines[i]!))) i++;
      continue;
    }
    if (HTML.test(line)) {
      while (i < lines.length && !blank(lines[i]!)) i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const start = i;
      while (i < lines.length && !blank(lines[i]!) && !(i > start && (ATX.test(lines[i]!) || FENCE.test(lines[i]!)))) i++;
      linkBlocks.push({ start: start + 1, lines: lines.slice(start, i) });
      continue;
    }
    if (BULLET.test(line)) {
      const start = i;
      i++;
      while (i < lines.length) {
        const l = lines[i]!;
        if (blank(l)) {
          // A blank line continues the list only if the next non-blank line is indented or another item.
          let j = i;
          while (j < lines.length && blank(lines[j]!)) j++;
          if (j < lines.length && (/^( {2,}|\t)/.test(lines[j]!) || BULLET.test(lines[j]!))) {
            i = j;
            continue;
          }
          break;
        }
        if (/^( {2,}|\t)/.test(l) || BULLET.test(l)) {
          i++;
          continue;
        }
        if (ATX.test(l) || FENCE.test(l) || HR.test(l) || QUOTE.test(l)) break;
        i++; // lazy continuation
      }
      linkBlocks.push({ start: start + 1, lines: lines.slice(start, i) });
      continue;
    }
    // Paragraph, possibly a setext heading.
    const start = i;
    const para: string[] = [line];
    i++;
    let setext: 1 | 2 | null = null;
    while (i < lines.length && !blank(lines[i]!)) {
      const sm = SETEXT.exec(lines[i]!);
      if (sm) {
        setext = sm[1]![0] === '=' ? 1 : 2;
        i++;
        break;
      }
      if (startsBlock(lines[i]!, true)) break;
      para.push(lines[i]!);
      i++;
    }
    if (setext) {
      headings.push({ depth: setext, text: para.map((l) => l.trim()).join(' '), line: start + 1 });
      linkBlocks.push({ start: start + 1, lines: para });
      continue;
    }
    paragraphs.push({ after: headings.length - 1, text: paragraphText(para) });
    linkBlocks.push({ start: start + 1, lines: para });
  }

  // Section tree.
  const roots: Section[] = [];
  const flat: Section[] = [];
  const stack: Section[] = [];
  for (const h of headings) {
    const heading = headingText(h.text);
    while (stack.length && stack[stack.length - 1]!.depth >= h.depth) stack.pop();
    const parent = stack[stack.length - 1] ?? null;
    const section: Section = {
      id: parent ? `${parent.id}#${heading}` : `${file}#${heading}`,
      heading,
      depth: h.depth,
      file,
      filePath: posix,
      children: [],
      startLine: h.line,
      endLine: 0,
      firstParagraph: '',
    };
    (parent ? parent.children : roots).push(section);
    stack.push(section);
    flat.push(section);
  }
  const lastLine = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
  flat.forEach((s, idx) => {
    s.endLine = idx + 1 < flat.length ? flat[idx + 1]!.startLine - 1 : lastLine;
  });
  for (const p of paragraphs) {
    const s = flat[p.after];
    if (s && !s.firstParagraph) s.firstParagraph = p.text;
  }

  // Wiki links.
  const refs: WikiRef[] = [];
  for (const block of linkBlocks) {
    if (!block.lines.length) continue;
    const body = blankCode(block.lines.join('\n'));
    WIKI.lastIndex = 0;
    for (let m = WIKI.exec(body); m; m = WIKI.exec(body)) {
      const line = block.start + (body.slice(0, m.index).match(/\n/g)?.length ?? 0);
      let from = '';
      for (const s of flat) {
        if (s.startLine <= line) from = s.id;
        else break;
      }
      refs.push({ target: m[1]!, alias: m[2] ?? null, fromSection: from, file, line });
    }
  }
  refs.sort((x, y) => x.line - y.line);

  return { roots, flat, refs, frontmatter, edges: parseEdges(text, filePath).edges };
}

// @tg: implements:: [[openspec:lat-resolver#Section tree]]
export function flattenSections(sections: Section[]): Section[] {
  return sections.flatMap((s) => [s, ...flattenSections(s.children)]);
}

/** Max characters of a section's leading paragraph, excluding `[[wiki link]]` content. */
// @tg: implements:: [[openspec:lat-resolver#Leading paragraph rule]]
export const MAX_LEADING_LENGTH = 250;

export type LeadingIssue = { kind: 'missing' } | { kind: 'too-long'; length: number };

/** Apply lat.md's leading-paragraph rule to one section. */
// @tg: implements:: [[openspec:lat-resolver#Leading paragraph rule]]
export function leadingParagraphIssue(section: Section): LeadingIssue | null {
  if (!section.firstParagraph) return { kind: 'missing' };
  const length = section.firstParagraph.replace(/\[\[[^\]]*\]\]/g, '').length;
  return length > MAX_LEADING_LENGTH ? { kind: 'too-long', length } : null;
}
