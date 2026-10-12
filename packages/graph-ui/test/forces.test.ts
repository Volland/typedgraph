import { describe, expect, it } from 'vitest';
import {
  buildStylesheet,
  DEFAULT_DISPLAY,
  DEFAULT_FORCES,
  edgeLabelWidth,
  fitAroundOrigin,
  formatLayoutOptions,
  nodeLabelWidth,
  parseControls,
  parseDisplay,
  parseForces,
  parsePin,
  resolveSettings,
  Simulation,
  type SimInput,
} from '../src/index';

const THEME = { text: '#000', muted: '#999', background: '#fff' };

/** Deterministic random numbers, so layouts are reproducible. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sim(input: SimInput, forces = {}, display = {}, seed = 1): Simulation {
  const s = resolveSettings(forces, display);
  const x = new Simulation(s.forces, s.display, seeded(seed));
  x.sync(input);
  return x;
}

/** Hub `h` with a tree below it, long labels and two edge types. */
function tree(): SimInput {
  const nodes = [{ id: 'h', labelWidth: nodeLabelWidth('Hub requirement') }];
  const links: SimInput['links'] = [];
  for (let i = 0; i < 9; i++) {
    nodes.push({ id: `n${i}`, labelWidth: nodeLabelWidth(`Some node label ${i}`) });
    links.push({ source: i < 3 ? 'h' : `n${i - 3}`, target: `n${i}`, type: i % 2 ? 'requirement' : 'feature' });
  }
  return { nodes, links };
}

function segmentDistance(p: { x: number; y: number }, s: { x: number; y: number }, t: { x: number; y: number }): number {
  const ex = t.x - s.x;
  const ey = t.y - s.y;
  const u = Math.max(0, Math.min(1, ((p.x - s.x) * ex + (p.y - s.y) * ey) / (ex * ex + ey * ey)));
  return Math.hypot(p.x - s.x - u * ex, p.y - s.y - u * ey);
}

describe('layout header options', () => {
  // @lat: [[tests/graph-ui#Layout options parsed]]
  // @tg: verifies:: [[openspec:graph-ui#Forces, pinning and controls#Initial values from the header]]
  it('parses forces and display with validation and keeps the valid entries', () => {
    expect(parseForces('center=0.5, repel=12; distance=200, pinOnDrag=off, edgeRepel=0.8')).toEqual({
      value: { center: 0.5, repel: 12, distance: 200, pinOnDrag: false, edgeRepel: 0.8 },
      errors: [],
    });
    const bad = parseDisplay('arrows=false, hide=requirement|feature, fade=2, bogus=1, nodeSize');
    expect(bad.value).toEqual({ arrows: false, hide: ['requirement', 'feature'] });
    expect(bad.errors).toEqual([
      "Invalid fade '2' (0-1)",
      "Unknown display setting 'bogus' (expected arrows, edgeLabels, fade, nodeSize, linkSize, hide)",
      "Expected name=value in 'display' but found 'nodeSize'",
    ]);
    expect(parseForces('labelRepel=2').errors).toEqual(["Invalid labelRepel '2' (0-1)"]);
    expect(parseForces('pinOnDrag=maybe').errors).toEqual(["Invalid pinOnDrag 'maybe' (expected true or false)"]);
  });

  // @lat: [[tests/graph-ui#Pin and controls options]]
  // @tg: verifies:: [[openspec:graph-ui#Forces, pinning and controls#Initial values from the header]]
  it('parses pin and controls', () => {
    expect(parsePin('self')).toEqual(['self']);
    expect(parsePin('none')).toEqual([]);
    expect(parsePin('SELF, [[Note A]] | Note B')).toEqual(['self', 'Note A', 'Note B']);
    expect(parseControls('Open')).toBe('open');
    expect(parseControls('hide')).toBe('hide');
    expect(parseControls('sideways')).toBeNull();
  });

  // @lat: [[tests/graph-ui#Settings defaults and round trip]]
  // @tg: verifies:: [[openspec:graph-ui#Forces, pinning and controls#Default settings]]
  it('has the documented defaults and formats settings the header can read back', () => {
    expect(DEFAULT_FORCES).toEqual({ center: 0.3, repel: 19.7, link: 0.68, distance: 235, edgeRepel: 0.44, labelRepel: 0.83, pinOnDrag: true });
    expect(DEFAULT_DISPLAY).toEqual({ arrows: true, edgeLabels: true, fade: 0.12, nodeSize: 0.75, linkSize: 0.5, hide: [] });
    const s = resolveSettings({ repel: 3 }, { hide: ['a', 'b'], arrows: false });
    const [forces, display] = formatLayoutOptions(s).split('\n').map((l) => l.replace(/^\w+:\s*/, ''));
    expect(parseForces(forces!)).toEqual({ value: s.forces, errors: [] });
    expect(parseDisplay(display!)).toEqual({ value: s.display, errors: [] });
    // Resolving never shares the hide array with the defaults.
    s.display.hide.push('c');
    expect(DEFAULT_DISPLAY.hide).toEqual([]);
  });
});

describe('force simulation', () => {
  // @lat: [[tests/graph-ui#Pins hold and centre at origin]]
  // @tg: verifies:: [[openspec:graph-ui#Forces, pinning and controls#Pinned nodes stay put]]
  it('keeps pinned nodes fixed, puts the first at the origin and spreads the rest around it', () => {
    const s = sim(tree(), { distance: 200 });
    s.autoPin(['h']);
    s.warmUp();
    const h = s.nodes.get('h')!;
    expect([h.x, h.y]).toEqual([0, 0]);
    // A user-pinned node does not move while the others settle.
    const n0 = s.nodes.get('n0')!;
    n0.pinned = true;
    n0.x = 300;
    n0.y = 40;
    s.reheat(1);
    for (let i = 0; i < 100; i++) s.tick();
    expect([n0.x, n0.y]).toEqual([300, 40]);
    expect([h.x, h.y]).toEqual([0, 0]);
    const reach = [...s.nodes.values()].filter((n) => !n.pinned).map((n) => Math.hypot(n.x, n.y));
    expect(Math.max(...reach)).toBeLessThan(200 * 4);
    // A leaf settles near its link distance from the pinned neighbour.
    const leaf = s.nodes.get('n6')!;
    expect(Math.hypot(leaf.x - s.nodes.get('n3')!.x, leaf.y - s.nodes.get('n3')!.y)).toBeGreaterThan(100);
  });

  // @lat: [[tests/graph-ui#Auto pins applied once]]
  // @tg: verifies:: [[openspec:graph-ui#Forces, pinning and controls#Pinned nodes stay put]]
  it('places extra pins on a ring and does not re-pin the same list after the user unpins', () => {
    const s = sim(tree());
    s.autoPin(['h', 'n0', 'n1']);
    const ring = ['n0', 'n1'].map((id) => Math.hypot(s.nodes.get(id)!.x, s.nodes.get(id)!.y));
    expect(ring[0]).toBeCloseTo(DEFAULT_FORCES.distance * 1.5);
    expect(ring[1]).toBeCloseTo(DEFAULT_FORCES.distance * 1.5);
    for (const n of s.all) n.pinned = false;
    s.autoPin(['h', 'n0', 'n1']);
    expect(s.all.some((n) => n.pinned)).toBe(false);
    s.autoPin(['n3']);
    expect(s.nodes.get('n3')!.pinned).toBe(true);
    // Ids that are not in the graph are ignored.
    s.autoPin(['missing']);
    expect(s.nodes.get('n3')!.pinned).toBe(true);
  });

  // @lat: [[tests/graph-ui#Relayout keeps positions]]
  // @tg: verifies:: [[openspec:graph-ui#Forces, pinning and controls#Relayout keeps nodes in place]]
  it('keeps positions and pins of existing nodes when the graph grows, and flags a new graph as fresh', () => {
    const s = sim(tree());
    s.autoPin(['h']);
    s.warmUp();
    const before = new Map([...s.nodes].map(([id, n]) => [id, [n.x, n.y]]));
    const grown = tree();
    grown.nodes.push({ id: 'extra', labelWidth: 0 });
    grown.links.push({ source: 'n0', target: 'extra', type: 'feature' });
    expect(s.sync(grown).fresh).toBe(false);
    for (const [id, p] of before) expect([s.nodes.get(id)!.x, s.nodes.get(id)!.y]).toEqual(p);
    expect(s.nodes.get('h')!.pinned).toBe(true);
    const extra = s.nodes.get('extra')!;
    expect(Math.hypot(extra.x - s.nodes.get('n0')!.x, extra.y - s.nodes.get('n0')!.y)).toBeLessThan(DEFAULT_FORCES.distance);
    expect(s.sync({ nodes: Array.from({ length: 12 }, (_, i) => ({ id: `z${i}`, labelWidth: 0 })), links: [] }).fresh).toBe(true);
  });

  // @lat: [[tests/graph-ui#Node lying on an edge is pushed off]]
  // @tg: verifies:: [[openspec:graph-ui#Forces, pinning and controls#Edges repel nodes]]
  it('pushes a node that lies on an edge off the edge line', () => {
    const input: SimInput = {
      nodes: ['a', 'b', 'c'].map((id) => ({ id, labelWidth: 0 })),
      links: [{ source: 'a', target: 'b', type: 't' }],
    };
    const run = (edgeRepel: number) => {
      const s = sim(input, { edgeRepel, repel: 0, center: 0, link: 0, labelRepel: 0 });
      const [a, b, c] = ['a', 'b', 'c'].map((id) => s.nodes.get(id)!);
      a!.x = -100; a!.y = 0; b!.x = 100; b!.y = 0; c!.x = 10; c!.y = 0;
      a!.pinned = true;
      b!.pinned = true;
      s.reheat(1);
      for (let i = 0; i < 60; i++) s.tick();
      return segmentDistance(c!, a!, b!);
    };
    expect(run(0)).toBeLessThan(1);
    expect(run(1)).toBeGreaterThan(20);
  });

  // @lat: [[tests/graph-ui#Labels pushed apart]]
  // @tg: verifies:: [[openspec:graph-ui#Forces, pinning and controls#Labels repel each other]]
  it('leaves fewer overlapping labels with label repulsion on', () => {
    const nodes = [{ id: 'h', labelWidth: nodeLabelWidth('Hub requirement') }];
    const links: SimInput['links'] = [];
    for (let i = 0; i < 12; i++) {
      nodes.push({ id: `n${i}`, labelWidth: nodeLabelWidth(`A fairly long node label ${i}`) });
      links.push({ source: 'h', target: `n${i}`, type: 'requirement' });
      if (i > 0) links.push({ source: `n${i - 1}`, target: `n${i}`, type: 'depends_on' });
    }
    const total = (labelRepel: number) => {
      let sum = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const s = sim({ nodes, links }, { labelRepel, distance: 120 }, {}, seed);
        s.autoPin(['h']);
        s.warmUp();
        sum += s.overlappingLabels();
      }
      return sum;
    };
    expect(total(1)).toBeLessThan(total(0));
  });

  // @lat: [[tests/graph-ui#Hidden types and label sizes]]
  // @tg: verifies:: [[openspec:graph-ui#Forces, pinning and controls#Edge type visibility]]
  it('ignores the labels of hidden edge types and builds display rules from the settings', () => {
    const input: SimInput = {
      nodes: [{ id: 'a', labelWidth: 0 }, { id: 'b', labelWidth: 0 }, { id: 'c', labelWidth: 0 }, { id: 'd', labelWidth: 0 }],
      links: [{ source: 'a', target: 'b', type: 'wide-edge-label' }, { source: 'c', target: 'd', type: 'wide-edge-label' }],
    };
    const s = sim(input);
    for (const id of ['a', 'b', 'c', 'd']) Object.assign(s.nodes.get(id)!, { x: id < 'c' ? 0 : 1, y: 0 });
    expect(s.overlappingLabels()).toBe(1);
    s.display.hide = ['wide-edge-label'];
    expect(s.overlappingLabels()).toBe(0);
    s.display.hide = [];
    s.display.edgeLabels = false;
    expect(s.overlappingLabels()).toBe(0);
    expect(nodeLabelWidth('')).toBe(0);
    expect(edgeLabelWidth('x')).toBeGreaterThan(0);

    const rules = buildStylesheet(THEME, resolveSettings({}, { arrows: false, edgeLabels: false, nodeSize: 2, fade: 0.5 }).display);
    const text = JSON.stringify(rules);
    expect(rules.find((r) => r.selector === 'edge.type-hidden')?.style).toEqual({ display: 'none' });
    expect(text).toContain('"target-arrow-shape":"none"');
    expect(text).toContain('"width":48');
    expect(text).toContain('"min-zoomed-font-size":7');
    expect(rules.find((r) => r.selector === 'node.pinned')).toBeDefined();
    // Without display settings the sheet is the plain base.
    expect(buildStylesheet(THEME).some((r) => r.selector === 'node.pinned')).toBe(false);
  });

  // @lat: [[tests/graph-ui#Fit centres on origin]]
  // @tg: verifies:: [[openspec:graph-ui#Forces, pinning and controls#Pinned nodes stay put]]
  it('fits the view symmetrically around the origin', () => {
    expect(fitAroundOrigin([], 600, 400)).toBeNull();
    expect(fitAroundOrigin([{ x: 1, y: 1 }], 0, 400)).toBeNull();
    const v = fitAroundOrigin([{ x: 0, y: 0 }, { x: 500, y: -100 }], 600, 400)!;
    expect(v.pan).toEqual({ x: 300, y: 200 });
    expect(v.zoom).toBeCloseTo(300 / 530);
    expect(fitAroundOrigin([{ x: 1e6, y: 0 }], 600, 400)!.zoom).toBe(0.1);
  });
});
