// Ontology gallery visuals, drawn by the plugin's own styler and renderer from the real
// ontology notes: a schema map per ontology and a step-through of a Zettelkasten.
import cytoscape from 'cytoscape';
import { parse as parseYaml } from 'yaml';
import { Graph, pathResolver, schemasFromGraph, splitFrontmatter, styleSourcesFromSchemas, type SchemaSet } from '@obsigraph/core';
import { buildStylesheet } from '../../packages/plugin/src/render/styles';
import { makeStyler } from '../../packages/plugin/src/render/styler';
import { nodeElement, type EdgeElement, type NodeElement } from '../../packages/plugin/src/render/elements';

import { STEPS } from './trail-steps';

declare const __ONTOLOGIES__: Record<string, { path: string; text: string }[]>;
/** Ontologies another one builds on, from `ontologies/requires.json`. */
declare const __REQUIRES__: Record<string, string[]>;

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const theme = () => {
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  return dark ? { text: '#e8e6f3', muted: '#8d88a8', background: '#14121f' } : { text: '#1f1b2e', muted: '#8a86a0', background: '#ffffff' };
};

/** The graph and schemas of one ontology, with the shared `core` and the ontologies it builds on, as its download has them. */
function load(id: string): { graph: Graph; set: SchemaSet } {
  const notes = [...(__ONTOLOGIES__.core ?? []), ...(__REQUIRES__[id] ?? []).flatMap((dep) => __ONTOLOGIES__[dep] ?? []), ...(__ONTOLOGIES__[id] ?? [])];
  const graph = new Graph(pathResolver(() => notes.map((n) => n.path)));
  for (const n of notes) {
    const { yaml } = splitFrontmatter(n.text);
    let fm: Record<string, unknown> | null = null;
    try {
      fm = yaml ? (parseYaml(yaml) as Record<string, unknown>) : null;
    } catch {
      fm = null;
    }
    graph.upsertNote({ path: n.path, text: n.text, frontmatter: fm });
  }
  return { graph, set: schemasFromGraph(graph, 'Types/') };
}

interface Drawn {
  cy: cytoscape.Core;
  nodes: NodeElement[];
}

function draw(host: HTMLElement, nodes: NodeElement[], edges: EdgeElement[], set: SchemaSet, opts: { loops?: boolean } = {}): Drawn {
  host.replaceChildren();
  const styler = makeStyler(styleSourcesFromSchemas(set.schemas).sources);
  const cy = cytoscape({
    container: host,
    wheelSensitivity: 0.3,
    userZoomingEnabled: false,
    style: [
      ...buildStylesheet(theme()),
      { selector: 'node', style: { 'font-size': 16, width: 38, height: 38, 'text-margin-y': 5 } },
      { selector: 'edge.soft', style: { opacity: 0.3, label: '' } },
      { selector: 'edge', style: { 'edge-text-rotation': 'none', 'text-wrap': 'wrap', 'text-max-width': '130px', 'font-size': 13, 'text-background-color': theme().background, 'text-background-opacity': 0.85, 'text-background-padding': '2px' } },
      { selector: '.hide', style: { display: 'none' } },
      { selector: 'node.fresh', style: { 'border-width': 4, 'border-color': '#7c5cff', 'z-index': 10 } },
      { selector: 'edge.fresh', style: { width: 3, 'z-index': 10 } },
      { selector: 'edge.old', style: { opacity: 0.55 } },
    ] as unknown as cytoscape.StylesheetJson,
    elements: [
      ...nodes.map((n) => ({ group: 'nodes' as const, data: { id: n.id, labels: n.labels, ...styler.node(n) } })),
      ...edges.map((e) => ({ group: 'edges' as const, data: { id: e.id, source: e.source, target: e.target, type: e.sign < 0 ? `−${e.type}` : e.type, ...styler.edge(e) }, classes: e.sign < 0 ? ['negative'] : [] })),
    ],
  });
  void opts;
  // Seeded randomness keeps the force layout identical on every visit.
  let seed = 11;
  const random = Math.random;
  Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  try {
    cy.layout({ name: 'cose', animate: false, randomize: true, padding: 30, nodeRepulsion: () => 900000, idealEdgeLength: () => 200, edgeElasticity: () => 100, nodeOverlap: 50, componentSpacing: 80, gravity: 30, numIter: 3000 } as cytoscape.LayoutOptions).run();
  } finally {
    Math.random = random;
  }
  cy.fit(undefined, 30);
  return { cy, nodes };
}

// ---- schema maps ------------------------------------------------------------------

function schemaElements(set: SchemaSet): { nodes: NodeElement[]; edges: EdgeElement[] } {
  const nodes: NodeElement[] = [...set.schemas.keys()].sort().map((t) => ({ id: t, label: t, labels: [t], stub: false, path: null, props: { title: t } }));
  // Links between the same two types are drawn as one arrow labelled with all of them.
  const pairs = new Map<string, { source: string; target: string; types: Set<string> }>();
  for (const t of set.schemas.values()) {
    for (const rule of t.edges ?? []) {
      for (const target of rule.targets ?? []) {
        if (!set.schemas.has(target)) continue;
        const k = `${t.type}|${target}|${rule.type === 'about'}`;
        const p = pairs.get(k) ?? { source: t.type, target, types: new Set<string>() };
        p.types.add(rule.type);
        pairs.set(k, p);
      }
    }
  }
  const edges: EdgeElement[] = [...pairs.entries()].map(([k, p]) => ({ id: k, source: p.source, target: p.target, type: [...p.types].join(',\n'), sign: 1 }));
  return { nodes, edges };
}

const NOTES: Record<string, string> = {
  zettelkasten: 'Notes move from fleeting to literature to permanent; sources have writers and highlights.',
  library: 'Books have authors, series and genres, and quotes point back to the book they came from.',
  code: 'Decisions are motivated by constraints, requirements are refined by scenarios, and code implements both.',
  requirements: 'Built on the code ontology: requirements are requested by stakeholders, ship in releases and are threatened by risks.',
  team: 'Built on the code ontology: members own and know decisions and decide them, and agents propose and act for people.',
  agents: 'Agents use prompts, tools and skills, read knowledge and are scored by evals.',
  okf: 'Tables feed metrics, metrics appear on dashboards, and terms and runbooks explain them.',
};

function initMaps(): void {
  const host = document.getElementById('map-canvas');
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('.map-tabs [role="tab"]')];
  if (!host || tabs.length === 0) return;
  let current = tabs[0]!.dataset.onto!;
  const render = () => {
    const { set } = load(current);
    const { nodes, edges } = schemaElements(set);
    const { cy } = draw(host, nodes, edges, set);
    cy.edges().filter((e) => e.data('type') === 'about').addClass('soft');
    const note = document.getElementById('map-note');
    if (note) note.textContent = `${set.schemas.size} types, ${set.edgeTypes.size} edge types. ${NOTES[current] ?? ''}`;
  };
  const select = (id: string) => {
    current = id;
    for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.onto === id));
    render();
  };
  for (const t of tabs) t.addEventListener('click', () => select(t.dataset.onto!));
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-map]')) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      select(a.dataset.map!);
      document.getElementById('schema-maps')?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' });
    });
  }
  render();
  window.addEventListener('obsigraph-theme', render);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
}

// ---- the Zettelkasten trail --------------------------------------------------------

function initTrail(): void {
  const host = document.getElementById('trail-canvas');
  if (!host) return;
  const { graph, set } = load('zettelkasten');
  const wanted = new Set(STEPS.flatMap((s) => s.nodes));
  const nodes = [...graph.nodes()].filter((n) => !n.stub && wanted.has(String(n.props.title))).map(nodeElement);
  const idOf = new Map(nodes.map((n) => [n.label, n.id]));
  const ids = new Set(nodes.map((n) => n.id));
  const edges: EdgeElement[] = [...graph.edges()]
    .filter((e) => ids.has(e.source) && ids.has(e.target) && e.type !== 'about')
    .map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.type, sign: e.sign }));
  const stepOfNode = new Map<string, number>();
  STEPS.forEach((s, i) => s.nodes.forEach((t) => idOf.get(t) && stepOfNode.set(idOf.get(t)!, i)));

  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  let current = 0;
  let timer: number | undefined;
  let drawn: Drawn | null = null;

  const show = (animate: boolean) => {
    if (!drawn) return;
    const { cy } = drawn;
    const upTo = (id: string) => (stepOfNode.get(id) ?? 99) <= current;
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const s = stepOfNode.get(n.id()) ?? 99;
        n.toggleClass('hide', s > current);
        n.toggleClass('fresh', s === current);
      });
      cy.edges().forEach((e) => {
        const visible = upTo(e.source().id()) && upTo(e.target().id());
        const fresh = visible && Math.max(stepOfNode.get(e.source().id()) ?? 0, stepOfNode.get(e.target().id()) ?? 0) === current;
        e.toggleClass('hide', !visible);
        e.toggleClass('fresh', fresh);
        e.toggleClass('old', visible && !fresh);
      });
    });
    const eles = cy.elements().not('.hide');
    if (animate && !reduceMotion()) cy.animate({ fit: { eles, padding: 50 }, duration: 350 });
    else cy.fit(eles, 50);
    if (cy.zoom() > 1.2) cy.zoom(1.2);
    const step = STEPS[current]!;
    $('trail-count').textContent = `Step ${current + 1} of ${STEPS.length}`;
    $('trail-title').textContent = step.title;
    $('trail-text').innerHTML = step.text;
    const labels = [...new Set(step.nodes.flatMap((t) => (idOf.get(t) ? graph.node(idOf.get(t)!)!.labels : [])))];
    const edgeTypes = [...new Set(edges.filter((e) => stepOfNode.get(e.source)! <= current && stepOfNode.get(e.target)! <= current && Math.max(stepOfNode.get(e.source)!, stepOfNode.get(e.target)!) === current).map((e) => e.type))];
    $('trail-chips').innerHTML = [...labels.map((l) => `<span class="tag">${l}</span>`), ...edgeTypes.map((t) => `<span class="tag edge">${t}</span>`)].join(' ');
    $<HTMLButtonElement>('trail-prev').disabled = current === 0;
    $<HTMLButtonElement>('trail-next').disabled = current === STEPS.length - 1;
    document.querySelectorAll<HTMLButtonElement>('#trail-dots button').forEach((b, i) => {
      b.setAttribute('aria-current', i === current ? 'step' : 'false');
    });
  };

  const go = (i: number, animate = true) => {
    current = Math.max(0, Math.min(STEPS.length - 1, i));
    show(animate);
  };
  const stop = () => {
    window.clearInterval(timer);
    timer = undefined;
    $('trail-play').textContent = '▶ Play';
  };
  const play = () => {
    if (timer) return stop();
    if (current === STEPS.length - 1) go(0);
    $('trail-play').textContent = '❚❚ Pause';
    timer = window.setInterval(() => {
      if (current >= STEPS.length - 1) return stop();
      go(current + 1);
    }, 4500);
  };

  const dots = $('trail-dots');
  STEPS.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = s.title;
    b.setAttribute('aria-label', `Step ${i + 1}: ${s.title}`);
    b.addEventListener('click', () => {
      stop();
      go(i);
    });
    dots.append(b);
  });
  $('trail-prev').addEventListener('click', () => {
    stop();
    go(current - 1);
  });
  $('trail-next').addEventListener('click', () => {
    stop();
    go(current + 1);
  });
  $('trail-play').addEventListener('click', play);

  const render = () => {
    drawn = draw(host, nodes, edges, set);
    show(false);
  };
  render();
  const redraw = () => render();
  window.addEventListener('obsigraph-theme', redraw);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
  let wasVisible = false;
  new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && !wasVisible && !reduceMotion() && current === 0) {
        wasVisible = true;
        play();
      }
    }
  }, { threshold: 0.6 }).observe(host);
}

initMaps();
initTrail();
