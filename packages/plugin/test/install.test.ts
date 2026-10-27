import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without types
import { ASSETS, checkInstall, installUrls, manifestProblems } from '../../../scripts/check-plugin-install.mjs';
// @ts-expect-error plain ESM script without types
import { changelogSection } from '../../../scripts/release-notes.mjs';

const REPO_ROOT = join(__dirname, '../../..');
const PLUGIN = join(__dirname, '..');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const rootManifest = readJson(join(REPO_ROOT, 'manifest.json'));

/** Modules Obsidian provides at runtime; a bundle requiring anything else fails to load. */
const HOST_MODULES = /^(obsidian|electron|@codemirror\/.+|@lezer\/.+)$/;

/** Callable, constructible stand-in for any host API: every property and call yields another stub. */
function stub(): any {
  const fn = function () {};
  return new Proxy(fn, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : k === 'prototype' ? t.prototype : stub()),
    apply: () => stub(),
    construct: () => stub(),
  });
}

class Plugin {
  app: unknown;
  manifest: unknown;
  calls: string[] = [];
  private data: unknown = null;
  constructor(app: unknown, manifest: unknown) {
    this.app = app;
    this.manifest = manifest;
    // Every other Plugin API (addCommand, registerView, ...) is recorded and returns a stub.
    return new Proxy(this, { get: (t, k, r) => (k in t ? Reflect.get(t, k, r) : () => (t.calls.push(String(k)), stub())) });
  }
  async loadData() {
    return this.data;
  }
  async saveData(d: unknown) {
    this.data = d;
  }
}

/** Load main.js the way Obsidian does: CommonJS evaluated with the host's `require`. */
function loadBundle(code: string) {
  const required: string[] = [];
  const obsidian = new Proxy({ Plugin } as Record<string | symbol, unknown>, { get: (t, k) => (k in t ? t[k] : stub()) });
  const require = (id: string) => {
    required.push(id);
    if (!HOST_MODULES.test(id)) throw new Error(`Cannot find module '${id}'`);
    return id === 'obsidian' ? obsidian : stub();
  };
  const module = { exports: {} as any };
  // Browser and Obsidian globals the plugin may touch, shadowed with stubs since tests run in Node.
  const globals = ['window', 'document', 'activeWindow', 'activeDocument', 'createEl', 'createDiv', 'createSpan', 'createFragment', 'requestAnimationFrame'];
  new Function('module', 'exports', 'require', ...globals, code)(module, module.exports, require, ...globals.map(() => stub()));
  return { exported: module.exports.default ?? module.exports, required };
}

describe('Plugin install', () => {
  let dir: string;
  let pluginDir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'typed-graph-install-'));
    const out = join(dir, 'dist');
    const build = spawnSync(process.execPath, ['esbuild.config.mjs'], { cwd: PLUGIN, env: { ...process.env, OBSIGRAPH_OUT: out }, encoding: 'utf8' });
    if (build.status !== 0) throw new Error(`plugin build failed:\n${build.stderr}`);
    // Lay the release assets out as the installer does: <vault>/.obsidian/plugins/<id>/.
    pluginDir = join(dir, 'vault/.obsidian/plugins', rootManifest.id);
    mkdirSync(pluginDir, { recursive: true });
    for (const a of ASSETS) copyFileSync(join(out, a), join(pluginDir, a));
  }, 60_000);

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  // @tg: verifies:: [[tests/plugin-install#Plugin Install Tests#Manifest is installable]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/plugin-install#Plugin Install Tests#Manifest is installable]]
  // @tg: verifies:: [[openspec:plugin-install#Manifest is installable#Versions in step]]
  it('ships a manifest Obsidian accepts, the same everywhere it is read', () => {
    expect(manifestProblems(rootManifest)).toEqual([]);
    expect(readJson(join(PLUGIN, 'manifest.json'))).toEqual(rootManifest);
    expect(readJson(join(pluginDir, 'manifest.json'))).toEqual(rootManifest);
    expect(readJson(join(REPO_ROOT, 'versions.json'))[rootManifest.version]).toBe(rootManifest.minAppVersion);
  });

  // @tg: verifies:: [[tests/plugin-install#Plugin Install Tests#Release attaches the installer assets]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/plugin-install#Plugin Install Tests#Release attaches the installer assets]]
  // @tg: verifies:: [[openspec:plugin-install#Release attaches the installer assets#Release workflow assets]]
  it('attaches every asset the installer downloads to the release', () => {
    const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8');
    const create = workflow.slice(workflow.indexOf('gh release create'));
    for (const a of ASSETS) expect(create).toContain(`packages/plugin/dist/${a}`);
  });

  // @tg: verifies:: [[tests/plugin-install#Plugin Install Tests#Release notes from the changelog]] {since: "2026-10-27", level: unit}
  // @lat: [[tests/plugin-install#Plugin Install Tests#Release notes from the changelog]]
  // @tg: verifies:: [[openspec:plugin-install#Release notes from the changelog#Section for the tagged version]]
  it('takes the release notes from the version\'s changelog section', () => {
    const log = '# Changelog\n\nIntro.\n\n## 0.21.0 — 2026-10-27\n\nLead.\n\n### Added\n\n- New.\n\n## 0.20.0 — 2026-10-16\n\n- Old.\n';
    expect(changelogSection(log, '0.21.0')).toBe('Lead.\n\n### Added\n\n- New.');
    expect(changelogSection(log, '0.20.0')).toBe('- Old.');
    expect(changelogSection(log, '0.2.0')).toBeNull();
    expect(changelogSection(readFileSync(join(REPO_ROOT, 'CHANGELOG.md'), 'utf8'), rootManifest.version)).toBeTruthy();
    const create = readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8');
    expect(create).toContain('node scripts/release-notes.mjs "${GITHUB_REF_NAME}" > release-notes.md');
    expect(create.slice(create.indexOf('gh release create'))).toContain('--notes-file release-notes.md --generate-notes');
  });

  // @tg: verifies:: [[tests/plugin-install#Plugin Install Tests#Bundle loads in Obsidian]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/plugin-install#Plugin Install Tests#Bundle loads in Obsidian]]
  // @tg: verifies:: [[openspec:plugin-install#Bundle loads in Obsidian#Load and unload]]
  it('loads the installed main.js and runs onload and onunload', async () => {
    const { exported: PluginClass, required } = loadBundle(readFileSync(join(pluginDir, 'main.js'), 'utf8'));
    expect(required.filter((id) => !HOST_MODULES.test(id))).toEqual([]);
    expect(PluginClass.prototype).toBeInstanceOf(Plugin);
    const plugin = new PluginClass(stub(), rootManifest);
    await plugin.onload();
    expect(plugin.calls).toEqual(expect.arrayContaining(['addSettingTab', 'registerMarkdownCodeBlockProcessor', 'registerView', 'addCommand']));
    await plugin.onunload?.();
  });

  // @tg: verifies:: [[tests/plugin-install#Plugin Install Tests#Missing release is reported]] {since: "2026-10-08", level: unit}
  // @lat: [[tests/plugin-install#Plugin Install Tests#Missing release is reported]]
  // @tg: verifies:: [[openspec:plugin-install#Missing release is reported#Version without a release]], verifies:: [[openspec:plugin-install#Missing release is reported#Complete release]]
  it('reports a manifest on main whose release was never published', async () => {
    const served = (urls: Record<string, string>) => async (url: string) =>
      url in urls ? new Response(urls[url]) : new Response('Not Found', { status: 404 });
    const manifest = JSON.stringify(rootManifest);
    const urls = installUrls('o/r', 'main', rootManifest.version);

    const unreleased = await checkInstall({ repo: 'o/r', fetch: served({ [urls.manifest]: manifest }) });
    expect(unreleased.problems).toHaveLength(ASSETS.length);
    expect(unreleased.problems[0]).toContain(`push the tag ${rootManifest.version}`);

    const released = await checkInstall({
      repo: 'o/r',
      fetch: served({ [urls.manifest]: manifest, [urls.assets['main.js']]: 'x', [urls.assets['manifest.json']]: manifest, [urls.assets['styles.css']]: 'x' }),
    });
    expect(released).toEqual({ version: rootManifest.version, problems: [] });

    const stale = await checkInstall({
      repo: 'o/r',
      fetch: served({ [urls.manifest]: manifest, [urls.assets['main.js']]: 'x', [urls.assets['manifest.json']]: JSON.stringify({ ...rootManifest, version: '0.0.1' }), [urls.assets['styles.css']]: 'x' }),
    });
    expect(stale.problems).toEqual([`released manifest version "0.0.1" != "${rootManifest.version}"`]);
  });
});
