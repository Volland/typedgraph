# graph-view Specification

## Purpose
Defines the full-pane Graph view where users explore the vault graph with labeled, signed edges and typed nodes, sharing the renderer used by inline query blocks.

## Requirements

### Requirement: Graph view leaf
The system SHALL provide a command that opens a Graph view in a workspace leaf, with a query bar that runs a Cypher query and shows its graph result.

#### Scenario: Open and query
- **WHEN** the user runs the open command and submits a query
- **THEN** the leaf shows the resulting graph

#### Scenario: Default content
- **WHEN** the view opens with no query entered
- **THEN** it shows the neighborhood of the active note

### Requirement: Edge presentation
The system SHALL draw edges as directed arrows labeled with the edge type, SHALL visually distinguish negative edges from positive ones, and SHALL label nodes with note titles.

#### Scenario: Signed edges
- **WHEN** the graph contains a `knows` edge and a `-distrusts` edge
- **THEN** both show their type label and the negative edge is styled differently from the positive one

### Requirement: Node type styling
The system SHALL style nodes by their type labels using the resolved style for each type, taken in order of precedence from schema notes, plugin settings and built-in defaults as specified by visualization-config, and SHALL render stub nodes distinctly.

#### Scenario: Typed and stub nodes
- **WHEN** the graph shows a `Person` node and a stub node
- **THEN** the `Person` node uses the configured Person style and the stub is visibly different

#### Scenario: Schema note wins over settings
- **WHEN** settings color `Person` red and `Types/Person.md` declares `visualization: {color: blue}`
- **THEN** Person nodes in the Graph view are blue

### Requirement: Click to expand
The system SHALL expand a node's direct neighbors in the Graph view when the user activates its expand action, and SHALL open the node's note on a modifier-click or double-click.

#### Scenario: Expand neighbors
- **WHEN** the user expands a node
- **THEN** its neighbors and connecting edges are added to the view without discarding existing elements

### Requirement: Shared renderer
The system SHALL use the same renderer and styling for the Graph view and for inline graph results, so an element looks the same in both.

#### Scenario: Consistent styling
- **WHEN** the same `Person` node appears in an inline block and in the Graph view
- **THEN** it has the same color, shape and label style in both

### Requirement: Node subtitle
The system SHALL draw a node whose note has a non-empty frontmatter `subtitle` (a string or a number) with the label `<title> — <subtitle>`, where the title is the frontmatter `title`, the document title or the file name, and SHALL use the same text as the node's heading in the details panel and as an edge endpoint's name there. A type's label property, when set and present on the node, still replaces this text.

#### Scenario: Shared file name
- **WHEN** `specs/auth/spec.md` has frontmatter `subtitle: auth` and `specs/billing/spec.md` has `subtitle: billing`
- **THEN** the graph draws them as `spec — auth` and `spec — billing`

#### Scenario: No subtitle
- **WHEN** a note has no `subtitle` or an empty one
- **THEN** its node is labeled with its title alone

### Requirement: Selection details
The system SHALL show the type, ID, sign and properties of a selected edge, and the labels and properties of a selected node.

#### Scenario: Select an edge
- **WHEN** the user selects an edge with `{since: 2020}`
- **THEN** the view shows its type, sign, ID and `since` = 2020

### Requirement: Details panel
The Graph view's details panel SHALL separate the note's own properties from graph bookkeeping, SHALL draw links in property values as links, and SHALL let the user size it. Technical rows SHALL be the labels, stub flag and path of a node, the sign, ID, declaring note and source heading of an edge, every style attribute, and the properties that the node's merged schema or the edge's type declaration does not declare; when there is no schema or declaration, every property of the note is a note property. The `type` and `types` properties SHALL always be note properties. Note properties SHALL be listed first. The panel SHALL offer a Technical toggle, off by default, that shows or hides the technical rows, and a Links toggle, on by default, that switches property values between clickable links and plain text. A wikilink or a markdown link to a note in a value SHALL be drawn as a link showing its alias or target, one list item per line, that opens the note (in a new tab with Cmd or Ctrl), and an empty `[[]]` or a link to something that is not a note SHALL stay text. The user SHALL be able to drag a handle between the graph and the panel to set the panel's width, and the width and both toggles SHALL be remembered on the device.

#### Scenario: Business and technical properties
- **WHEN** the user selects a Task node whose schema declares `status` and `owner`, and the note also has `tags`
- **THEN** `type`, `status` and `owner` are listed first, and `labels`, `stub`, `path`, `tags` and every `style.*` row are technical and hidden until the Technical toggle is on

#### Scenario: No schema
- **WHEN** the selected note's labels have no schema
- **THEN** all its frontmatter properties are note properties, and only `labels`, `stub`, `path` and `style.*` are technical

#### Scenario: Links in values
- **WHEN** a property value is `["[[Login]]", "plain"]` or `see [[Auth#Flow|the flow]]`
- **THEN** with the Links toggle on, `Login` is a link on its own line above the text `plain`, and `the flow` is a link to `Auth#Flow` inside the surrounding text

#### Scenario: Links as plain text
- **WHEN** the user turns the Links toggle off
- **THEN** every value is shown as plain text, lists as JSON, as before

#### Scenario: Resize the panel
- **WHEN** the user drags the handle left
- **THEN** the panel gets wider, the graph narrower and redrawn, and the width is restored the next time the view opens

### Requirement: Expanded nodes lifecycle
The Graph view SHALL keep the nodes the user expanded across refreshes caused by vault changes, and SHALL clear them when the user submits a new query or the followed note changes.

#### Scenario: Kept across an edit
- **WHEN** the user expands `Bob` and then edits an unrelated note
- **THEN** Bob's neighbors are still drawn after the refresh

#### Scenario: Cleared on note switch
- **WHEN** the user expands `Bob` and then opens another note that the view follows
- **THEN** the view shows only that note's neighborhood

### Requirement: Query input
The Graph view SHALL run the query in its input on Ctrl+Enter or Cmd+Enter, and submitting an empty query SHALL return the view to following the active note's neighborhood.

#### Scenario: Empty query
- **WHEN** the view shows a query result and the user clears the input and submits
- **THEN** the view shows the active note's neighborhood and follows note switches again

### Requirement: Remove and collapse
The Graph view's node context menu SHALL offer "Collapse neighbors" and "Remove from view". Collapse SHALL remove from the view the neighbors of the node that are joined to no other node in the view. Remove SHALL remove the node and the nodes in the view that are joined only to it. Removed nodes SHALL stay out across refreshes until the followed note or the query changes, the user expands a neighbor that includes them, or the user restores them from the Node types section of the controls.

#### Scenario: Collapse neighbors
- **WHEN** a node has three neighbors, two of which have no other edge in the view, and the user chooses "Collapse neighbors"
- **THEN** the two leaf neighbors disappear and the third, which also connects to another node, stays

#### Scenario: Remove from view
- **WHEN** the user chooses "Remove from view" on a node that has one leaf neighbor
- **THEN** the node, the leaf and their edges are gone, and the rest of the graph is unchanged

#### Scenario: Removed nodes stay out
- **WHEN** a node was removed and the vault changes
- **THEN** the view refreshes without it

### Requirement: Graph view filters
The Graph view's controls SHALL have a Node types section that lists the types in the view with their node counts. A type SHALL be hideable, which removes its nodes and their edges from the view. For each type the section SHALL offer the properties of that type with the values they have and how many nodes have each; checking values of a property SHALL keep only nodes whose value for it is any of the checked ones, a list value counting when any item is checked and an empty or missing value being the choice "(empty)". A type's properties that have filters SHALL all hold for a node to stay. A property in the details pane SHALL have a filter button that opens the same values as a menu. The values offered SHALL be those of the nodes of that type in the view before value filters, and properties with only empty values or with more than 60 distinct values SHALL be left out unless they are already filtered. Filters SHALL stay while the followed note changes and SHALL be cleared with "Clear filters".

#### Scenario: Hide node types
- **WHEN** the user unchecks the type `Person` in Node types
- **THEN** every `Person` node and the edges at it disappear and the type stays listed so it can be checked again

#### Scenario: Filter by property values
- **WHEN** the user checks `To Do` and `Done` for `status` of `Task` and `y` for `team`
- **THEN** a Task stays only if its status is `To Do` or `Done` and its `team` contains `y`, and nodes of other types are unaffected

#### Scenario: Values offered per type
- **WHEN** the user opens the filter of a type
- **THEN** each property with at least one value is listed with its values and counts, a node without the property counting as "(empty)"

### Requirement: Editable details
The details pane SHALL draw every property as a form field, compact and as wide as the pane. The pane header SHALL have a pen icon, remembered on the device, for a selected node that is a Markdown note in the vault. With it off the fields are read-only but their text SHALL stay selectable and scrollable; with it on, each property SHALL write its value back to the note's frontmatter when it changes, except `type`, which is never editable. A property the node's schema declares with a list of allowed values SHALL be a dropdown of those values, marked with a chevron on the right (a multi-choice dropdown when the property holds a list); otherwise the input SHALL follow the schema kind or, without a declaration, the type of the current value: number, boolean, date, comma-separated list or text. An empty entry SHALL be saved as an empty value. Properties the schema declares and the note lacks SHALL be offered empty. An entry that is not valid for its kind SHALL be marked and not saved. Properties that hold links, which are those with a declared edge type or a `[[link]]` value, SHALL show each link as a clickable chip in both modes; in edit mode a chip can be removed and an input adds a link, offering the notes whose name contains the typed text and whose type the edge type allows. `aliases`, `tags` and `path` SHALL count as note properties, not technical ones. Suggestions SHALL show a note as a link with its type beside it as plain text; a link property that is empty SHALL offer them too. A link to a note that does not exist SHALL be dimmed as in Obsidian, tags SHALL look like Obsidian tags, and the values of an enum list SHALL be chips with the same dropdown of suggestions as links, and a single enum a field that opens the same list. Text boxes SHALL be resizable by dragging their corner, the height kept for the property until Obsidian restarts. Read-only fields SHALL have a dotted outline instead of a fill. The `type` row SHALL have an info icon that replaces the values with the type's schema: the properties with data type and cardinality, the edge types with the types at their other end and the types that may point at it. The graph controls SHALL have a button beside the gear that shows or hides the details pane, and the controls panel SHALL scroll when taller than the visible view.

#### Scenario: Enum property
- **WHEN** the schema declares `status` with the values `To Do` and `Done` and editing is on
- **THEN** `status` is a dropdown with a chevron of those values and choosing one writes it to the note's frontmatter

#### Scenario: Undeclared property
- **WHEN** a property has no declaration and its value is a number
- **THEN** it is a number input, and an entry that is not a number is marked and not saved

#### Scenario: Save an edit
- **WHEN** the user changes a value and leaves the field
- **THEN** the note's frontmatter has the new value and the graph refreshes from the vault

#### Scenario: Read-only fields
- **WHEN** editing is off
- **THEN** the fields look the same but cannot be changed, and a long value can be selected and scrolled

#### Scenario: Type is locked
- **WHEN** editing is on
- **THEN** the `type` property stays read-only

#### Scenario: Schema info
- **WHEN** the user presses the info icon on the `type` row
- **THEN** the pane lists the type's properties, edges and incoming edges until the icon is pressed again

#### Scenario: Link suggestions
- **WHEN** the user types `Eu` into an `assignee` link field whose edge type allows `Person`
- **THEN** the notes of type `Person` whose name contains `Eu` are offered, and choosing one adds `[[Name]]`

### Requirement: Details pane shortcuts
The header of the details pane of a selected node that is not a stub SHALL have a link icon "Open note" that opens the note exactly as a double-click on the node does. The pane SHALL have an "Only with values" toggle, remembered on the device, that lists only the properties whose value is not empty, null or an empty list. When the pane or the controls panel is taller than the view it SHALL scroll.

#### Scenario: Open note
- **WHEN** the user presses the link icon
- **THEN** the note opens as it does on a double-click of its node

#### Scenario: Only with values
- **WHEN** the toggle is on
- **THEN** properties with no value are not listed

### Requirement: Opening notes
Opening a note from the Graph view SHALL switch to the tab the note is already open in, and only open a new tab when it is not open.

#### Scenario: Already open
- **WHEN** the note is open in another tab and the user double-clicks its node
- **THEN** that tab becomes active and no new tab opens

### Requirement: Alt-click toggles neighbors
Option/Alt-clicking a node in the Graph view SHALL expand its neighbors when some are not in the view, and otherwise collapse the neighbors that hang off it alone.

#### Scenario: Expand then collapse
- **WHEN** the user Alt-clicks a node with hidden neighbors, then Alt-clicks it again
- **THEN** the first click shows its neighbors and the second removes those that touch nothing else
