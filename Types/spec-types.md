---
tgs: "0.4"
schemas:
  Capability:
    description: "An OpenSpec capability: the folder of requirements under openspec/specs/ for one area of behaviour."
    properties:
      status: {values: [draft, stable, deprecated], default: draft}
      owner: text
    visualization: {color: "#0284c7", shape: barrel}
  ADR:
    description: A numbered architecture decision record in docs/adr/; it is also a Decision, so it holds options and consequences.
    properties:
      adrStatus: {values: [proposed, accepted, deprecated, superseded, rejected]}
      number: text
      date: date
      title: text
    sections:
      Context and Problem Statement: The forces that make a decision necessary, in two or three sentences (Context in the Nygard format).
      Considered Options: Every option weighed, each as an <option> element with an id.
      Decision Outcome: The chosen option and the reason it won (Decision in the Nygard format).
      Consequences: What becomes easier, harder or riskier, each as a <consequence> element.
    elements:
      option:
        description: One considered option, with why it won or lost. Code that realizes it points at it as adr:<number>#^<id>.
        attributes:
          id:
            description: Stable address within the record.
          outcome: {values: [chosen, rejected, deferred]}
    visualization: {color: "#6366f1", shape: hexagon}
edgeTypes:
  part_of:
    description: This requirement, decision or concept belongs to that group.
    from: [Requirement, Decision, Concept]
    to: [Capability]
    properties: {note: text}
  amends:
    description: A later record changes part of this one without replacing it.
    from: [Decision]
    to: [Decision]
    properties: {since: text, note: text}
---
# Spec Framework Ontology

Types and edges for the spec frameworks this project uses (OpenSpec, ADRs), written by `tg init` and rewritten on every run: keep project vocabulary in `Types/code-types.md`.

## How spec nodes are labelled

Every requirement `tg` reads from a spec file keeps the base label the code ontology's edges allow — `Requirement`, `Scenario` or `Decision` — and adds its framework's own label from this note, so `implements` and `verifies` work everywhere and `MATCH (u:UserStory)` finds just the user stories. Type a lat.md section with one of these labels to describe a feature, epic or principle in prose.
