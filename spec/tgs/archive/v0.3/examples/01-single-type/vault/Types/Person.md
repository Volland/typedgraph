---
schema:
  properties:
    name: text
    email: {kind: text, required: true}
    born: date
    status: {kind: text, values: [active, alumni], default: active}
    aliases: list
  edges: {knows: Person, worksAt: Company}
---

## Notes
