## MODIFIED Requirements

### Requirement: Incremental updates
The system SHALL update the graph when a note is created, modified, renamed or deleted, touching only that note's contributions and the affected stubs. A created note SHALL re-resolve only the links whose stubs carry its file name, so building a graph note by note takes time linear in the number of notes and edges.

#### Scenario: Note edited
- **WHEN** a note's edge line is changed
- **THEN** the old edge disappears and the new edge appears without rebuilding the whole graph

#### Scenario: Note deleted
- **WHEN** a note that other notes link to is deleted
- **THEN** edges pointing to it now point to a stub node

#### Scenario: New note re-resolves only its name
- **WHEN** notes link to the missing notes `Alpha` and `Beta`, and `Beta.md` is created
- **THEN** only the notes linking to `Beta` are re-resolved, and their edges now point to `Beta.md`

## ADDED Requirements

### Requirement: Indexed folders
The Obsidian plugin SHALL offer a list of folders to index (empty means the whole vault), a list of folders to exclude, and an option to also leave out Obsidian's "Excluded files", off by default. A note outside the indexed folders is not a node; a link to it becomes a stub, as for a missing note, and adds no diagnostic. Notes in the schema folder SHALL always be indexed. Changing any of these settings SHALL re-index the vault.

#### Scenario: Excluded folder
- **WHEN** `Scratch` is an excluded folder and `Scratch/Draft.md` exists
- **THEN** the graph has no node `Scratch/Draft.md` and a link `[[Draft]]` from an indexed note ends at a stub

#### Scenario: Include list
- **WHEN** the indexed folders are `Records` only
- **THEN** notes outside `Records` are not nodes, while notes in the schema folder still are

#### Scenario: Obsidian excluded files
- **WHEN** the option is on and Obsidian's "Excluded files" lists `Archive/`
- **THEN** notes under `Archive/` are not indexed

#### Scenario: Setting changed
- **WHEN** a folder is added to the excluded folders
- **THEN** the vault is re-indexed and that folder's notes leave the graph

### Requirement: Responsive indexing
The Obsidian plugin SHALL index notes at startup and on re-index in time slices, yielding to the UI after each slice of about 12 ms of indexing work, and SHALL report progress in the status bar.

#### Scenario: Yields by time
- **WHEN** indexing a slice of notes takes longer than the slice budget
- **THEN** the index yields to the UI before indexing the next note

### Requirement: Deferred diagnostics count
The Obsidian plugin's status bar SHALL show node and edge counts at once after a change, and SHALL recount diagnostics only once changes have paused for a short delay, not after every change.

#### Scenario: Burst of changes
- **WHEN** several notes change in quick succession
- **THEN** whole-vault diagnostics are computed once, after the last change settles
