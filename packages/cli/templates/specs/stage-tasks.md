## Traceability with tg

While breaking this {{name}} spec into tasks, add tasks that keep it traceable with `tg`:

- For each requirement, a task to annotate the code that implements it with `// @tg: implements:: [[{{requirement}}]]` on the line above the function or class (entry points only), with `{confidence: partial}` when it covers part of it.
- For each acceptance scenario or criterion, a task to annotate the test that proves it with `// @tg: verifies:: [[{{scenario}}]]` directly above the `it(` or `test(` call.
- A task to record the design's decisions and constraints in `lat.md/` as typed sections with typed edges, and to list what the lat.md file explains as `{{frontmatter}}` in its frontmatter.
- A final task: `tg check`, `tg ontology check` and `tg trace --gaps` show no new gaps.
