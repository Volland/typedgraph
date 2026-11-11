## Purpose

Lets a schema say what the parts inside a document mean, makes those parts addressable and queryable where it pays off, and checks that documents have the parts their type requires.

## ADDED Requirements

### Requirement: Descriptions
A type, a property, an edge of a type (map form) and an edge type MAY declare `description`, a string explaining its meaning. A declaration without one SHALL read exactly as before.

#### Scenario: Type and property described
- **WHEN** a schema note declares `Decision: {description: "A choice that was made", properties: {status: {description: "Where it is"}}}`
- **THEN** the type and the property carry those descriptions

#### Scenario: No description, no key
- **WHEN** a TGS 0.3 note without descriptions is read
- **THEN** its declarations are identical to what a 0.3 reader produced

### Requirement: Element declarations
A type MAY declare `elements`: a mapping from tag name to a declaration (or a description string, or null), or a list of tag names. A declaration has `description`, `type` (one or more type names an element node gets), `required`, `many` (default true), `node`, `attributes` (in the form of `properties`) and nested `elements`. Invalid tag names and repeated tags SHALL be reported and skipped.

#### Scenario: Element declared with attributes
- **WHEN** a type declares `elements: {option: {description: "An option considered", attributes: {outcome: {values: [chosen, rejected]}}}}`
- **THEN** the type has an `option` element with that description and an `outcome` attribute with those values

#### Scenario: Shorthand forms
- **WHEN** a type declares `elements: {example: "One worked case", note: null}`
- **THEN** `example` has that description and `note` has none, and both allow many

### Requirement: Section declarations
A type MAY declare `sections`: a mapping from heading text to a declaration (or a description string), or a list of headings. A declaration has `description` and `required`.

#### Scenario: Required heading declared
- **WHEN** a type declares `sections: {Context: {required: true, description: "The forces at play"}}`
- **THEN** the type has a required `Context` section with that description

### Requirement: Elements in Markdown
The system SHALL read block-level XML elements in Markdown: an opening tag at the start of a line (indented at most three spaces at the top level), outside fenced code and frontmatter, closed by `</tag>` at the end of a line, possibly on the same line. Text that is not attribute syntax SHALL NOT be read as a tag, and an unclosed tag SHALL become an empty element whose would-be content stays with its parent.

#### Scenario: Nested elements with attributes
- **WHEN** a file holds `<example id="a">`, then `<input>x</input>` and `</example>` on separate lines
- **THEN** an `example` element with `id` "a" spans those lines and contains an `input` element with text "x"

#### Scenario: Placeholders and code are not elements
- **WHEN** a file holds `<insert summary — key points>` and a fenced block containing `<example>`
- **THEN** neither is read as an element

#### Scenario: Unclosed tag
- **WHEN** an `<option>` is never closed inside a `<decision>` element
- **THEN** `option` is an empty, unclosed element and `decision` keeps its text and children

### Requirement: Addressing by id
An element with an `id` attribute SHALL be addressable as `<file>#^<id>` in lat.md files, with the file as a full path or a unique short name, and as `<scheme><group>#^<id>` or `adr:<record>#^<id>` in spec files. `tg check` SHALL resolve such links in docs and in `@lat:` and `@tg:` comments, report a missing id with the nearest one, and report an id used twice in one file.

#### Scenario: Link to an element
- **WHEN** a doc links `[[decisions#^redis]]` and `lat.md/decisions.md` has `<option id="redis">`
- **THEN** `tg check` passes

#### Scenario: Missing element id
- **WHEN** a doc links `[[decisions#^redsi]]`
- **THEN** `tg check` reports a broken link and suggests `[[lat.md/decisions#^redis]]`

#### Scenario: Element in an ADR
- **WHEN** code carries `@tg: implements:: [[adr:3#^redis]]` and record 0003 has `<option id="redis">`
- **THEN** `tg check` passes and the edge ends at the element node

#### Scenario: Repeated id
- **WHEN** one file has two elements with `id="redis"`
- **THEN** `tg check` reports the second

### Requirement: Element nodes
In the `tg` graph, an element with an `id`, or one whose declaration names a `type` or sets `node: true`, SHALL be a node labelled `Element` plus its declared types, with properties `tag`, `element` (its id), `file`, `line`, `endLine`, `text` (at most 500 characters), `owner`, `title`, its `description` and its attributes. It SHALL hang off the innermost section, spec requirement or scenario, or element node around it by a `contains` edge. Typed edge lines and links inside it SHALL start at it. Other elements SHALL stay text.

#### Scenario: Element node and its edges
- **WHEN** `<option id="redis">` in a Decision section holds `- motivated_by:: [[constraints#Session limit]]`
- **THEN** the section `contains` the element node and the `motivated_by` edge starts at the element, not the section

#### Scenario: Typed element without id
- **WHEN** the Requirement type declares `rule: {type: Requirement}` and a requirement section holds an anonymous `<rule>`
- **THEN** the rule is a node labelled `Element` and `Requirement` with a generated id `<file>#^rule-1`

#### Scenario: Undeclared element stays text
- **WHEN** a section holds `<details>` with no id and no declaration
- **THEN** no node is created for it

### Requirement: Elements in spec files
Elements in OpenSpec, Spec Kit, Kiro, BMAD, GSD and ADR files SHALL become nodes under the rules above, owned by the requirement or scenario above them (the record for an ADR), and their declarations SHALL come from the owner's labels. Typed edge lines inside an element node in a spec file SHALL start at it.

#### Scenario: Elements in an OpenSpec requirement
- **WHEN** an OpenSpec requirement holds `<rule id="lockout">`
- **THEN** the requirement node `contains` the element node `openspec:<capability>#^lockout`

### Requirement: Document shape validation
`tg ontology check` SHALL check each typed document part (each outermost typed section of a lat.md file, each spec requirement or record) against its type's merged `elements` and `sections`: a required element or heading that is missing, a single element that repeats, a required attribute that is missing, an attribute value outside `values`, and a declared element that is never closed. Elements nested in a declared element SHALL be checked against that element's own `elements`.

#### Scenario: Missing required element
- **WHEN** a type requires `<when_to_use>` and one of its sections has none
- **THEN** `tg ontology check` reports the section with the element's description and exits 1

#### Scenario: Missing ADR heading
- **WHEN** the ADR type requires `Context and Problem Statement` and a record lacks that heading
- **THEN** `tg ontology check` reports the record

#### Scenario: Attribute value not allowed
- **WHEN** `option` declares `outcome` with values `chosen, rejected` and a document has `outcome="maybe"`
- **THEN** `tg ontology check` reports the value and the allowed ones

### Requirement: Ontology listing explains documents
`tg ontology` SHALL print each description under its type or edge type, property descriptions next to the properties, and the declared sections and elements in the structure of their YAML: each element with its rules and description, then its attributes shown the way properties are shown, then its nested elements, indented under it; `--json` SHALL include `description`, `elements` and `sections`.

#### Scenario: Listing shows elements
- **WHEN** `tg ontology` runs on a project whose Decision type declares `option` with an `outcome` attribute, and whose Skill type nests `trigger` (`many: false`) inside a required `when_to_use`
- **THEN** the output shows `<option> — <description>` with an `attributes:` line and `outcome (text, chosen|rejected)` under it, and `<when_to_use>  (required)` with an `elements:` line and `<trigger>  (at most one)` under it

### Requirement: Element scope
An element SHALL be resolved to the first declaration of its tag along the chain of the nested `elements` of the declared elements around it, innermost first, then its type's `elements`; undeclared elements SHALL add nothing to the chain. `required` and `many` SHALL be counted per container, the document for a type's elements and each occurrence of the parent for nested ones, over the elements at any depth inside it that resolve to the declaration. Element nodes and document validation SHALL use the same resolution.

#### Scenario: Counts per container
- **WHEN** a runbook holds its only `<rollback>` inside `<details>`, a `<step>` without the `<check>` its declaration requires, a second `<rollback>` inside another step, and a `<check>` outside any step
- **THEN** validation reports the step's missing `<check>` at the step and the second `<rollback>` as too many for the document, and nothing else

#### Scenario: Innermost declaration wins
- **WHEN** a typed `<case>` declared inside `<example>` stands inside an `<input>` inside an `<example>`, and another `<case>` stands outside any example
- **THEN** the first is an element node with the declared type and the second stays text

### Requirement: SHACL exchange of descriptions and elements
The SHACL export SHALL write descriptions as `sh:description` on node shapes and property shapes, and a type's `elements` and `sections` as `tgs:elements` and `tgs:sections` JSON annotations; the import SHALL read them back so a round trip loses nothing.

#### Scenario: Round trip keeps elements
- **WHEN** a schema with descriptions, elements and sections is exported and imported again
- **THEN** the imported declarations equal the original ones

### Requirement: TGS 0.5 published
The specification SHALL be published as TGS 0.5 with 0.4 archived unchanged. 0.5 adds no key: it defines the attribute keys that have a meaning and the reserved `id`, the element scope and counting per container, and one normal form for every shorthand. The JSON Schema SHALL accept every 0.4 note, a list of `elements` or `sections` SHALL hold names only, and the reader SHALL report unknown keys inside element declarations of notes declaring 0.3 or later.

#### Scenario: Published 0.5
- **WHEN** the spec folder is read
- **THEN** the 0.5 text, current or archived, has sections 4.4 (nesting and scope) and 4.9 (normal form) and a JSON Schema `$id` naming 0.5, and `archive/v0.4/SPEC.md` is the unchanged 0.4 text

### Requirement: Code ontology describes itself
The bundled code ontology SHALL describe every type, property and edge type, declare the elements its types commonly hold, and the ADR framework type SHALL declare MADR's headings; none of them SHALL be required, so existing docs stay clean.

#### Scenario: Descriptions installed
- **WHEN** `tg init` installs the code ontology and `tg ontology` runs
- **THEN** every type and edge type has a description and Decision lists its `option` element
