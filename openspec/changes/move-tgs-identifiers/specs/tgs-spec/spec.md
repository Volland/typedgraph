## MODIFIED Requirements

### Requirement: Namespace IRI
The project SHALL define the `tgs:` namespace IRI used for annotations in SHACL exports as `https://typedgraph.org/ns/tgs#`, and that IRI SHALL resolve to a page documenting each term listed in `spec/tgs/namespace.json` and naming the former namespace. A SHACL import SHALL read terms in the former namespace `https://volland.github.io/obsigraph/ns/tgs#` as the same terms.

#### Scenario: Namespace documented
- **WHEN** a user opens the `tgs:` namespace IRI in a browser
- **THEN** a page lists `tgs:note`, `tgs:template`, `tgs:templateBody`, `tgs:visualization`, `tgs:edgesClosed`, `tgs:edge`, `tgs:kind` and `tgs:default` with their meaning

#### Scenario: Former namespace imported
- **WHEN** a SHACL export whose `tgs:` terms use the former namespace is imported
- **THEN** the declarations, dropped constructs and prefixes equal those of the same export in the current namespace, and no `tgs` vault prefix is kept

## ADDED Requirements

### Requirement: TGS 0.6 published
The specification SHALL be published as TGS 0.6 with 0.5 archived unchanged. 0.6 adds no key and changes no rule; its version address, JSON Schema `$id` and namespace SHALL be under `https://typedgraph.org/`. The site SHALL serve archived versions whose published addresses no longer resolve with a notice naming their new address.

#### Scenario: Published 0.6 at typedgraph.org
- **WHEN** the spec folder is read
- **THEN** `SPEC.md` is version 0.6 with its version address and namespace under typedgraph.org, its JSON Schema `$id` is `https://typedgraph.org/spec/tgs/v0.6/tgs.schema.json`, `archive/v0.5/SPEC.md` keeps its former addresses, and the site builder publishes 0.6
