## 1. Specification

- [x] 1.1 TGS 0.6 with identifiers under typedgraph.org; 0.5 archived unchanged; JSON Schema `$id`; `namespace.json` with `formerly`
- [x] 1.2 Site builder publishes 0.6, marks archived versions whose addresses moved, and names the former namespace

## 2. Implementation

- [x] 2.1 `TGS_NAMESPACE` is `https://typedgraph.org/ns/tgs#`, with `TGS_FORMER_NAMESPACES`
- [x] 2.2 SHACL import reads the former namespace as the current one and keeps no former `tgs:` prefix
- [x] 2.3 Conformance example 05 regenerated

## 3. Docs and tests

- [x] 3.1 Tests for 0.6, the 0.5 archive and importing the former namespace
- [x] 3.2 lat.md docs, changelog and site links
