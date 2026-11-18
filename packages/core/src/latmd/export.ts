import { parseEdges } from '../edges/parse.js';
import { findEmbeds, parseEmbed, resolveEmbed, viewEmbed, EMBED_PATTERN } from '../embeds/embeds.js';
import { Graph } from '../graph/graph.js';
import { pathResolver } from '../graph/resolve.js';
import { LatIndex } from './index.js';
import { parseMarkdown } from './markdown.js';
import { frontmatterClose } from '../schema/frontmatter.js';

export interface ExportNote {
  /** Path within the exported folder, posix, ending in `.md`. */
  path: string;
  text: string;
}

export interface ExportFile {
  /** Path relative to the output project root, always under `lat.md/`. */
  path: string;
  text: string;
}

export type LossKind = 'typed-edge' | 'edge-properties' | 'negative-edge' | 'edge-embed' | 'unresolved-link' | 'added-heading' | 'generated-index' | 'index-entries';

export interface LossEntry {
  kind: LossKind;
  count: number;
  /** Up to three `path:line` places, for the report. */
  examples: string[];
}

export interface ExportResult {
  files: ExportFile[];
  report: LossEntry[];
}

/** What each kind means in the printed report. */
// @tg: implements:: [[openspec:lat-vault-integration#Loss report]]
export const LOSS_DESCRIPTIONS: Record<LossKind, string> = {
  'typed-edge': 'typed edge lines flattened to "type: [[link]]" text',
  'edge-properties': 'edge property blocks dropped',
  'negative-edge': 'negative edge signs turned into "(negative)" text',
  'edge-embed': '{{edge: ...}} embeds replaced by their value as text (or removed when unresolved)',
  'unresolved-link': 'links to notes outside the export turned into plain text',
  'added-heading': 'notes without a level-1 heading given one from their file name',
  'generated-index': 'directory index files generated',
  'index-entries': 'entries appended to existing directory index notes',
};

const EDGE_LINE = /^(\s*(?:(?:[-*+]|\d+[.)])\s+|>\s*)*)([+-]?)([\p{L}_][\p{L}\p{N}_-]*)::\s*(.*)$/u;
const LINK_RUN = /^((?:\s*\[\[[^\]]*\]\]\s*,?)+)\s*(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const WIKI = /(!?)\[\[([^\]|\r\n]+)(?:\|([^\]\r\n]+))?\]\]/g;
const INLINE_CODE = /(`+[^`\n]*`+)/;

/** Counts per kind with up to three example places; shared by the lat.md and OKF exports. */
// @tg: implements:: [[openspec:lat-vault-integration#Loss report]]
export class Report<K extends string = LossKind> {
  private readonly map = new Map<K, { kind: K; count: number; examples: string[] }>();
  add(kind: K, where: string): void {
    const e = this.map.get(kind) ?? { kind, count: 0, examples: [] };
    e.count++;
    if (e.examples.length < 3) e.examples.push(where);
    this.map.set(kind, e);
  }
  entries(): { kind: K; count: number; examples: string[] }[] {
    return [...this.map.values()];
  }
}

/** Apply `fn` to the parts of a line outside inline code spans. */
export function outsideCode(line: string, fn: (part: string) => string): string {
  return line
    .split(INLINE_CODE)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join('');
}

const titleOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');

/** Walk body lines outside frontmatter and fenced code, letting `fn` rewrite each. */
export function mapProse(text: string, fn: (line: string, n: number) => string): string {
  const lines = text.split('\n');
  let i = 0;
  const fmClose = frontmatterClose(lines);
  if (fmClose > 0) i = fmClose + 1;
  let fence: string | null = null;
  for (; i < lines.length; i++) {
    const f = FENCE.exec(lines[i]!);
    if (f) {
      if (fence === null) fence = f[1]!;
      else if (f[1] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    lines[i] = fn(lines[i]!, i + 1);
  }
  return lines.join('\n');
}

function flattenEdges(path: string, text: string, report: Report): string {
  return mapProse(text, (line, n) => {
    const m = EDGE_LINE.exec(line);
    if (!m || parseEdges(line, path).edges.length === 0) return line;
    const [, prefix, sign, type, value] = m as unknown as [string, string, string, string, string];
    const run = LINK_RUN.exec(value);
    if (!run) return line;
    const links = run[1]!.trim().replace(/,$/, '');
    let rest = run[2]!;
    report.add('typed-edge', `${path}:${n}`);
    if (rest.startsWith('{')) {
      report.add('edge-properties', `${path}:${n}`);
      rest = '';
    }
    if (sign === '-') report.add('negative-edge', `${path}:${n}`);
    return `${prefix}${type}${sign === '-' ? ' (negative)' : ''}: ${links}${rest ? ` ${rest}` : ''}`;
  });
}

export function expandEmbeds(path: string, text: string, graph: Graph, report: { add(kind: 'edge-embed', where: string): void }): string {
  if (findEmbeds(text).length === 0) return text;
  return mapProse(text, (line, n) =>
    outsideCode(line, (part) =>
      part.replace(EMBED_PATTERN, (_raw, inner: string) => {
        report.add('edge-embed', `${path}:${n}`);
        const embed = parseEmbed(inner);
        if (typeof embed === 'string') return '';
        const view = viewEmbed(embed, resolveEmbed(graph, embed, path));
        if (view.kind === 'value') return view.text;
        if (view.kind === 'table') return view.rows.map(([k, v]) => `${k}: ${v}`).join(', ');
        return '';
      }),
    ),
  );
}

function ensureHeading(path: string, text: string, report: Report): string {
  if (parseMarkdown(path, text).flat.some((s) => s.depth === 1)) return text;
  report.add('added-heading', path);
  const lines = text.split('\n');
  let at = 0;
  const fmClose = frontmatterClose(lines);
  if (fmClose > 0) at = fmClose + 1;
  lines.splice(at, 0, `# ${titleOf(path)}`, '');
  return lines.join('\n');
}

/** Make every link resolvable: ambiguous ones get a full path, ones to notes outside the export become plain text. */
function normalizeLinks(file: ExportFile, index: LatIndex, report: Report): string {
  return mapProse(file.text, (line, n) =>
    outsideCode(line, (part) =>
      part.replace(WIKI, (whole, bang: string, target: string, alias: string | undefined) => {
        const r = index.resolve(target.trim());
        if (r.kind === 'section' || r.kind === 'code') return whole;
        if (r.kind === 'ambiguous') {
          const pick = r.suggested ?? r.candidates[0]!;
          return `${bang}[[${pick}|${alias ?? target.trim()}]]`;
        }
        const filePart = target.trim().split('#')[0]!;
        const fileExists = filePart !== '' && index.resolve(filePart).kind !== 'missing';
        if (fileExists) return whole; // a missing heading is a finding for the author, not something to hide
        report.add('unresolved-link', `${file.path}:${n}`);
        return alias ?? target.trim();
      }),
    ),
  );
}

const describe = (index: LatIndex, path: string): string => {
  const first = index.sections().find((s) => s.filePath === path);
  const text = (first?.firstParagraph ?? '').replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, t: string, a?: string) => a ?? t).replace(/\s+/g, ' ').trim();
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
};

/** `lat.md/dir` listing: files by stem, directories by name, each `- [[name]] — description`. */
function addIndexes(files: ExportFile[], report: Report): ExportFile[] {
  const index = new LatIndex(files);
  const byPath = new Map(files.map((f) => [f.path, f]));
  const md = files.map((f) => f.path.slice('lat.md/'.length));
  const dirs = new Set<string>(['']);
  for (const p of md) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  const out = new Map(byPath);
  for (const dir of [...dirs].sort()) {
    const dirName = dir === '' ? 'lat.md' : dir.split('/').pop()!;
    const indexRel = dir === '' ? 'lat.md' : `${dir}/${dirName}.md`;
    const prefix = dir === '' ? '' : `${dir}/`;
    const children = new Map<string, string>(); // stem -> description
    for (const p of md) {
      if (!p.startsWith(prefix) || p === indexRel) continue;
      const rest = p.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash === -1) children.set(rest.replace(/\.md$/, ''), describe(index, `lat.md/${p}`));
      else if (!children.has(rest.slice(0, slash))) children.set(rest.slice(0, slash), '');
    }
    if (children.size === 0) continue;
    const entry = (stem: string, desc: string): string => `- [[${stem}]] — ${desc || stem}`;
    const existing = byPath.get(`lat.md/${indexRel}`);
    if (!existing) {
      const body = [...children].sort(([a], [b]) => a.localeCompare(b)).map(([s, d]) => entry(s, d));
      const title = dir === '' ? 'Notes' : dirName;
      out.set(`lat.md/${indexRel}`, { path: `lat.md/${indexRel}`, text: `# ${title}\n\nIndex of the ${dir === '' ? 'exported notes' : `${dirName} notes`}.\n\n${body.join('\n')}\n` });
      report.add('generated-index', `lat.md/${indexRel}`);
      continue;
    }
    const listed = new Set([...existing.text.matchAll(/^- \[\[([^\]]+?)(?:\|[^\]]+)?\]\]/gm)].map((m) => m[1]!));
    const missing = [...children].filter(([s]) => !listed.has(s)).sort(([a], [b]) => a.localeCompare(b));
    if (missing.length) {
      out.set(existing.path, { path: existing.path, text: `${existing.text.replace(/\n*$/, '\n\n')}${missing.map(([s, d]) => entry(s, d)).join('\n')}\n` });
      report.add('index-entries', existing.path);
    }
  }
  return [...out.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Project vault notes into a lat.md-conformant folder: typed edges become
 * plain `type: [[link]]` text, property blocks and embeds are flattened, every
 * note gets a level-1 heading, links are made resolvable and directory index
 * files are generated. Lossy by design; the report says what was lost. The
 * caller verifies the result with the normal checks.
 */
// @tg: implements:: [[cli#Vault integration]] {since: "2026-10-04"}
// @lat: [[cli#Vault integration]]
// @tg: implements:: [[openspec:lat-vault-integration#Export projection]]
export function exportLattice(notes: ExportNote[]): ExportResult {
  const report = new Report();
  const paths = notes.map((n) => n.path);
  const graph = new Graph(pathResolver(() => paths));
  for (const n of notes) graph.upsertNote({ path: n.path, text: n.text, frontmatter: null });

  let files: ExportFile[] = notes.map((n) => {
    let text = n.text.replace(/\r\n/g, '\n');
    text = expandEmbeds(n.path, text, graph, report);
    text = flattenEdges(n.path, text, report);
    text = ensureHeading(n.path, text, report);
    return { path: `lat.md/${n.path}`, text };
  });
  const index = new LatIndex(files);
  files = files.map((f) => ({ path: f.path, text: normalizeLinks(f, index, report) }));
  files = addIndexes(files, report);
  return { files, report: report.entries() };
}
