# graph-ui Specification

## Purpose
Provides the host-independent graph renderer and neighborhood view-state shared by the Obsidian plugin and the VS Code extension, so styling and expansion behavior are defined once.

## Requirements

### Requirement: Host-independent rendering
The renderer SHALL draw the same graph elements with the same node shapes, colors, edge labels, signs and stubs in any host when given the same styler and theme inputs, and SHALL take theme colors as an input supplied by the host rather than reading host-specific variables.

#### Scenario: Theme supplied by host
- **WHEN** a host passes its own color map
- **THEN** nodes and edges use those colors and no Obsidian or VS Code global is read

#### Scenario: Negative edge
- **WHEN** an edge has a negative sign
- **THEN** it has a tee arrow and a minus-prefixed label in every host, and is dashed unless a style source sets its line

### Requirement: Neighborhood view-state
The package SHALL compute the neighborhood of a node and merge element sets independent of any host UI, and each host SHALL keep the nodes the user expanded across refreshes caused by file changes.

#### Scenario: Expanded nodes kept
- **WHEN** the graph refreshes after a file change
- **THEN** previously expanded nodes remain expanded

### Requirement: No host imports
The package SHALL NOT import `obsidian` or `vscode`.

#### Scenario: Import check
- **WHEN** the package's sources are scanned for imports
- **THEN** no host module is imported

### Requirement: Restyle in place
When a refresh yields the same set of element ids, the renderer SHALL update styles and data in place without re-running layout or moving nodes.

#### Scenario: Same elements
- **WHEN** a refresh changes a node's color but no element is added or removed
- **THEN** every node keeps its position

### Requirement: No dangling edges
The renderer SHALL never draw an edge without both endpoints, adding a relationship's endpoint nodes from the graph when the result lacks them and dropping the edge when an endpoint does not exist.

#### Scenario: Relationship-only result
- **WHEN** a query returns only `r` for `(a)-[r:knows]->(b)`
- **THEN** the drawn graph contains `a`, `b` and the `knows` edge between them

### Requirement: Edge note neighborhood
The system SHALL, when asked for the neighborhood of an edge note's path, return the edge it declares and both endpoint nodes, so opening an edge note shows it as an edge.

#### Scenario: Active edge note
- **WHEN** the graph view focuses `Alice knows Bob.md`, an edge note from Alice to Bob
- **THEN** it shows nodes `Alice.md` and `Bob.md` and the `knows` edge between them

### Requirement: Forces, pinning and controls
The renderer SHALL lay nodes out with a live force simulation and SHALL let nodes be pinned. The forces SHALL be a pull to the centre, node-node repulsion and link springs, plus a push on a node that lies across an edge and a push between overlapping node and edge labels. Pinned nodes SHALL be held fixed while the others spread around them; the first node of a list of pins SHALL be placed at the canvas centre and the others on a ring around it. Dragging a node SHALL pin it unless pin-on-drag is off, and shift-click SHALL toggle a pin. A host SHALL be able to set initial force and display settings and to change them at run time, including hiding edge types, without changing the layout. Defaults SHALL be: center 0.3, repel 19.7, link 0.68, distance 235, node-edge repel 0.44, label repel 0.83, pin on drag on; arrows on, edge labels on, text fade 0.12, node size 0.75, link thickness 0.5, no hidden types.

#### Scenario: Pinned nodes stay put
- **WHEN** a node is pinned and the simulation runs
- **THEN** it keeps its position, and the first auto-pinned node is at the canvas centre

#### Scenario: Edges repel nodes
- **WHEN** a node lies on an edge between two other nodes
- **THEN** it is pushed off the edge line

#### Scenario: Labels repel each other
- **WHEN** node or edge labels overlap
- **THEN** their nodes are pushed apart so fewer labels overlap

#### Scenario: Edge type visibility
- **WHEN** an edge type is hidden
- **THEN** its edges are not drawn, its labels do not take part in label repulsion, and node positions are not affected

#### Scenario: Relayout keeps nodes in place
- **WHEN** elements are added to a graph
- **THEN** existing nodes keep their position and pin, and new nodes appear next to a neighbour

#### Scenario: Default settings
- **WHEN** no settings are given
- **THEN** the defaults listed above apply

#### Scenario: Initial values from the header
- **WHEN** a host passes partial settings
- **THEN** unspecified values keep their defaults
