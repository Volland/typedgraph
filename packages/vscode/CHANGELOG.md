# Changelog

## 0.13.0

- **Live force layout.** The graph panel lays nodes out with a force simulation instead of a one-shot layout: nodes keep settling, a node lying across an edge is pushed off it and overlapping labels move apart. Drag a node to pin it where you drop it and shift-click to toggle a pin; pinned nodes get an accent border. Right-click still expands a node. Default node size, link thickness and label fade are smaller.
- The HTML export starts at the saved layout and settles under the same forces when you drag a node.

## 0.12.0

- **Node subtitles.** A note's frontmatter `subtitle` is drawn after its title, as `spec — billing`, in the graph panel, the details panel and the HTML and PDF exports, so notes that share a file name such as `spec.md` stay apart.

## 0.11.0

- **AsciiDoc notes.** `.adoc` files are indexed as notes beside markdown: properties from a leading `////` block and `:tg-*:` attributes, edges from `// @tg:` comments, with backlinks and the graph for `.adoc` editors. The setting `typegraph.asciidoc` (default on) turns it off, and the file watcher and activation cover `.adoc`.
- **New typed notes** keep the format of the type's template: an `.adoc` template creates an `.adoc` note with its properties filled in.

## 0.10.1

- **Fixed an empty graph on first open.** The new panel takes focus before it reports ready, so no file was active and the *Active file* graph stayed empty until you switched editors. It now starts from the file you had open, and an empty graph says why in the toolbar.

## 0.10.0

- **Whole project graph.** The new command `TypeGraph: Open Full Graph`, a button in the Backlinks title bar and a *Whole project* toggle in the graph panel draw every node and edge. The setting `typegraph.fullGraphLimit` (default 2000) caps it, keeping the most connected nodes and saying how many were left out.
- **Export as HTML.** `TypeGraph: Export Graph as HTML` saves a single self-contained page with the panel's layout, pan, zoom and a details panel; it loads nothing from the network.
- **Export as PDF.** `TypeGraph: Export Graph as PDF` saves a one-page vector PDF with selectable labels, a white background, and the scope and node and edge counts in its caption and metadata.
- The graph panel has a toolbar with the scope toggle and Export HTML and Export PDF buttons.

## 0.9.2

- **Set up TypeGraph** lists the new `tg-migrate` skill among the files `tg init` installs. With `tg` 0.18 or later, `tg migrate` turns a lat.md project into a typed graph: typed files, typed links with metadata, and `@tg:` code edges.

## 0.9.1

- The README describes the current `tg init`: it sets up Claude Code, Codex, Cursor, GitHub Copilot, OpenCode, Kilo Code, Pi, Oh My Pi or any `AGENTS.md` agent, writes the files, and prints only the diff with `--dry-run`.

## 0.9.0

- **Set up TypeGraph** now opens the new `tg init` setup in the terminal: pick your coding agents (Claude Code, Codex, Cursor, GitHub Copilot, OpenCode or any `AGENTS.md` agent), what to set up or update, and whether docs live in `lat.md/` or `tg.md/`. The confirmation lists the default files, including the code ontology's `Types/code-types.md` and its templates in `Templates/`.
- A workspace whose docs are in `tg.md/` counts as set up, like one with `lat.md/`.
- The README covers the setup, skills for every agent, and the OpenSpec rules that make generated tasks annotate code and tests.

## 0.8.5

- The graph no longer runs a layout on an empty, not yet sized canvas, which could throw on first render (from #4 by @ma-be).

## 0.8.4

- The README describes the `tg` CLI (lat.md compatible checks, typed code annotations, Cypher, trace and validate) and the agent setup: hooks, MCP server and skills.

## 0.8.3

- Edge notes: a note with `type: edge`, `from`, `to` and `edgeType` frontmatter shows as an edge between its endpoints in the graph, and opening it shows that edge. Backlinks for such an edge open the edge note.

## 0.8.2

- Setup now lists the three new `tg` skills (`tg-trace`, `tg-impact`, `tg-audit`) among the files `tg init` will create.

## 0.8.1

- The graph clears expanded nodes when you switch to another file, as in Obsidian; expansions still survive refreshes of the same file, and the last file stays shown while focus is in the graph.
- The Backlinks view says when the active file is outside `typegraph.roots`, and shows the "Set up TypeGraph" offer as the welcome view or as a row below the backlinks.

## 0.8.0

- **New typed notes.** `TypeGraph: New Typed Note` (command palette, the Explorer folder menu and the Backlinks title bar) creates a note from a type declared in your schema folder (`typegraph.schemaFolder`, default `Types/`), using the type's template and never overwriting a file.
- **Generated ids.** Types can ask for ids with the new `id` key of TGS 0.2: a random UUID, a time-ordered UUID v7, a timestamp, or a Luhmann id.
- **Luhmann branching.** `TypeGraph: New Child Note` and `New Sibling Note` create the next free id (`1` to `1a` to `1a1`, `1b`, `2`) next to the active note, with a link back through the template.
- Templates may use `{{title}}`, `{{date}}`, `{{id}}`, `{{parent-link}}` and more.
- The extension now writes files, but only the notes you create with these commands.

## 0.7.0

- Setup now installs `tg` 0.7.0, which adds `tg schema export` and `tg schema import` for exchanging Typed Graph Schema notes with SHACL. The extension itself does not read schema notes, so nothing else changes in the editor.

## 0.6.0

- Typed edges written with markdown links (`knows:: [Bob](/people/bob.md)`) show up in backlinks and the graph, so Open Knowledge Format bundles work.
- A frontmatter `title` is used as the node title in the graph.
- Published on Open VSX as `pavlyshyn.typegraph-vscode`; the manifest's publisher now matches.

## 0.5.0

- Typed backlinks panel for the active markdown note or source file, grouped by edge type with sign and properties.
- Source files show the `lat.md` sections their `@lat` annotations point at, and sections show the code that points back.
- Graph view of the active file's neighborhood, with click-to-expand, using VS Code theme colors.
- "Set up TypeGraph" runs `tg init` in a visible terminal after you confirm the files it will touch.
- `typegraph.roots` and `typegraph.ignore` settings. No telemetry.
