# graph-query-block Specification

## Purpose
Defines the `graph-query` fenced code block that lets a note embed a Cypher query and see its result as a table or graph, updating as the vault changes.

## Requirements

### Requirement: Block structure
The system SHALL render fenced blocks tagged `graph-query` whose content is an optional header of `key: value` lines, a blank line, and then the Cypher text.

#### Scenario: Header and query
- **WHEN** a block has the header line `view: table` followed by a blank line and a `MATCH ... RETURN ...` query
- **THEN** the query runs and its result is rendered as a table

#### Scenario: No header
- **WHEN** a block contains only a Cypher query
- **THEN** it runs with default options

### Requirement: Renderer chosen by result shape
The system SHALL render results as a graph when the returned columns contain nodes or relationships, and as a table when they contain only scalars, unless the header sets `view`.

#### Scenario: Nodes and edges
- **WHEN** a query returns `a, r, b`
- **THEN** the block renders a graph with labeled, signed edges

#### Scenario: Scalars only
- **WHEN** a query returns `a.title, r.since`
- **THEN** the block renders a table

### Requirement: View override and columns
The system SHALL honor `view: table` and `view: graph` and, for tables, a `columns` header listing the columns to show and their order.

#### Scenario: Forced table
- **WHEN** a query returns nodes and the header says `view: table`
- **THEN** the result renders as a table with node titles linking to their notes

### Requirement: Live refresh
The system SHALL re-run a visible block once vault changes have been quiet for the plugin's Refresh delay setting (default 300 ms, range 0–60000 ms), SHALL defer re-running a block that is scrolled out of view until it becomes visible, and SHALL update a graph whose element set is unchanged in place, without re-running layout.

#### Scenario: Edge edited
- **WHEN** a note changes in a way that alters the query result
- **THEN** the block shows the new result after the Refresh delay, without a manual re-run

#### Scenario: Hidden block deferred
- **WHEN** a note changes while a block is scrolled out of view
- **THEN** the block re-runs when it is next scrolled into view, not before

#### Scenario: Positions kept
- **WHEN** a change alters only a property of a node already drawn
- **THEN** the graph is restyled with every node in the same position

### Requirement: Render after layout
The system SHALL start rendering a block only after its container has been attached and sized, SHALL NOT run a layout on the renderer's empty initial graph, and SHALL cancel a pending first render when the block unloads.

#### Scenario: Graph block in a fresh note
- **WHEN** a note containing a `graph-query` block with `view: graph` is opened
- **THEN** the block shows its graph instead of a render error, even though the container had no width when the block loaded

#### Scenario: Unloaded before first frame
- **WHEN** a block unloads before its first render has run
- **THEN** no renderer is created for it

### Requirement: Errors shown in place
The system SHALL show query and header errors inside the block with their message and position, and SHALL NOT break the rest of the note.

#### Scenario: Bad query
- **WHEN** the Cypher text has a syntax error
- **THEN** the block displays the error message and the surrounding note renders normally

### Requirement: Large results are bounded
The system SHALL limit graph rendering to a configurable maximum element count and, when exceeded, SHALL show a notice with the count and fall back to a table.

#### Scenario: Result exceeds limit
- **WHEN** a graph result has more elements than the limit
- **THEN** the block shows a notice and offers the table view

### Requirement: Size and code header options
The block header SHALL accept `height` (a number of pixels from 100 to 4000, optionally suffixed `px`, default 360) and `code` (`show` or `hide`), and SHALL report any other value of either as a header error.

#### Scenario: Height set
- **WHEN** a block header has `height: 600`
- **THEN** the rendered graph is 600 pixels tall

#### Scenario: Height out of range
- **WHEN** a block header has `height: 50`
- **THEN** the block shows a header error naming `height` and its allowed range

### Requirement: Latest run wins
A block SHALL show only the result of its most recent run, discarding answers from earlier runs that arrive later.

#### Scenario: Slow earlier answer
- **WHEN** a Ladybug block re-runs after an edit and the answer to the earlier run arrives after the newer one
- **THEN** the block keeps showing the newer result

### Requirement: Layout header options
The block header SHALL accept `forces`, `display`, `pin` and `controls` lines that set the graph's initial force and display settings, the nodes pinned (`self`, `none` or note names; default `self`, the note holding the block, at the canvas centre) and whether the controls button is shown, expanded or hidden (`show`, `open`, `hide`; default `show`). Valid entries SHALL be kept and each invalid one SHALL be reported as a header error with its line.

#### Scenario: Valid layout header
- **WHEN** a block header has `forces: center=0.5, repel=12`, `display: arrows=false, hide=requirement|feature`, `pin: self, Other Note` and `controls: open`
- **THEN** those values are the initial settings and the controls panel starts expanded

#### Scenario: Defaults
- **WHEN** a block has none of these lines
- **THEN** it pins its own note, shows the controls button and uses the default settings

#### Scenario: Invalid layout header
- **WHEN** a header has `forces: center=2`
- **THEN** the block shows a header error naming `center` and its range
