---
tgs: "0.6"
edgeTypes:
  contradicts:
    description: Knowingly in conflict, written with a leading minus. Named debt, with a reason, a ticket and a deadline.
    properties:
      reason: {kind: text, description: Why the conflict is accepted for now.}
      until: {kind: text, description: Version or date by which the conflict must be gone.}
      ticket: {kind: text, description: The issue that tracks it.}
    visualization: {color: "#e5484d", line: dashed}
  derived_from:
    description: Built from another thing of the same kind, such as a prompt based on a prompt or a table computed from a table.
    properties:
      transform: {kind: text, description: What was done to the source.}
  cites:
    description: "Refers to a source, with CiTO's reason for citing it when that matters."
    uri: "http://purl.org/spar/cito/cites"
    properties:
      page: {kind: text, description: Where in the source.}
      intent:
        description: "The CiTO sub-property that says why, such as usesMethodIn or disagreesWith."
        values: [agreesWith, citesAsAuthority, citesAsDataSource, citesAsEvidence, citesAsPotentialSolution, citesAsRecommendedReading, citesAsRelated, citesAsSourceDocument, citesForInformation, confirms, corrects, credits, critiques, discusses, disagreesWith, disputes, documents, extends, includesExcerptFrom, includesQuotationFrom, obtainsBackgroundFrom, obtainsSupportFrom, qualifies, refutes, repliesTo, reviews, speculatesOn, supports, updates, usesConclusionsFrom, usesDataFrom, usesMethodIn]
---
The shared core: edge types that more than one ontology uses, declared once so ontologies can be combined without a duplicate-declaration clash. The same file ships with `tg init` and with every ontology in the gallery, so copying one into the other replaces it instead of declaring a name twice.

The core says what each edge is and leaves its ends open; each ontology says which of its own types may use it, in the type's `edges` list. `cites` is CiTO's citation relation; its `intent` property names the CiTO sub-property when the reason for a citation matters. Add an edge type here when a second ontology starts to need the same word, and drop it from the first. Your own edge types belong in your own schema note, not here: tg rewrites this file on `tg upgrade`.
