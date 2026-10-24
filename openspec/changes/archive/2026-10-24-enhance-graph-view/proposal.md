## Why

Exploring in the Graph view only ever adds nodes: a note change pins the new note at the centre while the previous one stays pinned under it, a node cannot be taken out once expanded, big graphs cannot be cut down by type or property, and the details pane is read-only and has no way to open the note without leaving the graph. In an inline block the gear button also covers Obsidian's `</>` button.

## What Changes

- Following another note releases the previous automatic pin; pins the user set stay. The gear in a block moves left of the `</>` button.
- The node menu gets "Collapse neighbors" and "Remove from view".
- The controls get a Node types section: hide types, and per type keep only nodes with checked property values (alternatives within a property, all properties must match). A filter button in the details pane opens the same values.
- The details pane gets an Open note button (background tab), an Only with values toggle and an Edit toggle that writes frontmatter, with a dropdown for schema enums.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `graph-view`: remove and collapse, filters, editable details and pane shortcuts.
- `graph-ui`: a new auto-pin list releases the previous one.

## Impact

- `packages/graph-ui`: `ViewFilters`, `applyFilters`, `collapseTargets`, `removalTargets`, `typeCounts`, `propertyValues`; `fieldSpec`, `coerceInput`; `Simulation.setPinned`, `unpinAll`; `GraphRenderer.select`.
- `packages/plugin`: Graph view state for removed nodes and filters, the filter UI, the details pane, menu items, styles.
- `lat.md/visualization`, `lat.md/tests/graph-ui`, tests.
