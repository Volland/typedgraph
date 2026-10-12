## ADDED Requirements

### Requirement: Layout header options
The block header SHALL accept `forces`, `display`, `pin` and `controls` lines that set the graph's initial force and display settings, the nodes pinned (`self`, `none` or note names; default `self`, the note holding the block, at the canvas centre) and whether the controls button is shown, expanded or hidden (`show`, `open`, `hide`; default `show`). Valid entries SHALL be kept and each invalid one SHALL be reported as a header error with its line.

#### Scenario: Valid layout header
- **WHEN** a block header has `forces: center=0.5, repel=12`, `display: arrows=false, hide=requirement|feature`, `pin: self, Other Note` and `controls: open`
- **THEN** those values are the initial settings and the controls panel starts expanded

#### Scenario: Defaults
- **WHEN** a block has none of these lines
- **THEN** it pins its own note, shows the controls button and uses the default settings

#### Scenario: Invalid layout header
- **WHEN** a header has `forces: center=2`
- **THEN** the block shows a header error naming `center` and its range
