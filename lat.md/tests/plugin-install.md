---
type: Scenario
lat:
  require-code-mention: true
---
# Plugin Install Tests

Test specifications that the Obsidian plugin installs and loads the way the community installer delivers it. See [[publishing#Plugin releases]].

## Manifest is installable

The root `manifest.json` passes the directory's rules, matches `packages/plugin/manifest.json` and the built copy, and `versions.json` maps its version to its `minAppVersion`.

## Release attaches the installer assets

The release workflow's `gh release create` attaches `main.js`, `manifest.json` and `styles.css` from the plugin build, the three files Obsidian downloads.

## Release notes from the changelog

The release body is the tagged version's section of `CHANGELOG.md`, cut at the next version heading; a version without a section yields no notes, and the release step passes them with `--notes-file` before GitHub's generated list.

## Bundle loads in Obsidian

`main.js`, installed in a temporary vault's `.obsidian/plugins/typed-graph/` and evaluated as CommonJS with only host modules, exports a `Plugin` subclass.

Its `onload` registers views, commands and settings against stubbed Obsidian APIs, then `onunload` runs.

## Missing release is reported

The installer emulation in `scripts/check-plugin-install.mjs` reports every asset missing when `main` announces a version with no release, passes when the release is complete, and flags a released manifest with another version.
