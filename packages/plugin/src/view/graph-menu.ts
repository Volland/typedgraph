import { Menu } from 'obsidian';
import type { GraphContextEvent, GraphRenderer } from '@obsigraph/graph-ui';

export interface GraphMenuActions {
  open: (path: string) => void;
  /** Only the Graph view can expand a node in place. */
  expand?: (id: string) => void;
}

/**
 * Right-click menu over a graph: pin actions for the node under the pointer (or the whole selection when it
 * is part of one), open and expand for notes, and graph-wide unpin and re-center.
 */
// @lat: [[visualization#Forces and pinning]]
// @tg: implements:: [[openspec:graph-ui#Forces, pinning and controls]]
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
    menu.addSeparator();
  }
  if (selected.length > 0) menu.addItem((i) => i.setTitle('Pin/unpin selected').setIcon('pin').onClick(() => renderer.togglePinSelected()));
  menu.addItem((i) => i.setTitle('Unpin all').setIcon('pin-off').onClick(() => renderer.unpinAll()));
  menu.addItem((i) => i.setTitle('Re-center').setIcon('locate-fixed').onClick(() => renderer.recenter()));
  menu.showAtPosition({ x: ev.x, y: ev.y });
}
