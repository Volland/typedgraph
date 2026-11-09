## Why

Issue #11: on a vault of about 5,600 large notes (90,000 nodes, 230,000 edges, plain and frontmatter links as edges) the Obsidian plugin takes about 20 minutes to index on every startup and Obsidian lags while it runs. Profiling a synthetic vault of that shape showed the cost is not reading files: every new note re-resolved the edges of every note that links to any stub, so indexing was quadratic (500 notes 5.2 s, 1,000 notes 21.8 s; about 12 minutes extrapolated to 5,600). The plugin also cannot leave folders out, yields to the UI by note count rather than time, and recounts whole-vault diagnostics after every change.

## What Changes

- A new note re-resolves only the stubs that carry its file name, so indexing is linear (5,600 notes and 224,000 edges in about 1.2 s in core).
- Plugin settings for folders to index, folders to exclude, and following Obsidian's "Excluded files". Excluded notes are not indexed and links into them become stubs. The schema folder is always indexed.
- Startup indexing and re-indexing yield to the UI by time slice, reading a few files ahead.
- The status bar counts diagnostics once a change burst settles, not after every change.
- A "Re-index vault" command.

Persisting parsed notes between sessions (proposal 2 of the issue) is left out: with linear indexing the remaining startup cost is reading the files, and a cache would add invalidation risk for a gain to be measured first.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `graph-model`: modify `[[openspec:graph-model#Incremental updates]]`; add `[[openspec:graph-model#Indexed folders]]`, `[[openspec:graph-model#Responsive indexing]]` and `[[openspec:graph-model#Deferred diagnostics count]]`.

## Impact

- Core: `packages/core/src/graph/graph.ts` (stub name index).
- Plugin: `packages/plugin/src/vault-index.ts`, `note-scope.ts`, `status-count.ts`, `settings.ts`, `main.ts`, `schema-commands.ts`.
- Tests: `packages/core/test/graph.test.ts`, `packages/plugin/test/note-scope.test.ts`, `packages/plugin/test/vault-index-scope.test.ts`, `packages/plugin/test/status-count.test.ts`.
- Intent: `lat.md/graph-model.md`, `lat.md/architecture.md`, `lat.md/tests/graph-store.md`, `lat.md/tests/edge-settings.md`.
