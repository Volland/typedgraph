import {
  BuiltinEngine,
  EmbedIndex,
  Graph,
  LatIndex,
  noteFormat,
  noteFrontmatter,
  schemasFromGraph,
  styleSource,
  styleSourcesFromSchemas,
  vaultDiagnostics,
  type CodeMode,
  type Diagnostic,
  type ExecOptions,
  type IconCheck,
  type LinkResolver,
  type NoteInput,
  type SchemaSet,
  type StyleSource,
  type YamlParser,
} from '@obsigraph/core';
import { TFile, type App, type EventRef } from 'obsidian';
import { CodeLayer } from './code-layer';
import { inLatFolder, latDiagnostics } from './lat-links';

/** Indexing work per slice before yielding to the UI, in milliseconds. */
export const SLICE_MS = 12;
/** Files read concurrently ahead of indexing. */
const READ_AHEAD = 16;

/**
 * Keeps the core graph in sync with the vault. Reads note text and frontmatter
 * through Obsidian, resolves links with the metadata cache, never writes notes.
 */
// @tg: implements:: [[architecture#Source of truth]] {since: "2026-10-03"}
// @lat: [[architecture#Source of truth]]
export class VaultIndex {
  readonly graph: Graph;
  readonly engine: BuiltinEngine;
  readonly embeds = new EmbedIndex();
  readonly code: CodeLayer;
  /** Sections and links of any lat.md folder in the vault, for in-place navigation and checks. */
  readonly lat = new LatIndex();
  ready = false;

  private readonly listeners = new Set<() => void>();
  private timer: number | null = null;
  private readonly refs: EventRef[] = [];
  /** Every note path in the graph, so a re-index can remove notes that left the scope or format settings. */
  private readonly paths = new Set<string>();
  /** Which paths are indexed, from the folder settings; rebuilt at build and re-index. */
  private inScope: (path: string) => boolean = () => true;
  private readonly adocTimers = new Map<string, number>();
  private schemaCache: SchemaSet | null = null;
  private diagnosticCache: Diagnostic[] | null = null;
  private styleCache: { sources: StyleSource[]; diagnostics: Diagnostic[] } | null = null;

  constructor(
    private readonly app: App,
    private readonly debounceMs: () => number,
    private readonly schemaFolder: () => string,
    private readonly settingsStyles: () => { nodes: Record<string, unknown>; edges: Record<string, unknown> },
    private readonly iconExists: IconCheck,
    engineOptions: () => ExecOptions = () => ({}),
    codeMode: () => CodeMode = () => 'off',
    codeRoot: () => string = () => '',
    frontmatterEdges: () => boolean = () => false,
    /** Index `.adoc` files as notes; read at each use, so the setting applies live. */
    private readonly asciidoc: () => boolean = () => true,
    /** YAML parser for AsciiDoc property blocks; Obsidian's own in the plugin. */
    private readonly parseYaml?: YamlParser,
    linkEdges: () => boolean = () => false,
    /** Builds the predicate for indexed paths from the folder settings. */
    private readonly scope: () => (path: string) => boolean = () => () => true,
  ) {
    this.graph = new Graph(
      this.resolver(),
      // `[[src/auth.ts#login]]` ends at the code node when the code layer has it.
      (link, sub) => (this.graph.node(`${link}#${sub}`) ? `${link}#${sub}` : null),
      // Read at each upsert, so the setting applies to notes indexed after it changes.
      {
        get frontmatterEdges() {
          return frontmatterEdges();
        },
        parseYaml: this.parseYaml,
        get linkEdges() {
          return linkEdges();
        },
      },
    );
    this.code = new CodeLayer(app, this.graph, codeMode, codeRoot);
    this.engine = new BuiltinEngine(this.graph, engineOptions);
    this.graph.onChange(() => {
      this.invalidate();
      this.schedule();
    });
  }

  /**
   * Link resolution for notes of both formats. The metadata cache resolves `.md` notes by bare name and
   * any file by its extension, so a bare link also tries `<link>.adoc`; a link that matches both is ambiguous.
   */
  // @tg: implements:: [[openspec:asciidoc-notes#Link resolution across formats]]
  private resolver(): LinkResolver {
    const find = (link: string, source: string): string[] => {
      const cache = this.app.metadataCache;
      const explicit = /\.(?:md|adoc)$/i.test(link.trim());
      const hit = cache.getFirstLinkpathDest(link, source);
      // A note outside the indexed folders is not a node, so a link to it ends at a stub.
      const first = hit && this.isNote(hit) && this.inScope(hit.path) ? [hit.path] : [];
      if (explicit || !this.asciidoc()) return first;
      const sibling = cache.getFirstLinkpathDest(`${link.trim()}.adoc`, source);
      return sibling && sibling.extension === 'adoc' && this.inScope(sibling.path) && !first.includes(sibling.path) ? [...first, sibling.path] : first;
    };
    const resolve: LinkResolver = (link, source) => {
      const found = find(link, source);
      return found.length === 1 ? found[0]! : null;
    };
    resolve.ambiguous = (link, source) => {
      const found = find(link, source);
      return found.length > 1 ? found : null;
    };
    return resolve;
  }

  /** A Markdown note, or an AsciiDoc note while AsciiDoc indexing is on. */
  private isNote(file: { extension: string }): boolean {
    return file.extension === 'md' || (file.extension === 'adoc' && this.asciidoc());
  }

  /** A note file inside the indexed folders. */
  private indexes(file: { path: string; extension: string }): boolean {
    return this.isNote(file) && this.inScope(file.path);
  }

  /** Every file indexed as a note: Markdown through the metadata cache, AsciiDoc straight from the vault, both within the indexed folders. */
  // @tg: implements:: [[openspec:graph-model#Indexed folders]] {since: "0.25.0"}
  private noteFiles(): TFile[] {
    const { vault } = this.app;
    const files = this.asciidoc() ? [...vault.getMarkdownFiles(), ...vault.getFiles().filter((f) => f.extension === 'adoc')] : vault.getMarkdownFiles();
    return files.filter((f) => this.inScope(f.path));
  }

  /** Type schemas from the schema folder, cached until the next vault change. */
  // @lat: [[graph-model#Schema notes]]
  // @tg: implements:: [[openspec:schema-notes#Schema changes take effect live]]
  schemas(): SchemaSet {
    return (this.schemaCache ??= schemasFromGraph(this.graph, this.schemaFolder()));
  }

  /** Parse, schema and validation diagnostics for the whole vault. */
  // @tg: implements:: [[openspec:tg-validate#Same findings as the plugin]]
  diagnostics(): Diagnostic[] {
    if (!this.diagnosticCache) {
      const set = this.schemas();
      // Shared with `tg validate`, so the command and this list agree.
      this.diagnosticCache = [
        ...vaultDiagnostics({ graph: this.graph, schemas: set, style: this.styleSources().diagnostics, embeds: this.embeds }),
        ...latDiagnostics(this.lat),
      ];
    }
    return this.diagnosticCache;
  }

  /**
   * Style sources below the block header, in precedence order: one per schema
   * note, then plugin settings. Invalid values become diagnostics.
   */
  // @tg: implements:: [[visualization#Styling]] {since: "2026-10-03"}
  // @lat: [[visualization#Styling]]
  styleSources(): { sources: StyleSource[]; diagnostics: Diagnostic[] } {
    if (!this.styleCache) {
      const set = this.schemas();
      const schemas = styleSourcesFromSchemas(set.schemas, this.iconExists, set.edgeTypes);
      const { nodes, edges } = this.settingsStyles();
      const settings = styleSource('settings', null, nodes, edges, this.iconExists);
      this.styleCache = {
        sources: [...schemas.sources, settings.source],
        diagnostics: [...schemas.diagnostics, ...settings.diagnostics],
      };
    }
    return this.styleCache;
  }

  /** Drop cached schemas and styles, e.g. after settings change. */
  // @tg: implements:: [[openspec:schema-notes#Schema changes take effect live]]
  invalidate(): void {
    this.schemaCache = null;
    this.diagnosticCache = null;
    this.styleCache = null;
  }

  /** Index every note in the indexed folders, yielding to the UI between time slices. */
  async build(onProgress?: (done: number, total: number) => void): Promise<void> {
    this.inScope = this.scope();
    // Code first, so notes linking to symbols resolve to them at once.
    await this.code.load();
    await this.indexFiles(this.noteFiles(), onProgress);
    this.ready = true;
    this.flush();
  }

  /** Re-read every note, e.g. after a setting that changes which notes are indexed or how they become edges. */
  // @tg: implements:: [[openspec:graph-model#Indexed folders]] {since: "0.25.0"}
  async reindex(onProgress?: (done: number, total: number) => void): Promise<void> {
    this.inScope = this.scope();
    const files = this.noteFiles();
    // Notes now outside the indexed folders, or AsciiDoc with that setting off, leave the graph.
    const keep = new Set(files.map((f) => f.path));
    for (const path of [...this.paths]) if (!keep.has(path)) this.remove(path);
    await this.indexFiles(files, onProgress);
    this.flush();
  }

  /**
   * Read and index files, a few reads ahead, yielding to the UI once a slice of indexing work exceeds
   * its time budget, so a large vault never blocks editing for long.
   */
  // @tg: implements:: [[openspec:graph-model#Responsive indexing]] {since: "0.25.0"}
  private async indexFiles(files: TFile[], onProgress?: (done: number, total: number) => void): Promise<void> {
    let sliceStart = performance.now();
    let done = 0;
    for (let i = 0; i < files.length; i += READ_AHEAD) {
      const notes = await Promise.all(files.slice(i, i + READ_AHEAD).map((f) => this.read(f)));
      for (const note of notes) {
        this.upsert(note);
        done++;
        if (performance.now() - sliceStart < SLICE_MS) continue;
        onProgress?.(done, files.length);
        await new Promise((r) => window.setTimeout(r, 0));
        sliceStart = performance.now();
      }
    }
    onProgress?.(done, files.length);
  }

  /** Start listening for vault changes; returns event refs for the plugin to register. */
  watch(): EventRef[] {
    const { metadataCache, vault } = this.app;
    this.refs.push(
      vault.on('modify', (file) => {
        if (!(file instanceof TFile)) return;
        // The metadata cache has nothing for AsciiDoc, so its edits are re-read here, debounced.
        if (file.extension === 'adoc') return this.inScope(file.path) ? this.scheduleAdoc(file) : undefined;
        if (file.extension !== 'md') void this.code.update(file);
      }),
      vault.on('create', (file) => {
        if (file instanceof TFile && file.extension === 'adoc' && this.inScope(file.path)) this.scheduleAdoc(file);
      }),
      metadataCache.on('changed', (file, data, cache) => {
        if (file.extension !== 'md' || !this.inScope(file.path)) return;
        this.upsert({ path: file.path, text: data, frontmatter: cache.frontmatter ?? null });
      }),
      vault.on('delete', (file) => {
        if (file instanceof TFile && file.extension !== 'md' && file.extension !== 'adoc') this.code.remove(file.path);
        if (!(file instanceof TFile) || (file.extension !== 'md' && file.extension !== 'adoc')) return;
        this.remove(file.path);
      }),
      vault.on('rename', async (file, oldPath) => {
        if (file instanceof TFile && file.extension !== 'md' && file.extension !== 'adoc') this.code.rename(file, oldPath);
        if (!(file instanceof TFile) || !this.isNote(file)) return;
        // Moved out of the indexed folders: the note leaves the graph.
        if (!this.indexes(file)) return this.remove(oldPath);
        this.paths.delete(oldPath);
        this.paths.add(file.path);
        const note = await this.read(file);
        if (inLatFolder(oldPath)) this.lat.update(oldPath, null);
        if (inLatFolder(note.path)) this.lat.update(note.path, note.text);
        this.embeds.remove(oldPath);
        this.embeds.upsert(note.path, note.text);
        this.graph.renameNote(oldPath, note);
      }),
    );
    return this.refs;
  }

  /** Subscribe to debounced change notifications; returns an unsubscribe function. */
  // @tg: implements:: [[openspec:graph-query-block#Live refresh]]
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  destroy(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.listeners.clear();
  }

  private scheduleAdoc(file: TFile): void {
    if (!this.asciidoc()) return;
    const prev = this.adocTimers.get(file.path);
    if (prev !== undefined) window.clearTimeout(prev);
    this.adocTimers.set(
      file.path,
      window.setTimeout(() => {
        this.adocTimers.delete(file.path);
        void this.read(file).then((note) => this.upsert(note));
      }, 150),
    );
  }

  /** Embeds first, so the graph change notification sees current embeds. */
  private upsert(note: NoteInput): void {
    this.paths.add(note.path);
    if (inLatFolder(note.path)) this.lat.update(note.path, note.text);
    this.embeds.upsert(note.path, note.text);
    this.graph.upsertNote(note);
  }

  private remove(path: string): void {
    this.paths.delete(path);
    this.embeds.remove(path);
    if (inLatFolder(path)) this.lat.update(path, null);
    this.graph.removeNote(path);
  }

  private async read(file: TFile): Promise<NoteInput> {
    const text = await this.app.vault.cachedRead(file);
    if (noteFormat(file.path) === 'adoc') return { path: file.path, text, frontmatter: noteFrontmatter(file.path, text, this.parseYaml).frontmatter };
    return { path: file.path, text, frontmatter: this.app.metadataCache.getFileCache(file)?.frontmatter ?? null };
  }

  private schedule(): void {
    if (!this.ready) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), this.debounceMs());
  }

  private flush(): void {
    this.timer = null;
    for (const fn of this.listeners) fn();
  }
}
