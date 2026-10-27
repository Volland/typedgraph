import { describe, expect, it } from 'vitest';
import { EMPTY_VALUE, UNTYPED, ViewFilters, applyFilters, collapseTargets, propertyValues, removalTargets, typeCounts, valueKeys, valueLabel, type GraphElements, type NodeElement } from '../src';

const node = (id: string, labels: string[], props: Record<string, unknown> = {}): NodeElement => ({ id, label: id, labels, stub: false, path: id, props });
const edge = (source: string, target: string) => ({ id: `${source}-${target}`, source, target, type: 'rel', sign: 1 as const });

/** hub joins a, b and c; c also joins d; e hangs off d; x is alone. */
function graph(): GraphElements {
  return {
    nodes: [
      node('hub', ['Project']),
      node('a', ['Task'], { status: 'To Do', team: ['x', 'y'] }),
      node('b', ['Task'], { status: 'Done' }),
      node('c', ['Task'], { status: 'To Do', team: [] }),
      node('d', ['Person']),
      node('e', []),
      node('x', ['Task'], { status: 'Done', team: ['y'] }),
    ],
    edges: [edge('hub', 'a'), edge('hub', 'b'), edge('hub', 'c'), edge('c', 'd'), edge('d', 'e')],
  };
}
const ids = (g: GraphElements) => g.nodes.map((n) => n.id).sort();

describe('value filter display', () => {
  // @tg: verifies:: [[tests/graph-ui#Value filter display]] {since: "2026-10-24", level: unit}
  // @lat: [[tests/graph-ui#Value filter display]]
  it('shows links without brackets and clears only the value filters', () => {
    expect(valueLabel('[[Eulálius Vopršálek]]')).toBe('Eulálius Vopršálek');
    expect(valueLabel('[[People/Ruth|Ruth]]')).toBe('Ruth');
    expect(valueLabel('plain [[x]]')).toBe('plain [[x]]');
    const f = new ViewFilters();
    expect(f.valueFiltered).toBe(false);
    f.setTypeHidden('Person', true);
    expect(f.valueFiltered).toBe(false);
    f.setValues('Task', 'status', ['Done']);
    expect(f.valueFiltered).toBe(true);
    f.clearValues();
    expect(f.valueFiltered).toBe(false);
    expect(f.hiddenTypes.has('Person')).toBe(true);
  });
});

describe('removing nodes from the view', () => {
  // @tg: verifies:: [[tests/graph-ui#Collapse neighbors]] {since: "2026-10-24", level: unit}
  // @lat: [[tests/graph-ui#Collapse neighbors]]
  // @tg: verifies:: [[openspec:graph-view#Remove and collapse#Collapse neighbors]]
  it('collapses only the neighbors that hang off the node alone', () => {
    expect(collapseTargets(graph(), 'hub').sort()).toEqual(['a', 'b']);
    // c also reaches d, so it stays; the hub is not a leaf of c.
    expect(collapseTargets(graph(), 'd')).toEqual(['e']);
    expect(collapseTargets(graph(), 'x')).toEqual([]);
  });

  // @tg: verifies:: [[tests/graph-ui#Remove from view]] {since: "2026-10-24", level: unit}
  // @lat: [[tests/graph-ui#Remove from view]]
  // @tg: verifies:: [[openspec:graph-view#Remove and collapse#Remove from view]]
  it('removes the node with the nodes connected only to it, and the edges of all of them', () => {
    const g = graph();
    const gone = new Set(removalTargets(g, 'd'));
    expect([...gone].sort()).toEqual(['d', 'e']);
    const left = applyFilters(g, new ViewFilters(), gone);
    expect(ids(left)).toEqual(['a', 'b', 'c', 'hub', 'x']);
    expect(left.edges.map((e) => e.id).sort()).toEqual(['hub-a', 'hub-b', 'hub-c']);
  });
});

describe('view filters', () => {
  // @tg: verifies:: [[tests/graph-ui#Hidden node types]] {since: "2026-10-24", level: unit}
  // @lat: [[tests/graph-ui#Hidden node types]]
  // @tg: verifies:: [[openspec:graph-view#Graph view filters#Hide node types]]
  it('hides nodes of a hidden type and the edges that lose an end', () => {
    const f = new ViewFilters();
    f.setTypeHidden('Person', true);
    f.setTypeHidden(UNTYPED, true);
    const g = applyFilters(graph(), f, new Set());
    expect(ids(g)).toEqual(['a', 'b', 'c', 'hub', 'x']);
    expect(g.edges).toHaveLength(3);
    expect(typeCounts(graph()).find((t) => t.type === 'Task')?.count).toBe(4);
    f.setTypeHidden('Person', false);
    expect(ids(applyFilters(graph(), f, new Set()))).toContain('d');
  });

  // @tg: verifies:: [[tests/graph-ui#Property value filters]] {since: "2026-10-24", level: unit}
  // @lat: [[tests/graph-ui#Property value filters]]
  // @tg: verifies:: [[openspec:graph-view#Graph view filters#Filter by property values]]
  it('accepts a node when any checked value of each filtered property matches, and leaves other types alone', () => {
    const f = new ViewFilters();
    f.setValues('Task', 'status', ['To Do', 'Done']);
    expect(ids(applyFilters(graph(), f, new Set()))).toEqual(['a', 'b', 'c', 'd', 'e', 'hub', 'x']);
    f.setValues('Task', 'status', ['To Do']);
    expect(ids(applyFilters(graph(), f, new Set()))).toEqual(['a', 'c', 'd', 'e', 'hub']);
    // A second property must hold as well; a list value passes when any item is accepted.
    f.setValues('Task', 'team', ['y']);
    expect(ids(applyFilters(graph(), f, new Set()))).toEqual(['a', 'd', 'e', 'hub']);
    // Empty and missing values are one choice.
    f.setValues('Task', 'team', [EMPTY_VALUE]);
    expect(ids(applyFilters(graph(), f, new Set()))).toEqual(['c', 'd', 'e', 'hub']);
    f.setValues('Task', 'team', []);
    f.setValues('Task', 'status', []);
    expect(f.active).toBe(false);
  });

  // @tg: verifies:: [[tests/graph-ui#Offered filter values]] {since: "2026-10-24", level: unit}
  // @lat: [[tests/graph-ui#Offered filter values]]
  // @tg: verifies:: [[openspec:graph-view#Graph view filters#Values offered per type]]
  it('lists the values of a type with counts, counting a missing property as empty and skipping empty-only properties', () => {
    const props = propertyValues(graph(), 'Task');
    expect([...props.keys()].sort()).toEqual(['status', 'team']);
    expect(Object.fromEntries(props.get('status')!)).toEqual({ 'To Do': 2, Done: 2 });
    expect(Object.fromEntries(props.get('team')!)).toEqual({ x: 1, y: 2, [EMPTY_VALUE]: 2 });
    expect(propertyValues(graph(), 'Person').size).toBe(0);
    expect(valueKeys([' ', null])).toEqual([EMPTY_VALUE]);
  });
});
