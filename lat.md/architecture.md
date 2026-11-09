---
type: Decision
openspec: [node-vault-loader]
---
# Architecture

A standalone Obsidian plugin that turns a vault into a typed, labeled, signed property graph with openCypher queries, plus an optional sidecar that serves the same graph as RAG storage.

## Standalone plugin

The plugin owns its parser, index and graph view and does not require Dataview or Graph Link Types. It reads Graph Link Types' inline-field syntax for compatibility only.

Edge properties, signed edges and typed nodes do not fit Dataview's page-and-field model, and the core graph view cannot draw labeled edges, so building on either would mean fighting both.

## Monorepo layout

Packages share one model: `core` (no Obsidian APIs), `plugin` (Obsidian UI), `sidecar` (headless Node service), `cli` (`tg`), and three host-independent helpers, `node-vault`, `graph-ui` and `vscode`.

`core` holds the [[edge-syntax|edge parser]], the [[graph-model|graph model]], schema handling, the [[query-engine|Cypher subset engine]] and the [[vector-search#Edge verbalization|edge verbalizer]]. Keeping it free of Obsidian imports lets the [[sidecar]] reuse it unchanged.

`node-vault` is the stateless Node half of reading a vault: [[packages/node-vault/src/index.ts#listNotes]] (Markdown and AsciiDoc) and [[packages/node-vault/src/index.ts#readNote]] turn a directory into note inputs for the graph. The sidecar and the VS Code extension both use it; watching stays per host. `graph-ui` is the shared renderer, see [[visualization#Shared renderer]]. `vscode` is the extension, see [[vscode]].

## Source of truth

Markdown files are the only source of truth; every other store (in-memory index, Ladybug mirror, vector index) is derived and rebuildable.

See [[ladybug-mirror#One-way mirror]] for why writes never flow from a database back into notes.

## Stub re-resolution by name

A new note re-resolves only the links whose stubs carry its file name. Before, it re-resolved every note linking to any stub, which made indexing quadratic.

- motivated_by:: [[graph-model#Nodes]] {weight: primary, since: "0.25.0", note: "stubs are keyed by link text"}
- motivated_by:: [[architecture#Source of truth]] {weight: secondary, note: "the index is rebuilt from the files at every start, so build time is felt every time"}

Every host's resolver (Obsidian's metadata cache, [[packages/core/src/graph/resolve.ts#pathResolver]], the lat.md name map) resolves a link only to a note whose file name matches the link's last segment, case-insensitively. That makes the file name a safe key. Names that share a key by accident only cost an extra re-resolve. In issue #11, a vault of 5,600 notes and 230,000 edges took about 20 minutes to index. On a synthetic vault of that shape, core indexing went from about 12 minutes (extrapolated from 5.2 s for 500 notes and 21.8 s for 1,000) to 1.2 s.

## No parse cache yet

The plugin re-reads and re-parses every indexed note at startup instead of persisting parsed results keyed by modification time and size.

- motivated_by:: [[architecture#Source of truth]] {weight: primary, since: "0.25.0", note: "a persisted parse is one more derived store that can go stale"}
- motivated_by:: [[architecture#Stub re-resolution by name]] {weight: secondary, note: "with linear indexing the remaining startup cost is reading files"}

Revisit this when startup on a large vault, measured after the linear fix, is still slow. The cache would need to cover edges, diagnostics, embeds and AsciiDoc sections, and be rebuilt whenever an edge setting or the cache format changes.
