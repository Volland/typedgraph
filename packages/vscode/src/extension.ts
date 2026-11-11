import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as vscode from 'vscode';
import { panelRows, type ActiveFile, type BacklinkGroup, type BacklinkItem } from './backlinks';
import { buildHtml, exportFileName } from './export';
import { GraphSession, type GraphScope, type SessionView } from './graph-session';
import { buildGraphPdf, type Scene } from './pdf';
import { BAD_TITLE, luhmannParentOf, planWorkspaceNote, typesIn } from './new-note';
import { needsSetup, runSetup } from './setup';
import { WorkspaceIndex } from './workspace-index';

const SOURCE_GLOB = '**/*.{md,adoc,ts,tsx,js,jsx,py,rs,go,c,h,mts,cts,mjs,cjs}';

type Node = { kind: 'group'; group: BacklinkGroup } | { kind: 'item'; item: BacklinkItem; folder: string } | { kind: 'message'; text: string } | { kind: 'setup' };

/** Thin VS Code adapter: everything it shows is computed by the pure modules next to it. */
// @tg: implements:: [[openspec:vscode-extension#Empty and unsupported states]]
// @tg: implements:: [[openspec:vscode-extension#Graph webview]]
// @tg: implements:: [[openspec:vscode-extension#Index the workspace in process]]
// @tg: implements:: [[openspec:vscode-extension#No telemetry]]
// @tg: implements:: [[openspec:vscode-extension#Set up TypeGraph]]
// @tg: implements:: [[openspec:vscode-extension#Whole project graph]]
// @tg: implements:: [[openspec:graph-export#Export commands from the editor and the panel]]
// @tg: implements:: [[openspec:graph-export#Export the graph as standalone HTML]]
// @tg: implements:: [[openspec:vscode-extension#Typed backlinks for notes]]
export function activate(context: vscode.ExtensionContext): void {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const changed = new vscode.EventEmitter<void>();
  let index: WorkspaceIndex | null = null;
  let loading: Promise<void> | null = null;
  let panel: vscode.WebviewPanel | null = null;
  let lastView: SessionView | null = null;
  let readyWaiters: (() => void)[] = [];
  const fullGraphLimit = () => Math.max(10, vscode.workspace.getConfiguration('typegraph').get<number>('fullGraphLimit', 2000));
  const session = new GraphSession(() => index!.graph, fullGraphLimit);

  const settings = () => {
    const c = vscode.workspace.getConfiguration('typegraph');
    return { roots: c.get<string[]>('roots', ['.']), ignore: c.get<string[]>('ignore', ['node_modules']), asciidoc: c.get<boolean>('asciidoc', true) };
  };
  const schemaFolder = () => vscode.workspace.getConfiguration('typegraph').get<string>('schemaFolder', 'Types/');

  const activePath = (): string | null => {
    const doc = vscode.window.activeTextEditor?.document;
    if (!doc || !folder || doc.uri.scheme !== 'file') return null;
    const rel = vscode.workspace.asRelativePath(doc.uri, false);
    return rel.startsWith('..') ? null : rel.split('\\').join('/');
  };

  /** The active file, flagged when it lies outside the workspace folder. */
  const activeFile = (): ActiveFile | null => {
    const doc = vscode.window.activeTextEditor?.document;
    if (!doc || !folder || doc.uri.scheme !== 'file') return null;
    const path = activePath();
    return path ? { path, inWorkspace: true } : { path: doc.uri.fsPath, inWorkspace: false };
  };

  const refreshContext = () => {
    if (folder) void vscode.commands.executeCommand('setContext', 'typegraph.needsSetup', needsSetup(folder.uri.fsPath));
  };

  const ensureLoaded = (): Promise<void> => {
    if (!folder) return Promise.resolve();
    if (!loading) {
      index = new WorkspaceIndex({ workspace: folder.uri.fsPath, ...settings() });
      loading = index.load().then(() => changed.fire());
    }
    return loading;
  };

  const reload = () => {
    loading = null;
    index = null;
    void ensureLoaded();
  };

  let timer: NodeJS.Timeout | undefined;
  const touched = (uri: vscode.Uri, deleted: boolean) => {
    if (!folder || !index) return;
    const rel = vscode.workspace.asRelativePath(uri, false).split('\\').join('/');
    const task = deleted ? Promise.resolve(index.remove(rel)) : index.update(rel);
    void task.then(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        changed.fire();
        postGraph();
        refreshContext();
      }, 150);
    });
  };

  const tree: vscode.TreeDataProvider<Node> = {
    onDidChangeTreeData: changed.event,
    getTreeItem(n) {
      if (n.kind === 'message') return new vscode.TreeItem(n.text);
      if (n.kind === 'setup') {
        const t = new vscode.TreeItem('Set up TypeGraph');
        t.iconPath = new vscode.ThemeIcon('tools');
        t.command = { command: 'typegraph.setup', title: 'Set up TypeGraph' };
        return t;
      }
      if (n.kind === 'group') {
        const t = new vscode.TreeItem(`${n.group.title} (${n.group.items.length})`, vscode.TreeItemCollapsibleState.Expanded);
        t.iconPath = new vscode.ThemeIcon('symbol-event');
        return t;
      }
      const i = n.item;
      const t = new vscode.TreeItem(`${i.sign === -1 ? '− ' : ''}${i.label}`);
      const props = Object.entries(i.props).map(([k, v]) => `${k}: ${String(v)}`).join(', ');
      t.description = [i.target, props].filter(Boolean).join('  ');
      t.tooltip = `${i.path}:${i.line}`;
      t.iconPath = new vscode.ThemeIcon(i.sign === -1 ? 'circle-slash' : i.sign === null ? 'file-code' : 'file');
      t.command = { command: 'vscode.open', title: 'Open', arguments: [vscode.Uri.joinPath(vscode.Uri.file(n.folder), i.path), { selection: new vscode.Range(Math.max(0, i.line - 1), 0, Math.max(0, i.line - 1), 0) }] };
      return t;
    },
    async getChildren(n) {
      if (!folder) return [{ kind: 'message', text: 'Open a folder to see backlinks.' }];
      await ensureLoaded();
      if (n?.kind === 'group') return n.group.items.map((item) => ({ kind: 'item', item, folder: folder.uri.fsPath }));
      if (n) return [];
      if (!index) return [];
      return panelRows(index, activeFile(), needsSetup(folder.uri.fsPath));
    },
  };

  const postGraph = () => {
    if (!panel || !index) return;
    lastView = session.view(activePath());
    void panel.webview.postMessage({ type: 'elements', ...lastView });
  };

  /** Open the graph panel, or reveal it; a given scope replaces the panel's current one. */
  const openGraph = async (scope?: GraphScope) => {
    if (!folder) return void vscode.window.showInformationMessage('Open a folder to see the graph.');
    await ensureLoaded();
    if (scope) session.setScope(scope);
    if (panel) {
      panel.reveal();
      return postGraph();
    }
    // The new panel takes focus, so no text editor is active when it reports ready; let the session see the file now.
    session.view(activePath());
    const dist = vscode.Uri.joinPath(context.extensionUri, 'dist');
    panel = vscode.window.createWebviewPanel('typegraph.graph', 'TypeGraph', vscode.ViewColumn.Beside, { enableScripts: true, localResourceRoots: [dist], retainContextWhenHidden: true });
    const script = panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.js'));
    const nonce = Math.random().toString(36).slice(2);
    panel.webview.html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"><style>#bar{display:flex;align-items:center;gap:6px;height:34px;padding:0 8px;box-sizing:border-box;font:12px var(--vscode-font-family);color:var(--vscode-foreground)}#bar button{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:0;padding:3px 9px;border-radius:2px;cursor:pointer}#bar button.on{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}#bar .spacer{flex:1}#bar .note{margin-left:8px;color:var(--vscode-descriptionForeground)}</style></head><body style="margin:0"><div id="bar"></div><div id="graph"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
    panel.webview.onDidReceiveMessage((m: { type: string; id?: string; path?: string; scope?: GraphScope; format?: 'html' | 'pdf'; scene?: Scene; positions?: Record<string, { x: number; y: number }>; theme?: { text: string; muted: string; background: string } }) => {
      if (m.type === 'ready') {
        postGraph();
        const waiting = readyWaiters;
        readyWaiters = [];
        for (const w of waiting) w();
      } else if (m.type === 'scope' && (m.scope === 'file' || m.scope === 'project')) {
        session.setScope(m.scope);
        postGraph();
      } else if (m.type === 'export' && m.format) void writeExport(m.format, m);
      else if (m.type === 'expand' && m.id) {
        session.expand(m.id);
        postGraph();
      } else if (m.type === 'open' && m.path) void vscode.commands.executeCommand('vscode.open', vscode.Uri.joinPath(folder.uri, m.path));
    });
    panel.onDidDispose(() => (panel = null));
  };

  /** Ask where to save, then write only that file. */
  const save = async (format: 'html' | 'pdf', content: string | Uint8Array) => {
    if (!folder) return;
    const name = exportFileName(lastView?.scope ?? 'file', format, new Date());
    const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.joinPath(folder.uri, name), filters: format === 'html' ? { 'HTML page': ['html'] } : { PDF: ['pdf'] }, title: `Export graph as ${format.toUpperCase()}` });
    if (!target) return;
    await vscode.workspace.fs.writeFile(target, typeof content === 'string' ? Buffer.from(content, 'utf8') : content);
    void vscode.window.showInformationMessage(`Graph exported to ${vscode.workspace.asRelativePath(target)}.`);
  };

  /** Build the file from what the webview captured and the view the host last sent. */
  const writeExport = async (format: 'html' | 'pdf', m: { scene?: Scene; positions?: Record<string, { x: number; y: number }>; theme?: { text: string; muted: string; background: string } }) => {
    const view = lastView;
    if (!view) return;
    try {
      const meta = { scope: view.scope, omitted: view.omitted, limit: view.limit, date: new Date() };
      if (format === 'html') {
        const viewerScript = readFileSync(vscode.Uri.joinPath(context.extensionUri, 'dist', 'viewer.js').fsPath, 'utf8');
        await save('html', buildHtml({ ...meta, elements: view.elements, positions: m.positions ?? {}, theme: m.theme ?? { text: '#1f1f1f', muted: '#6b6b6b', background: '#ffffff' }, viewerScript }));
      } else if (m.scene) await save('pdf', buildGraphPdf(m.scene, meta));
    } catch (e) {
      void vscode.window.showErrorMessage(`Export failed: ${(e as Error).message}`);
    }
  };

  /** Run an export from a command or title-bar button: open the panel if needed, wait for its first draw, then capture. */
  const exportGraph = async (format: 'html' | 'pdf') => {
    if (!folder) return void vscode.window.showInformationMessage('Open a folder to export the graph.');
    const wasOpen = !!panel;
    await openGraph();
    if (!panel) return;
    if (!wasOpen) {
      const ready = await Promise.race([new Promise<boolean>((r) => readyWaiters.push(() => r(true))), new Promise<boolean>((r) => setTimeout(() => r(false), 10000))]);
      if (!ready) return void vscode.window.showErrorMessage('The graph panel did not load; nothing was exported.');
    }
    void panel.webview.postMessage({ type: 'capture', format });
  };

  const setup = async () => {
    if (!folder) return;
    await runSetup({
      hasGlobalTg: () => spawnSync('tg', ['--version'], { cwd: folder.uri.fsPath, shell: process.platform === 'win32' }).status === 0,
      confirm: async (files, command) => {
        const pick = await vscode.window.showInformationMessage(`Run "${command}" in a terminal?`, { modal: true, detail: `With the defaults (Claude Code, everything), these files will be created or changed:\n\n${files.join('\n')}\n\nThe terminal lets you pick other coding agents and parts first. tg init never overwrites other content in them.` }, 'Run');
        return pick === 'Run';
      },
      runInTerminal: (command) => {
        const t = vscode.window.createTerminal({ name: 'TypeGraph setup', cwd: folder.uri.fsPath });
        t.show();
        t.sendText(command);
      },
    });
  };

  /** Create a note from a type, refusing to overwrite, and open it. */
  const createNote = async (opts: { type: string; title: string; folder: string; parent?: Parameters<typeof planWorkspaceNote>[2]['parent']; luhmann?: boolean }) => {
    if (!folder || !index) return;
    try {
      const plan = await planWorkspaceNote(index, folder.uri.fsPath, { schemaFolder: schemaFolder(), ...opts });
      const uri = vscode.Uri.joinPath(folder.uri, ...plan.path.split('/'));
      const exists = await vscode.workspace.fs.stat(uri).then(() => true, () => false);
      if (exists) return void vscode.window.showWarningMessage(`${plan.path} already exists; nothing was changed.`);
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
      await vscode.workspace.fs.writeFile(uri, Buffer.from(plan.content, 'utf8'));
      await vscode.window.showTextDocument(uri);
    } catch (e) {
      void vscode.window.showErrorMessage((e as Error).message);
    }
  };

  const askTitle = (prompt: string) =>
    vscode.window.showInputBox({ prompt, validateInput: (v) => (v.trim() && !BAD_TITLE.test(v) ? null : 'Enter a title without \\ / : * ? " < > | # ^ [ ]') });

  /** The folder to create in: the one given by the Explorer, else the active note's folder. */
  const targetFolder = async (uri?: vscode.Uri): Promise<string> => {
    if (!folder) return '';
    let base: vscode.Uri | null = uri ?? vscode.window.activeTextEditor?.document.uri ?? null;
    if (base && uri && !(await vscode.workspace.fs.stat(uri).then((s) => s.type === vscode.FileType.Directory, () => false))) base = vscode.Uri.joinPath(uri, '..');
    else if (base && !uri) base = vscode.Uri.joinPath(base, '..');
    if (!base || base.scheme !== 'file') return '';
    const rel = vscode.workspace.asRelativePath(base, false).split('\\').join('/');
    return rel.startsWith('..') || rel === base.fsPath ? '' : rel;
  };

  const newNote = async (uri?: vscode.Uri) => {
    if (!folder) return;
    await ensureLoaded();
    const types = typesIn(index!, schemaFolder());
    if (types.length === 0) return void vscode.window.showInformationMessage(`No schema notes found in ${schemaFolder()}. Set typegraph.schemaFolder or add types.`);
    const pick = await vscode.window.showQuickPick(
      types.map((t) => ({ label: t.type, description: t.ids.map((r) => `${r.kind}${r.auto ? '' : ' on request'}`).join(', '), detail: t.description ?? t.properties.map((p) => p.name).join(', '), type: t.type })),
      { placeHolder: 'Choose a type', matchOnDetail: true },
    );
    if (!pick) return;
    const title = await askTitle(`New ${pick.type}`);
    if (title) await createNote({ type: pick.type, title: title.trim(), folder: await targetFolder(uri) });
  };

  const newLuhmann = async (placement: 'child' | 'sibling') => {
    const path = activePath();
    if (!folder || !path) return void vscode.window.showInformationMessage('Open a note with a Luhmann id first.');
    await ensureLoaded();
    const parent = luhmannParentOf(index!, schemaFolder(), path);
    if (!parent) return void vscode.window.showInformationMessage('This note has no Luhmann id. Its type needs `id: {kind: luhmann, property: ...}` and a value for it.');
    const title = await askTitle(`New ${placement} of ${parent.title} (${parent.id})`);
    if (title) await createNote({ type: parent.type, title: title.trim(), folder: await targetFolder(), parent: { ...parent, placement } });
  };

  const watcher = vscode.workspace.createFileSystemWatcher(SOURCE_GLOB);
  context.subscriptions.push(
    vscode.window.createTreeView('typegraph.backlinks', { treeDataProvider: tree }),
    watcher,
    watcher.onDidChange((u) => touched(u, false)),
    watcher.onDidCreate((u) => touched(u, false)),
    watcher.onDidDelete((u) => touched(u, true)),
    vscode.window.onDidChangeActiveTextEditor(() => {
      changed.fire();
      postGraph();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('typegraph') && reload()),
    vscode.commands.registerCommand('typegraph.openGraph', () => openGraph('file')),
    vscode.commands.registerCommand('typegraph.openFullGraph', () => openGraph('project')),
    vscode.commands.registerCommand('typegraph.exportGraphHtml', () => exportGraph('html')),
    vscode.commands.registerCommand('typegraph.exportGraphPdf', () => exportGraph('pdf')),
    vscode.commands.registerCommand('typegraph.setup', setup),
    vscode.commands.registerCommand('typegraph.refresh', reload),
    vscode.commands.registerCommand('typegraph.newNote', newNote),
    vscode.commands.registerCommand('typegraph.newChildNote', () => newLuhmann('child')),
    vscode.commands.registerCommand('typegraph.newSiblingNote', () => newLuhmann('sibling')),
    changed,
  );
  refreshContext();
}

export function deactivate(): void {}
