## 1. Schema

- [x] 1.1 Read `description` on types, properties, edges of a type and edge types, leaving the key out when absent
- [x] 1.2 Read `elements` and `sections` with their shorthands, nesting and strict unknown-key reporting
- [x] 1.3 Merge elements and sections across labels in `mergeSchemas`
- [x] 1.4 Bump the reader to TGS 0.4

## 2. Elements

- [x] 2.1 Element scanner with attributes, nesting, placeholders and unclosed tags
- [x] 2.2 `#^id` addressing in `LatIndex` and `SpecIndex`, and in `tg check` for docs and annotations; duplicate ids reported
- [x] 2.3 Element nodes in `buildLatGraph` with `contains` edges, typed edges and links owned by the innermost element node
- [x] 2.4 Element nodes in spec files, owned by the requirement or scenario above them
- [x] 2.5 `checkDocuments` for required, single and unclosed elements, attributes and required headings

## 3. CLI

- [x] 3.1 `tg ontology` prints descriptions, sections and elements; `--json` includes them
- [x] 3.2 `tg ontology check` adds document findings; `tg cypher` reads the ontology
- [x] 3.3 SHACL export and import of descriptions, elements and sections

## 4. Spec, ontology and guidance

- [x] 4.1 TGS 0.4 in `spec/tgs/` with 0.3 archived, JSON Schema, namespace terms, site builder
- [x] 4.2 Describe the code ontology and declare its elements; ADR headings in the spec framework ontology
- [x] 4.3 Update the code ontology guide, `tg-docs` and `tg-graph` skills, ADR template and spec authoring guidance
- [x] 4.4 lat.md docs and test specs

## 5. TGS 0.5: one way to declare and read elements

- [x] 5.1 Spec 0.5: elements, attributes (reserved `id`, keys that have a meaning), nesting and scope, sections, reading, nodes, validation and normal form as separate sections; 0.4 archived; JSON Schema attribute definition
- [x] 5.2 One scope rule for element nodes and validation, with counts per container
- [x] 5.3 `tg ontology` lists elements in the structure of their YAML, attributes shown like properties
- [x] 5.4 List forms of `elements` and `sections` hold names only
- [x] 5.5 Conformance example 08, tests, lat.md docs and a guide article
