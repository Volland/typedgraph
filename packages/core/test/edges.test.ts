import { describe, expect, it } from 'vitest';
import { parseEdges } from '../src/index.js';

const one = (text: string) => {
  const { edges, diagnostics } = parseEdges(text, 'Alice.md');
  expect(diagnostics).toEqual([]);
  expect(edges).toHaveLength(1);
  return edges[0]!;
};

describe('edge parsing', () => {
  // @tg: verifies:: [[tests/edge-parsing#Plain Graph Link Types line]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/edge-parsing#Plain Graph Link Types line]]
  // @tg: verifies:: [[openspec:edge-parsing#Inline edge form#Plain Graph Link Types line]]
  it('parses a plain Graph Link Types line', () => {
    const e = one('knows:: [[Bob]]');
    expect(e).toMatchObject({ type: 'knows', target: 'Bob', sign: 1, props: {} });
  });

  // @tg: verifies:: [[tests/edge-parsing#Line with properties]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/edge-parsing#Line with properties]]
  // @tg: verifies:: [[openspec:edge-parsing#Inline edge form#Line with properties]]
  it('parses a trailing property block with typed values', () => {
    const e = one('knows:: [[Bob]] {since: 2020, label: "met at conf", ok: true, tags: [a, "b c"],}');
    expect(e.props).toEqual({ since: 2020, label: 'met at conf', ok: true, tags: ['a', 'b c'] });
  });

  // @tg: verifies:: [[tests/edge-parsing#Negative sign prefix]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/edge-parsing#Negative sign prefix]]
  // @tg: verifies:: [[openspec:edge-parsing#Sign prefix#Negative edge]]
  it('treats a - prefix as sign -1 and strips it from the type', () => {
    const e = one('-distrusts:: [[Eve]]');
    expect(e.type).toBe('distrusts');
    expect(e.sign).toBe(-1);
  });

  // @tg: verifies:: [[tests/edge-parsing#Default positive sign]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/edge-parsing#Default positive sign]]
  // @tg: verifies:: [[openspec:edge-parsing#Sign prefix#Unsigned edge]]
  it('defaults sign to +1 and accepts an explicit + prefix', () => {
    expect(one('knows:: [[Bob]]').sign).toBe(1);
    const plus = one('+trusts:: [[Bob]]');
    expect(plus).toMatchObject({ type: 'trusts', sign: 1 });
  });

  // @tg: verifies:: [[tests/edge-parsing#Weight independent of sign]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/edge-parsing#Weight independent of sign]]
  // @tg: verifies:: [[openspec:edge-parsing#Weight is independent of sign#Negative weight on positive edge]]
  it('keeps weight as an ordinary property', () => {
    const e = one('knows:: [[Bob]] {weight: -0.8}');
    expect(e.sign).toBe(1);
    expect(e.props.weight).toBe(-0.8);
  });

  // @tg: verifies:: [[tests/edge-parsing#Source heading recorded]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/edge-parsing#Source heading recorded]]
  // @tg: verifies:: [[openspec:edge-parsing#Source heading is recorded#Edge under a heading]]
  it('records the nearest preceding heading', () => {
    const { edges } = parseEdges('knows:: [[Zed]]\n# People\n## Colleagues\nknows:: [[Bob]]');
    expect(edges.map((e) => e.heading)).toEqual([null, 'Colleagues']);
  });

  // @tg: verifies:: [[tests/edge-parsing#Malformed property block]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/edge-parsing#Malformed property block]]
  // @tg: verifies:: [[openspec:edge-parsing#Malformed property blocks#Unclosed block]]
  it('keeps the edge and reports a diagnostic for a malformed block', () => {
    const { edges, diagnostics } = parseEdges('intro\nknows:: [[Bob]] {since: 2020', 'Alice.md');
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ type: 'knows', target: 'Bob', props: {} });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ path: 'Alice.md', line: 1 });
    expect(diagnostics[0]!.message).toMatch(/Malformed edge property block/);
  });

  // @tg: verifies:: [[tests/edge-parsing#Code fences ignored]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/edge-parsing#Code fences ignored]]
  // @tg: verifies:: [[openspec:edge-parsing#Non-edge text is ignored#Edge syntax in a code fence]]
  it('ignores fenced code and frontmatter', () => {
    const text = [
      '---',
      'related:: [[NotAnEdge]]',
      '---',
      '```',
      'knows:: [[Bob]]',
      '```',
      '~~~md',
      'knows:: [[Carol]]',
      '~~~',
      'knows:: [[Dave]]',
    ].join('\n');
    expect(parseEdges(text).edges.map((e) => e.target)).toEqual(['Dave']);
    expect(parseEdges('plain text with [[Bob]]\nnot an edge: [[Bob]]').edges).toEqual([]);
  });

  // @tg: verifies:: [[tests/edge-parsing#List items and multiple links]] {since: "2026-10-03", level: unit}
  // @lat: [[tests/edge-parsing#List items and multiple links]]
  it('handles list items, multiple links, aliases and subpaths', () => {
    const { edges } = parseEdges('- knows:: [[Bob|Bobby]], [[People/Carol#Work]] {since: 2021}');
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({ target: 'Bob', alias: 'Bobby', props: { since: 2021 } });
    expect(edges[1]).toMatchObject({ target: 'People/Carol', subpath: 'Work', props: { since: 2021 } });
    expect(edges[0]!.props).not.toBe(edges[1]!.props);
    expect(parseEdges('- -distrusts:: [[Eve]]').edges[0]).toMatchObject({ type: 'distrusts', sign: -1 });
  });

  // @tg: verifies:: [[tests/edge-parsing#Unquoted link in a property]] {since: "2026-11-26", level: unit}
  // @lat: [[tests/edge-parsing#Unquoted link in a property]]
  // @tg: verifies:: [[openspec:edge-parsing#Links in property values#Unquoted link in a property]]
  it('reads a property value written like a wikilink as that link text', () => {
    const { edges, diagnostics } = parseEdges('met_with:: [[Person A]] {location: [[Location B]], at: [[[Hall]], [[Lobby#Desk|desk]]], q: "[[Q]]"}', 'Alice.md');
    expect(diagnostics).toEqual([]);
    expect(edges[0]!.props).toEqual({ location: '[[Location B]]', at: ['[[Hall]]', '[[Lobby#Desk|desk]]'], q: '[[Q]]' });
  });

  // @tg: verifies:: [[tests/edge-parsing#Nested lists that are not links]] {since: "2026-11-26", level: unit}
  // @lat: [[tests/edge-parsing#Nested lists that are not links]]
  // @tg: verifies:: [[openspec:edge-parsing#Links in property values#Nested lists]]
  it('keeps nested lists that do not look like links', () => {
    const { edges, diagnostics } = parseEdges('knows:: [[Bob]] {b: [[X],], c: [ [X] ], d: [[1, 2], [3]], e: [[X] ], f: [[[X],]]}');
    expect(diagnostics).toEqual([]);
    expect(edges[0]!.props).toEqual({ b: [['X']], c: [['X']], d: [[1, 2], [3]], e: [['X']], f: [[['X']]] });
  });
});
