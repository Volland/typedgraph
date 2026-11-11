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
