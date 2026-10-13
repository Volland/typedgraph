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

## Note variables become literals

`{{path}}`, `{{title}}`, `{{name}}`, `{{folder}}`, `{{extension}}` and frontmatter values such as `{{fm.status}}` are replaced by Cypher literals of the note holding the block: strings quoted, numbers and booleans plain, lists of those as lists.

## Unknown variables are null

A name that resolves to nothing, or to a value that is not a literal, becomes `null`. Only identifier chains are substituted and nothing is evaluated, so expressions and calls stay in the text for the parser to reject.

## Variables substituted before parsing

A query such as `MATCH (w {path: {{path}}})` runs against the note it sits in, because substitution happens before the Cypher text is parsed and keeps the block's line numbers.
