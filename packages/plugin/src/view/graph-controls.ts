import { setIcon } from 'obsidian';
import { DISPLAY_RANGES, FORCE_RANGES, formatLayoutOptions, type ControlsMode, type GraphRenderer } from '@obsigraph/graph-ui';

/**
 * Gear button and panel over a graph, in the spirit of Obsidian's graph settings: Display, Edge types,
 * Forces and Pins. It only drives the renderer's public settings and pin methods, so it works for inline
 * blocks and the Graph view alike. `hide` adds nothing.
 */
// @lat: [[visualization#Forces and pinning]]
// @tg: implements:: [[openspec:graph-ui#Forces, pinning and controls]]
export function attachGraphControls(renderer: GraphRenderer, mode: ControlsMode): void {
  if (mode === 'hide') return;
  const root = renderer.container.createDiv({ cls: 'obsigraph-controls' });
  // Keep pointer and wheel input on the panel from reaching the graph underneath.
  for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'wheel', 'click', 'dblclick', 'contextmenu']) {
    root.addEventListener(ev, (e) => e.stopPropagation());
  }
  const button = root.createEl('button', { cls: 'obsigraph-controls-button clickable-icon', attr: { 'aria-label': 'Graph controls' } });
  setIcon(button, 'settings');
  const panel = root.createDiv({ cls: 'obsigraph-controls-panel' });
  panel.toggleClass('is-open', mode === 'open');
  button.addEventListener('click', () => panel.toggleClass('is-open', !panel.hasClass('is-open')));

  const refreshers: (() => void)[] = [];
  const section = (title: string) => {
    const d = panel.createEl('details', { cls: 'obsigraph-controls-section' });
    d.open = true;
    d.createEl('summary', { text: title });
    return d.createDiv();
  };
  const toggle = (parent: HTMLElement, label: string, get: () => boolean, set: (v: boolean) => void) => {
    const row = parent.createDiv({ cls: 'obsigraph-controls-row' });
    row.createSpan({ text: label });
    const input = row.createEl('input', { type: 'checkbox' });
    input.checked = get();
    input.addEventListener('change', () => set(input.checked));
    refreshers.push(() => (input.checked = get()));
  };
  const slider = (parent: HTMLElement, label: string, range: readonly [number, number], step: number, get: () => number, set: (v: number) => void, fmt: (v: number) => string) => {
    const wrap = parent.createDiv({ cls: 'obsigraph-controls-slider' });
    const top = wrap.createDiv({ cls: 'obsigraph-controls-row' });
    top.createSpan({ text: label });
    const val = top.createSpan({ cls: 'obsigraph-controls-value' });
    const input = wrap.createEl('input', { type: 'range', attr: { min: String(range[0]), max: String(range[1]), step: String(step) } });
    const show = () => {
      input.value = String(get());
      val.setText(fmt(get()));
    };
    show();
    refreshers.push(show);
    input.addEventListener('input', () => {
      set(Number(input.value));
      val.setText(fmt(get()));
    });
  };
  const two = (v: number) => v.toFixed(2);
  const d = () => renderer.settings.display;
  const f = () => renderer.settings.forces;

  const display = section('Display');
  toggle(display, 'Arrows', () => d().arrows, (arrows) => renderer.updateSettings({ display: { arrows } }));
  toggle(display, 'Edge labels', () => d().edgeLabels, (edgeLabels) => renderer.updateSettings({ display: { edgeLabels } }));
  slider(display, 'Text fade threshold', DISPLAY_RANGES.fade, 0.01, () => d().fade, (fade) => renderer.updateSettings({ display: { fade } }), two);
  slider(display, 'Node size', DISPLAY_RANGES.nodeSize, 0.05, () => d().nodeSize, (nodeSize) => renderer.updateSettings({ display: { nodeSize } }), two);
  slider(display, 'Link thickness', DISPLAY_RANGES.linkSize, 0.05, () => d().linkSize, (linkSize) => renderer.updateSettings({ display: { linkSize } }), two);

  const types = section('Edge types');
  const renderTypes = () => {
    types.empty();
    const list = renderer.edgeTypes();
    const bar = types.createDiv({ cls: 'obsigraph-controls-row obsigraph-controls-links' });
    const setAll = (hide: boolean) => {
      renderer.updateSettings({ display: { hide: hide ? list.map((t) => t.type) : [] } });
      renderTypes();
    };
    bar.createEl('a', { text: 'All' }).addEventListener('click', () => setAll(false));
    bar.createEl('a', { text: 'None' }).addEventListener('click', () => setAll(true));
    if (list.length === 0) types.createDiv({ cls: 'obsigraph-controls-hint', text: 'No edges' });
    for (const t of list) {
      const row = types.createDiv({ cls: 'obsigraph-controls-row' });
      const label = row.createEl('label', { cls: 'obsigraph-controls-type' });
      const input = label.createEl('input', { type: 'checkbox' });
      input.checked = !d().hide.includes(t.type);
      const swatch = label.createSpan({ cls: 'obsigraph-controls-swatch' });
      if (t.color) swatch.style.background = t.color;
      label.createSpan({ text: t.type });
      row.createSpan({ cls: 'obsigraph-controls-value', text: String(t.count) });
      input.addEventListener('change', () => {
        const hide = input.checked ? d().hide.filter((x) => x !== t.type) : [...d().hide, t.type];
        renderer.updateSettings({ display: { hide } });
      });
    }
  };
  renderTypes();
  renderer.onElementsChange(renderTypes);

  const forces = section('Forces');
  slider(forces, 'Center force', FORCE_RANGES.center, 0.01, () => f().center, (center) => renderer.updateSettings({ forces: { center } }), two);
  slider(forces, 'Repel force', FORCE_RANGES.repel, 0.1, () => f().repel, (repel) => renderer.updateSettings({ forces: { repel } }), (v) => v.toFixed(1));
  slider(forces, 'Link force', FORCE_RANGES.link, 0.01, () => f().link, (link) => renderer.updateSettings({ forces: { link } }), two);
  slider(forces, 'Link distance', FORCE_RANGES.distance, 5, () => f().distance, (distance) => renderer.updateSettings({ forces: { distance } }), (v) => String(Math.round(v)));
  slider(forces, 'Node-edge repel', FORCE_RANGES.edgeRepel, 0.01, () => f().edgeRepel, (edgeRepel) => renderer.updateSettings({ forces: { edgeRepel } }), two);
  slider(forces, 'Label repel', FORCE_RANGES.labelRepel, 0.01, () => f().labelRepel, (labelRepel) => renderer.updateSettings({ forces: { labelRepel } }), two);
  toggle(forces, 'Pin nodes on drag', () => f().pinOnDrag, (pinOnDrag) => renderer.updateSettings({ forces: { pinOnDrag } }));

  const pins = section('Pins');
  pins.createDiv({ cls: 'obsigraph-controls-hint', text: 'Drag a node to pin it. Shift-click or right-click toggles a pin. Pinned nodes keep their place; the rest spread around them.' });
  const buttons = pins.createDiv({ cls: 'obsigraph-controls-buttons' });
  const action = (text: string, run: (b: HTMLButtonElement) => void) => buttons.createEl('button', { text }).addEventListener('click', (e) => run(e.currentTarget as HTMLButtonElement));
  action('Pin/unpin selected', () => renderer.togglePinSelected());
  action('Unpin all', () => renderer.unpinAll());
  action('Re-center', () => renderer.recenter());
  action('Reset settings', () => {
    renderer.resetSettings();
    for (const r of refreshers) r();
    renderTypes();
  });
  action('Copy as block options', (b) => {
    void navigator.clipboard.writeText(formatLayoutOptions(renderer.settings)).then(() => {
      b.setText('Copied');
      window.setTimeout(() => b.setText('Copy as block options'), 1200);
    });
  });
}
