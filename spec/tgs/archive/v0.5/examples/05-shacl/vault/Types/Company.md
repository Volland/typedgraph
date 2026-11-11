---
schema:
  uri: schema:Organization
  properties: {founded: date, public: boolean}
edgeTypes:
  worksAt:
    uri: schema:worksFor
    from: Person
    to: Company
    properties: {since: date}
    visualization: {color: green}
---

## About
