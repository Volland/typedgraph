import { Graph } from '@obsigraph/core';
import { describe, expect, it } from 'vitest';
import { toElements } from '../src/render/elements';
import { makeStyler } from '../src/render/styler';
import { edgeDetails, mergeElements, neighborhood, nodeDetails, valueLines } from '../src/view/view-state';
import { BuiltinEngine } from '@obsigraph/core';

function fixture() {
  const notes: Record<string, [string, Record<string, unknown>]> = {
    'Alice.md': ['knows:: [[Bob]] {since: 2020}\n## Trust\n-distrusts:: [[Eve]]', { type: 'Person', age: 31 }],
    'Bob.md': ['knows:: [[Carol]]', { type: ['Person', 'Employee'] }],
    'Carol.md': ['likes:: [[Ghost]]', { type: 'Person' }],
    'Eve.md': ['', { type: 'Person' }],
  };
  const graph = new Graph((l) => (`${l}.md` in notes ? `${l}.md` : null));
  for (const [path, [text, frontmatter]] of Object.entries(notes)) graph.upsertNote({ path, text, frontmatter });
  return graph;
}

const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();

describe('graph view', () => {
  // @tg: verifies:: [[tests/graph-view#Neighborhood of active note]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/graph-view#Neighborhood of active note]]
  // @tg: verifies:: [[openspec:graph-view#Graph view leaf#Default content]]
  it('shows a node with its incident edges and direct neighbors in both directions', () => {
    const g = neighborhood(fixture(), 'Bob.md');
    expect(ids(g.nodes)).toEqual(['Alice.md', 'Bob.md', 'Carol.md']);
    expect(ids(g.edges)).toEqual(['Alice.md#knows#Bob.md#0', 'Bob.md#knows#Carol.md#0']);
    expect(neighborhood(fixture(), 'Missing.md')).toEqual({ nodes: [], edges: [] });
  });

  // @tg: verifies:: [[tests/graph-view#Expansion keeps existing elements]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/graph-view#Expansion keeps existing elements]]
  // @tg: verifies:: [[openspec:graph-view#Click to expand#Expand neighbors]]
  it('merges an expanded neighborhood without dropping existing elements', () => {
    const graph = fixture();
    const base = neighborhood(graph, 'Alice.md');
    const merged = mergeElements(base, neighborhood(graph, 'Bob.md'));
    expect(ids(merged.nodes)).toEqual(['Alice.md', 'Bob.md', 'Carol.md', 'Eve.md']);
    expect(merged.edges).toHaveLength(3);
    for (const n of base.nodes) expect(merged.nodes).toContain(n);
  });

  // @tg: verifies:: [[tests/graph-view#Edge selection details]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/graph-view#Edge selection details]]
  // @tg: verifies:: [[openspec:graph-view#Selection details#Select an edge]]
  it('describes a selected edge with type, sign, id, heading and properties', () => {
    const graph = fixture();
    const d = edgeDetails(graph.edge('Alice.md#knows#Bob.md#0')!, graph);
    expect(d.title).toBe('Alice knows → Bob');
    expect(d.rows).toEqual(
      expect.arrayContaining([
        ['type', 'knows'],
        ['sign', '+1'],
        ['id', 'Alice.md#knows#Bob.md#0'],
        ['since', '2020'],
      ]),
    );
    const neg = edgeDetails(graph.edge('Alice.md#distrusts#Eve.md#0')!, graph);
    expect(neg.title).toBe('Alice −distrusts → Eve');
    expect(neg.rows).toEqual(expect.arrayContaining([['sign', '-1 (negative)'], ['heading', 'Trust']]));
  });

  // @tg: verifies:: [[tests/graph-view#Node selection details]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/graph-view#Node selection details]]
  it('describes a selected node with labels and properties', () => {
    const d = nodeDetails(fixture().node('Bob.md')!);
    expect(d.title).toBe('Bob');
    expect(d.rows).toEqual(expect.arrayContaining([['labels', 'Person, Employee'], ['stub', 'false'], ['path', 'Bob.md']]));
  });

  // @tg: verifies:: [[tests/graph-view#Subtitle after the title]] {since: "2026-10-16", level: unit}
  // @lat: [[tests/graph-view#Subtitle after the title]]
  // @tg: verifies:: [[openspec:graph-view#Node subtitle#Shared file name]]
  // @tg: verifies:: [[openspec:graph-view#Node subtitle#No subtitle]]
  it('draws a frontmatter subtitle after the title', () => {
    const graph = new Graph((l) => (l.endsWith('.md') ? l : `${l}.md`));
    graph.upsertNote({ path: 'specs/auth/spec.md', text: 'depends_on:: [[specs/billing/spec.md]]', frontmatter: { subtitle: 'auth' } });
    graph.upsertNote({ path: 'specs/billing/spec.md', text: '', frontmatter: { subtitle: 'billing' } });
    graph.upsertNote({ path: 'changes/x/design.md', text: '', frontmatter: { subtitle: '  ' } });
    graph.upsertNote({ path: 'changes/y/design.md', text: '', frontmatter: { title: 'Y design', subtitle: 2 } });
    const label = (id: string) => toElements(new BuiltinEngine(graph).run(`MATCH (n) WHERE n.path = '${id}' RETURN n`), (i) => graph.node(i)).nodes[0]!.label;
    expect(label('specs/auth/spec.md')).toBe('spec — auth');
    expect(label('changes/x/design.md')).toBe('design');
    expect(label('changes/y/design.md')).toBe('Y design — 2');
    expect(nodeDetails(graph.node('specs/billing/spec.md')!).title).toBe('spec — billing');
    expect(edgeDetails([...graph.edges()][0]!, graph).title).toBe('spec — auth depends_on → spec — billing');
    expect(makeStyler([]).node(neighborhood(graph, 'specs/auth/spec.md').nodes.find((n) => n.id === 'specs/auth/spec.md')!).label).toBe('spec — auth');
  });

  // @tg: verifies:: [[tests/graph-view#Same element same style]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/graph-view#Same element same style]]
  // @tg: verifies:: [[openspec:graph-view#Shared renderer#Consistent styling]]
  it('produces identical element data and classes for a node in a block and in the view', () => {
    const graph = fixture();
    const fromBlock = toElements(new BuiltinEngine(graph).run('MATCH (n {title: "Bob"}) RETURN n'), (id) => graph.node(id));
    const fromView = neighborhood(graph, 'Bob.md');
    const a = fromBlock.nodes[0]!;
    const b = fromView.nodes.find((n) => n.id === 'Bob.md')!;
    expect(a).toEqual(b);
    const styler = makeStyler([]);
    expect(styler.node(a)).toEqual(styler.node(b));
  });

  // @tg: verifies:: [[tests/graph-view#Stubs visible in neighborhood]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/graph-view#Stubs visible in neighborhood]]
  it('includes stub neighbors so unresolved links stay visible', () => {
    const g = neighborhood(fixture(), 'Carol.md');
    expect(g.nodes.find((n) => n.id === 'Ghost')).toMatchObject({ stub: true, path: null });
  });
  // @tg: verifies:: [[tests/graph-view#Business and technical rows]] {since: "2026-10-13", level: unit}
  // @lat: [[tests/graph-view#Business and technical rows]]
  // @tg: verifies:: [[openspec:graph-view#Details panel#Business and technical properties]]
  it('marks graph bookkeeping and undeclared properties as technical when a schema is known', () => {
    const graph = new Graph(() => null);
    graph.upsertNote({ path: 'T.md', text: '', frontmatter: { type: 'Task', status: 'To Do', tags: ['x'], owner: 'bob' } });
    const n = graph.node('T.md')!;
    const style = makeStyler([]).resolveNode(n.labels);
    const d = nodeDetails(n, style, new Set(['status', 'owner']));
    expect([...d.technical].sort()).toEqual(['labels', 'stub', 'style.color', 'style.icon', 'style.label', 'style.shape'].sort());
    expect(d.rows.map(([k]) => k).filter((k) => !d.technical.has(k))).toEqual(['type', 'status', 'tags', 'owner', 'path']);
    expect(d.source).toBe('T.md');

    const open = nodeDetails(n, undefined);
    expect(open.rows.map(([k]) => k).filter((k) => !open.technical.has(k))).toEqual(['type', 'status', 'tags', 'owner', 'path']);

    const edge = fixture().edge('Alice.md#knows#Bob.md#0')!;
    const e = edgeDetails(edge, fixture(), undefined, new Set(['since']));
    expect([...e.technical].sort()).toEqual(['id', 'sign']);
    expect(edgeDetails(edge, fixture(), undefined, new Set()).technical.has('since')).toBe(true);
  });

  // @tg: verifies:: [[tests/graph-view#Links in values]] {since: "2026-10-13", level: unit}
  // @lat: [[tests/graph-view#Links in values]]
  // @tg: verifies:: [[openspec:graph-view#Details panel#Links in values]]
  it('splits property values into text and link parts, one line per list item', () => {
    expect(valueLines('[[Login]]')).toEqual([[{ link: { target: 'Login', subpath: null, label: 'Login' } }]]);
    expect(valueLines('see [[Auth#Flow|the flow]] now')).toEqual([[{ text: 'see ' }, { link: { target: 'Auth', subpath: 'Flow', label: 'the flow' } }, { text: ' now' }]]);
    expect(valueLines(['[[A]]', 'plain', 3], 'Tasks/T.md')).toEqual([
      [{ link: { target: 'A', subpath: null, label: 'A' } }],
      [{ text: 'plain' }],
      [{ text: '3' }],
    ]);
    expect(valueLines('[Guide](docs/Guide.md)', 'Tasks/T.md')).toEqual([[{ link: { target: 'Tasks/docs/Guide.md', subpath: null, label: 'Guide' } }]]);
    expect(valueLines('[site](https://example.com)')).toEqual([[{ text: '[site](https://example.com)' }]]);
    expect(valueLines('[[]]')).toEqual([[{ text: '[[]]' }]]);
    expect(valueLines([])).toEqual([[{ text: '[]' }]]);
    expect(valueLines(null)).toEqual([[{ text: '' }]]);
  });
});
