import { BuiltinEngine, colorFor, Graph, styleSource } from '@obsigraph/core';
import { describe, expect, it } from 'vitest';
import { chooseView, parseBlock } from '../src/query/block';
import { planRender } from '../src/query/plan';
import { buildStylesheet, parseEdgeStyles, parseTypeStyles } from '../src/render/styles';
import { makeStyler } from '../src/render/styler';
import { cellText } from '../src/render/table';

function fixture() {
  const notes: Record<string, string> = {
    'Alice.md': 'knows:: [[Bob]] {since: 2020}\n-distrusts:: [[Eve]]',
    'Bob.md': 'knows:: [[Carol]]',
    'Carol.md': '',
    'Eve.md': '',
  };
  const graph = new Graph((l) => (`${l}.md` in notes ? `${l}.md` : null));
  for (const [path, text] of Object.entries(notes)) graph.upsertNote({ path, text, frontmatter: { type: 'Person' } });
  const engine = new BuiltinEngine(graph);
  const plan = (source: string, max = 500) => {
    const b = parseBlock(source);
    expect(b.errors).toEqual([]);
    return planRender(engine.run(b.query), b.options, max, (id) => graph.node(id));
  };
  return { graph, engine, plan };
}

const THEME = { text: '#000', muted: '#999', background: '#fff' };

describe('graph-query block', () => {
  // @tg: verifies:: [[tests/graph-query-block#Header and query split]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/graph-query-block#Header and query split]]
  // @tg: verifies:: [[openspec:graph-query-block#Block structure#Header and query]]
  it('splits the header from the query and maps the query start line', () => {
    const b = parseBlock('view: table\ncolumns: a, b\nheight: 500px\n\nMATCH (a)-->(b)\nRETURN a, b');
    expect(b.options).toEqual({ view: 'table', columns: ['a', 'b'], height: 500, backend: null, code: 'show', forces: {}, display: {}, pin: ['self'], controls: 'show' });
    expect(b.query).toBe('MATCH (a)-->(b)\nRETURN a, b');
    expect(b.queryLine).toBe(4);
    expect(b.errors).toEqual([]);
  });

  // @tg: verifies:: [[tests/graph-query-block#Query without header]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/graph-query-block#Query without header]]
  // @tg: verifies:: [[openspec:graph-query-block#Block structure#No header]]
  it('uses defaults when there is no header', () => {
    const b = parseBlock('MATCH (n:Person) RETURN n');
    expect(b.options).toEqual({ view: 'auto', columns: null, height: 360, backend: null, code: 'show', forces: {}, display: {}, pin: ['self'], controls: 'show' });
    expect(b.query).toBe('MATCH (n:Person) RETURN n');
    expect(b.queryLine).toBe(0);
  });

  // @tg: verifies:: [[tests/graph-query-block#Header errors reported]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/graph-query-block#Header errors reported]]
  it('reports unknown options and invalid values with their line', () => {
    const b = parseBlock('view: pie\ncolour: red\nheight: 5\nMATCH (n) RETURN n');
    expect(b.errors.map((e) => e.line)).toEqual([0, 1, 2]);
    expect(b.errors[0]!.message).toMatch(/Invalid view 'pie'/);
    expect(b.errors[1]!.message).toMatch(/Unknown option 'colour'/);
  });

  // @tg: verifies:: [[tests/graph-query-block#Graph for nodes and edges]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/graph-query-block#Graph for nodes and edges]]
  // @tg: verifies:: [[openspec:graph-query-block#Renderer chosen by result shape#Nodes and edges]]
  it('renders a graph when the result holds nodes or relationships, with edge endpoints added', () => {
    const { plan } = fixture();
    const p = plan('MATCH ()-[r]->() RETURN r');
    expect(p.kind).toBe('graph');
    if (p.kind !== 'graph') return;
    expect(p.elements.edges.map((e) => [e.type, e.sign]).sort()).toEqual([['distrusts', -1], ['knows', 1], ['knows', 1]]);
    expect(p.elements.nodes.map((n) => n.label).sort()).toEqual(['Alice', 'Bob', 'Carol', 'Eve']);
  });

  // @tg: verifies:: [[tests/cypher-extensions#Paths render as graphs]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/cypher-extensions#Paths render as graphs]]
  // @tg: verifies:: [[openspec:cypher-extensions#Variable-length paths#Path result]]
  it('draws path results as graphs and summarizes them in tables', () => {
    const { plan, engine } = fixture();
    const p = plan('MATCH p = (a {title: "Alice"})-[:knows*1..2]->(c) RETURN p');
    expect(p.kind).toBe('graph');
    if (p.kind === 'graph') {
      expect(p.elements.nodes.map((n) => n.label).sort()).toEqual(['Alice', 'Bob', 'Carol']);
      expect(p.elements.edges).toHaveLength(2);
    }
    const r = engine.run('MATCH p = (a {title: "Alice"})-[:knows*2]->(c) RETURN p');
    expect(cellText(r.rows[0]![0]!)).toBe('Alice -knows-> Bob -knows-> Carol');
    const capped = plan('MATCH (a {title: "Alice"})-[:knows*]->(c) RETURN c');
    expect(capped.kind === 'graph' && capped.notices).toEqual([]);
  });

  // @tg: verifies:: [[tests/graph-query-block#Table for scalars]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/graph-query-block#Table for scalars]]
  // @tg: verifies:: [[openspec:graph-query-block#Renderer chosen by result shape#Scalars only]]
  it('renders a table when the result holds only scalars', () => {
    const { plan, engine } = fixture();
    expect(plan('MATCH (a)-[r]->(b) RETURN a.title, r.since').kind).toBe('table');
    expect(chooseView(engine.run('MATCH (a) RETURN a'), 'auto')).toBe('graph');
  });

  // @tg: verifies:: [[tests/graph-query-block#View and columns override]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/graph-query-block#View and columns override]]
  it('honors view: table and selects and orders columns', () => {
    const { plan } = fixture();
    const p = plan('view: table\ncolumns: b, a\n\nMATCH (a)-[r]->(b) RETURN a, r, b');
    expect(p).toEqual({ kind: 'table', indexes: [2, 0], notice: null, notices: [] });
    const bad = plan('columns: nope\n\nMATCH (a) RETURN a.title AS t');
    expect(bad.kind).toBe('error');
    if (bad.kind === 'error') expect(bad.messages[0]).toMatch(/Unknown column 'nope' \(available: t\)/);
  });

  // @tg: verifies:: [[tests/graph-query-block#Element cap falls back to table]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/graph-query-block#Element cap falls back to table]]
  // @tg: verifies:: [[openspec:graph-query-block#Large results are bounded#Result exceeds limit]]
  it('falls back to a table with a notice above the element cap', () => {
    const { plan } = fixture();
    const p = plan('MATCH (a)-[r]->(b) RETURN a, r, b', 3);
    expect(p.kind).toBe('table');
    if (p.kind === 'table') expect(p.notice).toMatch(/7 elements, above the limit of 3/);
  });

  // @tg: verifies:: [[tests/graph-query-block#Signed and typed styling]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/graph-query-block#Signed and typed styling]]
  // @tg: verifies:: [[openspec:graph-view#Edge presentation#Signed edges]]
  // @tg: verifies:: [[openspec:graph-view#Node type styling#Typed and stub nodes]]
  it('styles negative edges distinctly and nodes per type from element data', () => {
    const rules = buildStylesheet(THEME);
    const edge = rules.find((r) => r.selector === 'edge')!.style;
    expect(edge.label).toBe('data(type)');
    expect(edge['line-style']).toBe('data(line)');
    expect(rules.find((r) => r.selector === 'edge.negative')!.style['target-arrow-shape']).toBe('tee');
    expect(rules.find((r) => r.selector === 'node')!.style['background-color']).toBe('data(color)');
    const styler = makeStyler([styleSource('settings', null, { Person: { color: '#123456', shape: 'diamond' } }, {}).source]);
    const node = { id: 'a', label: 'Alice', labels: ['Person'], stub: false, path: 'a', props: {} };
    expect(styler.node(node)).toEqual({ color: '#123456', shape: 'diamond', label: 'Alice', icon: '' });
    expect(styler.node({ ...node, labels: ['Company'] }).color).toBe(colorFor('Company'));
    const e = { id: 'e', source: 'a', target: 'b', type: 'distrusts' };
    expect(styler.edge({ ...e, sign: -1 })).toEqual({ color: '#d94848', line: 'dashed' });
    expect(styler.edge({ ...e, sign: 1 })).toEqual({ color: '#8a8a8a', line: 'solid' });
  });

  // @tg: verifies:: [[tests/graph-query-block#Type style settings validated]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/graph-query-block#Type style settings validated]]
  it('validates type style settings', () => {
    expect(parseTypeStyles('{"Person": {"color": "red", "shape": "star"}}')).toEqual({ Person: { color: 'red', shape: 'star' } });
    expect(parseTypeStyles('{"Person": {"shape": "blob"}}')).toMatch(/Ignored shape 'blob' for type label Person/);
    expect(parseTypeStyles('{"Person": {"color": "nope"}}')).toMatch(/Ignored color 'nope'/);
    expect(parseEdgeStyles('{"knows": {"color": "orange", "line": "dotted"}}')).toEqual({ knows: { color: 'orange', line: 'dotted' } });
    expect(parseEdgeStyles('{"knows": {"line": "wavy"}}')).toMatch(/Ignored line 'wavy'/);
    expect(parseTypeStyles('[1]')).toMatch(/object keyed by type label/);
    expect(parseTypeStyles('{bad')).toMatch(/Invalid JSON/);
  });
});

describe('layout header options', () => {
  // @tg: verifies:: [[tests/graph-query-block#Layout header options]] {since: "2026-10-12", level: unit}
  // @lat: [[tests/graph-query-block#Layout header options]]
  // @tg: verifies:: [[openspec:graph-query-block#Layout header options#Valid layout header]]
  it('reads forces, display, pin and controls from the header', () => {
    const b = parseBlock('forces: center=0.5, repel=12\ndisplay: arrows=false, hide=requirement|feature\npin: self, Other Note\ncontrols: open\n\nMATCH (n) RETURN n');
    expect(b.errors).toEqual([]);
    expect(b.options.forces).toEqual({ center: 0.5, repel: 12 });
    expect(b.options.display).toEqual({ arrows: false, hide: ['requirement', 'feature'] });
    expect(b.options.pin).toEqual(['self', 'Other Note']);
    expect(b.options.controls).toBe('open');
    expect(b.query).toBe('MATCH (n) RETURN n');
    const none = parseBlock('pin: none\nMATCH (n) RETURN n');
    expect(none.options.pin).toEqual([]);
  });

  // @tg: verifies:: [[tests/graph-query-block#Layout header defaults]] {since: "2026-10-12", level: unit}
  // @lat: [[tests/graph-query-block#Layout header defaults]]
  // @tg: verifies:: [[openspec:graph-query-block#Layout header options#Defaults]]
  it('defaults to pinning the note holding the block, with the controls button shown', () => {
    const b = parseBlock('MATCH (n) RETURN n');
    expect(b.options.pin).toEqual(['self']);
    expect(b.options.controls).toBe('show');
    expect(b.options.forces).toEqual({});
    expect(b.options.display).toEqual({});
    // Parsing one block never leaks into the next.
    parseBlock('forces: repel=3\npin: none\nMATCH (n) RETURN n');
    expect(parseBlock('MATCH (n) RETURN n').options.forces).toEqual({});
    expect(parseBlock('MATCH (n) RETURN n').options.pin).toEqual(['self']);
  });

  // @tg: verifies:: [[tests/graph-query-block#Layout header errors]] {since: "2026-10-12", level: unit}
  // @lat: [[tests/graph-query-block#Layout header errors]]
  // @tg: verifies:: [[openspec:graph-query-block#Layout header options#Invalid layout header]]
  it('reports invalid layout values with their line and keeps valid entries', () => {
    const b = parseBlock('forces: center=2, repel=5, speed=1\ncontrols: sideways\nMATCH (n) RETURN n');
    expect(b.errors).toEqual([
      { line: 0, message: "Invalid center '2' (0-1)" },
      { line: 0, message: "Unknown forces setting 'speed' (expected center, repel, link, distance, edgeRepel, labelRepel, pinOnDrag)" },
      { line: 1, message: "Invalid controls 'sideways' (expected show, open or hide)" },
    ]);
    expect(b.options.forces).toEqual({ repel: 5 });
    expect(parseBlock('bogus: 1\nMATCH (n) RETURN n').errors[0]!.message).toContain('forces, display, pin, controls');
  });
});
