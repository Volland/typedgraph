## ADDED Requirements

### Requirement: Active file query parameter
The full-pane Graph view SHALL bind `$activeFile` to the tracked active Markdown note's vault-relative path when executing a Cypher query. Opening another Markdown note SHALL update the binding and rerun the entered query. A file-open event with no file or a non-Markdown file SHALL retain the last Markdown path. Before any note is active, the binding SHALL be `null`.

#### Scenario: Paths anchored to the active note
- **WHEN** A is the active Markdown note and the user runs `MATCH p = (n {path: $activeFile})-[:KNOWS*1..2]->(y) RETURN p` over A to B to C and unrelated D to E
- **THEN** `$activeFile` is `A.md` and the graph shows A, B, C and their two relationships without D or E

#### Scenario: Query follows a different Markdown note
- **WHEN** the anchored query is present and the user opens B
- **THEN** the view reruns the query with `$activeFile` set to `B.md` and shows B to C

#### Scenario: Retain the last Markdown note
- **WHEN** B was the last active Markdown note and a file-open event has no file or a non-Markdown file
- **THEN** executing the anchored query still binds `$activeFile` to `B.md`

#### Scenario: No active note
- **WHEN** the user runs the anchored query before any note is active
- **THEN** `$activeFile` is bound to `null` and the query returns an empty graph without a missing-parameter error
