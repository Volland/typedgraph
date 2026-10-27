# plugin-install Specification

## Purpose
Keeps the Obsidian plugin installable the way the community installer delivers it: a valid root manifest, a release carrying the three installer assets for the manifest's version, a bundle that loads in Obsidian, and a scheduled check that reports a missing release.

## Requirements

### Requirement: Manifest is installable
The root `manifest.json` SHALL pass the community directory's rules (id `typed-graph`, a valid version and `minAppVersion`), SHALL equal `packages/plugin/manifest.json` and the built copy, and `versions.json` SHALL map its version to its `minAppVersion`.

#### Scenario: Versions in step
- **WHEN** the plugin version is bumped to 0.9.1
- **THEN** the root manifest, the plugin package manifest and the built manifest all say 0.9.1 and `versions.json` maps `0.9.1` to the manifest's `minAppVersion`

### Requirement: Release attaches the installer assets
A pushed tag equal to the manifest version SHALL produce a release that attaches `main.js`, `manifest.json` and `styles.css` from the plugin build, with build provenance attested for `main.js` and `styles.css`.

#### Scenario: Release workflow assets
- **WHEN** the release workflow's release step is inspected
- **THEN** it attaches `main.js`, `manifest.json` and `styles.css` from the plugin build

### Requirement: Release notes from the changelog
The release SHALL take its body from the version's section of `CHANGELOG.md` (the text under `## <version>` up to the next `## ` heading), followed by GitHub's generated pull request list; when the changelog has no section for the version the release SHALL still be created, with generated notes only and a workflow warning.

#### Scenario: Section for the tagged version
- **WHEN** the changelog has `## 0.21.0 — 2026-10-27` followed by `## 0.20.0 — 2026-10-16`
- **THEN** the notes for `0.21.0` are the text between the two headings, and a version with no heading yields none

### Requirement: Bundle loads in Obsidian
The built `main.js`, installed in a vault's `.obsidian/plugins/typed-graph/` and evaluated as CommonJS with only Obsidian host modules available, SHALL export a `Plugin` subclass whose `onload` registers its views, commands and settings and whose `onunload` runs without error.

#### Scenario: Load and unload
- **WHEN** the bundle is loaded against stubbed Obsidian APIs and the plugin is loaded and unloaded
- **THEN** views, commands and the settings tab are registered and no error is thrown

### Requirement: Missing release is reported
The install check SHALL repeat the installer's downloads for the version on `main`, SHALL report every missing asset when that version has no release, SHALL flag a released manifest that names another version, and SHALL pass when the release is complete; it SHALL run as the last release step, after CI on `main` and every six hours.

#### Scenario: Version without a release
- **WHEN** `main` announces version 0.9.2 and no release is tagged `0.9.2`
- **THEN** the check reports `main.js`, `manifest.json` and `styles.css` as missing and fails

#### Scenario: Complete release
- **WHEN** the release for the manifest version has all three assets and its manifest has the same version
- **THEN** the check passes
