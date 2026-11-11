## Why

The specification names its addresses under `https://volland.github.io/obsigraph/`: the address of each version, the JSON Schema `$id` and the `tgs:` namespace IRI. Since the repository was renamed to `typedgraph`, every one of them answers 404, for every version, which breaks the requirement that the namespace IRI resolve to a page documenting its terms. The site lives at `https://typedgraph.org/`, a domain the project controls.

## What Changes

- TGS 0.6 moves every identifier to `https://typedgraph.org/`: versions at `/spec/tgs/v<version>/`, the JSON Schema `$id`, and the namespace `https://typedgraph.org/ns/tgs#`. It adds no key and changes no rule; 0.5 is archived unchanged.
- SHACL export writes the new namespace. Import reads terms in the former namespace as the same terms and does not keep a declared former `tgs:` prefix as a vault prefix, so exports made under 0.1 to 0.5 import unchanged.
- The site shows archived versions with a notice that their published addresses moved, and the namespace page names the former IRI.
- **BREAKING (exported RDF only)**: SHACL exports name `tgs:` terms with the new IRI.

## Capabilities

### Modified Capabilities

- `tgs-spec`: the namespace IRI and the published version move to typedgraph.org; the former namespace is read on import.

## Impact

`packages/core/src/schema/schema.ts` (`TGS_NAMESPACE`, `TGS_FORMER_NAMESPACES`, `TGS_VERSION`), `packages/core/src/shacl/import.ts`, `spec/tgs/`, `site/build-spec.mjs`, conformance example 05.
