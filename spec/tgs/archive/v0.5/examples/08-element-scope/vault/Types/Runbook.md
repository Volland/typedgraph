---
tgs: "0.5"
schema:
  description: How to operate one part of the system when something goes wrong.
  sections:
    Symptoms: {required: true, description: What an on-call engineer sees first.}
  elements:
    step:
      description: One action, in order, that an engineer or an agent can run.
      attributes:
        id: {description: Give one when an alert or a script points at the step.}
        risk: {values: [safe, disruptive], required: true, description: Whether the step can hurt users.}
      elements:
        check: {required: true, description: How to tell that the step worked.}
    rollback: {required: true, many: false, description: How to undo the steps.}
    note: A remark for the reader.
---
A runbook: symptoms, steps with checks, and one rollback.
