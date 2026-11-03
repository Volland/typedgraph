# ontology-gallery Specification

## Purpose
Ships ready-made Typed Graph ontologies (`zettelkasten`, `library`, `manuscript`, `requirements`, `agents`, `okf` and the shared `core`) as plain Markdown vaults that load on their own, compose with each other and are offered for download on the website.

## Requirements

### Requirement: Each ontology stands alone
Every ontology in `ontologies/` SHALL read without schema diagnostics, SHALL validate its own example notes without diagnostics, SHALL pass the TGS JSON Schema and SHALL export to SHACL, and `core` SHALL declare only the edge types several ontologies share.

#### Scenario: Ontology checked alone
- **WHEN** the `library` ontology's `Types/` and `Examples/` are loaded with `core`
- **THEN** there are no diagnostics and the SHACL export succeeds

### Requirement: Ontologies compose
All ontologies placed in one schema folder SHALL produce no diagnostics, with a combined type count equal to the sum of the parts, and declaring a shared edge type a second time outside `core` SHALL be reported as a duplicate declaration.

#### Scenario: All composed
- **WHEN** every ontology is placed in one schema folder with a note labelled by two ontologies at once
- **THEN** no diagnostic is reported and the type count is the sum of each ontology's types

#### Scenario: Clash without core
- **WHEN** a second note declares an edge type that `core` declares
- **THEN** it is reported as a duplicate declaration

### Requirement: Mixins bridge ontologies
A mixin type that allows an edge to a type from another ontology SHALL grant that edge to notes labelled with both types, and the edge SHALL be reported as not allowed on notes without the mixin.

#### Scenario: Edge granted by mixin
- **WHEN** a mixin `Traceable` allows `implements: Requirement` and an agents-ontology note typed `[Prompt, Traceable]` has `implements:: [[Tokens expire after 15 minutes]]` to a requirements-ontology note
- **THEN** no diagnostic is reported, while the same note typed only `Prompt` is reported for a disallowed `implements` edge

### Requirement: Zettelkasten ontology
The Zettelkasten ontology SHALL give every note type a time-ordered `uid`, SHALL let permanent notes take an optional Luhmann id, SHALL give each note type a template that produces a valid note, and SHALL require a source on literature notes and highlights. Every note the website walkthrough names SHALL be an example note of the ontology appearing in one step only, and each step SHALL have text.

#### Scenario: Literature note without a source
- **WHEN** a `LiteratureNote` has no `cites` edge or a `Highlight` has no `highlighted_in` edge
- **THEN** each is reported as missing that required edge

#### Scenario: Walkthrough notes exist
- **WHEN** the walkthrough steps are checked against the examples
- **THEN** every named note exists in `ontologies/zettelkasten/Examples/` and appears in exactly one step

### Requirement: Manuscript ontology
The manuscript ontology SHALL type AsciiDoc chapters, parts and the master file and order them by their `include::` lines, SHALL require every review to name its reviewer, SHALL restrict review comment status, kind and severity to declared values, and SHALL give every type a template that produces a valid note, AsciiDoc for the manuscript, parts and chapters and Markdown otherwise.

#### Scenario: Review comment checked
- **WHEN** a `Review` has no `reviewed_by` edge and a `comments_on` edge with a status that is not declared
- **THEN** both are reported, while the example book reads in include order with no diagnostics

### Requirement: OKF ontology exports conformant
The example notes of the `okf` ontology SHALL export as an Open Knowledge Format bundle that passes the conformance check, with typed edges kept as prose using bundle-absolute links.

#### Scenario: Export and check
- **WHEN** the `okf` examples are exported to an OKF bundle and checked
- **THEN** the check reports no errors and edge lines link with `/`-rooted paths

### Requirement: Gallery downloads
The website build SHALL write one zip per ontology containing its `Types/`, `Examples/`, README and the shared `Core.md`, an `all.zip` with every ontology composed into one vault, and each schema note as a single downloadable file.

#### Scenario: Per-ontology zip
- **WHEN** the gallery build runs
- **THEN** `site/ontologies/zettelkasten.zip` exists and contains `Types/Core.md`
