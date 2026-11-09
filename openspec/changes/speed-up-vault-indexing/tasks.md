## 1. Core

- [x] 1.1 Index stubs by file name in `Graph`; a new note re-resolves only the stubs with its name.
- [x] 1.2 Test that a new note re-resolves only its name and that stubs still become real.

## 2. Plugin

- [x] 2.1 Add indexed folders, excluded folders and the Obsidian "Excluded files" option; keep the schema folder; re-index when they change.
- [x] 2.2 Apply the scope to the file list, link resolution, vault events and re-index.
- [x] 2.3 Index by time slice with a small read-ahead, at startup and on re-index.
- [x] 2.4 Recount status bar diagnostics once changes settle.
- [x] 2.5 Add a "Re-index vault" command.

## 3. Verify and document

- [x] 3.1 Annotate code and tests with `implements` and `verifies` edges.
- [x] 3.2 Record the behavior in `lat.md/` and the test specs.
- [x] 3.3 Run tests, type checks, `openspec validate`, `tg check`, `tg ontology check` and `tg trace graph-model --gaps`.

Persisting parsed notes between sessions is deferred (see proposal).
