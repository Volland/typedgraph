## ADDED Requirements

### Requirement: Edge options as plugin settings
The Obsidian plugin SHALL offer the plain-link edge option and the frontmatter-link edge option as two independent settings, both off by default, and SHALL re-index the vault when either is changed.

#### Scenario: Plain links on
- **WHEN** "Plain links as links_to edges" is on and a note contains `See [[B]]`
- **THEN** the graph has a `links_to` edge from that note to `B`

#### Scenario: Frontmatter links on
- **WHEN** "Frontmatter links as edges" is on and a note has `requirement: "[[B]]"`
- **THEN** the graph has a `requirement` edge from that note to `B`

#### Scenario: Defaults
- **WHEN** neither setting has been changed
- **THEN** the graph has no `links_to` and no frontmatter edges
