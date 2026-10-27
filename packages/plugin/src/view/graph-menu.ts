import { Menu } from 'obsidian';
import type { GraphContextEvent, GraphRenderer } from '@obsigraph/graph-ui';

export interface GraphMenuActions {
  open: (path: string) => void;
  /** Only the Graph view can expand a node in place. */
  expand?: (id: string) => void;
  /** Only the Graph view keeps a set of nodes the user took out. Drop the neighbors that hang off this node alone. */
  collapse?: (id: string) => void;
  /** Take this node out of the view, with the nodes that hang off it alone. */
  remove?: (id: string) => void;
}

/**
 * Right-click menu over a graph: pin actions for the node under the pointer (or the whole selection when it
 * is part of one), open, expand, collapse and remove for notes, and graph-wide unpin and re-center.
 */
// @tg: implements:: [[visualization#Forces and pinning]] {since: "2026-10-12"}
// @lat: [[visualization#Forces and pinning]]
// @tg: implements:: [[openspec:graph-ui#Forces, pinning and controls]]
// @tg: implements:: [[openspec:graph-view#Remove and collapse]] {since: "2026-10-24"}
export function showGraphMenu(renderer: GraphRenderer, ev: GraphContextEvent, actions: GraphMenuActions): void {
  const menu = new Menu();
  const selected = renderer.selectedIds();
  const { kind, id, path } = ev.target;
  if (kind === 'node' && id) {
    const ids = selected.includes(id) ? selected : [id];
    const all = ids.every((i) => renderer.isPinned(i));
    menu.addItem((i) =>
      i
        .setTitle(`${all ? 'Unpin' : 'Pin'} ${ids.length > 1 ? `${ids.length} nodes` : 'node'}`)
        .setIcon(all ? 'pin-off' : 'pin')
        .onClick(() => renderer.setPinned(ids, !all)),
    );
    if (path) menu.addItem((i) => i.setTitle('Open note').setIcon('file-text').onClick(() => actions.open(path)));
    const expand = actions.expand;
    if (expand) menu.addItem((i) => i.setTitle('Expand neighbors').setIcon('git-fork').onClick(() => expand(id)));
    const { collapse, remove } = actions;
    if (collapse) menu.addItem((i) => i.setTitle('Collapse neighbors').setIcon('minimize-2').onClick(() => collapse(id)));
    if (remove) menu.addItem((i) => i.setTitle('Remove from view').setIcon('eye-off').onClick(() => remove(id)));
    menu.addSeparator();
  }
  if (selected.length > 0) menu.addItem((i) => i.setTitle('Pin/unpin selected').setIcon('pin').onClick(() => renderer.togglePinSelected()));
  menu.addItem((i) => i.setTitle('Unpin all').setIcon('pin-off').onClick(() => renderer.unpinAll()));
  menu.addItem((i) => i.setTitle('Re-center').setIcon('locate-fixed').onClick(() => renderer.recenter()));
  menu.showAtPosition({ x: ev.x, y: ev.y });
}
