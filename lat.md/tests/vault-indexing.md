---
type: Scenario
lat:
  require-code-mention: true
---
# Vault Indexing Tests

Test specifications for which notes the Obsidian plugin indexes and how it stays responsive on a large vault, described in [[graph-model#Indexed folders]] and [[graph-model#Indexing a large vault]].

## Folder lists

A folder setting accepts one folder per line or comma separated, and drops leading `./`, slashes, blanks and duplicates.

## Include and exclude

With no folders set, the whole vault is indexed. An include list keeps only notes under its folders. An excluded folder wins over the include list, and the schema folder is always kept.

## Obsidian excluded files

Obsidian's "Excluded files" apply only with the option on. They are read through the metadata cache's `isUserIgnored`, or from `userIgnoreFilters` (prefixes and `/regex/` entries) when that is missing.

## Excluded notes become stubs

An excluded note is not a node, a link to it ends at a stub, and the vault's diagnostics equal those of the same vault without that note.

## Re-index applies a changed scope

Narrowing the indexed folders and re-indexing removes notes that left the scope and turns links to them into stubs; widening it again restores them.

## Vault events respect the scope

A metadata change in an excluded folder is ignored, and a note renamed into an excluded folder leaves the graph.

## Indexing yields by time

When each note's indexing passes the slice budget, the index yields to the UI and reports progress after every note, and once more at the end.

## Diagnostics counted once changes settle

A burst of changes updates the node count at once but counts diagnostics once, after the delay following the last change.

## Diagnostics count off

With the diagnostics count hidden, the status bar never counts diagnostics.
