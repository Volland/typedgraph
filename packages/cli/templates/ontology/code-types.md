---
tgs: "0.4"
schemas:
  Decision:
    description: A choice that was made, with its reason and the alternatives rejected. An ADR is one.
    template: "[[Templates/Decision]]"
    properties:
      status: {values: [proposed, accepted, superseded, rejected], default: proposed, description: Where the decision is in its life.}
      date: {kind: date, description: When it was decided.}
      owner: {kind: text, description: Who answers for it.}
    edges:
      supersedes: Decision
      contradicts: [Decision, Requirement, Constraint]
      motivated_by: [Constraint, Concept, Decision]
      changed_by: Change
    elements:
      option:
        description: An alternative that was considered, and why it won or lost. Give it an id when code or a later decision must point at it.
        attributes:
          id: {description: "Stable address, unique in the file, linked as file#^id."}
          outcome: {values: [chosen, rejected, deferred], description: What happened to this option.}
      consequence:
        description: What becomes easier, harder or riskier because of the decision.
        attributes:
          kind: {values: [good, bad, risk]}
    visualization: {color: "#6366f1", shape: hexagon}
  Requirement:
    description: Something the system SHALL do, stated so that it can be implemented and tested. One section per requirement.
    template: "[[Templates/Requirement]]"
    properties:
      status: {values: [draft, stable, deprecated], default: draft, description: How settled the requirement is.}
      risk: {values: [low, medium, high], description: What breaks if it is wrong.}
      owner: {kind: text, description: Who decides what it means.}
    edges:
      refines: Requirement
      depends_on: Requirement
      contradicts: [Decision, Requirement, Constraint]
      introduced_by: Change
      changed_by: Change
    elements:
      rule:
        type: Requirement
        description: One precise, separately testable rule inside a larger requirement. It is a Requirement node, so code can implement it and a test verify it by id.
        attributes:
          id: {description: "Stable address, linked as file#^id."}
          strength: {values: [must, should]}
      example:
        description: A concrete case that shows the requirement; it illustrates, it does not add a rule.
        elements:
          input: What goes in, or the situation.
          output: What must come out, or happen.
      non-goal: Something this requirement deliberately does not cover, so nobody builds it by accident.
    visualization: {color: "#0ea5e9", shape: round-rectangle}
  Scenario:
    description: A checkable example of a requirement, written so a test can prove it. Test-spec sections are Scenarios.
    template: "[[Templates/Scenario]]"
    properties:
      status: {values: [draft, stable, deprecated], default: draft, description: How settled the scenario is.}
    edges:
      refines: Requirement
    elements:
      given: The state of the world before the action.
      when: The single action or event under test.
      then: The observable result a test asserts.
    visualization: {color: "#14b8a6", shape: round-rectangle}
  Constraint:
    description: A rule nobody here chose and nobody here can change, such as a regulation, an SLA or a platform limit.
    template: "[[Templates/Constraint]]"
    properties:
      source: {kind: text, required: true, description: "Where the rule comes from, such as a law, a contract or a vendor document."}
      owner: {kind: text, description: Who watches it for changes.}
    edges:
      constrains: [Requirement, Decision]
    elements:
      exception:
        description: A case the rule does not bind, with who allowed it and until when.
        attributes:
          id: {description: "Stable address, linked as file#^id."}
          until: {kind: date, description: When the exception ends.}
          approved_by: {kind: text, description: Who allowed it.}
    visualization: {color: "#f59e0b", shape: diamond}
  Concept:
    description: A domain term with one exact meaning in this project.
    template: "[[Templates/Concept]]"
    properties:
      status: {values: [draft, stable, deprecated], default: draft, description: How settled the definition is.}
    edges:
      defines:
    elements:
      example: A typical instance of the term.
      counterexample: Something often taken for the term that is not it.
    visualization: {color: "#a855f7", shape: ellipse}
  Change:
    description: A unit of work that moves intent and code together, with a lifecycle.
    template: "[[Templates/Change]]"
    properties:
      status: {values: [proposed, applied, archived], default: proposed, description: Where the change is in its life.}
      date: {kind: date, description: When it was applied.}
    visualization: {color: "#64748b", shape: tag}
edgeTypes:
  implements:
    description: Code realizes this requirement or decision.
    from: [CodeSymbol, CodeFile]
    to: [Requirement, Decision]
    properties:
      since: {kind: text, description: Version or date from which it holds.}
      confidence: {values: [full, partial], description: partial when only part is realized.}
      note: text
  verifies:
    description: A test proves this requirement or scenario.
    from: [CodeSymbol, CodeFile]
    to: [Requirement, Scenario]
    properties:
      since: {kind: text, description: Version or date from which it holds.}
      level: {values: [unit, integration, e2e, manual], description: How the test runs.}
  contradicts:
    description: Knowingly in conflict, written with a leading minus. Named debt, with a ticket and a deadline.
    from: [CodeSymbol, CodeFile, Requirement, Decision]
    to: [Decision, Requirement, Constraint]
    properties:
      until: {kind: text, description: Version or date by which the conflict must be gone.}
      ticket: {kind: text, description: The issue that tracks it.}
      reason: text
    visualization: {color: "#e5484d", line: dashed}
  supersedes:
    description: Replaces an older decision, which stays as history.
    from: Decision
    to: Decision
    properties:
      since: text
      reason: text
  motivated_by:
    description: The reason behind a decision, such as the constraint, concept or earlier decision that forced it.
    from: Decision
    to: [Constraint, Concept, Decision]
    properties:
      since: text
      weight: {values: [primary, secondary], description: primary for the main reason.}
      note: text
  constrains:
    description: A rule that binds a requirement, a decision or a piece of code.
    from: Constraint
    to: [Requirement, Decision, CodeSymbol, CodeFile]
    properties:
      strength: {values: [must, should]}
      source: text
      note: text
  refines:
    description: A more specific version of a requirement.
    from: [Requirement, Scenario]
    to: Requirement
    properties:
      note: text
  depends_on:
    description: A dependency of intent, meaning this cannot be met unless that is. It is not an import.
    from: [Requirement, CodeSymbol]
    to: Requirement
    properties:
      strength: {values: [hard, soft]}
      note: text
  defines:
    description: Where a term gets its meaning.
    from: Concept
    properties:
      note: text
  introduced_by:
    description: The change that brought this in.
    to: Change
    properties:
      date: date
  changed_by:
    description: A change that altered this.
    to: Change
    properties:
      date: date
      note: text
---
# Code Ontology Schema

The Typed Graph Schema (TGS) declaration of the code ontology: six intent types and eleven edge types, readable by the Obsidian plugin, `tg schema` and any TGS or SHACL tool.

The vocabulary and its rules of use are in `lat.md/code-ontology.md`; this note is its machine-readable form, so edit both together. It lives in `Types/`, the schema folder the Obsidian plugin, the VS Code extension and `tg validate` read by default, and outside `lat.md/` because every note directly in a schema folder declares a type. Each type's `template` links a note in `Templates/` that new notes of the type start from.

## Using it

Export it to RDF tools with `tg schema export shapes.ttl`, and check notes against it with `tg validate`. Open the project as an Obsidian vault, or use **New Typed Note** in VS Code, to create a Decision or Requirement from its template. `CodeSymbol`, `CodeFile`, `Section` and `Element` are derived by `tg` and need no declaration.

Every type, property and edge type has a `description`, which `tg ontology` prints, so an agent reads what each name means before it writes one. `elements` names the XML tags a section of the type may hold, such as a Decision's `<option>` or a Requirement's `<rule>`; none is required, and `tg ontology check` reports only wrong attribute values and unclosed tags.

## Changing it

Rename, drop or add types freely: a type earns its place only when a question depends on it. Describe what you add, because the description is how the next reader learns the word. Keep `tgs: "0.4"` so other readers know which version of the format this note is written for.
