---
type: Scenario
lat:
  require-code-mention: true
---
# Ontology Gallery Tests

Test specifications for the downloadable ontologies in `ontologies/` and the rules that let them be combined. See [[publishing#Ontology gallery]].

## Each ontology stands alone

Every ontology in the gallery reads without diagnostics, validates its own example notes, passes the TGS JSON Schema and exports to SHACL, and `core` declares only the shared edge types.

## Zettelkasten note types and sources

The Zettelkasten examples use every note, source (book, article, paper) and highlight type; a literature note or a highlight without a source is reported as a missing required edge.

## Zettelkasten trail steps exist

Every note the website's Zettelkasten walkthrough names is an example note of the ontology, appears in one step only, and each step has text to show.

## Manuscript chapters, research and reviews

The manuscript examples read as AsciiDoc chapters in include order and answer the idea-order, open-comment and citation-intent queries.

A review without a reviewer or with an unknown comment status is reported, and every type's template makes a valid note in its format.

## Ontologies compose

All ontologies placed in one schema folder, with a note labelled by two ontologies at once, produce no diagnostics and the combined type count is the sum of the parts.

## Clash without core

Declaring a shared edge type in a second note is reported as a duplicate declaration, which is why shared edge types live in `core`.

## Mixin bridges two ontologies

A small mixin type that allows an edge to a type from another ontology grants that edge to notes labelled with both types, and the edge is reported as not allowed on notes without the mixin.

## OKF ontology exports conformant

The example notes of the OKF ontology export as an Open Knowledge Format bundle that passes the conformance check, and typed edges survive as prose with bundle-absolute links.
