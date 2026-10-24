import { CypherError, mergeSchemas, type PropertySchema } from '@obsigraph/core';
import { applyFilters, chosenOptions, coerceInput, collapseTargets, fieldSpec, formatInput, isEmptyValue, nodeElement, removalTargets, typesOf, ViewFilters, type FieldSpec } from '@obsigraph/graph-ui';
import { ItemView, Notice, TFile, setIcon, type WorkspaceLeaf } from 'obsidian';
import type ObsigraphPlugin from '../main';
import { DEFAULT_OPTIONS } from '../query/block';
import { planRender } from '../query/plan';
import type { GraphElements } from '../render/elements';
import { DEFAULT_DISPLAY, DEFAULT_FORCES, GraphRenderer, type DisplaySettings, type ForceSettings, type LayoutSettings } from '../render/graph-renderer';
import { attachGraphControls } from './graph-controls';
import { showValueMenu, type FilterHost } from './graph-filters';
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
const NONEMPTY_KEY = 'obsigraph:details-nonempty';
const EDIT_KEY = 'obsigraph:details-edit';
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
  /** Nodes the user took out with "Remove from view" or "Collapse neighbors"; reset when the followed note or query changes. */
  private readonly removed = new Set<string>();
  /** Node types and property values the user filtered out. */
  private readonly filters = new ViewFilters();
  /** The elements the filters choose from (everything not removed by hand), and what is drawn. */
  private candidates: GraphElements = { nodes: [], edges: [] };
  private shown: GraphElements = { nodes: [], edges: [] };
  /** Path of a note just opened in the background, whose file-open event must not move this view. */
  private pendingBackground: string | null = null;

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
        if (file && file.path === this.pendingBackground) {
          this.pendingBackground = null;
          return;
        }
        if (this.query || !file || file.extension !== 'md') return;
        this.focus = file.path;
        this.expanded.clear();
        this.removed.clear();
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
    this.removed.clear();
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

    const merged = mergeElements(base, ...[...this.expanded].map((id) => neighborhood(graph, id)));
    this.candidates = applyFilters(merged, new ViewFilters(), this.removed);
    this.shown = applyFilters(merged, this.filters, this.removed);
    const selected = this.selection;
    const renderer = this.ensureRenderer();
    renderer.setStyler(this.plugin.makeStyler());
    renderer.setElements(this.shown);
    this.keepSelection(renderer, selected);
  }

  /** After a redraw: keep the selected element selected and its details current, or clear them if it is gone. */
  private keepSelection(renderer: GraphRenderer, sel: { kind: 'node' | 'edge'; id: string } | null): void {
    if (!sel) return;
    const present = sel.kind === 'node' ? this.shown.nodes.some((n) => n.id === sel.id) : this.shown.edges.some((e) => e.id === sel.id);
    if (!present) return this.showDetails(null);
    // Do not rebuild the pane under someone who is typing in it.
    if (this.details.contains(activeDocument.activeElement)) return;
    renderer.select(sel.id);
    this.showDetails(sel);
  }

  // @tg: implements:: [[openspec:graph-view#Click to expand]]
  private ensureRenderer(): GraphRenderer {
    if (this.renderer) return this.renderer;
    this.body.empty();
    const host = this.body.createDiv();
    const expand = (id: string) => {
      this.expanded.add(id);
      // Expanding brings back neighbors taken out earlier.
      for (const n of neighborhood(this.plugin.index.graph, id).nodes) this.removed.delete(n.id);
      this.refresh();
    };
    const collapse = (id: string) => this.take(collapseTargets(this.shown, id));
    const remove = (id: string) => this.take(removalTargets(this.shown, id));
    const renderer = new GraphRenderer(host, {
      height: 600,
      styler: this.plugin.makeStyler(),
      theme: () => themeFrom(host),
      onOpen: (path) => this.openNote(path),
      onExpand: expand,
      onContextMenu: (ev) => showGraphMenu(renderer, ev, { open: (path) => this.openNote(path), expand, collapse, remove }),
      onSelect: (sel) => this.showDetails(sel),
      // The note being followed sits pinned at the centre; with a query there is no such note.
      layout: { pins: () => (this.query || !this.focus ? [] : [this.focus]) },
      onSettingsChange: (s) => this.saveLayout(s),
    });
    this.renderer = renderer;
    const saved = this.loadLayout();
    if (saved) renderer.updateSettings(saved);
    attachGraphControls(renderer, 'show', this.filterHost());
    host.setCssStyles({ height: '100%', minHeight: '320px' });
    this.renderer.cy.resize();
    return this.renderer;
  }

  /** Take nodes out of the view until the followed note or the query changes. */
  // @tg: implements:: [[openspec:graph-view#Remove and collapse]] {since: "2026-10-24"}
  private take(ids: string[]): void {
    for (const id of ids) this.removed.add(id);
    this.refresh();
  }

  // @tg: implements:: [[openspec:graph-view#Graph view filters]] {since: "2026-10-24"}
  private filterHost(): FilterHost {
    return {
      filters: this.filters,
      candidates: () => this.candidates,
      removedCount: () => this.removed.size,
      restoreRemoved: () => {
        this.removed.clear();
        this.refresh();
      },
      changed: () => this.refresh(),
    };
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
    const node = sel.kind === 'node' ? graph.node(sel.id) : undefined;
    const schema = node ? mergeSchemas(node.labels, schemas.schemas) : null;
    if (node) {
      d = nodeDetails(node, styler.resolveNode(node.labels), schema ? new Set(schema.properties.map((p) => p.name)) : undefined);
    } else if (sel.kind === 'edge') {
      const e = graph.edge(sel.id);
      const declared = e ? schemas.edgeTypes.get(e.type) : undefined;
      if (e) d = edgeDetails(e, graph, styler.resolveEdge(e.type, e.sign), declared ? new Set(declared.properties.map((p) => p.name)) : undefined);
    }
    if (!d) return;
    const technical = this.app.loadLocalStorage(TECHNICAL_KEY) === '1';
    const links = this.app.loadLocalStorage(LINKS_KEY) !== '0';
    const withValues = this.app.loadLocalStorage(NONEMPTY_KEY) === '1';
    // Only a Markdown note in the vault has frontmatter to write to.
    const file = node && !node.stub ? this.app.vault.getAbstractFileByPath(node.id) : null;
    const editable = file instanceof TFile && file.extension === 'md' ? file : null;
    const edit = !!editable && this.app.loadLocalStorage(EDIT_KEY) === '1';
    const bar = this.details.createDiv({ cls: 'obsigraph-details-bar' });
    this.toggle(bar, 'Technical', 'Show graph bookkeeping and properties the schema does not declare', technical, (on) => {
      this.app.saveLocalStorage(TECHNICAL_KEY, on ? '1' : '0');
      this.details.toggleClass('obsigraph-hide-technical', !on);
    });
    this.toggle(bar, 'Links', 'Show [[links]] in values as clickable links instead of plain text', links, (on) => {
      this.app.saveLocalStorage(LINKS_KEY, on ? '1' : '0');
      this.showDetails(this.selection);
    });
    this.toggle(bar, 'Only with values', 'List only the properties that have a value', withValues, (on) => {
      this.app.saveLocalStorage(NONEMPTY_KEY, on ? '1' : '0');
      this.showDetails(this.selection);
    });
    if (editable) {
      this.toggle(bar, 'Edit', "Edit the note's properties here; a property with allowed values in its type's schema is a dropdown", edit, (on) => {
        this.app.saveLocalStorage(EDIT_KEY, on ? '1' : '0');
        this.showDetails(this.selection);
      });
    }
    this.details.toggleClass('obsigraph-hide-technical', !technical);
    this.details.createEl('h4', { text: d.title });
    if (node && !node.stub) {
      const actions = this.details.createDiv({ cls: 'obsigraph-details-actions' });
      const open = actions.createEl('button', { text: 'Open note', attr: { title: 'Open the note in a new tab without leaving this view' } });
      open.addEventListener('click', () => this.openInBackground(node.id));
    }
    const table = this.details.createEl('table');
    const rows = [...d.rows];
    // Editing can fill in a property the schema declares but the note does not have yet.
    if (edit && !withValues && schema) {
      for (const p of schema.properties) if (!rows.some((r) => r[0] === p.name)) rows.push([p.name, '']);
    }
    // Note properties first, graph bookkeeping after.
    rows.sort((a, b) => Number(d.technical.has(a[0])) - Number(d.technical.has(b[0])));
    for (const [k, text] of rows) {
      const value = k in d.values ? d.values[k] : text;
      if (withValues && (k in d.values ? isEmptyValue(value) : text.trim() === '' || text === '—')) continue;
      const tr = table.createEl('tr');
      if (d.technical.has(k)) tr.addClass('obsigraph-technical');
      const th = tr.createEl('th', { text: k });
      if (node && k in d.values) this.addFilterButton(th, node, k);
      const td = tr.createEl('td');
      const declared = schema?.properties.find((p) => p.name === k);
      if (edit && editable && (k in d.values || declared)) this.renderEditor(td, editable, k, k in d.values ? d.values[k] : null, declared);
      else if (links && k in d.values) this.renderValue(td, d.values[k], d.source);
      else td.setText(text);
    }
  }

  /** A filter icon next to a property: opens the values of that property among the nodes of the same type. */
  // @tg: implements:: [[openspec:graph-view#Graph view filters]] {since: "2026-10-24"}
  private addFilterButton(th: HTMLElement, node: { id: string; labels: string[] }, prop: string): void {
    const active = typesOf(node).some((t) => this.filters.filteredProperties(t).includes(prop));
    const button = th.createEl('button', { cls: `obsigraph-prop-filter clickable-icon${active ? ' is-active' : ''}`, attr: { 'aria-label': `Filter nodes by ${prop}` } });
    setIcon(button, 'filter');
    button.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const n = this.plugin.index.graph.node(node.id);
      if (!n) return;
      showValueMenu({ x: ev.clientX, y: ev.clientY }, this.filterHost(), nodeElement(n), prop, () => this.showDetails(this.selection));
    });
  }

  /** Open a note in a new tab behind this one, so the focus stays on the graph. */
  // @tg: implements:: [[openspec:graph-view#Details pane shortcuts]] {since: "2026-10-24"}
  private openInBackground(path: string): void {
    this.pendingBackground = path;
    window.setTimeout(() => {
      if (this.pendingBackground === path) this.pendingBackground = null;
    }, 1500);
    void this.app.workspace.openLinkText(path, '', 'tab', { active: false });
  }

  /** An input for one property, chosen from the schema (dropdown for enum values) or the value's type; it writes back on change. */
  // @tg: implements:: [[openspec:graph-view#Editable details]] {since: "2026-10-24"}
  // @lat: [[visualization#Editable details]]
  private renderEditor(td: HTMLElement, file: TFile, key: string, value: unknown, declared?: PropertySchema): void {
    const spec = fieldSpec(value, declared);
    const error = td.createDiv({ cls: 'obsigraph-edit-error' });
    const commit = (raw: string | boolean | string[], control?: HTMLElement) => {
      const c = coerceInput(spec, raw);
      control?.toggleClass('is-invalid', !c.ok);
      error.setText(c.ok ? '' : c.error);
      if (c.ok) void this.writeProperty(file, key, c.value);
    };
    this.editorControl(td, spec, value, commit);
    td.append(error); // below the control
  }

  private editorControl(td: HTMLElement, spec: FieldSpec, value: unknown, commit: (raw: string | boolean | string[], control?: HTMLElement) => void): HTMLElement {
    switch (spec.kind) {
      case 'boolean': {
        const box = td.createEl('input', { attr: { type: 'checkbox' } });
        box.checked = value === true;
        box.addEventListener('change', () => commit(box.checked, box));
        return box;
      }
      case 'enum': {
        const select = td.createEl('select');
        select.createEl('option', { value: '', text: '' });
        const current = chosenOptions(value)[0];
        const options = spec.options.map(String);
        if (current !== undefined && !options.includes(current)) options.push(current);
        for (const o of options) select.createEl('option', { value: o, text: o });
        select.value = current ?? '';
        select.addEventListener('change', () => commit(select.value, select));
        return select;
      }
      case 'enum-list': {
        const wrap = td.createDiv({ cls: 'obsigraph-enum-list' });
        const chosen = new Set(chosenOptions(value));
        const options = [...new Set([...spec.options.map(String), ...chosen])];
        const boxes: HTMLInputElement[] = [];
        for (const o of options) {
          const l = wrap.createEl('label');
          const box = l.createEl('input', { attr: { type: 'checkbox' } });
          box.checked = chosen.has(o);
          box.dataset.option = o;
          boxes.push(box);
          l.createSpan({ text: o });
          box.addEventListener('change', () => commit(boxes.filter((b) => b.checked).map((b) => b.dataset.option ?? ''), wrap));
        }
        return wrap;
      }
      case 'longtext': {
        const area = td.createEl('textarea');
        area.value = formatInput(spec, value);
        area.rows = Math.min(10, Math.max(3, area.value.split('\n').length));
        area.addEventListener('change', () => commit(area.value, area));
        return area;
      }
      default: {
        const date = spec.kind === 'date' && /^(\d{4}-\d{2}-\d{2})?$/.test(formatInput(spec, value));
        const input = td.createEl('input', { attr: { type: date ? 'date' : 'text', ...(spec.kind === 'datetime' ? { placeholder: 'YYYY-MM-DDTHH:mm' } : {}), ...(spec.kind === 'list' ? { placeholder: 'a, b, c' } : {}) } });
        input.value = formatInput(spec, value);
        input.addEventListener('change', () => commit(input.value, input));
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') input.blur();
        });
        return input;
      }
    }
  }

  /** Write one property into the note's frontmatter, as the Properties editor does. */
  private async writeProperty(file: TFile, key: string, value: unknown): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        fm[key] = value;
      });
    } catch (e) {
      new Notice(`Could not save ${key}: ${e instanceof Error ? e.message : String(e)}`);
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
    this.candidates = this.shown = { nodes: [], edges: [] };
    this.details.empty();
  }

  private openNote(path: string): void {
    this.plugin.openNote(path, this.app.workspace.getActiveFile()?.path ?? '');
  }
}
