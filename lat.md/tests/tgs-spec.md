---
type: Scenario
lat:
  require-code-mention: true
---
# TGS Specification Tests

Test specifications for the published Typed Graph Schema specification, its JSON Schema and its conformance examples. See [[shacl#Typed Graph Schema]].

## Conformance examples pass

Every example in `spec/tgs/examples` gives the expected declarations and diagnostics through the reader and validator, the expected SHACL where present, and the expected JSON Schema result per note.

## Spec examples validate

Every YAML example in `SPEC.md` and the schema scaffold validates against the JSON Schema and reads without diagnostics.

## Invalid notes rejected

Malformed declarations such as `edges: 5`, an unknown kind or an unknown key fail the JSON Schema.

## Namespace terms documented

Every `tgs:` term the SHACL export or import uses is listed in `namespace.json`, and no listed term is unused.

## AsciiDoc example reads as documented

The AsciiDoc chapter in `SPEC.md` section 2.1 produces the node, properties, edges with their `section` and the id alias that the table below it lists.

## Version 0.3 published beside 0.2

The specification, JSON Schema `$id` and site build name 0.3 as the current version, and 0.2 stays in `spec/tgs/archive/v0.2/` with its text unchanged.

## Version 0.6 published at typedgraph.org

`SPEC.md` is 0.6 with its version address and `tgs:` namespace under typedgraph.org, the JSON Schema `$id` is the typedgraph.org address, the site build publishes 0.6, and archived 0.5 keeps its former addresses.

## Former namespace imports unchanged

A SHACL export rewritten to the former `tgs:` namespace imports to the same types, edge types, prefixes and dropped constructs as the current one, and keeps no `tgs` vault prefix.
