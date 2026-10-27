---
inclusion: always
---
# Traceability with tg

This project links its Kiro specs to code, tests and docs with `tg`. Requirement ids are `kiro:<feature>#Requirement 1`; acceptance criteria are `kiro:<feature>#Requirement 1#1.2`, the same `N.M` numbers tasks cite as `_Requirements: 1.2_`.

- When implementing a task, put `// @tg: implements:: [[kiro:<feature>#Requirement N]]` directly above the function or class that realizes the requirement.
- Put `// @tg: verifies:: [[kiro:<feature>#Requirement N#N.M]]` directly above the test that proves each acceptance criterion the task lists.
- Record design decisions as `Decision` sections in `lat.md/` with typed edges; run `tg ontology` for the edge names.
- After each task run `tg check` and `tg ontology check`; when the spec is done, `tg trace kiro:<feature> --gaps` should list nothing.
