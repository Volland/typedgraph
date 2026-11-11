import { flattenSections, parseMarkdown, type ParsedMarkdown, type Section, type WikiRef } from './markdown.js';
import { flattenElements, type ElementOccurrence } from '../elements/scan.js';
import { adocSections } from './adoc.js';
import { extOf, isSourceTarget, splitTarget, toPosix } from './links.js';

/** One markdown file of the lattice: project-relative posix path (with `.md`) and text. */
export interface LatFile {
  path: string;
  text: string;
}

export type LinkResult =
  | { kind: 'section'; id: string; section: Section }
  | { kind: 'element'; id: string; file: string; element: ElementOccurrence }
  | { kind: 'code'; file: string; symbol: string | null }
  | { kind: 'ambiguous'; candidates: string[]; suggested: string | null }
  | { kind: 'missing'; reason: 'no-section' | 'no-element' | 'unsupported-extension'; ext?: string; suggestion: string | null };

/** An element with an `id` attribute in a lattice file, addressable as `file#^id`. */
export interface AddressedElement {
  /** `lat.md/dir/file#^id`. */
  id: string;
  /** Project-relative path without `.md`. */
  file: string;
  /** Project-relative path with `.md`. */
  filePath: string;
  element: ElementOccurrence;
}

/** Separator between a document and an element id in a link: `decisions#^redis`. */
export const ELEMENT_MARK = '#^';

export interface FindMatch {
  section: Section;
  reason: string;
}

export function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1] ? dp[i - 1]![j - 1]! : 1 + Math.min(dp[i - 1]![j - 1]!, dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  return dp[a.length]![b.length]!;
}

/** Trailing segments of a section id: `a#b#c` gives `b#c` and `c`. */
function tailSegments(id: string): string[] {
  const parts = id.split('#');
  const tails: string[] = [];
  for (let i = 1; i < parts.length; i++) tails.push(parts.slice(i).join('#'));
  return tails;
}

/** Normalize separators in the file part only; headings may legitimately hold backslashes. */
function normalizeRefFilePath(target: string): string {
  const i = target.indexOf('#');
  return i === -1 ? toPosix(target) : toPosix(target.slice(0, i)) + target.slice(i);
}

function isRootId(s: Section): boolean {
  return !s.id.includes('#', s.file.length + 1);
}

const MAX_DISTANCE_RATIO = 0.4;

/**
 * The parsed lattice: every section of every file, with lat.md-compatible
 * id lookup (full and short ids, case-insensitive), link resolution and
 * fuzzy locate.
 */
// @tg: implements:: [[cli#Compatibility contract]] {since: "2026-10-04"}
// @lat: [[cli#Compatibility contract]]
export class LatIndex {
  readonly files = new Map<string, ParsedMarkdown>();
  private flatCache: Section[] = [];
  /** Sections of AsciiDoc notes outside the lattice: found by locate, section and search, never checked as lat.md. */
  private noteSections: Section[] = [];
  private allCache: Section[] = [];
  private ids = new Set<string>();
  private byId = new Map<string, Section>();
  private fileIdx = new Map<string, string[]>();
  private elementIdx = new Map<string, AddressedElement>();
  private elementDups: AddressedElement[] = [];

  constructor(files: LatFile[] = []) {
    for (const f of files) this.files.set(toPosix(f.path), parseMarkdown(f.path, f.text));
    this.reindex();
  }

  /** Add or replace one file and rebuild lookups (cheap at docs scale; parsing is per file). */
  update(path: string, text: string | null): void {
    const key = toPosix(path);
    if (text === null) this.files.delete(key);
    else this.files.set(key, parseMarkdown(key, text));
    this.reindex();
  }

  /** Add AsciiDoc notes (project-relative `.adoc` paths and text), replacing earlier ones; the lattice and its checks are unchanged. */
  // @tg: implements:: [[openspec:asciidoc-notes#Hosts index AsciiDoc notes]] {confidence: partial}
  setNotes(files: LatFile[]): void {
    this.noteSections = files.flatMap((f) => adocSections(toPosix(f.path), f.text).flat);
    this.reindex();
  }

  /** Every section a lookup can reach: the lattice's, then those of added notes. */
  searchSections(): Section[] {
    return this.allCache;
  }

  private reindex(): void {
    this.flatCache = [...this.files.values()].flatMap((p) => flattenSections(p.roots));
    this.allCache = [...this.flatCache, ...this.noteSections];
    this.ids = new Set(this.allCache.map((s) => s.id.toLowerCase()));
    this.byId = new Map();
    for (const s of this.allCache) if (!this.byId.has(s.id.toLowerCase())) this.byId.set(s.id.toLowerCase(), s);
    // Index every trailing path suffix, so `lat.md/guides/setup` is also `guides/setup` and `setup`.
    const index = new Map<string, Set<string>>();
    for (const s of this.allCache) {
      const parts = s.file.split('/');
      for (let i = 1; i < parts.length; i++) {
        const suffix = parts.slice(i).join('/').toLowerCase();
        if (!index.has(suffix)) index.set(suffix, new Set());
        index.get(suffix)!.add(s.file);
        // A note's file is also found by its name without `.adoc`, as a lattice file is without `.md`.
        if (/\.adoc$/i.test(suffix)) {
          const bare = suffix.replace(/\.adoc$/i, '');
          if (!index.has(bare)) index.set(bare, new Set());
          index.get(bare)!.add(s.file);
        }
      }
    }
    this.fileIdx = new Map([...index].map(([k, v]) => [k, [...v]]));
    this.elementIdx = new Map();
    this.elementDups = [];
    for (const [filePath, parsed] of this.files) {
      const file = filePath.replace(/\.md$/, '');
      for (const element of flattenElements(parsed.elements)) {
        const name = element.attrs.id?.trim();
        if (!name) continue;
        const e: AddressedElement = { id: `${file}${ELEMENT_MARK}${name}`, file, filePath, element };
        const key = e.id.toLowerCase();
        if (this.elementIdx.has(key)) this.elementDups.push(e);
        else this.elementIdx.set(key, e);
      }
    }
  }

  /** Every element with an `id` in the lattice, first occurrence of each id. */
  elements(): AddressedElement[] {
    return [...this.elementIdx.values()];
  }

  /** Elements whose id repeats one earlier in the same file. */
  duplicateElements(): AddressedElement[] {
    return this.elementDups;
  }

  /** The element with a canonical id such as `lat.md/decisions#^redis`, ignoring case. */
  element(id: string): AddressedElement | undefined {
    return this.elementIdx.get(id.toLowerCase());
  }

  /** Resolve `file#^id`, with the file as a full path or a unique short name. */
  // @tg: implements:: [[openspec:document-elements#Addressing by id]]
  private resolveElement(target: string): LinkResult {
    const at = target.indexOf(ELEMENT_MARK);
    const doc = normalizeRefFilePath(target.slice(0, at)).replace(/\.md$/i, '');
    const name = target.slice(at + ELEMENT_MARK.length).trim();
    const files = this.files.has(`${doc}.md`) ? [doc] : (this.fileIdx.get(doc.toLowerCase()) ?? []).filter((f) => this.files.has(`${f}.md`));
    if (files.length > 1) {
      const hits = files.filter((f) => this.element(`${f}${ELEMENT_MARK}${name}`));
      return { kind: 'ambiguous', candidates: files.map((f) => `${f}${ELEMENT_MARK}${name}`), suggested: hits.length === 1 ? `${hits[0]}${ELEMENT_MARK}${name}` : null };
    }
    const e = files.length ? this.element(`${files[0]}${ELEMENT_MARK}${name}`) : undefined;
    if (e) return { kind: 'element', id: e.id, file: e.filePath, element: e.element };
    const ids = files.length ? this.elements().filter((x) => x.file === files[0]).map((x) => x.id) : [];
    const near = ids.map((id) => ({ id, d: levenshtein(id.slice(id.indexOf(ELEMENT_MARK) + 2).toLowerCase(), name.toLowerCase()) })).sort((a, b) => a.d - b.d)[0];
    return { kind: 'missing', reason: 'no-element', suggestion: near && near.d <= Math.max(2, Math.floor(name.length * 0.4)) ? near.id : null };
  }

  sections(): Section[] {
    return this.flatCache;
  }

  // @tg: implements:: [[openspec:lat-resolver#Section ids]]
  section(id: string): Section | undefined {
    return this.byId.get(id.toLowerCase());
  }

  /** Every wiki link in every file. */
  refs(): WikiRef[] {
    return [...this.files.values()].flatMap((p) => p.refs);
  }

  /** Expand a possibly short section ref to its canonical form; reports ambiguity instead of guessing. */
  // @tg: implements:: [[openspec:lat-resolver#Section ids]]
  resolveRef(rawTarget: string): { resolved: string; ambiguous: string[] | null; suggested: string | null } {
    const target = normalizeRefFilePath(rawTarget);
    if (this.ids.has(target.toLowerCase())) return { resolved: target, ambiguous: null, suggested: null };
    const { file: filePart, rest: restRaw } = splitTarget(target);
    const rest = restRaw === null ? '' : `#${restRaw}`;
    const lcFile = filePart.toLowerCase();
    const filePaths = this.fileIdx.get(lcFile) ?? [filePart];
    const rootHeadings = (fp: string): string[] => {
      const prefix = `${fp.toLowerCase()}#`;
      return [...this.ids].filter((id) => id.startsWith(prefix) && !id.includes('#', prefix.length)).map((id) => id.slice(prefix.length));
    };
    const tryFile = (fp: string): string | null => {
      const expanded = fp + rest;
      if (this.ids.has(expanded.toLowerCase())) return expanded;
      for (const h1 of rootHeadings(fp)) {
        const withRoot = rest ? `${fp}#${h1}${rest}` : `${fp}#${h1}`;
        if (this.ids.has(withRoot.toLowerCase())) return withRoot;
      }
      return null;
    };
    if (filePaths.length === 1) {
      const hit = tryFile(filePaths[0]!);
      if (hit) return { resolved: hit, ambiguous: null, suggested: null };
    } else if (filePaths.length > 1) {
      const all = filePaths.map((c) => c + rest);
      const valid = filePaths.filter((c) => tryFile(c) !== null);
      return { resolved: target, ambiguous: all, suggested: valid.length === 1 ? valid[0]! + rest : null };
    }
    return { resolved: target, ambiguous: null, suggested: null };
  }

  /** Resolve one wiki-link target to a section, a code target, or a failure kind. */
  // @tg: implements:: [[openspec:lat-resolver#Link resolution]]
  resolve(target: string): LinkResult {
    if (target.includes(ELEMENT_MARK) && !isSourceTarget(target)) return this.resolveElement(target);
    const r = this.resolveRef(target);
    if (r.ambiguous) return { kind: 'ambiguous', candidates: r.ambiguous, suggested: r.suggested };
    const hit = this.section(r.resolved);
    if (hit) return { kind: 'section', id: hit.id, section: hit };
    if (isSourceTarget(target)) {
      const { file, rest } = splitTarget(target);
      return { kind: 'code', file, symbol: rest };
    }
    const { file, rest } = splitTarget(target);
    const ext = extOf(file);
    const suggestion = this.find(target)[0]?.section.id ?? null;
    if (ext && rest !== null) return { kind: 'missing', reason: 'unsupported-extension', ext, suggestion };
    return { kind: 'missing', reason: 'no-section', suggestion };
  }

  /** lat.md's tiered locate: exact id, file stem, trailing segments, path subsequence, then fuzzy. */
  find(query: string): FindMatch[] {
    const flat = this.allCache;
    const normalized = normalizeRefFilePath(query.startsWith('#') ? query.slice(1) : query);
    const q = normalized.toLowerCase();
    const isFullPath = normalized.includes('#');

    const exact = flat.filter((s) => s.id.toLowerCase() === q);
    const exactMatches: FindMatch[] = exact.map((section) => ({ section, reason: 'exact match' }));
    if (exactMatches.length > 0 && isFullPath) return exactMatches;

    if (!isFullPath && exactMatches.length === 0) {
      const matchFiles = new Set<string>();
      for (const s of flat) if (s.file.toLowerCase() === q && isRootId(s)) matchFiles.add(s.file);
      for (const p of this.fileIdx.get(q) ?? []) matchFiles.add(p);
      if (matchFiles.size > 0) {
        const roots = flat.filter((s) => matchFiles.has(s.file) && isRootId(s));
        if (roots.length > 0) return roots.map((section) => ({ section, reason: 'exact match' }));
      }
    }

    const stemMatches: FindMatch[] = [];
    if (isFullPath) {
      const h = normalized.indexOf('#');
      const filePart = normalized.slice(0, h);
      const rest = normalized.slice(h);
      const stemPaths = this.fileIdx.get(filePart.toLowerCase()) ?? [];
      const allPaths = stemPaths.length > 0 ? stemPaths : filePart ? [filePart] : [];
      for (const p of allPaths) {
        const expanded = (p + rest).toLowerCase();
        const s = flat.find((x) => x.id.toLowerCase() === expanded && !exact.includes(x));
        if (s) {
          stemMatches.push({ section: s, reason: stemPaths.length > 0 ? `file stem expanded: ${filePart} → ${p}` : 'exact match' });
          continue;
        }
        for (const root of flat.filter((x) => x.file.toLowerCase() === p.toLowerCase() && isRootId(x))) {
          const withRoot = (root.id + rest).toLowerCase();
          const match = flat.find((x) => x.id.toLowerCase() === withRoot && !exact.includes(x));
          if (match) stemMatches.push({ section: match, reason: stemPaths.length > 0 ? `file stem expanded: ${filePart} → ${p}` : 'exact match' });
        }
      }
      if (stemMatches.length > 0) return [...exactMatches, ...stemMatches];
    } else {
      for (const p of this.fileIdx.get(q) ?? []) {
        for (const s of flat) {
          if (exact.includes(s)) continue;
          if (s.file.toLowerCase() === p.toLowerCase() && isRootId(s)) stemMatches.push({ section: s, reason: 'file stem match' });
        }
      }
    }

    const seen = new Set([...exact.map((s) => s.id), ...stemMatches.map((m) => m.section.id)]);
    const subsection: FindMatch[] = isFullPath
      ? []
      : flat.filter((s) => !seen.has(s.id) && tailSegments(s.id).some((t) => t.toLowerCase() === q)).map((section) => ({ section, reason: 'section name match' }));

    const seenSub = new Set([...seen, ...subsection.map((m) => m.section.id)]);
    const qParts = q.split('#');
    const variants = [qParts];
    if (qParts.length >= 2) for (const exp of this.fileIdx.get(qParts[0]!) ?? []) variants.push([exp.toLowerCase(), ...qParts.slice(1)]);
    const subsequence: FindMatch[] =
      qParts.length >= 2
        ? flat
            .filter((s) => {
              if (seenSub.has(s.id)) return false;
              const sParts = s.id.toLowerCase().split('#');
              return variants.some((v) => {
                if (sParts.length <= v.length) return false;
                let qi = 0;
                for (const sp of sParts) {
                  if (sp === v[qi]) qi++;
                  if (qi === v.length) return true;
                }
                return false;
              });
            })
            .map((section) => {
              const skipped = section.id.split('#').length - qParts.length;
              return { section, reason: `path match, ${skipped} intermediate ${skipped === 1 ? 'section' : 'sections'} skipped` };
            })
        : [];

    const seenAll = new Set([...seenSub, ...subsequence.map((m) => m.section.id)]);
    const qh = normalized.indexOf('#');
    const qFile = qh === -1 ? null : normalized.slice(0, qh).toLowerCase();
    const qHeading = qh === -1 ? null : normalized.slice(qh + 1).toLowerCase();
    const fuzzy: { section: Section; distance: number; matched: string }[] = [];
    for (const s of flat) {
      if (seenAll.has(s.id)) continue;
      let best = Infinity;
      let bestCandidate = '';
      for (const c of [s.id, ...tailSegments(s.id)]) {
        const cl = c.toLowerCase();
        const ch = cl.indexOf('#');
        let d: number;
        let maxLen: number;
        if (qFile && qHeading && ch !== -1 && cl.slice(0, ch) === qFile) {
          const cHeading = cl.slice(ch + 1);
          d = levenshtein(cHeading, qHeading);
          maxLen = Math.max(cHeading.length, qHeading.length);
        } else {
          d = levenshtein(cl, q);
          maxLen = Math.max(c.length, q.length);
        }
        if (maxLen > 0 && d / maxLen <= MAX_DISTANCE_RATIO && d < best) {
          best = d;
          bestCandidate = c;
        }
      }
      if (best < Infinity) fuzzy.push({ section: s, distance: best, matched: bestCandidate });
    }
    fuzzy.sort((a, b) => a.distance - b.distance);
    const fuzzyMatches: FindMatch[] = fuzzy.map((f) => ({
      section: f.section,
      reason: f.matched.toLowerCase() === f.section.id.toLowerCase() ? `fuzzy match, distance ${f.distance}` : `fuzzy match on "${f.matched}", distance ${f.distance}`,
    }));

    const sortKey = (s: Section) => s.depth * 100 + (s.file.match(/\//g)?.length ?? 0);
    const sortedStems = [...stemMatches].sort((a, b) => sortKey(a.section) - sortKey(b.section));
    return [...exactMatches, ...sortedStems, ...subsection, ...subsequence, ...fuzzyMatches];
  }
}
