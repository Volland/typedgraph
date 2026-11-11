---
type: Scenario
openspec: [document-elements]
lat:
  require-code-mention: true
---
# Document Elements Tests

Test specifications for [[elements]]: schema descriptions, element and section declarations, the scanner, `#^id` addressing, element nodes, document validation, SHACL and the CLI.

## Schema

How schema notes declare descriptions, elements and sections.

### Descriptions read

Types, properties, edges of a type in map form and edge types carry their `description`.

### Undescribed declarations unchanged

A note without descriptions, elements or sections has no such keys on its declarations, so a 0.3 note reads as before.

### Element declarations read

An element declares its description, attributes with values and `required`, `required` and `many`, a `type`, and nested elements.

### Element shorthands

A description string, a null declaration and a list of tags are all element declarations.

### Element declaration problems

An invalid tag name and a repeated tag are reported and skipped; an unknown key inside an element is `unknown-key` under TGS 0.4.

### Section declarations read

A heading maps to a declaration with `description` and `required`, or to a description string.

## Scanner

How block-level XML elements are found in Markdown.

### Nested elements with attributes

Quoted and bare attributes, nesting, one-line elements and 1-based lines are read; tags in frontmatter are not.

### Placeholders and code skipped

Placeholder text, autolinks, fenced code and tags indented four spaces at the top level are not elements.

### Unclosed tag

An unclosed tag is an empty element and its would-be content stays with the parent.

## Addressing

How `file#^id` links resolve and are checked.

### Element link resolves

`[[decisions#^redis]]` and `[[lat.md/decisions#^REDIS]]` reach the element and `tg check` passes.

### Missing element id suggests

A link to an id that does not exist is a broken link that names the nearest id.

### Repeated id reported

An id used twice in one file is reported once, for the second element.

### Spec element resolves

`adr:3#^mysql` and `adr:ADR-0003#^MYSQL` reach the element in record 0003, and `openspec:auth#^lockout` the one owned by requirement Login.

## Graph

How elements become nodes in the `tg` graph.

### Element node and its edges

An option with an id is an `Element` node its section contains, with its attributes and description; the typed edge inside it starts at the element, and the section's link to it is a reference.

### Typed element without id

A `<rule>` declared with `type: Requirement` is a node labelled `Element` and `Requirement`, with a generated id when it has none.

### Undeclared element stays text

An undeclared element and a declared, untyped one without an id are not nodes.

### Elements in spec files

An element in an OpenSpec requirement is a node the requirement contains, typed by the Requirement declarations, and a typed edge inside it starts at it.

## Validation

How documents are checked against their declared shape.

### Missing required element

A typed section without a required element is reported with the element's description; a section that has it is not.

### Attribute value not allowed

A repeated single element, a value outside `values`, an unclosed tag with a missing required attribute, and a nested element missing a required child are each reported at their line.

### Missing ADR heading

A record without a heading its ADR label requires is reported, and records also answer to their Decision label.

### Vault notes checked

A typed vault note is one document: a note without a required element is a note-level finding, one that has it is clean.

## SHACL round trip

Descriptions, elements and sections survive export to SHACL and import back, in declaration order, with nothing dropped.

## CLI

How the commands show and check documents.

### Listing shows elements

`tg ontology` prints type and edge type descriptions and each element with its attribute values, rules and description; `--json` includes them.

### Element links checked

`@tg:` comments that name `adr:3#^mysql` and `decisions#^redis` pass `tg check` and end at element nodes in `tg cypher`; a misspelled id fails the check.

### Ontology check reports documents

`tg ontology check` lists an attribute value outside the declared ones and a section missing a required element, and exits 1.

### Validate checks typed notes

`tg validate` reports a typed vault note without a required element as `missing-element`.

### Code ontology describes itself

After `tg init --spec adr`, every type and edge type has a description, Decision lists `option` and `consequence`, ADR lists its MADR headings, and `tg ontology check` is clean.

## TGS 0.4 published beside 0.3

`SPEC.md` is version 0.4 with section 4.2, its JSON Schema `$id` names 0.4, 0.3 stays in `spec/tgs/archive/v0.3/` without it, and the site build publishes 0.4.

