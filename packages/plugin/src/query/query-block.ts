import { CypherError, styleSource, type QueryResult } from '@obsigraph/core';
import { getIcon, requestUrl } from 'obsidian';
import { runRemote, type Fetcher } from './remote';
import { MarkdownRenderChild } from 'obsidian';
import type ObsigraphPlugin from '../main';
import { GraphRenderer } from '../render/graph-renderer';
import { themeFrom } from '../render/theme';
import { renderTable } from '../render/table';
import { parseBlock, type ParsedBlock } from './block';
import { planRender } from './plan';
import { noteContext, substituteVariables } from './variables';
import { attachGraphControls } from '../view/graph-controls';
import { showGraphMenu } from '../view/graph-menu';

/**
 * One rendered `graph-query` block. Re-runs on vault changes while visible;
 * changes that arrive while hidden are applied when it scrolls back into view.
 */
// @tg: implements:: [[query-engine#Query block]] {since: "2026-10-03"}
// @lat: [[query-engine#Query block]]
export class QueryBlock extends MarkdownRenderChild {
  private renderer: GraphRenderer | null = null;
  private warnEl: HTMLElement | null = null;
  private visible = true;
  private dirty = false;
  private observer: IntersectionObserver | null = null;
  private frame: number | null = null;
  private generation = 0;
  private retryTimer: number | null = null;
  /** The `pin` option of the latest parse; read on every relayout so edits to it apply without a new renderer. */
  private pin: string[] = [];

  constructor(
    containerEl: HTMLElement,
    private readonly source: string,
    private readonly sourcePath: string,
    private readonly plugin: ObsigraphPlugin,
  ) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.addClass('obsigraph-block');
    // Wait a frame so the container is attached and sized before Cytoscape measures it.
    this.frame = window.requestAnimationFrame(() => {
      this.frame = null;
      this.render();
    });
    this.register(this.plugin.index.onChange(() => this.refresh()));
    this.register(this.plugin.onStylesChanged(() => this.refresh()));
    if (typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver((entries) => {
        this.visible = entries.some((e) => e.isIntersecting);
        if (this.visible && this.dirty) this.refresh();
      });
      this.observer.observe(this.containerEl);
    }
  }

  onunload(): void {
    this.generation++;
    if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.observer?.disconnect();
    this.renderer?.destroy();
    this.renderer = null;
  }

  // @tg: implements:: [[openspec:graph-query-block#Live refresh]]
  private refresh(): void {
    if (!this.visible) {
      this.dirty = true;
      return;
    }
    this.dirty = false;
    this.render();
  }

  // @tg: implements:: [[openspec:graph-query-block#Errors shown in place]]
  // @tg: implements:: [[openspec:ladybug-backend#Backend selection]]
  private render(): void {
    const el = this.containerEl;
    if (!this.plugin.index.ready) {
      el.empty();
      el.createDiv({ cls: 'obsigraph-status', text: 'Indexing vault…' });
      return;
    }

    const parsed = parseBlock(this.source);
    if (parsed.errors.length > 0) {
      return this.showErrors(parsed.errors.map((e) => `Line ${e.line + 1}: ${e.message}`));
    }

    // Note variables ({{path}}, {{fm.status}}, ...) become literals before the query is parsed.
    const note = noteContext(this.sourcePath, this.plugin.app.metadataCache.getCache(this.sourcePath)?.frontmatter);
    parsed.query = substituteVariables(parsed.query, note);

    const backend = parsed.options.backend ?? this.plugin.settings.defaultBackend;
    if (backend === 'ladybug') {
      void this.renderRemote(parsed);
      return;
    }

    let result;
    try {
      result = this.plugin.index.engine.run(parsed.query);
    } catch (e) {
      if (e instanceof CypherError) {
        // Map query positions back to lines in the block.
        const where = e.line > 0 ? ` (line ${e.line + parsed.queryLine}, column ${e.column})` : '';
        return this.showErrors([`${label(e.kind)}: ${e.message}${where}`]);
      }
      throw e;
    }
    this.show(parsed, result);
  }

  /** Ladybug queries go to the sidecar; late answers from older runs are dropped. */
  private async renderRemote(parsed: ParsedBlock): Promise<void> {
    const gen = ++this.generation;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    if (!this.renderer && !this.containerEl.hasChildNodes()) {
      this.containerEl.createDiv({ cls: 'obsigraph-status', text: 'Running on Ladybug…' });
    }
    const { sidecarUrl, sidecarToken } = this.plugin.settings;
    const outcome = await runRemote(obsidianFetch, { url: sidecarUrl, token: sidecarToken }, parsed.query);
    if (gen !== this.generation) return;
    if (outcome.kind === 'retry') {
      this.showErrors([`${outcome.message} Retrying…`]);
      this.retryTimer = window.setTimeout(() => this.refresh(), outcome.afterMs);
      return;
    }
    if (outcome.kind === 'error') {
      const where = outcome.line > 0 ? ` (line ${outcome.line + parsed.queryLine}, column ${outcome.column})` : '';
      return this.showErrors([`${outcome.message}${where}`]);
    }
    this.show(parsed, outcome.result);
  }

  private show(parsed: ParsedBlock, result: QueryResult): void {
    const el = this.containerEl;
    const graph = this.plugin.index.graph;
    const plan = planRender(result, parsed.options, this.plugin.settings.maxElements, (id) => graph.node(id));
    if (plan.kind === 'error') return this.showErrors(plan.messages);

    if (plan.kind === 'graph') {
      // Block header styles win over schema notes and settings; bad values only warn.
      const header = styleSource('block header', null, parsed.styles.nodes, parsed.styles.edges, (n) => getIcon(n) !== null);
      const styler = this.plugin.makeStyler(header.source);
      this.pin = parsed.options.pin;
      // Reuse the renderer across refreshes to avoid flicker and keep positions.
      if (!this.renderer) {
        el.empty();
        this.warnEl = el.createDiv({ cls: 'obsigraph-notice' });
        const host = el.createDiv();
        const renderer = new GraphRenderer(host, {
          height: parsed.options.height,
          styler,
          theme: () => themeFrom(host),
          onOpen: (path) => this.plugin.openNote(path, this.sourcePath),
          onContextMenu: (ev) => showGraphMenu(renderer, ev, { open: (path) => this.plugin.openNote(path, this.sourcePath) }),
          layout: { forces: parsed.options.forces, display: parsed.options.display, pins: () => this.resolvePins() },
        });
        attachGraphControls(renderer, parsed.options.controls);
        this.renderer = renderer;
      } else {
        this.renderer.setStyler(styler);
      }
      this.warnEl?.setText([...plan.notices, ...header.diagnostics.map((d) => d.message)].join('\n'));
      this.renderer.setElements(plan.elements);
      return;
    }

    this.renderer?.destroy();
    this.renderer = null;
    const frag = createDiv();
    for (const n of [plan.notice, ...plan.notices]) if (n) frag.createDiv({ cls: 'obsigraph-notice', text: n });
    renderTable(frag, result, plan.indexes, (path) => this.plugin.openNote(path, this.sourcePath));
    el.replaceChildren(...Array.from(frag.childNodes));
  }

  /** `self` is the note holding the block; other entries resolve like wikilinks from it. Node ids are note paths. */
  private resolvePins(): string[] {
    return this.pin.map((p) => (p === 'self' ? this.sourcePath : (this.plugin.app.metadataCache.getFirstLinkpathDest(p, this.sourcePath)?.path ?? p)));
  }

  // @tg: implements:: [[openspec:graph-query-block#Errors shown in place]]
  private showErrors(messages: string[]): void {
    this.renderer?.destroy();
    this.renderer = null;
    const el = this.containerEl;
    el.empty();
    const box = el.createDiv({ cls: 'obsigraph-error' });
    for (const m of messages) box.createDiv({ text: m });
  }
}

function label(kind: CypherError['kind']): string {
  return kind === 'syntax' ? 'Syntax error' : kind === 'unsupported' ? 'Unsupported' : kind === 'readonly' ? 'Read-only' : 'Query error';
}

/** `requestUrl` avoids CORS and works on mobile. */
const obsidianFetch: Fetcher = async (req) => {
  const res = await requestUrl({ url: req.url, method: req.method, headers: req.headers, body: req.body, throw: false });
  let json: unknown = null;
  try {
    json = res.json;
  } catch {
    json = null;
  }
  return { status: res.status, json };
};
