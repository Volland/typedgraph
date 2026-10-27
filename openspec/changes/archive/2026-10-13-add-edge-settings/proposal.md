## Why

The graph options `linkEdges` and `frontmatterEdges` exist in core, but the plugin had no setting for `linkEdges` and users could not turn either on without editing code.

## What Changes

- A "Plain links as links_to edges" toggle in the plugin settings, next to "Frontmatter links as edges". Both are off by default and re-index the vault when changed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `graph-model`: plugin settings for the edge options.

## Impact

- `packages/plugin`: `linkEdges` setting, settings tab, `VaultIndex` option getter.
- `lat.md/graph-model`, `lat.md/tests/edge-settings`, tests.
