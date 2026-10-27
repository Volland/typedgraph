import type { CodeMode, StyleSource } from '@obsigraph/core';
import { getIcon, Keymap, Notice, parseYaml, Plugin } from 'obsidian';
import { latLinkTarget } from './lat-links';
import { makeStyler, type Styler } from './render/styler';
import type { EditorView } from '@codemirror/view';
import { edgeEmbedEditorExtension, edgeEmbedPostProcessor, refreshEmbeds } from './embeds/edge-embeds';
import { QueryBlock } from './query/query-block';
import { DEFAULT_SETTINGS, ObsigraphSettingTab, type ObsigraphSettings } from './settings';
import { VaultIndex } from './vault-index';
import { GraphView, VIEW_TYPE_GRAPH } from './view/graph-view';
import { DiagnosticsModal, registerSchemaCommands } from './schema-commands';
import { registerTgIcon, TG_ICON } from './icon';

// @tg: implements:: [[architecture#Standalone plugin]] {since: "2026-10-03"}
// @lat: [[architecture#Standalone plugin]]
export default class ObsigraphPlugin extends Plugin {
  settings: ObsigraphSettings = DEFAULT_SETTINGS;
  index!: VaultIndex;
  private readonly styleListeners = new Set<() => void>();
  private readonly iconUris = new Map<string, string | null>();
  private readonly editors = new Set<EditorView>();

  // @tg: implements:: [[openspec:graph-query-block#Block structure]]
  async onload(): Promise<void> {
    await this.loadSettings();
    this.index = new VaultIndex(
      this.app,
      () => this.settings.refreshDebounceMs,
      () => this.settings.schemaFolder,
      () => ({ nodes: this.settings.typeStyles, edges: this.settings.edgeStyles }),
      (name) => getIcon(name) !== null,
      () => ({ maxPathDepth: this.settings.maxPathDepth }),
      () => this.settings.codeMode,
      () => this.settings.codeRoot,
      () => this.settings.frontmatterEdges,
      () => this.settings.asciidoc,
      parseYaml,
      () => this.settings.linkEdges,
    );
    this.addSettingTab(new ObsigraphSettingTab(this.app, this));

    this.registerMarkdownCodeBlockProcessor('graph-query', (source, el, ctx) => {
      ctx.addChild(new QueryBlock(el, source, ctx.sourcePath, this));
    });

    registerTgIcon();
    this.registerView(VIEW_TYPE_GRAPH, (leaf) => new GraphView(leaf, this));
    this.addCommand({ id: 'open-graph-view', name: 'Open graph view', callback: () => this.openGraphView() });
    this.addRibbonIcon(TG_ICON, 'Open graph view', () => this.openGraphView());
    registerSchemaCommands(this);

    // lat.md ids such as [[file#Heading#Sub]] are not Obsidian heading links; resolve them with the lat resolver.
    this.registerDomEvent(
      document,
      'click',
      (evt: MouseEvent) => {
        const a = (evt.target as HTMLElement | null)?.closest?.('a.internal-link');
        const href = a?.getAttribute('data-href');
        if (!href || this.index.lat.sections().length === 0) return;
        const t = latLinkTarget(this.index.lat, href);
        if (!t) return;
        evt.preventDefault();
        evt.stopPropagation();
        if (t.kind === 'open') void this.app.workspace.openLinkText(t.path, '', Keymap.isModEvent(evt), { eState: { line: t.line } });
        else if (t.kind === 'code') new Notice(`Source link: ${t.file}${t.symbol ? `#${t.symbol}` : ''}`);
        else new Notice(`Ambiguous link, use one of: ${t.candidates.join(', ')}`);
      },
      true,
    );

    this.registerMarkdownPostProcessor(edgeEmbedPostProcessor(this));
    this.registerEditorExtension(edgeEmbedEditorExtension(this, this.editors));
    this.register(
      this.index.onChange(() => {
        for (const view of this.editors) view.dispatch({ effects: refreshEmbeds.of(null) });
      }),
    );

    this.app.workspace.onLayoutReady(async () => {
      for (const ref of this.index.watch()) this.registerEvent(ref);
      const status = this.addStatusBarItem();
      status.addClass('mod-clickable');
      status.addEventListener('click', () =>
        new DiagnosticsModal(this.app, this.index.diagnostics(), (p, line) => this.openNoteAt(p, line)).open(),
      );
      const update = () => {
        const { nodes, edges } = this.index.graph.size;
        const issues = this.settings.showDiagnostics ? this.index.diagnostics().length : 0;
        status.setText(`Typed Graph: ${nodes} nodes, ${edges} edges${issues ? ` · ${issues} issues` : ''}`);
      };
      this.register(this.index.onChange(update));
      this.register(this.onStylesChanged(update));
      await this.index.build((done, total) => status.setText(`Typed Graph: indexing ${done}/${total}`));
      update();
    });
  }

  onunload(): void {
    this.index?.destroy();
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<ObsigraphSettings> | null) };
  }

  // @tg: implements:: [[openspec:visualization-config#Live style updates]]
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.index.invalidate();
    for (const fn of this.styleListeners) fn();
  }

  /** Switch the code layer between off, annotated and all; saves the setting and rebuilds the layer. */
  async setCodeMode(mode: CodeMode): Promise<void> {
    this.settings.codeMode = mode;
    await this.saveSettings();
    await this.index.code.refresh();
  }

  /** Styler over block header (optional), schema notes and settings, in that order. */
  // @tg: implements:: [[visualization#Styling]] {since: "2026-10-03"}
  // @lat: [[visualization#Styling]]
  makeStyler(blockHeader: StyleSource | null = null): Styler {
    const sources = [...(blockHeader ? [blockHeader] : []), ...this.index.styleSources().sources];
    return makeStyler(sources, (name) => this.iconUri(name));
  }

  /** Lucide icon as a white SVG data URI for node backgrounds; null when unknown. */
  private iconUri(name: string): string | null {
    if (!this.iconUris.has(name)) {
      const svg = getIcon(name);
      let uri: string | null = null;
      if (svg) {
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('stroke', '#ffffff');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg.outerHTML)}`;
      }
      this.iconUris.set(name, uri);
    }
    return this.iconUris.get(name) ?? null;
  }

  onStylesChanged(fn: () => void): () => void {
    this.styleListeners.add(fn);
    return () => this.styleListeners.delete(fn);
  }

  // @tg: implements:: [[openspec:graph-view#Graph view leaf]]
  async openGraphView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_GRAPH)[0];
    const leaf = existing ?? this.app.workspace.getLeaf('tab');
    if (!existing) await leaf.setViewState({ type: VIEW_TYPE_GRAPH, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  openNoteAt(path: string, line: number): void {
    void this.app.workspace.openLinkText(path, '', false, { eState: { line } });
  }

  openNote(path: string, sourcePath: string): void {
    void this.app.workspace.openLinkText(path, sourcePath, false);
  }
}
