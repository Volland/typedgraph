import type { Annotation } from '../code/annotations.js';
import { isSpecTarget, type SpecIndex } from '../openspec/index.js';
import type { LatIndex } from './index.js';
import { isSourceTarget, splitTarget, SOURCE_EXTENSIONS } from './links.js';
import { leadingParagraphIssue, MAX_LEADING_LENGTH, flattenSections, specEntries } from './markdown.js';

export type FindingKind = 'link' | 'code-ref' | 'index' | 'section' | 'annotation';

export interface Finding {
  kind: FindingKind;
  /** Project-relative path, or a directory for index findings. */
  file: string;
  line: number;
  target?: string;
  message: string;
}

export interface CheckInput {
  index: LatIndex;
  /** Annotations found in source files, with project-relative file paths. */
  annotations: Annotation[];
  /** Files under lat.md/ relative to it, as the walker lists them (non-dot, gitignore applied). */
  latEntries: string[];
  /** Directory name of the lattice, normally `lat.md`. */
  latDirName: string;
  /** Read a file relative to the lattice directory; null if missing. */
  readLatFile(rel: string): string | null;
  /** Verify a source link on disk: an error message, or null when file and symbol exist (or cannot be judged). */
  checkSourceLink(file: string, symbol: string | null): string | null;
  /**
   * Spec requirements for `openspec:`, `speckit:`, `kiro:`, `bmad:` and `adr:` targets and
   * frontmatter; null when the project has no spec framework. Left out, spec references are not checked.
   */
  specs?: SpecIndex | null;
}

function filePart(id: string): string {
  const i = id.indexOf('#');
  return i === -1 ? id : id.slice(0, i);
}

function ambiguousMessage(target: string, candidates: string[], suggested: string | null): string {
  const short = filePart(target);
  const lines: string[] = [];
  if (suggested) lines.push(`ambiguous link '[[${target}]]' — did you mean '[[${suggested}]]'?`);
  else lines.push(`ambiguous link '[[${target}]]' — multiple paths match, use either of: ${candidates.map((a) => `'[[${a}]]'`).join(', ')}`);
  lines.push(`  The short path "${short}" is ambiguous — ${candidates.length} files match:`, ...candidates.map((c) => `  - "${filePart(c)}.md"`), '  Please fix the link to use a fully qualified path.');
  return lines.join('\n');
}

/** Markdown links: every `[[target]]` in every lattice file must reach a section, or an existing source file and symbol. */
function checkLinks(input: CheckInput): Finding[] {
  const out: Finding[] = [];
  const { index } = input;
  for (const ref of index.refs()) {
    const file = `${ref.file}.md`;
    const r = index.resolve(ref.target);
    switch (r.kind) {
      case 'section':
        break;
      case 'ambiguous':
        out.push({ kind: 'link', file, line: ref.line, target: ref.target, message: ambiguousMessage(ref.target, r.candidates, r.suggested) });
        break;
      case 'code': {
        const err = input.checkSourceLink(r.file, r.symbol);
        if (err) out.push({ kind: 'link', file, line: ref.line, target: ref.target, message: `broken link [[${ref.target}]] — ${err}` });
        break;
      }
      case 'missing':
        out.push({
          kind: 'link',
          file,
          line: ref.line,
          target: ref.target,
          message:
            r.reason === 'unsupported-extension'
              ? `broken link [[${ref.target}]] — unsupported file extension "${r.ext}". Supported: ${[...SOURCE_EXTENSIONS].sort().join(', ')}`
              : `broken link [[${ref.target}]] — no matching section found`,
        });
        break;
    }
  }
  return out;
}

/** Code references: every `@lat:` and `@tg:` target must resolve, and every `require-code-mention` leaf must be mentioned. */
// @tg: implements:: [[openspec:tg-annotations#Annotation validation]]
function checkCodeRefs(input: CheckInput): Finding[] {
  const out: Finding[] = [];
  const { index } = input;
  const mentioned = new Set<string>();
  for (const a of input.annotations) {
    for (const e of a.edges) {
      if (a.kind === 'tg' && isSpecTarget(e.target)) {
        if (input.specs === undefined) continue;
        const err = specTargetError(input.specs, e.target);
        if (err) out.push({ kind: 'annotation', file: a.file, line: a.line, target: e.target, message: `@tg: [[${e.target}]] — ${err}` });
        continue;
      }
      const r = index.resolveRef(e.target);
      mentioned.add(r.resolved.toLowerCase());
      if (r.ambiguous) {
        out.push({ kind: 'code-ref', file: a.file, line: a.line, target: e.target, message: ambiguousMessage(e.target, r.ambiguous, r.suggested) });
        continue;
      }
      if (index.section(r.resolved)) continue;
      if (a.kind === 'tg' && isSourceTarget(e.target)) {
        const { file, rest } = splitTarget(e.target);
        const err = input.checkSourceLink(file, rest);
        if (err) out.push({ kind: 'annotation', file: a.file, line: a.line, target: e.target, message: `@tg: [[${e.target}]] — ${err}` });
        continue;
      }
      out.push({ kind: a.kind === 'lat' ? 'code-ref' : 'annotation', file: a.file, line: a.line, target: e.target, message: `@${a.kind}: [[${e.target}]] — no matching section found` });
    }
  }
  for (const [path, parsed] of index.files) {
    if (!parsed.frontmatter.requireCodeMention) continue;
    for (const s of flattenSections(parsed.roots)) {
      if (s.children.length === 0 && !mentioned.has(s.id.toLowerCase())) {
        out.push({ kind: 'code-ref', file: path, line: s.startLine, target: s.id, message: `section "${s.id}" requires a code mention but none found` });
      }
    }
  }
  return out;
}

function specTargetError(specs: SpecIndex | null, target: string): string | null {
  if (!specs) return 'no spec framework (openspec/, specs/, .kiro/specs/, docs/adr/, ...) in this project';
  const r = specs.resolve(target);
  return r.kind === 'missing' ? `${r.message}${r.suggestion ? ` — did you mean '[[${r.suggestion}]]'?` : ''}` : null;
}

/** `openspec:` and `specs:` frontmatter in lattice files: every entry must name a group or a requirement. */
// @tg: implements:: [[cli#Requirement trace]] {since: "2026-10-08"}
// @lat: [[cli#Requirement trace]]
// @tg: implements:: [[openspec:tg-check#Check]]
function checkSpecFrontmatter(input: CheckInput): Finding[] {
  const out: Finding[] = [];
  if (input.specs === undefined) return out;
  const specs = input.specs;
  for (const [path, parsed] of input.index.files) {
    const entries = specEntries(parsed.frontmatter);
    if (!entries.length) continue;
    const text = input.readLatFile(path.replace(/^[^/]+\//, '')) ?? '';
    for (const { entry, key } of entries) {
      const line = text.split(/\r?\n/).findIndex((l) => l.startsWith(`${key}:`)) + 1;
      const err = entry.includes('#') || !specs?.hasCapability(entry) ? specTargetError(specs, entry) : null;
      if (err) out.push({ kind: 'link', file: path, line, target: entry, message: `${key}: "${entry}" — ${err}` });
    }
  }
  return out;
}

function parseIndexEntries(content: string): Set<string> {
  const names = new Set<string>();
  const re = /^- \[\[([^\]]+?)(?:\|[^\]]+)?\]\]/gm;
  for (let m = re.exec(content); m; m = re.exec(content)) names.add(m[1]!);
  return names;
}

const stem = (name: string): string => (name.endsWith('.md') ? name.slice(0, -3) : name);
const snippet = (entries: string[]): string => entries.map((e) => `- [[${stem(e)}]] — <describe>`).join('\n');

function immediate(paths: string[]): string[] {
  const set = new Set<string>();
  for (const p of paths) {
    const i = p.indexOf('/');
    set.add(i === -1 ? p : p.slice(0, i));
  }
  return [...set].sort();
}

/** Directory index files: each folder needs `<folder>/<folder>.md` listing its children as `- [[name]] — description`. */
function checkIndex(input: CheckInput): Finding[] {
  const out: Finding[] = [];
  const { latDirName: lat, latEntries } = input;
  for (const p of latEntries) {
    const name = p.slice(p.lastIndexOf('/') + 1);
    if (!name.endsWith('.md')) out.push({ kind: 'index', file: `${lat}/`, line: 0, message: `"${p}" is not a .md file — only markdown belongs in ${lat}/` });
  }
  const md = latEntries.filter((p) => p.endsWith('.md'));
  const dirs = new Set<string>(['']);
  for (const p of md) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  for (const dir of [...dirs]) {
    const dirName = dir === '' ? lat : dir.split('/').pop()!;
    const indexFileName = dirName.endsWith('.md') ? dirName : `${dirName}.md`;
    const indexRel = dir === '' ? indexFileName : `${dir}/${indexFileName}`;
    const prefix = dir === '' ? '' : `${dir}/`;
    const children = immediate(md.filter((p) => p.startsWith(prefix) && p !== indexRel).map((p) => p.slice(prefix.length)));
    if (children.length === 0) continue;
    const relDir = dir === '' ? `${lat}/` : `${dir}/`;
    const content = input.readLatFile(indexRel);
    if (content === null) {
      out.push({ kind: 'index', file: relDir, line: 0, message: `missing index file "${indexRel}" — create it with a directory listing:\n\n${snippet(children)}` });
      continue;
    }
    const listed = parseIndexEntries(content);
    const childStems = new Set(children.map(stem));
    const missing = children.filter((c) => !listed.has(stem(c)));
    if (missing.length) out.push({ kind: 'index', file: relDir, line: 0, message: `"${indexRel}" is missing entries — add:\n\n${snippet(missing)}` });
    const indexStem = stem(indexFileName);
    for (const name of listed) {
      if (!childStems.has(name) && name !== indexStem) out.push({ kind: 'index', file: relDir, line: 0, message: `"${indexRel}" lists "[[${name}]]" but it does not exist` });
    }
  }
  return out;
}

function checkSections(input: CheckInput): Finding[] {
  const out: Finding[] = [];
  for (const [path, parsed] of input.index.files) {
    for (const s of flattenSections(parsed.roots)) {
      const issue = leadingParagraphIssue(s);
      if (!issue) continue;
      out.push({
        kind: 'section',
        file: path,
        line: s.startLine,
        target: s.id,
        message:
          issue.kind === 'missing'
            ? `section "${s.id}" has no leading paragraph. Every section must start with a brief overview (≤${MAX_LEADING_LENGTH} chars) summarizing what it documents — this powers search snippets and command output.`
            : `section "${s.id}" leading paragraph is ${issue.length} characters (max ${MAX_LEADING_LENGTH}, excluding [[wiki links]]). Keep the first paragraph brief — it serves as the section's summary in search results and command output. Use subsequent paragraphs for details.`,
      });
    }
  }
  return out;
}

export type CheckScope = 'md' | 'code-refs' | 'index' | 'sections';

/** Run every check, in lat.md's order: links, code references, index files, section structure. */
// @tg: implements:: [[openspec:tg-check#Check]]
// @tg: implements:: [[openspec:tg-check#Parity with lat.md]]
export function checkLattice(input: CheckInput, scopes: CheckScope[] = ['md', 'code-refs', 'index', 'sections']): Finding[] {
  const out: Finding[] = [];
  if (scopes.includes('md')) out.push(...checkLinks(input), ...checkSpecFrontmatter(input));
  if (scopes.includes('code-refs')) out.push(...checkCodeRefs(input));
  if (scopes.includes('index')) out.push(...checkIndex(input));
  if (scopes.includes('sections')) out.push(...checkSections(input));
  return out;
}
