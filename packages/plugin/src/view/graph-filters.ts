import { Menu, setIcon } from 'obsidian';
import { EMPTY_VALUE, propertyValues, typeCounts, typesOf, type GraphElements, type NodeElement, type ViewFilters } from '@obsigraph/graph-ui';

/** What the Graph view lends the controls panel so it can filter the nodes it shows. */
export interface FilterHost {
  filters: ViewFilters;
  /** Everything in the view that was not removed by hand: the nodes the filters choose from. */
  candidates(): GraphElements;
  removedCount(): number;
  restoreRemoved(): void;
  /** Called after `filters` changed, so the view can redraw. */
  changed(): void;
}

/**
 * The "Node types" section of the controls panel: one row per type in the view with a checkbox to show
 * or remove it, and a filter button that opens the type's properties with the values they have, to
 * keep only nodes with the checked ones.
 */
// @tg: implements:: [[visualization#Graph view filters]] {since: "2026-10-24"}
// @lat: [[visualization#Graph view filters]]
export function renderNodeTypes(host: HTMLElement, filterHost: FilterHost, open: Set<string>, rerender: () => void): void {
  const { filters } = filterHost;
  host.empty();
  const types = typeCounts(filterHost.candidates());
  const change = () => {
    filterHost.changed();
    rerender();
  };

  const bar = host.createDiv({ cls: 'obsigraph-controls-row obsigraph-controls-links' });
  bar.createEl('a', { text: 'All' }).addEventListener('click', () => {
    filters.hiddenTypes.clear();
    change();
  });
  bar.createEl('a', { text: 'None' }).addEventListener('click', () => {
    for (const t of types) filters.setTypeHidden(t.type, true);
    change();
  });
  if (filters.active) {
    bar.createEl('a', { text: 'Clear filters' }).addEventListener('click', () => {
      filters.clear();
      change();
    });
  }
  const removed = filterHost.removedCount();
  if (removed > 0) {
    bar.createEl('a', { text: `Restore removed (${removed})`, attr: { title: 'Show the nodes taken out with "Remove from view" and "Collapse neighbors" again' } }).addEventListener('click', () => {
      filterHost.restoreRemoved();
      rerender();
    });
  }
  if (types.length === 0) host.createDiv({ cls: 'obsigraph-controls-hint', text: 'No nodes' });

  for (const t of types) {
    const filtered = filters.filteredProperties(t.type);
    const row = host.createDiv({ cls: 'obsigraph-controls-row' });
    const label = row.createEl('label', { cls: 'obsigraph-controls-type' });
    const input = label.createEl('input', { type: 'checkbox' });
    input.checked = !filters.hiddenTypes.has(t.type);
    label.createSpan({ text: t.type });
    input.addEventListener('change', () => {
      filters.setTypeHidden(t.type, !input.checked);
      change();
    });
    const right = row.createDiv({ cls: 'obsigraph-controls-right' });
    right.createSpan({ cls: 'obsigraph-controls-value', text: String(t.count) });
    const button = right.createEl('button', {
      cls: `obsigraph-filter-button clickable-icon${filtered.length > 0 ? ' is-active' : ''}`,
      attr: { 'aria-label': filtered.length > 0 ? `Filtered on ${filtered.join(', ')}` : `Filter ${t.type} nodes by property values` },
    });
    setIcon(button, 'filter');
    button.addEventListener('click', () => {
      if (!open.delete(t.type)) open.add(t.type);
      rerender();
    });
    if (open.has(t.type)) renderValueFilters(host.createDiv({ cls: 'obsigraph-filter-props' }), filterHost, t.type, change);
  }
}

function renderValueFilters(host: HTMLElement, filterHost: FilterHost, type: string, change: () => void): void {
  const { filters } = filterHost;
  const props = propertyValues(filterHost.candidates(), type, filters.filteredProperties(type));
  host.createDiv({ cls: 'obsigraph-controls-hint', text: 'Check the values to keep. Several values of one property are alternatives; each filtered property has to match.' });
  if (props.size === 0) host.createDiv({ cls: 'obsigraph-controls-hint', text: 'No properties with values to filter on.' });
  for (const [prop, counts] of [...props].sort((a, b) => a[0].localeCompare(b[0]))) {
    const accepted = filters.acceptedValues(type, prop);
    const d = host.createEl('details', { cls: 'obsigraph-filter-prop' });
    d.open = accepted.size > 0;
    d.createEl('summary', { text: accepted.size > 0 ? `${prop} (${accepted.size})` : prop });
    const list = d.createDiv();
    const bar = list.createDiv({ cls: 'obsigraph-controls-row obsigraph-controls-links' });
    bar.createEl('a', { text: 'Clear' }).addEventListener('click', () => {
      filters.setValues(type, prop, []);
      change();
    });
    for (const [key, count] of [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
      const row = list.createDiv({ cls: 'obsigraph-controls-row' });
      const label = row.createEl('label', { cls: 'obsigraph-controls-type' });
      const box = label.createEl('input', { type: 'checkbox' });
      box.checked = accepted.has(key);
      label.createSpan({ text: key, cls: key === EMPTY_VALUE ? 'obsigraph-muted' : '' });
      row.createSpan({ cls: 'obsigraph-controls-value', text: String(count) });
      box.addEventListener('change', () => {
        const next = new Set(filters.acceptedValues(type, prop));
        if (box.checked) next.add(key);
        else next.delete(key);
        filters.setValues(type, prop, next);
        change();
      });
    }
  }
}

/**
 * A menu of the values `prop` has among the nodes of the type(s) of `node`, checked where the filter
 * accepts them; choosing one toggles it. Opened from the filter button next to a property in the details pane.
 */
// @tg: implements:: [[visualization#Graph view filters]] {since: "2026-10-24"}
// @lat: [[visualization#Graph view filters]]
export function showValueMenu(at: { x: number; y: number }, filterHost: FilterHost, node: NodeElement, prop: string, onChange: () => void): void {
  const { filters } = filterHost;
  const menu = new Menu();
  const types = typesOf(node);
  for (const type of types) {
    const counts = propertyValues(filterHost.candidates(), type, filters.filteredProperties(type)).get(prop);
    if (types.length > 1) menu.addItem((i) => i.setTitle(type).setDisabled(true));
    if (!counts) {
      menu.addItem((i) => i.setTitle(`No values to filter ${type} by`).setDisabled(true));
      continue;
    }
    const accepted = filters.acceptedValues(type, prop);
    for (const [key, count] of [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
      menu.addItem((i) =>
        i
          .setTitle(`${key} (${count})`)
          .setChecked(accepted.has(key))
          .onClick(() => {
            const next = new Set(filters.acceptedValues(type, prop));
            if (next.has(key)) next.delete(key);
            else next.add(key);
            filters.setValues(type, prop, next);
            filterHost.changed();
            onChange();
          }),
      );
    }
    if (accepted.size > 0) {
      menu.addItem((i) =>
        i
          .setTitle(`Clear ${prop} filter`)
          .setIcon('x')
          .onClick(() => {
            filters.setValues(type, prop, []);
            filterHost.changed();
            onChange();
          }),
      );
    }
    if (types.length > 1) menu.addSeparator();
  }
  menu.showAtPosition(at);
}
