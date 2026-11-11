---
schemas:
  Person:
    properties:
      email: {kind: text, required: true}
      status: {values: [active, alumni]}
      nick: text
    edges:
      worksAt: {target: Company, required: true, many: false}
      knows: Person
  Company: {}
edgeTypes:
  worksAt:
    from: Person
    properties:
      role: {kind: text, required: true, values: [engineer, manager]}
---
