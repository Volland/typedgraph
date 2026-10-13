import { App, PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian';
import type ObsigraphPlugin from './main';
import { DEFAULT_BASE_IRI, DEFAULT_MAX_PATH_DEPTH, DEFAULT_SCHEMA_FOLDER, type CodeMode, type EdgeStyle, type NodeStyle } from '@obsigraph/core';
import { parseEdgeStyles, parseTypeStyles } from './render/styles';

export interface ObsigraphSettings {
  /** Above this many nodes plus edges, graph results fall back to a table. */
  maxElements: number;
  /** Delay before visible blocks re-run after a vault change. */
  refreshDebounceMs: number;
  /** Per-type node styles keyed by type label (third in style precedence). */
  typeStyles: Record<string, NodeStyle>;
  /** Per-edge-type styles keyed by edge type (third in style precedence). */
  edgeStyles: Record<string, EdgeStyle>;
  /** Folder whose notes declare type schemas. */
  schemaFolder: string;
  /** Base IRI for schema declarations without a `uri`, used by SHACL export and import. */
  schemaBaseIri: string;
  /** Show the diagnostics count in the status bar. */
  showDiagnostics: boolean;
  /** Depth cap for unbounded variable-length relationships. */
  maxPathDepth: number;
  /** Engine for blocks without a `backend` option. */
  defaultBackend: 'builtin' | 'ladybug';
  /** Typed Graph sidecar base URL, e.g. http://127.0.0.1:8765. */
  sidecarUrl: string;
  sidecarToken: string;
  /** Read links in frontmatter properties as edges typed by the property name. */
  frontmatterEdges: boolean;
  /** Index `.adoc` files as notes beside Markdown. */
  asciidoc: boolean;
  /** Read plain links in prose as untyped `links_to` edges. */
  linkEdges: boolean;
  /** Derived code layer: off, annotated symbols only, or every symbol. */
  codeMode: CodeMode;
  /** Vault folder scanned for source files; empty means the whole vault. */
  codeRoot: string;
}

export const DEFAULT_SETTINGS: ObsigraphSettings = {
  maxElements: 500,
  refreshDebounceMs: 300,
  typeStyles: {},
  edgeStyles: {},
  schemaFolder: DEFAULT_SCHEMA_FOLDER,
  schemaBaseIri: DEFAULT_BASE_IRI,
  showDiagnostics: true,
  maxPathDepth: DEFAULT_MAX_PATH_DEPTH,
  defaultBackend: 'builtin',
  sidecarUrl: '',
  sidecarToken: '',
  frontmatterEdges: false,
  asciidoc: true,
  linkEdges: false,
  codeMode: 'off',
  codeRoot: '',
};

export class ObsigraphSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: ObsigraphPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Maximum graph elements')
      .setDesc('Graph results with more nodes plus edges than this are shown as a table instead.')
      .addText((t) =>
        t.setValue(String(this.plugin.settings.maxElements)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isInteger(n) && n > 0) {
            this.plugin.settings.maxElements = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName('Default query backend')
      .setDesc('Where blocks run unless they set a backend line. Built-in runs inside the app; the sidecar option runs full read queries on its graph database.')
      .addDropdown((d) =>
        d
          .addOptions({ builtin: 'Built-in', ladybug: 'Ladybug (sidecar)' })
          .setValue(this.plugin.settings.defaultBackend)
          .onChange(async (v) => {
            this.plugin.settings.defaultBackend = v === 'ladybug' ? 'ladybug' : 'builtin';
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Code in the graph')
      .setDesc('Show source code as derived nodes. Annotated adds symbols carrying @lat or @tg comments and what they point at; all adds every symbol. Files are only read, never changed.')
      .addDropdown((d) =>
        d
          .addOptions({ off: 'Off', annotated: 'Annotated symbols', all: 'All symbols' })
          .setValue(this.plugin.settings.codeMode)
          .onChange(async (v) => this.plugin.setCodeMode(v === 'all' ? 'all' : v === 'annotated' ? 'annotated' : 'off')),
      );

    new Setting(containerEl)
      .setName('Code folder')
      .setDesc('Vault folder to scan for source files. Leave empty to scan the whole vault.')
      .addText((t) =>
        t.setPlaceholder('src').setValue(this.plugin.settings.codeRoot).onChange(async (v) => {
          this.plugin.settings.codeRoot = v.trim();
          await this.plugin.saveSettings();
          await this.plugin.index.code.refresh();
        }),
      );

    new Setting(containerEl)
      .setName('Sidecar URL')
      .setDesc('Address and port of the sidecar, used by sidecar-backed queries.')
      .addText((t) =>
        t.setValue(this.plugin.settings.sidecarUrl).onChange(async (v) => {
          this.plugin.settings.sidecarUrl = v.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Sidecar token')
      .setDesc('Bearer token configured on the sidecar. Stored in this vault\'s plugin data.')
      .addText((t) => {
        t.inputEl.type = 'password';
        t.setValue(this.plugin.settings.sidecarToken).onChange(async (v) => {
          this.plugin.settings.sidecarToken = v.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Maximum path depth')
      .setDesc('Unbounded variable-length patterns such as [:knows*] stop at this many hops.')
      .addText((t) =>
        t.setValue(String(this.plugin.settings.maxPathDepth)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isInteger(n) && n > 0 && n <= 50) {
            this.plugin.settings.maxPathDepth = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName('Refresh delay (ms)')
      .setDesc('How long query blocks wait after a vault change before re-running.')
      .addText((t) =>
        t.setValue(String(this.plugin.settings.refreshDebounceMs)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isInteger(n) && n >= 0) {
            this.plugin.settings.refreshDebounceMs = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName('Schema folder')
      .setDesc('Each note directly in this folder declares types: the one named by its title under `schema:`, others under `schemas:`, and edge types under `edgeTypes:`.')
      .addText((t) =>
        t.setPlaceholder(DEFAULT_SCHEMA_FOLDER).setValue(this.plugin.settings.schemaFolder).onChange(async (v) => {
          this.plugin.settings.schemaFolder = v.trim() || DEFAULT_SCHEMA_FOLDER;
          this.plugin.index.invalidate();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Schema base IRI')
      .setDesc('Names types, properties and edge types without a `uri` when exporting to or importing from SHACL.')
      .addText((t) =>
        t.setPlaceholder(DEFAULT_BASE_IRI).setValue(this.plugin.settings.schemaBaseIri).onChange(async (v) => {
          this.plugin.settings.schemaBaseIri = v.trim() || DEFAULT_BASE_IRI;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Frontmatter links as edges')
      .setDesc('Read wikilinks in note properties as edges typed by the property name, so `requirement: "[[Login]]"` is the edge `requirement:: [[Login]]`. Tags, aliases, cssclasses and type are skipped. Re-indexes the vault when changed.')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.frontmatterEdges).onChange(async (v) => {
          this.plugin.settings.frontmatterEdges = v;
          await this.plugin.saveSettings();
          await this.plugin.index.reindex();
        }),
      );

    new Setting(containerEl)
      .setName('AsciiDoc notes')
      .setDesc('Index `.adoc` files as notes: properties from a leading `////` comment block and `:tg-*:` attributes, edges from `// @tg:` comments. The files are only read; this plugin does not open or edit them. Re-indexes the vault when changed.')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.asciidoc).onChange(async (v) => {
          this.plugin.settings.asciidoc = v;
          await this.plugin.saveSettings();
          await this.plugin.index.reindex();
        }),
      );

    new Setting(containerEl)
      .setName('Plain links as links_to edges')
      .setDesc('Read ordinary wikilinks and markdown links in note text as untyped `links_to` edges, the way OKF consumers do. Typed edge lines such as `knows:: [[Bob]]` are unaffected. Re-indexes the vault when changed.')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.linkEdges).onChange(async (v) => {
          this.plugin.settings.linkEdges = v;
          await this.plugin.saveSettings();
          await this.plugin.index.reindex();
        }),
      );

    new Setting(containerEl)
      .setName('Show diagnostics')
      .setDesc('Show the number of parse and schema issues in the status bar.')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showDiagnostics).onChange(async (v) => {
          this.plugin.settings.showDiagnostics = v;
          await this.plugin.saveSettings();
        }),
      );

    const styles = new Setting(containerEl)
      .setName('Type styles')
      .setDesc('JSON keyed by type label: color, shape, icon (Lucide name) and label (property shown instead of the title). Schema notes and block headers override these per attribute. Example: {"Person": {"color": "#59a14f", "shape": "round-rectangle", "icon": "user"}}.');
    const status = containerEl.createDiv({ cls: 'obsigraph-setting-status' });
    styles.addTextArea((t) => {
      t.inputEl.rows = 8;
      t.inputEl.addClass('obsigraph-styles-input');
      t.setValue(JSON.stringify(this.plugin.settings.typeStyles, null, 2)).onChange(async (v) => {
        const parsed = parseTypeStyles(v);
        if (typeof parsed === 'string') {
          status.setText(parsed);
          return;
        }
        status.setText('');
        this.plugin.settings.typeStyles = parsed;
        await this.plugin.saveSettings();
      });
    });

    const edgeStyles = new Setting(containerEl)
      .setName('Edge styles')
      .setDesc('JSON keyed by edge type: color and line (solid, dashed, dotted). Negative edges are dashed red unless set here. Example: {"knows": {"color": "orange"}}.');
    const edgeStatus = containerEl.createDiv({ cls: 'obsigraph-setting-status' });
    edgeStyles.addTextArea((t) => {
      t.inputEl.rows = 6;
      t.inputEl.addClass('obsigraph-styles-input');
      t.setValue(JSON.stringify(this.plugin.settings.edgeStyles, null, 2)).onChange(async (v) => {
        const parsed = parseEdgeStyles(v);
        if (typeof parsed === 'string') {
          edgeStatus.setText(parsed);
          return;
        }
        edgeStatus.setText('');
        this.plugin.settings.edgeStyles = parsed;
        await this.plugin.saveSettings();
      });
    });
  }

  /**
   * Declarative settings (Obsidian 1.13+), so every option appears in settings
   * search. Older versions keep using display().
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    const intIn = (min: number, max: number) => (v: number) =>
      Number.isInteger(v) && v >= min && v <= max ? undefined : `Enter a whole number from ${min} to ${max}.`;
    return [
      {
        type: 'group',
        heading: 'Queries',
        items: [
          {
            name: 'Default query backend',
            desc: 'Where blocks run unless they set a backend line. Built-in runs inside the app; the sidecar option runs full read queries on its graph database.',
            control: { type: 'dropdown', key: 'defaultBackend', options: { builtin: 'Built-in', ladybug: 'Ladybug (sidecar)' } },
          },
          { name: 'Maximum graph elements', desc: 'Graph results with more nodes plus edges than this are shown as a table instead.', control: { type: 'number', key: 'maxElements', min: 1, validate: intIn(1, 100000) } },
          { name: 'Maximum path depth', desc: 'Unbounded variable-length patterns stop at this many hops.', control: { type: 'number', key: 'maxPathDepth', min: 1, max: 50, validate: intIn(1, 50) } },
          { name: 'Refresh delay (ms)', desc: 'How long query blocks wait after a vault change before re-running.', control: { type: 'number', key: 'refreshDebounceMs', min: 0, validate: intIn(0, 60000) } },
        ],
      },
      {
        type: 'group',
        heading: 'Sidecar',
        items: [
          { name: 'Sidecar URL', desc: 'Address and port of the sidecar, used by sidecar-backed queries.', control: { type: 'text', key: 'sidecarUrl' } },
          {
            name: 'Sidecar token',
            desc: "Bearer token configured on the sidecar. Stored in this vault's plugin data.",
            render: (setting) => {
              setting.addText((t) => {
                t.inputEl.type = 'password';
                t.setValue(this.plugin.settings.sidecarToken).onChange((v) => this.setControlValue('sidecarToken', v.trim()));
              });
            },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Types and styles',
        items: [
          { name: 'Schema folder', desc: 'Each note directly in this folder declares the schema for the type named by its title.', control: { type: 'folder', key: 'schemaFolder' } },
          {
            name: 'Frontmatter links as edges',
            desc: 'Read wikilinks in note properties as edges typed by the property name, so `requirement: "[[Login]]"` is the edge `requirement:: [[Login]]`. Tags, aliases, cssclasses and type are skipped. Re-indexes the vault when changed.',
            control: { type: 'toggle', key: 'frontmatterEdges' },
          },
          {
            name: 'Plain links as links_to edges',
            desc: 'Read ordinary wikilinks and markdown links in note text as untyped `links_to` edges, the way OKF consumers do. Typed edge lines such as `knows:: [[Bob]]` are unaffected. Re-indexes the vault when changed.',
            control: { type: 'toggle', key: 'linkEdges' },
          },
          { name: 'Show diagnostics', desc: 'Show the number of parse and schema issues in the status bar.', control: { type: 'toggle', key: 'showDiagnostics' } },
          {
            name: 'Type styles',
            desc: 'JSON keyed by type label: color, shape, icon (Lucide name) and label (property shown instead of the title).',
            aliases: ['colors', 'shapes', 'icons'],
            render: (setting) => this.jsonEditor(setting, 'typeStyles', 8),
          },
          {
            name: 'Edge styles',
            desc: 'JSON keyed by edge type: color and line (solid, dashed, dotted). Negative edges are dashed red unless set here.',
            render: (setting) => this.jsonEditor(setting, 'edgeStyles', 6),
          },
        ],
      },
    ];
  }

  getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof ObsigraphSettings];
  }

  /** Persist through the plugin so caches refresh and open views restyle. */
  async setControlValue(key: string, value: unknown): Promise<void> {
    const settings = this.plugin.settings as unknown as Record<string, unknown>;
    settings[key] = key === 'schemaFolder' && typeof value === 'string' && !value.trim() ? DEFAULT_SCHEMA_FOLDER : value;
    if (key === 'schemaFolder') this.plugin.index.invalidate();
    await this.plugin.saveSettings();
    // The edge options are read when a note is indexed, so existing notes need another pass.
    if (key === 'frontmatterEdges' || key === 'linkEdges') await this.plugin.index.reindex();
  }

  /** JSON style editor with inline validation, shared by both style settings. */
  private jsonEditor(setting: Setting, key: 'typeStyles' | 'edgeStyles', rows: number): void {
    const status = setting.descEl.createDiv({ cls: 'obsigraph-setting-status' });
    setting.addTextArea((t) => {
      t.inputEl.rows = rows;
      t.inputEl.addClass('obsigraph-styles-input');
      t.setValue(JSON.stringify(this.plugin.settings[key], null, 2)).onChange(async (v) => {
        const parsed = key === 'typeStyles' ? parseTypeStyles(v) : parseEdgeStyles(v);
        if (typeof parsed === 'string') {
          status.setText(parsed);
          return;
        }
        status.setText('');
        await this.setControlValue(key, parsed);
      });
    });
  }
}
