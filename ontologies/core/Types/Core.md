---
tgs: "0.1"
edgeTypes:
  contradicts:
    properties:
      why: text
      until: text
      ticket: text
    visualization: {color: "#e5484d", line: dashed}
  derived_from:
    properties:
      transform: text
  cites:
    uri: "http://purl.org/spar/cito/cites"
    properties:
      page: text
      intent:
        values: [agreesWith, citesAsAuthority, citesAsDataSource, citesAsEvidence, citesAsPotentialSolution, citesAsRecommendedReading, citesAsRelated, citesAsSourceDocument, citesForInformation, confirms, corrects, credits, critiques, discusses, disagreesWith, disputes, documents, extends, includesExcerptFrom, includesQuotationFrom, obtainsBackgroundFrom, obtainsSupportFrom, qualifies, refutes, repliesTo, reviews, speculatesOn, supports, updates, usesConclusionsFrom, usesDataFrom, usesMethodIn]
---
The shared core: edge types that more than one ontology uses, declared once so the ontologies can be combined without a duplicate-declaration clash.

Each ontology says which of its types may use `contradicts` and `cites`; this note says what the edge is. `cites` is CiTO's citation relation; its `intent` property names the CiTO sub-property, such as `usesMethodIn` or `disagreesWith`, when the reason for a citation matters. Add an edge type here when a second ontology starts to need the same word, and drop it from the first.
