## ADDED Requirements

### Requirement: Note variables in queries
The block's query text SHALL accept `{{name}}` variables that are replaced, before parsing, by Cypher literals of the note holding the block: `path`, `name`, `title`, `folder`, `extension` and frontmatter properties as `fm.<property>`. Strings SHALL be quoted, numbers and booleans written plain, lists of those written as lists, and a name that resolves to nothing or to another kind of value SHALL become `null`. Only identifier chains SHALL be substituted; no expression SHALL be evaluated.

#### Scenario: Query about the current note
- **WHEN** a block in `Proj/Build.md` has the query `MATCH (w {path: {{path}}}) RETURN w`
- **THEN** the query runs as `MATCH (w {path: "Proj/Build.md"}) RETURN w`

#### Scenario: Unknown variable
- **WHEN** a query contains `{{fm.missing}}`
- **THEN** it is replaced by `null`

#### Scenario: Not a variable
- **WHEN** a query contains `{{ 1 + 1 }}` or `{{path.toString()}}`
- **THEN** the text is left unchanged and the parser reports it
