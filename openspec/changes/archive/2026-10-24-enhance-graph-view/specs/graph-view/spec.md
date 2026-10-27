## ADDED Requirements

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
The details pane SHALL have an Edit toggle, remembered on the device, for a selected node that is a Markdown note in the vault. With it on, each property SHALL be an input that writes the value back to the note's frontmatter when it changes. A property the node's schema declares with a list of allowed values SHALL be a dropdown of those values (checkboxes when the property holds a list); otherwise the input SHALL follow the schema kind or, without a declaration, the type of the current value: number, boolean, date, comma-separated list or text. An empty entry SHALL be saved as an empty value. Properties the schema declares and the note lacks SHALL be offered empty. An entry that is not valid for its kind SHALL be marked and not saved.

#### Scenario: Enum property
- **WHEN** the schema declares `status` with the values `To Do` and `Done` and Edit is on
- **THEN** `status` is a dropdown of those values and choosing one writes it to the note's frontmatter

#### Scenario: Undeclared property
- **WHEN** a property has no declaration and its value is a number
- **THEN** it is a number input, and an entry that is not a number is marked and not saved

#### Scenario: Save an edit
- **WHEN** the user changes a value and leaves the field
- **THEN** the note's frontmatter has the new value and the graph refreshes from the vault

### Requirement: Details pane shortcuts
The details pane of a selected node that is not a stub SHALL have an "Open note" button that opens the note in a new tab without moving focus from the Graph view, and the Graph view SHALL keep following the note it follows. The pane SHALL have an "Only with values" toggle, remembered on the device, that lists only the properties whose value is not empty, null or an empty list.

#### Scenario: Open in the background
- **WHEN** the user presses "Open note"
- **THEN** the note opens in a new tab and the Graph view tab stays active

#### Scenario: Only with values
- **WHEN** the toggle is on
- **THEN** properties with no value are not listed
