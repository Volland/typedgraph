### OpenFlow

`tg` reads `docs/current/<capability>/spec.md` and `requirements.md`, plus the same files in the open change folders under `docs/changes/<change>/`. Records in `docs/decisions/ADR-NNN-*.md` are read as ADRs (`adr:001`).

```
openflow:<capability>#SC-001     a behaviour scenario from spec.md frontmatter (also its name)
openflow:<capability>#R1         a requirement row of requirements.md (also US-001, FR-001, NFR-1)
openflow:<change>#SC-002         a scenario still in an open change, shown as pending
```

- `spec.md` keeps its scenarios as frontmatter: each `{"id": "SC-001", "name", "given", "when", "then", "criticality"}` becomes a `BehaviorScenario` node with its criticality. Put `verifies::` on the test that proves it.
- `requirements.md` rows whose first cell is an id become requirements with their priority and acceptance column. Template rows that still hold `{{placeholders}}` are skipped.
- Through the OpenFlow phases:
  - `/openflow-feature` and brainstorm keep `SC-` and `R` ids stable.
  - `writing-plan` cites the ids each task covers.
  - `/openflow-implement` and the TDD skill annotate code and tests.
  - `openflow-quality-gate` counts `tg check`, `tg ontology check` and `tg trace openflow:<capability> --gaps` as readiness evidence.
- `/openflow-archive` promotes a change into `docs/current/<capability>/`, so re-point any `openflow:<change>#...` link to `openflow:<capability>#...` when it archives.
- Docs name what they explain as `specs: ["openflow:<capability>"]` in frontmatter.
