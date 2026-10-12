---
type: Scenario
lat:
  require-code-mention: true
---
# Graph Query Block Tests

Test specifications for the pure parts of the `graph-query` block pipeline described in [[query-engine#Query block]] and [[visualization]]; the Obsidian shell is verified manually.

## Header and query split

Leading `key: value` lines become options, a blank line is skipped, and the query start line is recorded so error positions map back into the block.

## Query without header

A block holding only Cypher runs with default options: automatic view, all columns, default height.

## Header errors reported

Unknown options and invalid values are reported with their line instead of being ignored.

## Graph for nodes and edges

Results holding nodes or relationships render as a graph; relationship endpoints are added so no edge dangles, and sign is carried to the renderer.

## Table for scalars

Results holding only scalars render as a table.

## View and columns override

`view: table` forces a table, `columns` selects and orders columns, and unknown column names are errors listing the available ones.

## Element cap falls back to table

A graph with more nodes plus edges than the configured maximum renders as a table with a notice stating the count and the limit.

## Signed and typed styling

The style sheet labels edges with their type, dashes negative edges, colors nodes per type with configured or stable default colors, and lets stub styling win.

## Type style settings validated

User-entered type styles are parsed as JSON and rejected with a clear message when the shape is unknown or the structure is wrong.

## Layout header options

The `forces`, `display`, `pin` and `controls` header lines fill the block's layout options and leave the query untouched.

## Layout header defaults

Without those lines the block pins its own note, shows the controls button and sets no initial forces or display values, and options never leak from one parse to the next.

## Layout header errors

Invalid layout values are reported with their line while valid entries are kept, and the unknown-option message lists the new options.
