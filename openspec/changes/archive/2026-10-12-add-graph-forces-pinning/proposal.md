## Why

Graphs are laid out once with Cytoscape's `cose` and then frozen: nodes cannot be arranged, a block cannot keep its own note in the middle, edges cut through nodes, labels pile up, and there are no controls like those of Obsidian's graph.

## What Changes

- A live force simulation replaces the one-shot layout, with Obsidian's forces (centre, repel, link force, link distance) plus node-edge repulsion and label repulsion.
- Nodes can be pinned: dragging pins, shift-click toggles, and a right-click menu offers pin, unpin, open, expand and re-center. The note that holds a block (or that the Graph view follows) is pinned at the canvas centre.
- A gear panel over every graph (block and Graph view) has Display, Edge types (show or hide per type), Forces and Pins sections, reset, and "Copy as block options".
- Block headers accept `forces:`, `display:`, `pin:` and `controls:` for initial values.
- Right-click no longer expands a node when the host has a menu; expand moves into the menu. Long-press still expands, and the VS Code webview keeps right-click expand.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `graph-ui`: forces, pinning and controls settings.
- `graph-query-block`: layout header options.

## Impact

- `packages/graph-ui`: `Simulation`, layout settings and header parsers, `GraphRenderer` options and methods, display rules in `buildStylesheet`. The VS Code webview gets the live layout with default settings and no panel.
- `packages/plugin`: header parsing, the controls panel, the context menu, Graph view persistence in local storage, styles.
- `lat.md/visualization`, `lat.md/tests/graph-ui`, `lat.md/tests/graph-query-block`, tests.
