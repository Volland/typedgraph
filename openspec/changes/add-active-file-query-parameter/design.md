## Context

`GraphView` already tracks a Markdown note path for its empty-query neighborhood. The query engine accepts a parameter map, but the view previously passed only the query text and ignored file-open events while a query was present.

## Decisions

### Bind the tracked path as an engine parameter

Pass `{ activeFile: this.focus }` to the existing engine interface. This keeps the path as data, including quotes or spaces, and avoids query-string substitution or parser changes. The view retains the last Markdown path when focus moves to its query box or another non-Markdown surface.

- motivated_by:: [[visualization#Surfaces]]

The decision is recorded in `[[visualization#Active note in queries]]`. A literal note path was rejected because it cannot follow navigation; reading the current workspace file on every refresh was rejected because non-Markdown focus should not discard the tracked note.

### Refresh queries on Markdown file-open events

Use the existing event handler even while a query is entered. This updates the parameter and resets expansions and removals on note switches, consistently with the empty-query view. All queries rerun, including those that do not reference `$activeFile`; this avoids introducing query-text inspection solely to suppress refreshes.

## Constraints

Use the existing engine parameter interface and the view's existing Markdown file-open lifecycle. This change introduces no new external constraints, dependencies, parser syntax, or inline query-block bindings.

## Validation

Run the graph-view regression tests, TypeScript checks, `tg check`, `tg ontology check`, and `tg trace graph-view --gaps`. Verify all scenarios of the new requirement have test annotations; record existing capability gaps separately.
