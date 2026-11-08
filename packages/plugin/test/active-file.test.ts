import { BuiltinEngine, Graph } from '@obsigraph/core';
import { describe, expect, it, vi } from 'vitest';
import type { GraphElements } from '../src/render/elements';

// Only the Obsidian shell and drawing surface are stubbed; queries use the real engine.
class ElementStub {
  value = '';
  empty() {}
  addClass() {}
  toggleClass() {}
  addEventListener() {}
  setText() {}
  createDiv() { return new ElementStub(); }
  createEl() { return new ElementStub(); }
}

vi.mock('obsidian', () => ({
  ItemView: class {
    app: unknown;
    contentEl = new ElementStub();
    constructor(leaf: { app: unknown }) { this.app = leaf.app; }
    register() {}
    registerEvent() {}
  },
  AbstractInputSuggest: class {},
  TFile: class {},
  Notice: class {},
}));

const { GraphView } = await import('../src/view/graph-view');

async function openView(activeFile: string | null) {
  const graph = new Graph((link) => `${link}.md`);
  for (const [path, text] of Object.entries({
    'A.md': 'KNOWS:: [[B]]',
    'B.md': 'KNOWS:: [[C]]',
    'C.md': '',
    'D.md': 'KNOWS:: [[E]]',
    'E.md': '',
  })) graph.upsertNote({ path, text, frontmatter: {} });

  let fileOpen!: (file: { path: string; extension: string } | null) => void;
  const app = {
    workspace: {
      getActiveFile: () => activeFile ? { path: activeFile } : null,
      on: (_event: string, callback: typeof fileOpen) => { fileOpen = callback; },
    },
    loadLocalStorage: () => null,
  };
  const engine = new BuiltinEngine(graph);
  const run = vi.spyOn(engine, 'run');
  const plugin = {
    settings: { codeMode: 'off', maxElements: 100 },
    index: { ready: true, graph, engine, onChange: vi.fn() },
    onStylesChanged: vi.fn(),
    makeStyler: vi.fn(),
  };
  // Access private view hooks to isolate rendering from the query and event lifecycle.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const view = new GraphView({ app } as any, plugin as any) as any;
  const setElements = vi.fn<(elements: GraphElements) => void>();
  vi.spyOn(view, 'initResizer').mockImplementation(() => {});
  vi.spyOn(view, 'ensureRenderer').mockReturnValue({ setElements, setStyler: vi.fn() });
  vi.spyOn(view, 'keepSelection').mockImplementation(() => {});
  await view.onOpen();
  view.input.value = 'MATCH p = (n {path: $activeFile})-[:KNOWS*1..2]->(y) RETURN p';
  view.submit();
  const shown = () => setElements.mock.lastCall![0];
  return { view, run, shown, fileOpen };
}

describe('graph view $activeFile', () => {
  // @tg: verifies:: [[tests/graph-view#Active file query parameter]] {level: unit}
  // @tg: verifies:: [[openspec:graph-view#Active file query parameter#Paths anchored to the active note]] {level: unit}
  it('anchors paths to the active note without unrelated nodes', async () => {
    const { run, shown } = await openView('A.md');
    expect(run.mock.lastCall?.[1]).toEqual({ activeFile: 'A.md' });
    expect(shown().nodes.map((n) => n.id).sort()).toEqual(['A.md', 'B.md', 'C.md']);
    expect(shown().edges).toHaveLength(2);
  });

  // @tg: verifies:: [[openspec:graph-view#Active file query parameter#Query follows a different Markdown note]] {level: unit}
  it('follows note changes while the query stays open', async () => {
    const { run, shown, fileOpen } = await openView('A.md');
    fileOpen({ path: 'B.md', extension: 'md' });
    expect(run.mock.lastCall?.[1]).toEqual({ activeFile: 'B.md' });
    expect(shown().nodes.map((n) => n.id).sort()).toEqual(['B.md', 'C.md']);
    expect(shown().edges).toHaveLength(1);
  });

  // @tg: verifies:: [[openspec:graph-view#Active file query parameter#Retain the last Markdown note]] {level: unit}
  it('retains the last Markdown note when focus moves away', async () => {
    const { view, run, fileOpen } = await openView('B.md');
    // Moving focus away from Markdown must keep the last note as the query anchor.
    fileOpen(null);
    view.submit();
    expect(run.mock.lastCall?.[1]).toEqual({ activeFile: 'B.md' });
    fileOpen({ path: 'image.png', extension: 'png' });
    view.submit();
    expect(run.mock.lastCall?.[1]).toEqual({ activeFile: 'B.md' });
  });

  // @tg: verifies:: [[tests/graph-view#Active file before a note is opened]] {level: unit}
  // @tg: verifies:: [[openspec:graph-view#Active file query parameter#No active note]] {level: unit}
  it('binds null and returns an empty graph when no note has been active', async () => {
    const { run, shown } = await openView(null);
    expect(run.mock.lastCall?.[1]).toEqual({ activeFile: null });
    expect(shown()).toEqual({ nodes: [], edges: [] });
  });
});
