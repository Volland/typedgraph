## Why

The Graph view follows the active note only when the query box is empty. Exploring longer paths currently requires hard-coding a note path, which stops the query from following the user's navigation.

## What Changes

- Bind `$activeFile` to the tracked Markdown note's vault-relative path in full-pane Graph view queries.
- Track Markdown file-open events while a query is present and rerun the query when the active note changes.
- Keep the last Markdown path when focus leaves Markdown; bind `null` before any note is active.
- Document the behavior and verify each scenario using the real query engine with a stubbed Obsidian shell.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `graph-view`: add `[[openspec:graph-view#Active file query parameter]]` with scenarios for anchored paths, note changes, non-Markdown focus, and no active note.

## Impact

- Implementation: `packages/plugin/src/view/graph-view.ts`; the engine already accepts parameters, so its parser and execution interface stay unchanged.
- Tests: `packages/plugin/test/active-file.test.ts`.
- Intent: `[[visualization#Active note in queries]]`, `[[tests/graph-view#Active file query parameter]]`, and `[[tests/graph-view#Active file before a note is opened]]`.
- Binding decision: `[[visualization#Surfaces]]` motivates keeping the active-note context in the full-pane view. `tg cypher` finds the existing `motivated_by` edge from the active-note decision to Surfaces; no additional external constraints or contradictory decisions were found in this area.
