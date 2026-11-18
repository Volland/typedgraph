---
tgs: "0.6"
schemas:
  Stakeholder:
    description: Someone outside the delivery team whose request or sign-off a requirement depends on.
    properties:
      role: {kind: text, description: What they do in relation to the product.}
      team: {kind: text, description: The group they speak for.}
    visualization: {color: "#ec4899", shape: ellipse, icon: user}
  Release:
    description: A version that ships a set of requirements and changes.
    properties:
      version: {kind: text, required: true, description: The version name.}
      date: {kind: date, description: When it ships or shipped.}
      status: {values: [planned, shipped], default: planned, description: Whether it is out.}
    visualization: {color: "#22c55e", shape: tag, icon: rocket}
  Risk:
    description: Something that could go wrong, how likely it is and how bad, and what mitigates it.
    properties:
      likelihood: {values: [low, medium, high], description: How likely it is.}
      impact: {values: [low, medium, high], description: How bad it would be.}
      status: {values: [open, mitigated, accepted, closed], default: open, description: Where the risk stands.}
    edges:
      threatens: Requirement
      mitigated_by: [Requirement, Decision]
    visualization: {color: "#e5484d", shape: triangle, icon: alert-triangle}
edgeTypes:
  requested_by:
    description: Who asked for this requirement.
    from: Requirement
    to: Stakeholder
    properties:
      since: {kind: date, description: When they asked.}
  ships_in:
    description: The release this requirement or change goes out in.
    from: [Requirement, Change]
    to: Release
  threatens:
    description: A risk that would break this requirement if it happened.
    from: Risk
    to: Requirement
  mitigated_by:
    description: The requirement or decision that makes this risk smaller.
    from: Risk
    to: [Requirement, Decision]
---
The requirements ontology: product work on top of the code ontology, with stakeholders, releases and risks.

It builds on the code ontology (`code-types.md`), which declares `Requirement`, `Scenario`, `Decision`, `Constraint`, `Concept` and `Change` with their edges and the `priority` of a requirement; this note adds only what product work needs on top. The download includes the code ontology and the shared core, and in a project set up with `tg init` you copy only this note, because both are already there.
