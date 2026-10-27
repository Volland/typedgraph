import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { compileIgnore, LatIndex, lookupSymbol, scanAnnotations, SpecIndex, type Annotation, type Diagnostic, type SpecFrameworkId } from '@obsigraph/core';
import { detectSpecs, specFiles } from './specs.mjs';
import { readConfig, type TgConfig } from './config.mjs';
import { DOCS_DIRS, existingDocsDir, type DocsDir } from './root.mjs';
import { walkProject } from './walk.mjs';

const MAX_SOURCE_BYTES = 1_500_000;

export class NoLatDir extends Error {
  constructor(root: string) {
    super(`${root} has no lat.md/ or tg.md/ docs folder; run tg init`);
  }
}

/** A project on disk: the lattice (`lat.md/` or `tg.md/`), the source files around it, and lazily scanned annotations. */
// @tg: implements:: [[openspec:tg-cli#Docs folder]]
export class Project {
  /** Name of the docs folder: `lat.md`, or `tg.md` when there is no `lat.md/`. */
  readonly latDirName: DocsDir;
  readonly latDir: string;
  private textCache = new Map<string, string | null>();
  private latEntriesCache: string[] | null = null;
  private indexCache: LatIndex | null = null;
  private sourceCache: string[] | null = null;
  private annCache: { annotations: Annotation[]; diagnostics: Diagnostic[] } | null = null;
  private specCache: SpecIndex | null | undefined;
  private configCache: { config: TgConfig; error: string | null } | null = null;
  private noteCache: string[] | null = null;

  constructor(readonly root: string) {
    const dir = existingDocsDir(root);
    if (!dir) throw new NoLatDir(root);
    this.latDirName = dir;
    this.latDir = join(root, dir);
  }

  /** Read a project-relative file; null when unreadable. */
  text(rel: string): string | null {
    if (!this.textCache.has(rel)) {
      let t: string | null = null;
      try {
        t = readFileSync(join(this.root, rel), 'utf8');
      } catch {
        t = null;
      }
      this.textCache.set(rel, t);
    }
    return this.textCache.get(rel) ?? null;
  }

  /** Files under the docs folder, relative to it, sorted. */
  latEntries(): string[] {
    return (this.latEntriesCache ??= walkProject(this.latDir).sort());
  }

  mdFiles(): string[] {
    return this.latEntries().filter((e) => e.endsWith('.md')).map((e) => `${this.latDirName}/${e}`);
  }

  index(): LatIndex {
    if (!this.indexCache) {
      this.indexCache = new LatIndex(this.mdFiles().map((path) => ({ path, text: this.text(path) ?? '' })));
      // AsciiDoc notes are found by locate, section and search; they are never checked as lat.md files.
      this.indexCache.setNotes(this.noteFiles().map((path) => ({ path, text: this.text(path) ?? '' })));
    }
    return this.indexCache;
  }

  /** The committed `.tg/config.json`, or the empty config when it is missing or broken (`error` says which). */
  config(): { config: TgConfig; error: string | null } {
    return (this.configCache ??= readConfig(this.root));
  }

  /** `.adoc` files outside the docs folders that match a `notes` glob of the config: read as notes, never as code. */
  // @tg: implements:: [[openspec:asciidoc-notes#Hosts index AsciiDoc notes]] {confidence: partial}
  noteFiles(): string[] {
    if (!this.noteCache) {
      const globs = this.config().config.notes;
      if (!globs.length) return (this.noteCache = []);
      const rules = compileIgnore(globs.join('\n'));
      this.noteCache = walkProject(this.root).filter((e) => e.toLowerCase().endsWith('.adoc') && !DOCS_DIRS.some((d) => e.startsWith(`${d}/`)) && rules.test(e, false) === true);
    }
    return this.noteCache;
  }

  /** `.adoc` files under the docs folder: they are not lat.md sections, and `tg check` says so. */
  latAdocFiles(): string[] {
    return this.latEntries().filter((e) => e.toLowerCase().endsWith('.adoc')).map((e) => `${this.latDirName}/${e}`);
  }

  /**
   * Requirements of every spec framework the project uses (OpenSpec specs and
   * active changes, Spec Kit features, Kiro specs, BMAD PRD and stories, GSD
   * requirements, ADRs); null when it uses none.
   */
  // @tg: implements:: [[openspec:spec-frameworks#Framework detection]]
  specIndex(): SpecIndex | null {
    if (this.specCache === undefined) {
      const used = detectSpecs(this.root);
      if (!used.length) return (this.specCache = null);
      this.specCache = new SpecIndex(used.flatMap((id) => specFiles(this.root, id)).flatMap((f) => {
        const text = this.text(f.path);
        return text === null ? [] : [{ ...f, text }];
      }));
    }
    return this.specCache;
  }

  /** Spec frameworks the project uses, judged by their folders. */
  specFrameworks(): SpecFrameworkId[] {
    return detectSpecs(this.root);
  }

  /** Source files outside the docs folder: no markdown or AsciiDoc, no `.claude/`, no nested projects that have their own docs folder. */
  sourceFiles(): string[] {
    if (!this.sourceCache) {
      const all = walkProject(this.root);
      const nested = new Set<string>();
      for (const e of all) {
        for (const d of DOCS_DIRS) {
          const i = e.indexOf(`/${d}/`);
          if (i !== -1) nested.add(e.slice(0, i + 1));
        }
      }
      // Both docs folders are skipped: an unused `tg.md/` next to `lat.md/` is docs, not code.
      this.sourceCache = all.filter((e) => !e.endsWith('.md') && !e.toLowerCase().endsWith('.adoc') && !DOCS_DIRS.some((d) => e.startsWith(`${d}/`)) && !e.startsWith('.claude/') && ![...nested].some((p) => e.startsWith(p)));
    }
    return this.sourceCache;
  }

  annotations(): { annotations: Annotation[]; diagnostics: Diagnostic[] } {
    if (!this.annCache) {
      const annotations: Annotation[] = [];
      const diagnostics: Diagnostic[] = [];
      for (const f of this.sourceFiles()) {
        let size = 0;
        try {
          size = statSync(join(this.root, f)).size;
        } catch {
          continue;
        }
        if (size > MAX_SOURCE_BYTES) continue;
        const t = this.text(f);
        if (t === null || t.includes('\0')) continue;
        const r = scanAnnotations(f, t);
        annotations.push(...r.annotations);
        diagnostics.push(...r.diagnostics);
      }
      this.annCache = { annotations, diagnostics };
    }
    return this.annCache;
  }

  /** Source files with their text, for the code layer. */
  codeSources(): { path: string; text: string }[] {
    return this.sourceFiles().flatMap((path) => {
      const text = this.text(path);
      return text === null || text.length > MAX_SOURCE_BYTES || text.includes('\0') ? [] : [{ path, text }];
    });
  }

  /** Error text for a source link whose file or symbol does not exist; null when fine or not judgeable. */
  checkSourceLink(file: string, symbol: string | null): string | null {
    if (!existsSync(join(this.root, file))) return `file "${file}" not found`;
    if (!symbol) return null;
    const r = lookupSymbol(file, this.text(file), symbol);
    return r.status === 'absent' ? `symbol "${symbol}" not found in "${file}"` : null;
  }
}

/** File counts by extension, for the "Scanned" line. */
export function countByExt(paths: string[]): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const p of paths) {
    const base = p.slice(p.lastIndexOf('/') + 1);
    const i = base.lastIndexOf('.');
    const ext = i <= 0 ? '(no ext)' : base.slice(i);
    stats[ext] = (stats[ext] ?? 0) + 1;
  }
  return stats;
}
