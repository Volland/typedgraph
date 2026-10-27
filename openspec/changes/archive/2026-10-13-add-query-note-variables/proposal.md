## Why

A block that shows the neighbourhood of "its own" note has to name that note in the query, so the same block cannot be copied between notes. Earlier local builds supported `{{path}}` with dynamic code evaluation, which the plugin must not ship (see the 0.9.1 review fixes).

## What Changes

- `{{name}}` variables in the query text are replaced by Cypher literals of the note holding the block: `path`, `name`, `title`, `folder`, `extension` and `fm.<property>`.
- Substitution is plain lookup by identifier chain; no expression is evaluated. Unresolved names become `null`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `graph-query-block`: note variables in queries.

## Impact

- `packages/plugin/src/query/variables.ts` and the block's run path (built-in and Ladybug backends).
- `lat.md/query-engine`, `lat.md/tests/graph-query-block`, tests.
