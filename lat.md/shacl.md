---
type: Decision
openspec: [shacl-interop, tgs-spec]
---
# SHACL

Exchange of schemas with the RDF world: export of schema notes as W3C SHACL, import of SHACL shapes into schema notes, and the open Typed Graph Schema specification both are defined by.

The schema format is described in [[graph-model#Schema notes]]; this file covers the mapping to SHACL and the specification that publishes it.

## Typed Graph Schema

TGS 0.4 is the current schema-note YAML format, published as an open specification so other tools can read and write the same ontologies without this project's code.

Sources live in `spec/tgs/`: `SPEC.md`, a JSON Schema `tgs.schema.json` for the frontmatter keys, `namespace.json` (the `tgs:` annotation terms) and `examples/` conformance cases, each a `vault/` with an `expected.json` of declarations and diagnostics. `site/build-spec.mjs` renders them to `site/spec/tgs/v0.4/` and `site/ns/tgs/`, which GitHub Pages serves at `https://typedgraph.org/spec/tgs/v0.4/`, with `spec/tgs/` redirecting to the latest version. TGS 0.1, 0.2 and 0.3 are archived unchanged in `spec/tgs/archive/` and still rendered to `site/spec/tgs/v0.1/`, `v0.2/` and `v0.3/`; TGS 0.3 defines a note as a Markdown or AsciiDoc file ([[asciidoc]]) and adds no schema key; TGS 0.4 adds `description`, `elements` and `sections` and a Document validator conformance level ([[elements]]), with example `07-document-elements`; a note without a `tgs` version key is read as 0.1. Published versions never change; minor versions only add optional keys, and a reader reports keys it does not know. Tests run every example through the reader and the JSON Schema, see [[tests/tgs-spec]].

## Export

`exportShacl` writes every type and edge type as one deterministic Turtle document, implemented by [[packages/core/src/shacl/export.ts#exportShacl]].

Types become `sh:NodeShape`s targeting a class, properties become property shapes with datatype, `sh:minCount`, `sh:maxCount`, `sh:defaultValue` and `sh:in`, and per-type edges become property shapes with `sh:class` or `sh:or`. Edge types become reification shapes over `rdf:subject`, `rdf:predicate` and `rdf:object` so edge properties can be constrained with plain SHACL 1.0. Descriptions become `sh:description` on node, property and edge shapes. What SHACL cannot say (`tgs:note`, `tgs:template`, `tgs:visualization`, `tgs:edgesClosed`, `tgs:elements` and `tgs:sections` as JSON in declaration order, and a few more) is kept as `tgs:` annotations that SHACL engines ignore; `sh:closed` is not used because it would close frontmatter properties too. Shapes are ordered by name and properties by `sh:order`, so unchanged schemas give byte-identical output. Declarations without `uri` are named by the base IRI, `urn:tgs:` by default.

## Import

`importShacl` reads shapes into TGS declarations and a drop report; `planImport` places them into schema notes, both in [[packages/core/src/shacl/import.ts#importShacl]] and [[packages/core/src/shacl/write.ts#planImport]].

A node shape with a target class is a type; a property shape with a datatype or `sh:nodeKind sh:IRI` is a property; one with `sh:class`, `sh:node` or an `sh:or` of classes is an edge; a shape constraining `rdf:predicate` with `sh:hasValue` is an edge type. IRIs that differ from the base IRI plus the name are written as `uri`, as a CURIE when a prefix matches. Everything outside that subset (`sh:closed`, `sh:pattern`, property paths, unknown datatypes, ...) is listed in the drop report and the rest of the shape is still imported. Notes are written one per type, grouped by `tgs:note`, or all in one; only the `schema`, `schemas`, `edgeTypes` and `prefixes` keys of an existing note are replaced, bodies and other frontmatter stay as written, and a note that also declares types missing from the import is left alone without `--force`. Nothing is ever deleted. Only a newly created note named after its type receives that type's `tgs:templateBody`, so the import warns for every template body it does not write, naming the type and suggesting `--layout per-type`: a note holding several types keeps no per-type body, and an existing note keeps its own body unless it already matches.

## Commands

`tg schema export <out.ttl>` and `tg schema import <file.ttl>` in `packages/cli/src/commands/schema.mts` and the plugin commands "Export schemas as SHACL" and "Import SHACL shapes" run the above.

The CLI takes `--vault`, `--schema-folder` and `--base`; import adds `--layout auto|per-type|single`, `--into` and `--force`, prints the drop report and exits 1 only when a note was left unchanged. The plugin reads the base IRI from the Schema base IRI setting and shows the report in a dialog. The SHACL module is a separate entry point (`@obsigraph/core/src/shacl.ts`) so hosts that never use it do not load the Turtle parser, `n3`.
