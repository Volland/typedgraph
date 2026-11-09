## 1. Specify and implement

- [x] 1.1 Add the Active file query parameter requirement and its four scenarios to the graph-view change specification.
- [x] 1.2 Pass the tracked Markdown path as `$activeFile` and keep tracking note changes while a query is entered.
- [x] 1.3 Annotate `GraphView` with `@tg: implements:: [[openspec:graph-view#Active file query parameter]]`.

## 2. Verify and document

- [x] 2.1 Test each scenario with the real engine and annotate each test with its `@tg: verifies:: [[openspec:graph-view#Active file query parameter#Scenario]]` reference.
- [x] 2.2 Record the binding and refresh decisions in the typed `lat.md/visualization.md` section; retain its `motivated_by` edge and `openspec: [graph-view, ...]` coverage. Review applicable constraints; no new external constraint needs a section.
- [x] 2.3 Update the graph-view test specifications for the new behavior.
- [x] 2.4 Run tests, TypeScript checks, OpenSpec validation, `tg check`, `tg ontology check`, and `tg trace graph-view --gaps`; close all gaps introduced by this change and record pre-existing gaps.

## Validation results

All 13 targeted tests and repository-wide TypeScript checks pass. Strict OpenSpec validation, `tg check`, and `tg ontology check` pass. The new requirement is implemented, documented, and verified across all four scenarios.

The capability already had gaps in Graph view leaf, Node type styling, Details panel, Expanded nodes lifecycle, Query input, Remove and collapse, Editable details, Details pane shortcuts, Opening notes, and Alt-click toggles neighbors. Those existing gaps are unchanged by this contribution.
