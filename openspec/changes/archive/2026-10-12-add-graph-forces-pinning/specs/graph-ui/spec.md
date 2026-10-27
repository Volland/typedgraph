## ADDED Requirements

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
