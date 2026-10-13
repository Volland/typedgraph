import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({ App: class App {}, PluginSettingTab: class PluginSettingTab {}, Setting: class Setting {} }));

const { ObsigraphSettingTab, DEFAULT_SETTINGS } = await import('../src/settings');

function tab() {
  const reindex = vi.fn(async () => {});
  const plugin = { settings: { ...DEFAULT_SETTINGS }, saveSettings: vi.fn(async () => {}), index: { reindex, invalidate: vi.fn() } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { t: new ObsigraphSettingTab({} as any, plugin as any), plugin, reindex };
}

describe('settings tab', () => {
  // @lat: [[tests/edge-settings#Toggles in the settings tab]]
  it('offers both edge options as toggles in the declarative settings, off by default', () => {
    const { t, plugin } = tab();
    const items = t.getSettingDefinitions().flatMap((g) => ('items' in g ? g.items : [g]));
    const toggle = (name: string) => items.find((i) => i !== undefined && 'name' in i && i.name === name);
    expect(toggle('Frontmatter links as edges')).toMatchObject({ control: { type: 'toggle', key: 'frontmatterEdges' } });
    expect(toggle('Plain links as links_to edges')).toMatchObject({ control: { type: 'toggle', key: 'linkEdges' } });
    expect(plugin.settings.frontmatterEdges).toBe(false);
    expect(plugin.settings.linkEdges).toBe(false);
  });

  // @lat: [[tests/edge-settings#Changing a toggle re-indexes]]
  it('re-indexes the vault when an edge option changes, and only then', async () => {
    const { t, plugin, reindex } = tab();
    await t.setControlValue('linkEdges', true);
    expect(plugin.settings.linkEdges).toBe(true);
    await t.setControlValue('frontmatterEdges', true);
    expect(reindex).toHaveBeenCalledTimes(2);
    await t.setControlValue('showDiagnostics', false);
    expect(reindex).toHaveBeenCalledTimes(2);
  });
});
