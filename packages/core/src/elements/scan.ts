/**
 * Block-level XML elements inside Markdown: `<tag attr="v">` on its own line
 * (or with text after it), closed by `</tag>`. Prompt files, skills, ADRs and
 * specs use them to mark parts of a document; a schema says what each tag means.
 */

export interface ElementOccurrence {
  /** Tag name as written. */
  tag: string;
  attrs: Record<string, string>;
  /** 1-based line of the opening tag. */
  line: number;
  /** 1-based line of the closing tag; the opening line for one-line, self-closing and unclosed elements. */
  endLine: number;
  /** Inner text with the tags of nested elements kept, trimmed. */
  text: string;
  children: ElementOccurrence[];
  /** No closing tag was found: the element is empty and what followed belongs to its parent. */
  unclosed?: boolean;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const NAME = '[A-Za-z][\\w.-]*';
const OPEN = new RegExp(`^(\\s*)<(${NAME})((?:\\s[^<>]*?)?)\\s*(/?)>(.*)$`);
const CLOSE_AT_END = new RegExp(`^(.*?)</(${NAME})>\\s*$`);
const ATTR = /\s*([A-Za-z_:][\w.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;

/** Attributes of an opening tag, or null when the text is not attribute syntax (a placeholder such as `<insert summary here>`). */
export function parseAttributes(raw: string): Record<string, string> | null {
  const attrs: Record<string, string> = {};
  let i = 0;
  const s = raw.trimEnd();
  while (i < s.length) {
    ATTR.lastIndex = i;
    const m = ATTR.exec(s);
    if (!m || m[0].length === 0) return null;
    const name = m[1]!;
    if (!(name in attrs)) attrs[name] = m[2] ?? m[3] ?? m[4] ?? '';
    i = ATTR.lastIndex;
    // A bare word must be followed by whitespace or the end, so `a—b` is not two attributes.
    if (i < s.length && !/\s/.test(s[i]!)) return null;
  }
  return attrs;
}

interface Open {
  tag: string;
  attrs: Record<string, string>;
  line: number;
  indent: number;
  text: string[];
  children: ElementOccurrence[];
}

/**
 * Every block-level element in a Markdown text, as a tree. An opening tag
 * counts when it starts a line (indented at most three spaces at the top
 * level, any amount inside another element) outside fenced code and
 * frontmatter; a closing tag counts at the end of a line. A tag that is never
 * closed becomes an empty element and its would-be content stays with the
 * parent. Text that is not attribute syntax is not a tag.
 */
// @tg: implements:: [[openspec:document-elements#Elements in Markdown]]
export function scanElements(text: string): ElementOccurrence[] {
  const lines = text.split(/\r?\n/);
  const roots: ElementOccurrence[] = [];
  const stack: Open[] = [];
  let start = 0;
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((l, idx) => idx > 0 && (l.trim() === '---' || l.trim() === '...'));
    if (close > 0) start = close + 1;
  }
  const sink = () => (stack.length ? stack[stack.length - 1]!.children : roots);
  const addText = (t: string) => {
    for (const o of stack) o.text.push(t);
  };
  /** Close the innermost open element named `tag`; elements opened after it were never closed. */
  const close = (tag: string, line: number, before: string): boolean => {
    const at = findOpen(stack, tag);
    if (at === -1) return false;
    if (before.trim()) addText(before);
    while (stack.length - 1 > at) demote(stack.pop()!, sink);
    const o = stack.pop()!;
    sink().push({ tag: o.tag, attrs: o.attrs, line: o.line, endLine: line, text: o.text.join('\n').trim(), children: o.children });
    // The closing tag is part of the enclosing elements' text.
    addText(`</${tag}>`);
    return true;
  };

  let fence: string | null = null;
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i]!;
    const lineNo = i + 1;
    const f = FENCE.exec(raw);
    if (fence !== null) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length && raw.replace(FENCE, '').trim() === '') fence = null;
      addText(raw);
      continue;
    }
    if (f) {
      fence = f[1]!;
      addText(raw);
      continue;
    }
    const open = OPEN.exec(raw);
    const attrs = open ? parseAttributes(open[3]!) : null;
    if (open && attrs && (stack.length > 0 || open[1]!.replace(/\t/g, '    ').length <= 3)) {
      const [, indent, tag, , selfClose, after] = open as unknown as [string, string, string, string, string, string];
      addText(raw);
      if (selfClose) {
        sink().push({ tag, attrs, line: lineNo, endLine: lineNo, text: '', children: [] });
        continue;
      }
      const same = new RegExp(`^(.*?)</${escape(tag)}>\\s*$`).exec(after);
      if (same) {
        sink().push({ tag, attrs, line: lineNo, endLine: lineNo, text: same[1]!.trim(), children: [] });
        continue;
      }
      stack.push({ tag, attrs, line: lineNo, indent: indent.length, text: after.trim() ? [after] : [], children: [] });
      continue;
    }
    const c = stack.length ? CLOSE_AT_END.exec(raw) : null;
    if (c && close(c[2]!, lineNo, c[1]!)) continue;
    addText(raw);
  }
  while (stack.length) demote(stack.pop()!, sink);
  return roots;
}

/** An element that was never closed: empty, with its children handed to whoever is open around it. */
function demote(o: Open, sink: () => ElementOccurrence[]): void {
  const target = sink();
  target.push({ tag: o.tag, attrs: o.attrs, line: o.line, endLine: o.line, text: '', children: [], unclosed: true });
  target.push(...o.children);
}

function findOpen(stack: Open[], tag: string): number {
  for (let k = stack.length - 1; k >= 0; k--) if (stack[k]!.tag === tag) return k;
  return -1;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const HEADING = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;

/** ATX headings of a Markdown text outside fenced code and frontmatter, with their 1-based lines and the `Requirement:` or `Scenario:` prefix of OpenSpec removed. */
export function scanHeadings(text: string): { line: number; depth: number; text: string }[] {
  const out: { line: number; depth: number; text: string }[] = [];
  const lines = text.split(/\r?\n/);
  let start = 0;
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((l, idx) => idx > 0 && (l.trim() === '---' || l.trim() === '...'));
    if (close > 0) start = close + 1;
  }
  let fence: string | null = null;
  for (let i = start; i < lines.length; i++) {
    const l = lines[i]!;
    const f = FENCE.exec(l);
    if (f) {
      if (fence === null) fence = f[1]!;
      else if (f[1]![0] === fence[0] && f[1]!.length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const h = HEADING.exec(l);
    if (h) out.push({ line: i + 1, depth: h[1]!.length, text: h[2]!.replace(/^(?:Requirement|Scenario):\s*/i, '').trim() });
  }
  return out;
}

/** Every element of a tree, parents before children. */
export function flattenElements(elements: ElementOccurrence[]): ElementOccurrence[] {
  return elements.flatMap((e) => [e, ...flattenElements(e.children)]);
}
