# graph-model Specification

## Purpose
Defines the in-memory property graph derived from the vault: how notes become labeled nodes, how links become identified edges, and how the graph stays current as notes change.

## Requirements

### Requirement: One note is one node
The system SHALL create exactly one node per markdown note, and SHALL NOT create nodes for headings or blocks.

#### Scenario: Note with headings
- **WHEN** a note has three headings and two edges
- **THEN** the graph contains one node for that note

### Requirement: Stub nodes for unresolved links
The system SHALL create a stub node for each edge target that does not match an existing note, marked as a stub, so no edge is left without a target.

#### Scenario: Link to missing note
- **WHEN** a note has `knows:: [[Nobody]]` and no note named `Nobody` exists
- **THEN** a stub node `Nobody` exists and the edge points to it

#### Scenario: Stub becomes real
- **WHEN** a note named `Nobody` is later created
- **THEN** the stub is replaced by the real node and existing edges keep pointing to it

### Requirement: Node labels from frontmatter
The system SHALL derive a node's labels from its frontmatter `type` value, accepting a string or a list, so a list yields multiple labels. A node without `type` SHALL have no type label.

#### Scenario: Multiple types
- **WHEN** a note has frontmatter `type: [Person, Employee]`
- **THEN** the node has labels `Person` and `Employee`

### Requirement: Node properties
The system SHALL expose a note's frontmatter fields, its file path and its title as node properties.

#### Scenario: Frontmatter property
- **WHEN** a note has frontmatter `age: 31`
- **THEN** the node has property `age` = 31

### Requirement: Derived edge IDs
The system SHALL give each edge the ID `source#type#target#n`, where `n` is its zero-based ordinal among edges sharing the same source, type and target, and SHALL use an explicit `id` property instead when one is present.

#### Scenario: Duplicate edges
- **WHEN** a note has two `knows:: [[Bob]]` lines
- **THEN** their IDs differ only in the ordinal `n`

#### Scenario: Pinned ID
- **WHEN** an edge has `{id: "met-2020"}`
- **THEN** its ID is `met-2020`

### Requirement: Incremental updates
The system SHALL update the graph when a note is created, modified, renamed or deleted, touching only that note's contributions and the affected stubs.

#### Scenario: Note edited
- **WHEN** a note's edge line is changed
- **THEN** the old edge disappears and the new edge appears without rebuilding the whole graph

#### Scenario: Note deleted
- **WHEN** a note that other notes link to is deleted
- **THEN** edges pointing to it now point to a stub node

### Requirement: Plain link edges
The system SHALL, when built with the link-edges option, turn every plain wikilink or markdown link to a note outside edge lines, code and frontmatter into an untyped edge of type `links_to` with sign +1, and SHALL NOT do so when the option is off.

#### Scenario: OKF prose link
- **WHEN** link edges are on and a note says `See the [customers table](/tables/customers.md).`
- **THEN** the graph has a `links_to` edge from the note to `tables/customers.md`

#### Scenario: Option off
- **WHEN** link edges are off
- **THEN** prose links produce no edges, as before

#### Scenario: Images ignored
- **WHEN** a note contains `![diagram](/img/a.png)` or `![[a.png]]`
- **THEN** no edge is produced

### Requirement: Frontmatter title
The system SHALL use a non-empty string frontmatter `title` as the node's `title` property, and the file name otherwise, and SHALL add the entries of a frontmatter `types` list to the node's labels after those from `type`.

#### Scenario: OKF title
- **WHEN** a note has frontmatter `title: GA4 Events Export`
- **THEN** the node's `title` is `GA4 Events Export`

#### Scenario: Types list
- **WHEN** a note has `type: Person` and `types: [Person, Engineer]`
- **THEN** the node has labels `Person` and `Engineer`

### Requirement: Link resolution outside Obsidian
Outside Obsidian (sidecar, CLI, VS Code), the system SHALL resolve a link with Obsidian-compatible rules: an exact vault path first, otherwise a path whose suffix matches, preferring a match in the source note's folder and then the shortest path.

#### Scenario: Same folder preferred
- **WHEN** `People/Alice.md` links `[[Bob]]` and both `People/Bob.md` and `Archive/Old/Bob.md` exist
- **THEN** the edge targets `People/Bob.md`

### Requirement: Duplicate pinned edge ids
The system SHALL keep the first edge that pins a given id, SHALL leave any later edge with the same id out of the graph, and SHALL report a duplicate edge id diagnostic at that later edge's line.

#### Scenario: Same id pinned twice
- **WHEN** two edge lines both carry `{id: "e1"}`
- **THEN** the graph holds only the first as `e1` and a duplicate edge id diagnostic points at the second line

### Requirement: Edge notes
The system SHALL treat a note whose frontmatter `type` is `edge` (or a list containing `edge`) as an edge note: it SHALL contribute exactly one edge and no node. The edge SHALL go from the note named by frontmatter `from` to the note named by `to`, each written as a wikilink, a markdown link or bare link text, resolved like written links, with stubs for missing notes. Its type SHALL be frontmatter `edgeType`, whose `+` or `-` prefix sets the sign as in inline edges. Its ID SHALL be frontmatter `id` when present and the note's path otherwise. Every other frontmatter field except `type` and `types` SHALL become an edge property. The edge SHALL record the edge note's path as its declaring file. The note body SHALL contribute no edges.

#### Scenario: Edge note becomes an edge
- **WHEN** `Alice knows Bob.md` has frontmatter `type: edge`, `from: "[[Alice]]"`, `to: "[[Bob]]"`, `edgeType: knows`, `since: 2020`
- **THEN** the graph has a `knows` edge from `Alice.md` to `Bob.md` with property `since` = 2020 and ID `Alice knows Bob.md`, and no node `Alice knows Bob.md`

#### Scenario: Negative edge note
- **WHEN** an edge note has `edgeType: -distrusts`
- **THEN** its edge has type `distrusts` and sign -1

#### Scenario: Missing endpoint becomes a stub
- **WHEN** an edge note has `to: "[[Nobody]]"` and no note `Nobody` exists
- **THEN** the edge points to a stub `Nobody`, and creating `Nobody.md` re-points it to the real node

#### Scenario: Incomplete edge note
- **WHEN** an edge note has no `edgeType`
- **THEN** it contributes no edge and no node, and an `edge-note` diagnostic names the missing field

### Requirement: Links to edge notes
The system SHALL NOT create an edge whose endpoint resolves to an edge note, and SHALL report an `edge-note` diagnostic at the line of the link, because edge notes are not nodes. When an edge note changes back into an ordinary note, such links SHALL resolve to it.

#### Scenario: Inline edge to an edge note
- **WHEN** a note has `about:: [[Alice knows Bob]]` and `Alice knows Bob.md` is an edge note
- **THEN** no `about` edge exists and an `edge-note` diagnostic points at that line

### Requirement: Findings at the declaring file
The system SHALL report schema validation findings about an edge, and embed warnings that cite an edge's location, at the edge's declaring file when it differs from the edge's source.

#### Scenario: Edge property validated in the edge note
- **WHEN** a schema requires `since` on `knows` and an edge note declares a `knows` edge without it
- **THEN** the missing-edge-property finding has the edge note's path

### Requirement: Edge options as plugin settings
The Obsidian plugin SHALL offer the plain-link edge option and the frontmatter-link edge option as two independent settings, both off by default, and SHALL re-index the vault when either is changed.

#### Scenario: Plain links on
- **WHEN** "Plain links as links_to edges" is on and a note contains `See [[B]]`
- **THEN** the graph has a `links_to` edge from that note to `B`

#### Scenario: Frontmatter links on
- **WHEN** "Frontmatter links as edges" is on and a note has `requirement: "[[B]]"`
- **THEN** the graph has a `requirement` edge from that note to `B`

#### Scenario: Defaults
- **WHEN** neither setting has been changed
- **THEN** the graph has no `links_to` and no frontmatter edges
