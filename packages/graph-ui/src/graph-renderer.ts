import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import { sameElementSet, type EdgeElement, type GraphElements, type NodeElement } from './elements';
import { buildStylesheet, type Theme } from './styles';
import type { Styler } from './styler';
import { resolveSettings, type DisplaySettings, type ForceSettings, type LayoutSettings } from './layout-options';
import { fitAroundOrigin, nodeLabelWidth, Simulation } from './simulation';

/** Where and on what a right-click happened, in viewport coordinates. */
export interface GraphContextEvent {
  target: { kind: 'node' | 'edge' | 'background'; id?: string; path?: string };
  x: number;
  y: number;
}

/** An edge type present in the graph, for visibility toggles. */
export interface EdgeTypeInfo {
  type: string;
  count: number;
  color: string;
}

export interface RendererOptions {
  height: number;
  styler: Styler;
  /** Colors for text and background, read from the host on every restyle so the graph follows theme changes. */
  theme: () => Theme;
  /** Called on double-click or modifier-click of a non-stub node. */
  onOpen?: (path: string) => void;
  /** Called when the selection changes; null when cleared. */
  onSelect?: (sel: { kind: 'node' | 'edge'; id: string } | null) => void;
  /** Called when a node's expand action fires (long-press, and right-click when `onContextMenu` is not set). */
  onExpand?: (id: string) => void;
  /** Option/Alt-click on a node: the host expands its neighbors or collapses them. */
  onToggleNeighbors?: (id: string) => void;
  /** Saved node positions. When every node has one the simulation is not warmed up and they are used as given. */
  positions?: Record<string, { x: number; y: number }>;
  /** Called on right-click; when set, right-click no longer expands a node, so the host can offer expand in its menu. */
  onContextMenu?: (e: GraphContextEvent) => void;
  /** Initial force and display settings, and the nodes to pin (first at the canvas centre), re-read on every relayout. */
  layout?: { forces?: Partial<ForceSettings>; display?: Partial<DisplaySettings>; pins?: () => string[] };
  /** Called after the settings changed through `updateSettings` or `resetSettings`, e.g. to persist them. */
  onSettingsChange?: (s: LayoutSettings) => void;
}

/**
 * Shared Cytoscape renderer for inline query blocks and the Graph view, so an
 * element looks the same everywhere. Visual attributes come from a styler and
 * are stored as element data, so restyling never moves nodes. Positions come from a live force
 * simulation in which nodes can be pinned; see {@link Simulation}.
 */
// @tg: implements:: [[visualization#Surfaces]] {since: "2026-10-04"}
// @lat: [[visualization#Surfaces]]
// @tg: implements:: [[openspec:graph-ui#Host-independent rendering]]
// @tg: implements:: [[openspec:graph-view#Edge presentation]]
// @tg: implements:: [[openspec:graph-view#Shared renderer]]
// @tg: implements:: [[openspec:graph-ui#Forces, pinning and controls]]
export class GraphRenderer {
  readonly cy: Core;
  private styler: Styler;
  private readonly model = new Map<string, NodeElement | EdgeElement>();
  private readonly current: LayoutSettings;
  private readonly sim: Simulation;
  private readonly cyNodes = new Map<string, cytoscape.NodeSingular>();
  private readonly moved = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private raf = 0;
  private dead = false;
  /** Refit after the layout cools, until the user pans or zooms. */
  private autoFit = true;
  /** Set once the user pans or zooms by hand; until then a change of the visible area refits the graph. */
  private touched = false;
  private readonly resizeObserver?: ResizeObserver;

  constructor(
    readonly container: HTMLElement,
    private readonly opts: RendererOptions,
  ) {
    this.styler = opts.styler;
    container.style.height = `${opts.height}px`;
    container.classList.add('obsigraph-graph');
    this.current = resolveSettings(opts.layout?.forces, opts.layout?.display);
    this.sim = new Simulation(this.current.forces, this.current.display);
    // No layout on the empty bootstrap graph: Cytoscape's default grid layout measures the container,
    // which may not be sized yet, and throws.
    this.cy = cytoscape({ container, elements: [], layout: { name: 'null' }, wheelSensitivity: 0.3, minZoom: 0.1, maxZoom: 4 });
    this.cy.style(buildStylesheet(opts.theme(), this.current.display));

    const target = (e: cytoscape.EventObject) => e.target as cytoscape.SingularElementReturnValue;
    this.cy.on('dbltap', 'node', (e) => this.open(target(e).data('path') as unknown));
    this.cy.on('tap', 'node', (e) => {
      const orig = e.originalEvent as MouseEvent | undefined;
      if (orig && (orig.metaKey || orig.ctrlKey)) this.open(target(e).data('path') as unknown);
      else if (orig?.altKey) opts.onToggleNeighbors?.(target(e).id());
    });
    this.cy.on('taphold', 'node', (e) => opts.onExpand?.(target(e).id()));
    this.cy.on('cxttap', (e) => this.contextMenu(e));
    this.cy.on('select', 'node, edge', (e) => opts.onSelect?.({ kind: target(e).isNode() ? 'node' : 'edge', id: target(e).id() }));
    this.cy.on('unselect', () => {
      if (this.cy.$(':selected').empty()) opts.onSelect?.(null);
    });

    // Dragging a node pins it where it is dropped; shift-click toggles a pin.
    this.cy.on('grab', 'node', (e) => {
      const s = this.sim.nodes.get(target(e).id());
      if (!s) return;
      s.dragging = true;
      this.moved.delete(s.id);
      this.heat(0.3);
    });
    this.cy.on('drag', 'node', (e) => {
      const n = target(e);
      const s = this.sim.nodes.get(n.id());
      if (!s) return;
      const p = n.position();
      s.x = p.x;
      s.y = p.y;
      s.vx = s.vy = 0;
      this.moved.add(s.id);
      this.heat(0.3);
    });
    this.cy.on('free', 'node', (e) => {
      const s = this.sim.nodes.get(target(e).id());
      if (!s) return;
      s.dragging = false;
      if (this.moved.has(s.id) && this.current.forces.pinOnDrag) {
        this.sim.setPinned(s.id, true);
        this.markPins();
      }
    });
    this.cy.on('tap', 'node', (e) => {
      const orig = e.originalEvent as MouseEvent | undefined;
      if (orig?.shiftKey) this.setPinned([target(e).id()], !this.isPinned(target(e).id()));
    });
    const stopAutoFit = () => {
      this.autoFit = false;
      this.touched = true;
    };
    container.addEventListener('wheel', stopAutoFit, { passive: true });
    container.addEventListener('pointerdown', stopAutoFit);
    container.addEventListener('contextmenu', (e) => e.preventDefault());
    // The visible area changes when the details pane is shown, hidden or resized: keep the graph centred in what is left.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.dead || this.cy.destroyed()) return;
        this.cy.resize();
        if (this.autoFit) this.fit();
        else if (!this.touched && this.sim.all.length > 0) this.cy.fit(undefined, 24);
      });
      this.resizeObserver.observe(container);
    }
  }

  /** The current settings; mutate only through `updateSettings`. */
  get settings(): Readonly<LayoutSettings> {
    return this.current;
  }

  /** Change settings: display changes restyle, force changes reheat the simulation. */
  updateSettings(patch: { forces?: Partial<ForceSettings>; display?: Partial<DisplaySettings> }): void {
    if (patch.forces) {
      Object.assign(this.current.forces, patch.forces);
      this.heat(0.5);
    }
    if (patch.display) {
      Object.assign(this.current.display, patch.display);
      if (patch.display.hide) this.current.display.hide = [...patch.display.hide];
      this.applyDisplay();
    }
    this.opts.onSettingsChange?.(this.current);
  }

  /** Back to the settings the renderer was created with. */
  resetSettings(): void {
    const base = resolveSettings(this.opts.layout?.forces, this.opts.layout?.display);
    this.updateSettings({ forces: base.forces, display: base.display });
    this.heat(0.6);
  }

  /** Edge types in the graph with counts and colours, plus hidden types that are currently absent. */
  edgeTypes(): EdgeTypeInfo[] {
    const out = new Map<string, EdgeTypeInfo>();
    this.cy.edges().forEach((e) => {
      const type = String(e.data('type'));
      const x = out.get(type) ?? { type, count: 0, color: String(e.data('color') ?? '') };
      x.count++;
      out.set(type, x);
    });
    for (const t of this.current.display.hide) if (!out.has(t)) out.set(t, { type: t, count: 0, color: '' });
    return [...out.values()].sort((a, b) => a.type.localeCompare(b.type));
  }

  /** Called after the element set changed, so a panel can refresh its edge-type list. */
  onElementsChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Select a node or edge by id, which reports it through `onSelect`. */
  select(id: string): void {
    const e = this.cy.getElementById(id);
    if (e.nonempty() && !e.selected()) e.select();
  }

  selectedIds(): string[] {
    return this.cy.nodes(':selected').map((n) => n.id());
  }

  isPinned(id: string): boolean {
    return this.sim.nodes.get(id)?.pinned ?? false;
  }

  setPinned(ids: string[], pinned: boolean): void {
    for (const id of ids) this.sim.setPinned(id, pinned);
    this.markPins();
    this.heat(0.3);
  }

  /** Pin the selected nodes, or unpin them when all of them already are. */
  togglePinSelected(): void {
    const ids = this.selectedIds();
    if (ids.length > 0) this.setPinned(ids, !ids.every((id) => this.isPinned(id)));
  }

  unpinAll(): void {
    this.sim.unpinAll();
    this.markPins();
    this.heat(0.6);
  }

  /** Fit the whole graph around the centre and follow it again until the next pan or zoom. */
  recenter(): void {
    this.autoFit = true;
    this.fit();
  }

  /**
   * Show exactly these elements. When the element set is unchanged only data
   * is refreshed, so live updates keep node positions.
   */
  setElements(g: GraphElements): void {
    const same = sameElementSet(this.model, g);
    this.model.clear();
    for (const x of [...g.nodes, ...g.edges]) this.model.set(x.id, x);
    if (same) {
      this.restyle();
      return;
    }
    this.cy.batch(() => {
      this.cy.elements().remove();
      this.cy.add(this.definitions(g));
    });
    this.layout();
  }

  /** Add elements without discarding existing ones. */
  // @tg: implements:: [[openspec:graph-view#Click to expand]]
  addElements(g: GraphElements): void {
    const fresh = [...g.nodes, ...g.edges].filter((x) => !this.model.has(x.id));
    if (fresh.length === 0) return;
    for (const x of fresh) this.model.set(x.id, x);
    const added = this.cy.add(this.definitions({ nodes: g.nodes.filter((n) => fresh.includes(n)), edges: g.edges.filter((e) => fresh.includes(e)) }));
    if (added.nodes().length > 0 || added.edges().length > 0) this.layout();
  }

  /** Swap the styler and update element data in place, without re-layout. */
  // @tg: implements:: [[openspec:visualization-config#Live style updates]]
  setStyler(styler: Styler): void {
    this.styler = styler;
    this.restyle();
  }

  destroy(): void {
    this.dead = true;
    this.resizeObserver?.disconnect();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.cy.destroy();
  }

  private restyle(): void {
    this.cy.batch(() => {
      this.cy.style(buildStylesheet(this.opts.theme(), this.current.display));
      for (const [id, x] of this.model) {
        const ele = this.cy.getElementById(id);
        if (ele.nonempty()) ele.data(isEdge(x) ? this.styler.edge(x) : { ...this.styler.node(x) });
      }
    });
    this.markTypes();
  }

  private applyDisplay(): void {
    this.cy.style(buildStylesheet(this.opts.theme(), this.current.display));
    this.markTypes();
  }

  private markTypes(): void {
    const hide = new Set(this.current.display.hide);
    this.cy.batch(() => {
      this.cy.edges().forEach((e) => {
        e.toggleClass('type-hidden', hide.has(String(e.data('type'))));
      });
      // A node whose edges are all of hidden types goes with them; unconnected and pinned nodes stay.
      this.cy.nodes().forEach((n) => {
        const edges = n.connectedEdges();
        const orphaned = edges.nonempty() && edges.filter('.type-hidden').length === edges.length && !this.isPinned(n.id());
        n.toggleClass('type-hidden', orphaned);
      });
    });
  }

  private markPins(): void {
    this.cy.batch(() => {
      for (const s of this.sim.all) this.cyNodes.get(s.id)?.toggleClass('pinned', s.pinned);
    });
  }

  private contextMenu(e: cytoscape.EventObject): void {
    const t = e.target as cytoscape.SingularElementReturnValue | Core;
    const kind = t === this.cy ? 'background' : (t as cytoscape.SingularElementReturnValue).isNode() ? 'node' : 'edge';
    const ele = kind === 'background' ? null : (t as cytoscape.SingularElementReturnValue);
    if (!this.opts.onContextMenu) {
      if (ele && kind === 'node') this.opts.onExpand?.(ele.id());
      return;
    }
    const orig = e.originalEvent as MouseEvent | undefined;
    this.opts.onContextMenu({
      target: { kind, id: ele?.id(), path: kind === 'node' ? (String(ele!.data('path') ?? '') || undefined) : undefined },
      x: orig?.clientX ?? 0,
      y: orig?.clientY ?? 0,
    });
  }

  private definitions(g: GraphElements): ElementDefinition[] {
    return [
      ...g.nodes.map((n) => ({
        group: 'nodes' as const,
        data: { id: n.id, labels: n.labels, path: n.path ?? '', ...this.styler.node(n) },
        classes: n.stub ? ['stub'] : [],
      })),
      ...g.edges.map((e) => ({
        group: 'edges' as const,
        data: { id: e.id, source: e.source, target: e.target, type: e.sign < 0 ? `−${e.type}` : e.type, sign: e.sign, ...this.styler.edge(e) },
        classes: e.sign < 0 ? ['negative'] : [],
      })),
    ];
  }

  /**
   * Hand the current elements to the simulation. A mostly new graph is settled at once and fitted;
   * otherwise (an expansion, a vault edit) existing nodes keep their place and the new ones ease in.
   */
  private layout(): void {
    this.cyNodes.clear();
    const nodes = this.cy.nodes().map((n) => {
      this.cyNodes.set(n.id(), n);
      return { id: n.id(), labelWidth: nodeLabelWidth(String(n.data('label') ?? '')) };
    });
    const links = this.cy.edges().map((e) => ({ source: String(e.data('source')), target: String(e.data('target')), type: String(e.data('type') ?? '') }));
    const { fresh } = this.sim.sync({ nodes, links });
    this.sim.autoPin(this.opts.layout?.pins?.() ?? []);
    const saved = this.opts.positions;
    const restored = fresh && !!saved && nodes.length > 0 && nodes.every((n) => !!saved[n.id]);
    if (restored) for (const s of this.sim.all) Object.assign(s, { x: saved![s.id]!.x, y: saved![s.id]!.y, vx: 0, vy: 0 });
    this.apply();
    this.markPins();
    this.markTypes();
    for (const cb of this.listeners) cb();
    if (restored) {
      this.autoFit = false;
      this.cy.fit(undefined, 24);
    } else if (fresh) {
      this.autoFit = true;
      this.sim.warmUp();
      this.apply();
      this.fit();
    } else {
      this.heat(0.5);
    }
  }

  private heat(alpha: number): void {
    this.sim.reheat(alpha);
    if (!this.raf && !this.dead) this.raf = requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.raf = 0;
    if (this.dead || this.cy.destroyed()) return;
    const running = this.sim.tick();
    this.apply();
    if (running) this.raf = requestAnimationFrame(() => this.frame());
    else if (this.autoFit) this.fit();
  }

  /** Copy simulated positions to Cytoscape; a node under the pointer keeps the pointer's position. */
  private apply(): void {
    this.cy.batch(() => {
      for (const s of this.sim.all) if (!s.dragging) this.cyNodes.get(s.id)?.position({ x: s.x, y: s.y });
    });
  }

  private fit(): void {
    const v = fitAroundOrigin(this.sim.all, this.cy.width(), this.cy.height());
    if (v) this.cy.viewport(v);
  }

  private open(path: unknown): void {
    if (typeof path === 'string' && path) this.opts.onOpen?.(path);
  }
}

function isEdge(x: NodeElement | EdgeElement): x is EdgeElement {
  return 'source' in x;
}
