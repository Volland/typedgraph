---
type: Decision
openspec: [graph-query-block, graph-ui, graph-view, visualization-config]
---
# Visualization

Graph rendering is done by the plugin itself with Cytoscape.js, because the core graph view cannot show edge labels, signs or typed shapes.

## Surfaces

Two surfaces share one renderer and one config: inline `graph-query` blocks and a full-pane Graph view leaf.

Both use [[packages/graph-ui/src/graph-renderer.ts#GraphRenderer]]. Inline blocks are driven by [[packages/plugin/src/query/query-block.ts#QueryBlock]], which re-runs only while visible and reuses its renderer across refreshes to avoid flicker; [[packages/plugin/src/query/plan.ts#planRender]] picks graph or table and falls back to a table above the element cap. Only the leaf, [[packages/plugin/src/view/graph-view.ts#GraphView]], supports click-to-expand of neighbors; with an empty query it follows the active note's [[packages/graph-ui/src/view-state.ts#neighborhood]] and keeps expanded nodes across live refreshes. Patching or replacing the core graph view is explicitly out of scope; see [[visualization#Core graph view]].

The leaf opens from the command palette or a ribbon button. The button and the leaf's tab use a custom "TG" icon registered in [[packages/plugin/src/icon.ts#registerTgIcon]], so they don't look like the core Graph view's icon.

## Shared renderer

The renderer, styler, style sheet and view-state live in the host-independent `graph-ui` package so the Obsidian plugin and the VS Code extension draw identical graphs.

Hosts supply a theme function instead of the renderer reading host variables: the plugin reads Obsidian CSS variables in [[packages/plugin/src/render/theme.ts#themeFrom]], the extension's webview reads `--vscode-*` variables. The renderer re-reads the theme on every restyle so theme switches apply. A test keeps the package free of `obsidian` and `vscode` imports; see [[tests/graph-ui]]. The VS Code webview is a third surface for the same renderer, described in [[vscode#Graph webview]].

The renderer starts Cytoscape with the `null` layout, so the empty bootstrap graph is never laid out against a container that may not be sized yet, and [[packages/plugin/src/query/query-block.ts#QueryBlock]] defers its first render by one animation frame (cancelled on unload) so the container is attached and sized when Cytoscape measures it. Without both, a `view: graph` block crashed on every render with a zero-width container (issue #3).

## Node captions

A node is drawn with its title, followed by ` — ` and the note's frontmatter `subtitle` when it has one, so many `spec.md` or `design.md` notes stay apart in one graph.

The title is the frontmatter `title`, the document title or the file name, in that order (see [[graph-model#Node types]]): `title` replaces the file name everywhere, including queries, while `subtitle` only adds to what the graph shows. [[packages/graph-ui/src/elements.ts#nodeCaption]] builds the text for node labels, the details panel heading and edge endpoint names, so every host shows the same caption. A type's `label` property in its schema style still wins over it. OpenSpec accepts frontmatter in `spec.md` and `design.md`, so a capability or change can carry its own subtitle.

## Code nodes

Derived `CodeFile` and `CodeSymbol` nodes from the code layer share the renderer: distinct built-in shapes and colors, a Code dropdown in the Graph view and a `code: hide` block option; see [[cli#Code layer]].

The Graph view dropdown writes the plugin's `codeMode` setting, so the layer is global rather than per block; `code: hide` only filters what one block draws.

## Core graph view

Obsidian's core Graph view is never patched; type coloring there is documented as a zero-code recipe using core color groups such as `[type:Person]`.

The core view has no plugin API. Decorating it means reaching into its private renderer, as Graph Link Types and Extended Graph do. That code breaks on Obsidian updates and needs the `any` casts the directory review flags. It would also only label edges the core view already draws: one line per note pair, so parallel edges collapse into one, and there are no edge properties, stubs, schema styles or queries. Users get the full model in [[visualization#Surfaces]] and color their types in the core view with groups. A later optional, off-by-default "decorate core graph" setting may add edge labels and negative-edge colors, but only if users ask for it. It would check that the internals exist and do nothing when they don't.

## Styling

Node and edge styles are generated as Cytoscape style sheets from type definitions: color, shape, icon, label and sign rendering.

Precedence, highest first, per attribute: `graph-query` block header (`node.<Type>:` / `edge.<type>:` lines), schema notes (a type's `visualization` block, with `edges` for edge types, and an `edgeTypes` entry's own `visualization`, which wins per attribute), plugin settings, built-in default. All schema notes form one level, so a multi-label node takes each attribute from its first label that supplies it. Settings rank below schema notes because they are device-local and do not sync. Resolved by [[packages/core/src/style/style.ts#resolveNodeStyle]] and [[packages/core/src/style/style.ts#resolveEdgeStyle]]; invalid values are dropped with a diagnostic naming source and attribute and fall through.

Node attributes are color, shape, icon (Lucide, drawn as a white SVG background) and label property; edge attributes are color and line. Negative edges default to dashed red and always get a tee arrow and a minus prefix; stubs are faded and dashed. [[packages/graph-ui/src/styler.ts#makeStyler]] turns resolved styles into element data for a data-driven sheet from [[packages/graph-ui/src/styles.ts#buildStylesheet]], so a style change or an unchanged query result restyles in place without moving nodes. The Graph view details panel shows each attribute's origin. Theme colors are read from Obsidian CSS variables. Vaults beyond roughly 5-10k nodes are handled by scoping queries, not by swapping renderer.

## Details panel

The Graph view's details panel lists the selection's properties, with note properties first and graph bookkeeping hidden behind a toggle, links drawn as links, and a width the user sets.

[[packages/graph-ui/src/view-state.ts#nodeDetails]] and [[packages/graph-ui/src/view-state.ts#edgeDetails]] classify each row: a node's `labels`, `stub` and `path`, an edge's `sign`, `id`, declaring `note` and `heading`, every `style.*` row and any property the schema does not declare are technical; `type` and `types` always count as note properties, and with no schema every property is one. [[packages/graph-ui/src/view-state.ts#valueLines]] splits a value into text and link parts, one line per list item. The leaf in [[packages/plugin/src/view/graph-view.ts#GraphView]] adds a Technical toggle (off by default), a Links toggle (on by default) that falls back to the old plain text, links that open the note, and a drag handle between the graph and the panel. Width and toggles are device-local state in `app.saveLocalStorage`, not plugin settings, so changing them does not rebuild the index.

## Forces and pinning

Both surfaces lay nodes out with a live force simulation instead of a one-shot layout, and a gear button opens controls for forces, display, edge-type visibility and pinning.

[[packages/graph-ui/src/simulation.ts#Simulation]] is pure (no Cytoscape, no DOM) and [[packages/graph-ui/src/graph-renderer.ts#GraphRenderer]] copies its positions into Cytoscape on every animation frame. The forces are Obsidian's: a pull to the centre, node-node repulsion and link springs with the d3 degree bias. Two more are added: a node lying across an edge is pushed off it (the edge's end nodes take the opposite push), and overlapping node and edge label boxes are pushed apart by a position correction that is not drowned out by the springs and runs once more, at full strength, when the layout stops moving. Label overlap is best effort: a node's label and its own edge labels cannot be separated by moving that node.

Pinned nodes are held fixed and the rest spread around them. Dragging a node pins it where it is dropped (`pinOnDrag`), shift-click toggles a pin, and pinned nodes get an accent border. [[packages/graph-ui/src/simulation.ts#Simulation#autoPin]] pins a list of ids: the first at the origin, which is the canvas centre, the others on a ring; it does nothing for an unchanged list, so unpinning sticks. A block pins the note that holds it by default and the Graph view pins the note it follows. A mostly new graph is settled at once and fitted around the origin; otherwise existing nodes keep their place and new ones ease in next to a neighbour. The view follows the layout until the user pans or zooms.

The panel is [[packages/plugin/src/view/graph-controls.ts#attachGraphControls]]: Display (arrows, edge labels, text fade threshold, node size, link thickness), Edge types (a toggle per type, with counts), Forces (centre, repel, link force, link distance, node-edge repel, label repel, pin on drag) and Pins, plus reset and "Copy as block options". Hiding an edge type is only visual; it does not change the layout. Right-click opens [[packages/plugin/src/view/graph-menu.ts#showGraphMenu]] with the pin actions, open, and (in the Graph view) expand; hosts without a menu, such as the VS Code webview, keep right-click as expand. The Graph view remembers panel values in `app.saveLocalStorage`; a block does not write back to its note.

A block sets its starting values in header lines, parsed by [[packages/graph-ui/src/layout-options.ts#parseForces]] and its siblings:

- `forces: center=0.3, repel=19.7, link=0.68, distance=235, edgeRepel=0.44, labelRepel=0.83, pinOnDrag=true` (ranges: center 0-1, repel 0-20, link 0-1, distance 30-500, edgeRepel 0-1, labelRepel 0-1; 0 turns node-edge or label repulsion off)
- `display: arrows=true, edgeLabels=true, fade=0.12, nodeSize=0.75, linkSize=0.5, hide=requirement|feature` (`hide` lists edge types separated by `|`; a negative edge is named with its minus)
- `pin: self` (default), `none`, or note names resolved like wikilinks; the first goes to the centre
- `controls: show` (default), `open` or `hide`

Any subset may be given; the values above are the defaults.
