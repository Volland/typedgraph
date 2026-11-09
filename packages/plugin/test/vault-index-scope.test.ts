import { pathResolver } from '@obsigraph/core';
import type { App } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { noteScope } from '../src/note-scope';
import { VaultIndex } from '../src/vault-index';

vi.mock('obsidian', () => ({ TFile: class TFile {} }));
const { TFile } = await import('obsidian');

type Handler = (...args: unknown[]) => unknown;

/** An in-memory Obsidian app whose metadata cache resolves links over every file, indexed or not. */
function app(files: Record<string, string>) {
  const mk = (path: string) => Object.assign(new TFile(), { path, extension: path.slice(path.lastIndexOf('.') + 1) });
  const handlers = new Map<string, Handler>();
  const state = { files: { ...files } };
  const list = () => Object.keys(state.files).map(mk);
  const resolve = pathResolver(() => Object.keys(state.files));
  const vault = {
    getMarkdownFiles: () => list().filter((f) => f.extension === 'md'),
    getFiles: () => list(),
    cachedRead: async (f: { path: string }) => state.files[f.path] ?? '',
    on: (name: string, fn: Handler) => (handlers.set(name, fn), {}),
  };
  const metadataCache = {
    getFirstLinkpathDest: (link: string, source: string) => {
      const hit = resolve(/\.[a-z]+$/i.test(link) ? link : `${link}.md`, source);
      return hit ? mk(hit) : null;
    },
    getFileCache: () => ({ frontmatter: undefined }),
    on: (name: string, fn: Handler) => (handlers.set(`mc:${name}`, fn), {}),
  };
  return { app: { vault, metadataCache } as unknown as App, state, handlers, mk };
}

const FILES = {
  'Notes/A.md': 'knows:: [[Draft]]\nknows:: [[B]]\n',
  'Notes/B.md': '',
  'Scratch/Draft.md': 'knows:: [[B]]\nbroken:: [[\n',
  'Types/Person.md': '---\nschema: {}\n---\n',
};

function indexOf(a: App, scope: { include?: string; exclude?: string }) {
  const s = { include: '', exclude: '', ...scope };
  const index = new VaultIndex(a, () => 0, () => 'Types/', () => ({ nodes: {}, edges: {} }), () => true, undefined, undefined, undefined, undefined, undefined, undefined, undefined, () =>
    noteScope({ include: s.include, exclude: s.exclude, obsidianExcluded: false, schemaFolder: 'Types/' }),
  );
  return { index, s };
}

const real = (index: VaultIndex) => [...index.graph.nodes()].filter((n) => !n.stub).map((n) => n.id).sort();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('indexed folders in the vault index', () => {
  // @tg: verifies:: [[openspec:graph-model#Indexed folders#Excluded folder]] {since: "0.25.0", level: integration}
  // @lat: [[tests/vault-indexing#Excluded notes become stubs]]
  it('leaves an excluded folder out, ends links into it at stubs and adds no diagnostics', async () => {
    vi.stubGlobal('window', globalThis);
    const { index } = indexOf(app(FILES).app, { exclude: 'Scratch' });
    await index.build();
    expect(real(index)).toEqual(['Notes/A.md', 'Notes/B.md', 'Types/Person.md']);
    expect(index.graph.outEdges('Notes/A.md').map((e) => e.target).sort()).toEqual(['Draft', 'Notes/B.md']);
    expect(index.graph.node('Draft')?.stub).toBe(true);

    const { 'Scratch/Draft.md': _drop, ...without } = FILES;
    const { index: plain } = indexOf(app(without).app, {});
    await plain.build();
    expect(index.diagnostics()).toEqual(plain.diagnostics());
    index.destroy();
    plain.destroy();
  });

  // @tg: verifies:: [[openspec:graph-model#Indexed folders#Include list]] {since: "0.25.0", level: integration}
  // @tg: verifies:: [[openspec:graph-model#Indexed folders#Setting changed]] {since: "0.25.0", level: integration}
  // @lat: [[tests/vault-indexing#Re-index applies a changed scope]]
  it('narrows to the indexed folders, keeps the schema folder and applies a changed scope on re-index', async () => {
    vi.stubGlobal('window', globalThis);
    const { index, s } = indexOf(app(FILES).app, {});
    await index.build();
    expect(real(index)).toEqual(['Notes/A.md', 'Notes/B.md', 'Scratch/Draft.md', 'Types/Person.md']);
    expect(index.graph.outEdges('Notes/A.md').map((e) => e.target)).toContain('Scratch/Draft.md');

    s.include = 'Notes';
    await index.reindex();
    expect(real(index)).toEqual(['Notes/A.md', 'Notes/B.md', 'Types/Person.md']);
    expect(index.graph.outEdges('Notes/A.md').map((e) => e.target)).toContain('Draft');

    s.include = '';
    await index.reindex();
    expect(index.graph.outEdges('Notes/A.md').map((e) => e.target)).toContain('Scratch/Draft.md');
    index.destroy();
  });

  // @lat: [[tests/vault-indexing#Vault events respect the scope]]
  it('ignores edits in an excluded folder and drops a note moved into one', async () => {
    vi.stubGlobal('window', globalThis);
    const { app: a, handlers, mk } = app(FILES);
    const { index } = indexOf(a, { exclude: 'Scratch' });
    await index.build();
    index.watch();
    handlers.get('mc:changed')!(mk('Scratch/Draft.md'), 'knows:: [[A]]', {});
    expect(index.graph.node('Scratch/Draft.md')).toBeUndefined();
    await handlers.get('rename')!(mk('Scratch/B.md'), 'Notes/B.md');
    expect(real(index)).toEqual(['Notes/A.md', 'Types/Person.md']);
    index.destroy();
  });

  // @tg: verifies:: [[openspec:graph-model#Responsive indexing#Yields by time]] {since: "0.25.0", level: integration}
  // @lat: [[tests/vault-indexing#Indexing yields by time]]
  it('yields to the UI and reports progress whenever a slice runs past its time budget', async () => {
    vi.stubGlobal('window', globalThis);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (now += 20));
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    const progress: number[] = [];
    const { index } = indexOf(app(FILES).app, {});
    await index.build((done) => progress.push(done));
    expect(timeout.mock.calls.filter(([, ms]) => ms === 0)).toHaveLength(4);
    expect(progress).toEqual([1, 2, 3, 4, 4]);
    index.destroy();
  });
});
