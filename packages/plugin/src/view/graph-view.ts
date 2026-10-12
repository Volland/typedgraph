import { CypherError, mergeSchemas } from '@obsigraph/core';
import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type ObsigraphPlugin from '../main';
import { DEFAULT_OPTIONS } from '../query/block';
import { planRender } from '../query/plan';
import type { GraphElements } from '../render/elements';
import { DEFAULT_DISPLAY, DEFAULT_FORCES, GraphRenderer, type DisplaySettings, type ForceSettings, type LayoutSettings } from '../render/graph-renderer';
import { attachGraphControls } from './graph-controls';
import { showGraphMenu } from './graph-menu';
import { themeFrom } from '../render/theme';
import { renderTable } from '../render/table';
import { TG_ICON } from '../icon';
import { edgeDetails, mergeElements, neighborhood, nodeDetails, valueLines, type Details } from './view-state';

export const VIEW_TYPE_GRAPH = 'obsigraph-graph-view';
const LAYOUT_KEY = 'obsigraph-graph-layout';

// Device-local view state: how wide the details pane is and which rows it shows.
const WIDTH_KEY = 'obsigraph:details-width';
const TECHNICAL_KEY = 'obsigraph:details-technical';
const LINKS_KEY = 'obsigraph:details-links';
const MIN_DETAILS_WIDTH = 160;

/**
 * Full-pane exploratory graph. With an empty query it shows the active note's
 * neighborhood; a node expands in place from the right-click menu or a long-press.
 */
// @tg: implements:: [[visualization#Surfaces]] {since: "2026-10-03"}
// @lat: [[visualization#Surfaces]]
// @tg: implements:: [[openspec:code-layer#Visible on demand]]
// @tg: implements:: [[openspec:graph-view#Graph view leaf]]
export class GraphView extends ItemView {
  private renderer: GraphRenderer | null = null;
  private input!: HTMLTextAreaElement;
  private body!: HTMLElement;
  private details!: HTMLElement;
  private resizer!: HTMLElement;
  private selection: { kind: 'node' | 'edge'; id: string } | null = null;
  private message!: HTMLElement;
  private query = '';
  private focus: string | null = null;
  private readonly expanded = new Set<string>();

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: ObsigraphPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_GRAPH;
  }
  getDisplayText(): string {
    return 'Typed graph';
  }
  getIcon(): string {
    return TG_ICON;
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass('obsigraph-view');

    const bar = root.createDiv({ cls: 'obsigraph-querybar' });
    this.input = bar.createEl('textarea', {
      attr: { rows: '2', placeholder: 'Enter a query, or leave empty to follow the active note' },
    });
    const code = bar.createEl('select', { attr: { 'aria-label': 'Code in the graph', title: 'Show source code as nodes' } });
    for (const [value, text] of [['off', 'Code: off'], ['annotated', 'Code: annotated'], ['all', 'Code: all']] as const) {
      code.createEl('option', { value, text });
    }
    code.value = this.plugin.settings.codeMode;
    code.addEventListener('change', () => void this.plugin.setCodeMode(code.value === 'all' ? 'all' : code.value === 'annotated' ? 'annotated' : 'off'));
    const run = bar.createEl('button', { text: 'Run', cls: 'mod-cta' });
    run.addEventListener('click', () => this.submit());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.submit();
      }
    });

    this.message = root.createDiv({ cls: 'obsigraph-status' });
    const main = root.createDiv({ cls: 'obsigraph-view-main' });
    this.body = main.createDiv({ cls: 'obsigraph-view-body' });
    this.resizer = main.createDiv({ cls: 'obsigraph-resizer', attr: { 'aria-label': 'Drag to resize the details pane' } });
    this.details = main.createDiv({ cls: 'obsigraph-details' });
    this.initResizer(main);

    this.register(this.plugin.index.onChange(() => this.refresh()));
    this.register(this.plugin.onStylesChanged(() => this.refresh()));
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (this.query || !file || file.extension !== 'md') return;
        this.focus = file.path;
        this.expanded.clear();
        this.refresh();
      }),
    );
    this.focus = this.app.workspace.getActiveFile()?.path ?? null;
    this.refresh();
  }

  async onClose(): Promise<void> {
    this.renderer?.destroy();
    this.renderer = null;
  }

  private submit(): void {
    this.query = this.input.value.trim();
    this.expanded.clear();
    if (!this.query) this.focus = this.app.workspace.getActiveFile()?.path ?? this.focus;
    this.refresh();
  }

  /** Rebuild the current view, keeping nodes the user expanded. */
  private refresh(): void {
    if (!this.plugin.index.ready) {
      this.message.setText('Indexing vault…');
      return;
    }
    this.message.setText('');
    const graph = this.plugin.index.graph;
    let base: GraphElements;

    if (this.query) {
      let result;
      try {
        result = this.plugin.index.engine.run(this.query);
      } catch (e) {
        if (!(e instanceof CypherError)) throw e;
        this.showError(`${e.message}${e.line > 0 ? ` (line ${e.line}, column ${e.column})` : ''}`);
        return;
      }
      const plan = planRender(result, DEFAULT_OPTIONS, this.plugin.settings.maxElements, (id) => graph.node(id));
      if (plan.kind === 'error') return this.showError(plan.messages.join('\n'));
      if (plan.kind === 'table') {
        this.dropRenderer();
        this.body.empty();
        for (const n of [plan.notice, ...plan.notices]) if (n) this.body.createDiv({ cls: 'obsigraph-notice', text: n });
        renderTable(this.body, result, plan.indexes, (p) => this.openNote(p));
        return;
      }
      base = plan.elements;
      this.message.setText(plan.notices.join('\n'));
    } else if (this.focus && graph.node(this.focus)) {
      base = neighborhood(graph, this.focus);
    } else {
      this.dropRenderer();
      this.body.empty();
      this.message.setText('Open a note or enter a query.');
      return;
    }

    const elements = mergeElements(base, ...[...this.expanded].map((id) => neighborhood(graph, id)));
    const renderer = this.ensureRenderer();
    renderer.setStyler(this.plugin.makeStyler());
    renderer.setElements(elements);
  }

  // @tg: implements:: [[openspec:graph-view#Click to expand]]
  private ensureRenderer(): GraphRenderer {
    if (this.renderer) return this.renderer;
    this.body.empty();
    const host = this.body.createDiv();
    const expand = (id: string) => {
      this.expanded.add(id);
      this.renderer?.addElements(neighborhood(this.plugin.index.graph, id));
    };
    const renderer = new GraphRenderer(host, {
      height: 600,
      styler: this.plugin.makeStyler(),
      theme: () => themeFrom(host),
      onOpen: (path) => this.openNote(path),
      onExpand: expand,
      onContextMenu: (ev) => showGraphMenu(renderer, ev, { open: (path) => this.openNote(path), expand }),
      onSelect: (sel) => this.showDetails(sel),
      // The note being followed sits pinned at the centre; with a query there is no such note.
      layout: { pins: () => (this.query || !this.focus ? [] : [this.focus]) },
      onSettingsChange: (s) => this.saveLayout(s),
    });
    this.renderer = renderer;
    const saved = this.loadLayout();
    if (saved) renderer.updateSettings(saved);
    attachGraphControls(renderer, 'show');
    host.setCssStyles({ height: '100%', minHeight: '320px' });
    this.renderer.cy.resize();
    return this.renderer;
  }

  /** Panel settings are device-local state, like the details panel's toggles, not plugin settings. */
  private saveLayout(s: LayoutSettings): void {
    this.app.saveLocalStorage(LAYOUT_KEY, JSON.stringify(s));
  }

  private loadLayout(): { forces: Partial<ForceSettings>; display: Partial<DisplaySettings> } | null {
    let raw: unknown;
    try {
      raw = JSON.parse(String(this.app.loadLocalStorage(LAYOUT_KEY) ?? 'null'));
    } catch {
      return null;
    }
    if (typeof raw !== 'object' || raw === null) return null;
    const pick = <T extends object>(src: unknown, defaults: T): Partial<T> => {
      const out: Record<string, unknown> = {};
      if (typeof src !== 'object' || src === null) return out as Partial<T>;
      for (const [k, d] of Object.entries(defaults)) {
        const v = (src as Record<string, unknown>)[k];
        if (Array.isArray(d) ? Array.isArray(v) && v.every((x) => typeof x === 'string') : typeof v === typeof d) out[k] = v;
      }
      return out as Partial<T>;
    };
    const o = raw as { forces?: unknown; display?: unknown };
    return { forces: pick(o.forces, DEFAULT_FORCES), display: pick(o.display, DEFAULT_DISPLAY) };
  }

  // @tg: implements:: [[openspec:graph-view#Details panel]]
  private showDetails(sel: { kind: 'node' | 'edge'; id: string } | null): void {
    this.selection = sel;
    this.details.empty();
    if (!sel) return;
    const graph = this.plugin.index.graph;
    let d: Details | null = null;
    const styler = this.plugin.makeStyler();
    const schemas = this.plugin.index.schemas();
    if (sel.kind === 'node') {
      const n = graph.node(sel.id);
      const schema = n ? mergeSchemas(n.labels, schemas.schemas) : null;
      if (n) d = nodeDetails(n, styler.resolveNode(n.labels), schema ? new Set(schema.properties.map((p) => p.name)) : undefined);
    } else {
      const e = graph.edge(sel.id);
      const declared = e ? schemas.edgeTypes.get(e.type) : undefined;
      if (e) d = edgeDetails(e, graph, styler.resolveEdge(e.type, e.sign), declared ? new Set(declared.properties.map((p) => p.name)) : undefined);
    }
    if (!d) return;
    const technical = this.app.loadLocalStorage(TECHNICAL_KEY) === '1';
    const links = this.app.loadLocalStorage(LINKS_KEY) !== '0';
    const bar = this.details.createDiv({ cls: 'obsigraph-details-bar' });
    this.toggle(bar, 'Technical', 'Show graph bookkeeping and properties the schema does not declare', technical, (on) => {
      this.app.saveLocalStorage(TECHNICAL_KEY, on ? '1' : '0');
      this.details.toggleClass('obsigraph-hide-technical', !on);
    });
    this.toggle(bar, 'Links', 'Show [[links]] in values as clickable links instead of plain text', links, (on) => {
      this.app.saveLocalStorage(LINKS_KEY, on ? '1' : '0');
      this.showDetails(this.selection);
    });
    this.details.toggleClass('obsigraph-hide-technical', !technical);
    this.details.createEl('h4', { text: d.title });
    const table = this.details.createEl('table');
    // Note properties first, graph bookkeeping after.
    const rows = [...d.rows].sort((a, b) => Number(d.technical.has(a[0])) - Number(d.technical.has(b[0])));
    for (const [k, text] of rows) {
      const tr = table.createEl('tr');
      if (d.technical.has(k)) tr.addClass('obsigraph-technical');
      tr.createEl('th', { text: k });
      const td = tr.createEl('td');
      if (links && k in d.values) this.renderValue(td, d.values[k], d.source);
      else td.setText(text);
    }
  }

  private toggle(bar: HTMLElement, label: string, title: string, on: boolean, change: (on: boolean) => void): void {
    const l = bar.createEl('label', { attr: { title } });
    const box = l.createEl('input', { attr: { type: 'checkbox' } });
    box.checked = on;
    l.createSpan({ text: label });
    box.addEventListener('change', () => change(box.checked));
  }

  /** Text and links of a property value; links open their note, in a new tab with Cmd/Ctrl. */
  private renderValue(td: HTMLElement, value: unknown, source: string | null): void {
    const lines = valueLines(value, source);
    for (const parts of lines) {
      const host = lines.length > 1 ? td.createDiv() : td;
      for (const part of parts) {
        if ('text' in part) {
          host.appendText(part.text);
          continue;
        }
        const { target, subpath, label } = part.link;
        const href = subpath ? `${target}#${subpath}` : target;
        const a = host.createEl('a', { cls: 'internal-link', text: label, attr: { href, 'data-href': href, title: href } });
        if (!this.app.metadataCache.getFirstLinkpathDest(target, source ?? '')) a.addClass('is-unresolved');
        a.addEventListener('click', (ev) => {
          ev.preventDefault();
          void this.app.workspace.openLinkText(href, source ?? '', ev.ctrlKey || ev.metaKey);
        });
      }
    }
  }

  /** Drag the handle between the graph and the details pane to set the pane's width. */
  private initResizer(main: HTMLElement): void {
    const saved = Number(this.app.loadLocalStorage(WIDTH_KEY));
    if (saved > 0) this.details.style.width = `${saved}px`;
    this.resizer.addEventListener('pointerdown', (down) => {
      down.preventDefault();
      this.resizer.setPointerCapture(down.pointerId);
      const move = (ev: PointerEvent) => {
        const box = main.getBoundingClientRect();
        this.details.style.width = `${Math.max(MIN_DETAILS_WIDTH, Math.min(box.width * 0.7, box.right - ev.clientX))}px`;
        this.renderer?.cy.resize();
      };
      const up = () => {
        this.resizer.removeEventListener('pointermove', move);
        this.resizer.removeEventListener('pointerup', up);
        this.renderer?.cy.resize();
        this.app.saveLocalStorage(WIDTH_KEY, String(Math.round(this.details.getBoundingClientRect().width)));
      };
      this.resizer.addEventListener('pointermove', move);
      this.resizer.addEventListener('pointerup', up);
    });
  }

  private showError(msg: string): void {
    this.dropRenderer();
    this.body.empty();
    this.body.createDiv({ cls: 'obsigraph-error', text: msg });
  }

  private dropRenderer(): void {
    this.renderer?.destroy();
    this.renderer = null;
    this.details.empty();
  }

  private openNote(path: string): void {
    this.plugin.openNote(path, this.app.workspace.getActiveFile()?.path ?? '');
  }
}
