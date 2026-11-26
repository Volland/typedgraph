# edge-parsing Specification

## Purpose
Defines how typed, signed edges with optional properties are written in note bodies and recognized by the plugin, while staying compatible with Graph Link Types' inline-field syntax.

## Requirements

### Requirement: Inline edge form
The system SHALL recognize a line of the form `type:: [[Target]]` as an edge of the given type from the containing note to the target, and SHALL accept an optional trailing property block `{key: value, ...}`.

#### Scenario: Plain Graph Link Types line
- **WHEN** a note contains `knows:: [[Bob]]`
- **THEN** the system produces one edge of type `knows` to `Bob` with no properties

#### Scenario: Line with properties
- **WHEN** a note contains `knows:: [[Bob]] {since: 2020, label: "met at conf"}`
- **THEN** the edge has properties `since` = 2020 (number) and `label` = "met at conf" (string)

### Requirement: Sign prefix
The system SHALL treat a `+` or `-` prefix on the edge type as the edge's sign, SHALL default the sign to +1 when no prefix is present, and SHALL strip the prefix from the type name.

#### Scenario: Negative edge
- **WHEN** a note contains `-distrusts:: [[Eve]]`
- **THEN** the edge has type `distrusts` and sign -1

#### Scenario: Unsigned edge
- **WHEN** a note contains `knows:: [[Bob]]`
- **THEN** the edge has sign +1

### Requirement: Weight is independent of sign
The system SHALL expose `weight` as an ordinary numeric property and SHALL NOT derive sign from it.

#### Scenario: Negative weight on positive edge
- **WHEN** a note contains `knows:: [[Bob]] {weight: -0.8}`
- **THEN** the edge has sign +1 and property `weight` = -0.8

### Requirement: Source heading is recorded
The system SHALL record the nearest preceding heading of an edge line as edge metadata.

#### Scenario: Edge under a heading
- **WHEN** an edge line appears under the heading `## Colleagues`
- **THEN** the edge records `Colleagues` as its source heading

### Requirement: Malformed property blocks
The system SHALL keep the edge when its property block is malformed, SHALL ignore the unparseable block, and SHALL report a diagnostic naming the note and line.

#### Scenario: Unclosed block
- **WHEN** a note contains `knows:: [[Bob]] {since: 2020`
- **THEN** the edge `knows` to `Bob` exists with no properties and a diagnostic is reported for that line

### Requirement: Non-edge text is ignored
The system SHALL NOT create edges from lines inside fenced code blocks or from lines that do not match the inline edge form.

#### Scenario: Edge syntax in a code fence
- **WHEN** `knows:: [[Bob]]` appears inside a fenced code block
- **THEN** no edge is created

### Requirement: Markdown link targets
The system SHALL accept standard markdown links to notes as edge targets in an edge line, alone or mixed with wikilinks, and SHALL normalize their paths to vault paths: percent escapes decoded, `#anchor` kept as the subpath, `./` and `../` resolved against the source note's folder, a leading `/` meaning the vault root. Links with a URL scheme SHALL NOT produce edges.

#### Scenario: Bundle-absolute link
- **WHEN** `people/alice.md` contains `knows:: [Bob](/people/bob.md) {since: 2020}`
- **THEN** the system produces an edge of type `knows` to `people/bob.md` with `since` = 2020

#### Scenario: Relative link
- **WHEN** `people/alice.md` contains `works_at:: [Acme](../orgs/acme.md)`
- **THEN** the edge target is `orgs/acme.md`

#### Scenario: External URL
- **WHEN** a note contains `cites:: [paper](https://example.com/paper)`
- **THEN** no edge is produced

### Requirement: Property value types
The system SHALL read edge property values as JSON5-like literals: bare numbers as numbers, `true` and `false` as booleans, `null` as null, `[...]` as lists, quoted strings with escapes as strings, unquoted words as strings and unquoted wikilinks as strings, allowing a trailing comma.

#### Scenario: Typed values
- **WHEN** an edge line ends with `{since: 2020, active: true, tags: [a, "b c"], note: null,}`
- **THEN** the edge has `since` 2020 as a number, `active` true as a boolean, `tags` as the list `a`, `b c`, and `note` null

### Requirement: Links in property values
The system SHALL read an unquoted property value that Obsidian highlights as a wikilink (`[[`, then no bracket or line break, then `]]`) as the string it looks like, exactly as if it were quoted, so a nested list holding one item is written `[[X],]` or `[ [X] ]`.

#### Scenario: Unquoted link in a property
- **WHEN** an edge line ends with `{location: [[Location B]], at: [[[Hall]], [[Lobby]]]}`
- **THEN** `location` is the string `[[Location B]]`, `at` is the list `[[Hall]]`, `[[Lobby]]`, and no finding is reported

#### Scenario: Nested lists
- **WHEN** an edge line ends with `{b: [[X],], c: [ [X] ], d: [[1, 2], [3]]}`
- **THEN** `b` and `c` are the nested list `[["X"]]` and `d` is `[[1, 2], [3]]`

### Requirement: Edge lines in lists and quotes
The system SHALL recognize an edge line whose type is preceded by a list-item marker or a blockquote prefix, and SHALL produce no edge and no diagnostic for a `type::` line that contains no link.

#### Scenario: Edge in a list item
- **WHEN** a note contains `- knows:: [[Bob]]`
- **THEN** the note has a `knows` edge to `Bob`

#### Scenario: Placeholder without a link
- **WHEN** a note contains `employs:: ` with nothing after it
- **THEN** no edge and no diagnostic is produced for that line

### Requirement: Frontmatter link edges
The system SHALL, when the frontmatter edges option is on, turn each wikilink or markdown link in a frontmatter property value, or in a list of values, into an edge from the note to the link target, typed by the property name, with sign +1, no properties and no source heading. It SHALL ignore values without links, empty `[[]]` placeholders and the properties `tags`, `aliases`, `cssclasses`, `type` and `types`. The option SHALL be off by default. These edges SHALL be added to the edges written in the note body, SHALL follow edits to the note, and SHALL be checked by schema edge declarations like any other edge.

#### Scenario: Single and list values
- **WHEN** the option is on and a note has `requirement: "[[Login]]"` and `topics: ["[[Security]]", "[[Auth]]"]`
- **THEN** the note has one `requirement` edge to `Login` and two `topics` edges, to `Security` and to `Auth`

#### Scenario: Alias, subpath and markdown links
- **WHEN** a property value is `[[Security|sec]]`, `[[Auth#Flow]]` or `[Docs](docs/Guide.md)`
- **THEN** the edges record alias `sec`, subpath `Flow` and the vault path of `docs/Guide.md` respectively

#### Scenario: Values without links and skipped properties
- **WHEN** a note has `owner: bob`, `estimate: 3`, `feature: "[[]]"`, `tags: ["[[x]]"]` and `type: "[[Task]]"`
- **THEN** it has no frontmatter edges

#### Scenario: Off by default
- **WHEN** the option is not set and a note has `requirement: "[[Login]]"`
- **THEN** the graph has no `requirement` edge

#### Scenario: Alongside body edges
- **WHEN** a note has `related: "[[A]]"` in frontmatter and `related:: [[A]]` in its body
- **THEN** the graph has both edges, with distinct IDs

#### Scenario: Follows note edits
- **WHEN** a note's `requirement` property changes from `[[Ghost]]` to `[[Other]]`, or is removed
- **THEN** the edge to `Ghost` is replaced by an edge to `Other`, or removed, and the `Ghost` stub disappears

#### Scenario: Schema checks apply
- **WHEN** the option is on, `requirement` is declared as an edge type from `Task` to `Requirement`, and a Task's `requirement` property links to a Bug
- **THEN** validation reports a wrong-target-type finding at that note, and reports none when the option is off

### Requirement: Frontmatter closing fence
The system SHALL end frontmatter at the first later line that is `---` or `...` starting at column 0, optionally followed by spaces or tabs; an indented `---` or `...` SHALL be content of the frontmatter, as in a YAML block scalar. Every reader that splits or skips frontmatter (properties, frontmatter edges, body edges, headings and elements) SHALL use this one rule.

#### Scenario: Indented fence in a block scalar
- **WHEN** a note's frontmatter has a block scalar containing an indented `---`, followed by `concept: ["[[topic]]"]`
- **THEN** the frontmatter keeps the block scalar text and `concept`, and the body yields no edge or heading from those lines

#### Scenario: Column-0 fence with trailing whitespace
- **WHEN** the closing fence is `---` followed by spaces or tabs, or is `...`
- **THEN** it closes the frontmatter
