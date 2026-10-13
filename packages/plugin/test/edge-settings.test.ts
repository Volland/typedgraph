import { Graph } from '@obsigraph/core';
import { describe, expect, it } from 'vitest';

/** Options object shaped like the one `VaultIndex` hands to `Graph`: each flag is read when a note is indexed. */
function liveGraph(flags: { linkEdges: boolean; frontmatterEdges: boolean }) {
  const resolve = (l: string) => (`${l}.md` in notes ? `${l}.md` : null);
  const notes: Record<string, string> = { 'A.md': 'See [[B]] for details.', 'B.md': '' };
  const graph = new Graph(resolve, undefined, {
    get linkEdges() {
      return flags.linkEdges;
    },
    get frontmatterEdges() {
      return flags.frontmatterEdges;
    },
  });
  const index = () => {
    for (const [path, text] of Object.entries(notes)) graph.upsertNote({ path, text, frontmatter: path === 'A.md' ? { requirement: '[[B]]' } : {} });
  };
  const types = () => [...graph.edges()].map((e) => e.type).sort();
  return { index, types };
}

describe('edge settings', () => {
  // @lat: [[tests/edge-settings#Both off by default]]
  it('adds no prose or frontmatter edges while both settings are off', () => {
    const g = liveGraph({ linkEdges: false, frontmatterEdges: false });
    g.index();
    expect(g.types()).toEqual([]);
  });

  // @lat: [[tests/edge-settings#Each setting adds its own edges]]
  it('adds links_to edges for prose and typed edges for frontmatter, each on its own', () => {
    const prose = liveGraph({ linkEdges: true, frontmatterEdges: false });
    prose.index();
    expect(prose.types()).toEqual(['links_to']);
    const fm = liveGraph({ linkEdges: false, frontmatterEdges: true });
    fm.index();
    expect(fm.types()).toEqual(['requirement']);
    const both = liveGraph({ linkEdges: true, frontmatterEdges: true });
    both.index();
    expect(both.types()).toEqual(['links_to', 'requirement']);
  });

  // @lat: [[tests/edge-settings#Changes apply on re-index]]
  it('applies a changed setting to notes indexed afterwards', () => {
    const flags = { linkEdges: false, frontmatterEdges: false };
    const g = liveGraph(flags);
    g.index();
    expect(g.types()).toEqual([]);
    flags.linkEdges = true;
    g.index();
    expect(g.types()).toEqual(['links_to']);
  });
});
