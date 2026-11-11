## Why

The typed graph stops at the section: a decision's rejected options, a requirement's separate rules, an ADR's consequences and a skill's examples are all prose that no query, check or link can reach. Prompt files, skills, ADRs and specs already mark such parts with XML tags (`<example>`, `<constraint>`, `<option>`), but nothing says what a tag means, so neither agents nor `tg` can rely on it. Meanwhile the ontology itself has no explanations: `tg ontology` lists names and endpoints, and an agent has to guess what a `Constraint` or a `refines` edge is for.

## What Changes

- Typed Graph Schema 0.4: a `description` on types, properties, edges of a type and edge types, so the ontology explains itself to people and agents; `tg ontology` prints it and the SHACL export writes it as `sh:description`.
- Types declare the inside of their documents: `elements` (XML tags with a description, attributes, nesting, cardinality, an optional ontology `type` and a `node` switch) and `sections` (headings with a description and `required`).
- `tg` reads block-level XML elements in lat.md files and spec files (OpenSpec, Spec Kit, Kiro, BMAD, GSD, ADRs). An element with an `id` attribute is addressable as `[[file#^id]]` or `[[adr:0003#^id]]`, from docs and from `@tg:` comments, and `tg check` resolves those links.
- Balance between text and graph: only an element with an `id`, or one whose declaration gives it a `type` (or `node: true`), becomes a graph node, `Element` plus its type, hanging off its section or requirement by `contains`. Typed edge lines inside it start at the element. Everything else stays text in its section.
- `tg ontology check` validates documents against their declared shape: required and single elements, required headings, attribute values and unclosed declared tags.
- The bundled code ontology gets a description for every type, property and edge type, and element declarations (`option`, `consequence`, `rule`, `example`, `exception`, `given`/`when`/`then`); the ADR framework type declares MADR's headings. The `tg-docs` and `tg-graph` skills, the code ontology guide, the ADR template and the spec authoring guidance explain when to use an element, a heading or a separate section.

## Capabilities

### New Capabilities
- `document-elements`: descriptions in the schema, element and section declarations, element nodes and addressing, document shape validation, and the TGS 0.4 publication.

### Modified Capabilities

None. TGS 0.4 only adds optional keys; every 0.3 note reads unchanged.

## Impact

- `packages/core`: schema reader (`description`, `elements`, `sections`), an element scanner, element nodes in `buildLatGraph`, `#^id` resolution in `LatIndex` and `SpecIndex`, `checkDocuments`, SHACL export and import.
- `packages/cli`: `tg ontology` listing and check, `tg cypher` reads the ontology, `Project.schemas()`, templates (code ontology, ADR, spec stages, skills).
- `spec/tgs/`: TGS 0.4 with 0.3 archived; `site/build-spec.mjs` publishes 0.4.
- The Obsidian plugin and VS Code extension read the new keys through core but do not show elements as nodes yet.
