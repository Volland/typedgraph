---
type: Decision
openspec: [vscode-extension, graph-export]
---
# VS Code Extension

A VS Code extension that shows typed backlinks and the graph for a workspace's markdown and annotated code without Obsidian, and leads users to set up the `tg` CLI.

The extension is a thin adapter in [[packages/vscode/src/extension.ts#activate]]; everything it shows comes from pure modules that run without VS Code, so [[tests/vscode-extension]] covers them directly. It bundles `core`, `node-vault` and `graph-ui`, so installing it needs no CLI, server or Obsidian.

## Workspace index

The extension builds the typed graph in process from the configured roots and keeps it current per file.

[[packages/vscode/src/workspace-index.ts#WorkspaceIndex]] lists markdown and supported source files under `typegraph.roots` (default the workspace folder) with [[packages/node-vault/src/index.ts#listFiles]], skipping dot folders and `typegraph.ignore` names such as `node_modules`. Node ids are workspace-relative paths. Markdown feeds the core graph; source files feed the code layer in `annotated` mode and a per-file annotation index. The index never writes into the workspace. VS Code's file watcher drives updates in the adapter, unlike the sidecar's `fs.watch` with polling; only the stateless reading is shared. Loading is lazy: the first view or command triggers it, and a settings change reloads it. Only the first workspace folder is indexed. `.adoc` files are indexed as notes beside markdown unless `typegraph.asciidoc` is off, and the file watcher includes them ([[asciidoc#Hosts route by extension]]).

## Backlinks

The Backlinks view lists, for the active file, what points at it, grouped by edge type with sign and properties; click opens the source at the line.

[[packages/vscode/src/backlinks.ts#backlinksFor]] is pure over the index. For a note it groups incoming note edges by type and adds a `referenced from code` group built from annotations, because the code layer's graph edges would lose the heading written in the comment. For a source file it lists the notes its `@lat` and `@tg` annotations point at, with the link as written. It works at whole-file granularity; tracking the cursor's symbol is a later step. Files outside the roots or without edges give an empty result. [[packages/vscode/src/backlinks.ts#panelRows]] turns that into the view's rows: a file outside `typegraph.roots` (or outside the workspace folder) gets its own message, distinct from "No typed edges". While setup is needed, the view returns no rows when no file is active, because VS Code shows the viewsWelcome "Set up TypeGraph" content only for an empty tree, and otherwise appends a "Set up TypeGraph" row after the backlinks so the offer never blocks them.

## Graph webview

A webview renders the active file's neighborhood, or the whole project, with the shared renderer, using VS Code theme colors.

The extension host owns the graph and posts plain element data; the webview bundle runs `graph-ui`, because Cytoscape needs a DOM. [[packages/vscode/src/graph-session.ts#GraphSession]] merges the active file's neighborhood with the neighborhoods of expanded nodes, so expansions survive refreshes of the same file and vanish when their nodes do. Switching the active file clears them, as Obsidian does; when no text editor is active, for example while the webview has focus, the session keeps the last file and its expansions. Opening the panel shows the session the active file first, because the new panel takes focus before it reports ready; an empty graph says why in the toolbar note. Nodes use the built-in type styles only: the webview passes no schema-note or settings styles to the styler. Expand is right-click or long-press, open is double-click, the same as the Obsidian leaf.

## Whole project graph

The graph panel can draw every node and edge of the index instead of the active file's neighborhood, so a project's shape is visible at once.

[[packages/graph-ui/src/view-state.ts#projectElements]] returns all nodes and edges, or, past `typegraph.fullGraphLimit` (default 2000), the most connected nodes (ties broken by id, so the choice is stable) with only the edges among them and a count of what was left out. [[packages/vscode/src/graph-session.ts#GraphSession]] has a scope: `file` (the default, and what `typegraph.openGraph` selects) or `project`, which ignores the active file and expansions and refreshes with file changes like the neighborhood does. `typegraph.openFullGraph` selects `project`; a toolbar at the top of the webview (Active file, Whole project, a size note that says when nodes were left out, and the export buttons) switches it by posting a `scope` message. The panel keeps its context while hidden, so layout survives tab switches.

## Graph export

The graph in the panel can be saved as one standalone HTML page or as a one-page vector PDF, from commands, title-bar buttons or the panel toolbar.

Commands and buttons all take one path: the host posts `capture` to the webview, which reads what the file needs from Cytoscape and answers with an `export` message; the host builds the file and writes only the path chosen in a save dialog, so the extension still writes nowhere else. With no panel open the command opens one (active-file scope) and waits for it to load, for up to ten seconds. [[packages/vscode/src/export.ts#buildHtml]] inlines the data (with `<` escaped, so a note title cannot close the script), the node positions, the theme colors and the viewer bundle `dist/viewer.js` (built from `src/webview/viewer.ts`, the same renderer plus a details panel) into one page whose policy allows no network, so the page shows the panel's layout without running a new one. [[packages/vscode/src/pdf.ts#buildGraphPdf]] writes PDF 1.4 by hand from a scene read from the renderer (positions, size, shape, color, labels): paths, arrowheads and Helvetica text, so it stays sharp and searchable, with the scope, node and edge counts and any nodes left out in a caption and in the Subject metadata. The page is the drawing's bounding box, scaled down only past the PDF limit of 14400 units. It is always black on white, since colors come from the styler and not the theme. Characters outside Latin-1 are drawn as `?` in the PDF; the HTML keeps them. The exported page shows its details panel by toggling an `open` class rather than assigning styles, which the Obsidian community review lints for across the whole repository.

## Set up TypeGraph

A welcome-view action runs `tg init --write` in a visible terminal when the workspace lacks a docs folder (`lat.md/` or `tg.md/`) or a tg instruction block.

It lists the files the defaults would touch and asks to confirm first; the terminal then shows the checklists for coding agents and parts.

[[packages/vscode/src/setup.ts#runSetup]] prefers a global `tg` and falls back to `npx @typedgraph/cli init --write`. The extension never writes setup files itself, so `tg` stays the single owner of what init does; [[packages/vscode/src/setup.ts#SETUP_FILES]] is checked against the CLI's own plan by a test. The action shows while the workspace has no docs folder or no tg-managed instruction block, and backlinks work either way. This is the funnel: users see value from backlinks first, then one click leads to agent integration.

## Creating notes

TypeGraph: New Typed Note creates a note from a declared type, and the child and sibling commands branch from the active note's Luhmann id.

[[packages/vscode/src/new-note.ts#planWorkspaceNote]] is pure over the index: it finds the type in the schema folder (`typegraph.schemaFolder`, default `Types/`), reads the linked template note from disk, and returns a path and content with ids and template tokens filled in by core's planner. The adapter offers a type picker with each type's id kinds and its `description` (its properties when it has none, [[elements#Descriptions]]), asks for a title, never overwrites an existing file, and opens the new note. The command is also in the Explorer folder menu, which picks the folder. Child and sibling commands need the active note to have a value for its type's Luhmann id property; they create a note of the same type next to it with the next free id and a link back through the template's `{{parent-link}}`. When the type's template is an `.adoc` file the planned note is `.adoc` with its leading block and `:tg-*:` entries filled in ([[packages/core/src/schema/adocnote.ts#renderAdocNote]]).

## Privacy

The extension reads the workspace and writes only the notes a user creates with the New Typed Note commands, collects no telemetry and makes no network requests of its own.

A test scans the sources for networking imports. The only outward step is the setup command the user confirms, and `npx` may then download the CLI.

## Publishing

One packaged `.vsix` is published to both the VS Code Marketplace and Open VSX by a script that refuses to publish anywhere unless both tokens are present.

The publisher (namespace) is `pavlyshyn`, so the id is `pavlyshyn.typegraph-vscode` and the Open VSX page is `open-vsx.org/extension/pavlyshyn/typegraph-vscode`; the npm scope `@typedgraph` is separate. The extension versions independently of the root version bump; it is live on both registries (the Marketplace page is `marketplace.visualstudio.com/items?itemName=pavlyshyn.typegraph-vscode`), and a lone Open VSX publish is `npx ovsx publish packages/vscode/typegraph.vsix -p $OVSX_PAT`.

`npm run package:vscode` builds the bundles and runs `vsce package`; `npm run release:vscode` calls `scripts/release-vscode.mjs` with `VSCE_PAT` and `OVSX_PAT`, supports `--dry-run`, and publishes the same file to both registries so they cannot diverge. Publishing needs the maintainer's tokens and is not part of CI. The `@typedgraph/cli` version the setup flow downloads must be published to npm first, or setup falls back to an older release without the code layer.
