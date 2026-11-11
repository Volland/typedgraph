---
tgs: "0.4"
schema:
  description: A choice that was made, with its reason and the alternatives rejected.
  properties:
    status: {values: [proposed, accepted], description: Where the decision is in its life.}
  sections:
    Context: {required: true, description: The forces that made a decision necessary.}
    Consequences: What becomes easier or harder.
  elements:
    option:
      description: An option that was considered, and why it won or lost.
      attributes:
        id: {description: A stable address for the option.}
        outcome: {values: [chosen, rejected, deferred], required: true}
    summary:
      description: The decision in one or two sentences.
      required: true
      many: false
  edges:
    supersedes: {target: Decision, description: The older decision this one replaces.}
---
A decision record with its options.
