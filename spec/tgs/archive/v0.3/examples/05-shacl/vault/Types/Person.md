---
schema:
  uri: schema:Person
  template: "[[Templates/Person]]"
  properties:
    name: {kind: text, required: true, uri: schema:name}
    score: {kind: number, default: 0}
    tags: {kind: list, default: [new]}
  edges: {worksAt: Company, knows: {target: Person, many: true}}
  visualization: {color: "#3b82f6", icon: user}
---
