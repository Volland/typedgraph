import type { DisplaySettings, ForceSettings } from './layout-options';

export interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Held in place: not moved by any force. */
  pinned: boolean;
  /** Being dragged by the pointer; the pointer owns the position. */
  dragging: boolean;
  /** Distinct neighbours, at least 1. */
  deg: number;
  /** Width of the node label box in model pixels; 0 when it has none. */
  labelWidth: number;
}

export interface SimLink {
  source: SimNode;
  target: SimNode;
  /** Edge type as displayed. */
  type: string;
  /** Width of the edge label box; 0 when it has none. */
  labelWidth: number;
}

/** What the host knows about the graph, in the shape `sync` consumes. */
export interface SimInput {
  nodes: { id: string; labelWidth: number }[];
  links: { source: string; target: string; type: string }[];
}

/** A label box: node labels hang under the node, edge labels sit at the edge midpoint. */
interface LabelBox {
  l: number;
  r: number;
  t: number;
  b: number;
  /** Nodes that move when the label is pushed: one for a node label, both ends for an edge label. */
  o1: SimNode;
  o2: SimNode | null;
}

const TAU = Math.PI * 2;
const NODE_LABEL_CHAR = 5.6;
const EDGE_LABEL_CHAR = 4.8;

/** Width of a node label box; capped so one long title does not dominate. */
export function nodeLabelWidth(text: string): number {
  return text ? Math.min(text.length, 40) * NODE_LABEL_CHAR + 4 : 0;
}

export function edgeLabelWidth(type: string): number {
  return type ? type.length * EDGE_LABEL_CHAR + 4 : 0;
}

/**
 * Force simulation with pinnable nodes. Pure: it knows nothing about Cytoscape or the DOM, so hosts
 * drive it with `tick()` and copy positions out. Model space is centred on the origin, where the
 * first auto-pinned node sits.
 *
 * Forces, in the style of Obsidian's graph: a pull to the centre, node-node repulsion, link springs
 * with the d3 degree bias. On top of those, a node lying across an edge is pushed off it, and label
 * boxes that overlap are pushed apart by moving their nodes.
 */
// @lat: [[visualization#Forces and pinning]]
// @tg: implements:: [[openspec:graph-ui#Forces, pinning and controls]]
export class Simulation {
  nodes = new Map<string, SimNode>();
  links: SimLink[] = [];
  /** Remaining heat, 1 after a fresh layout; forces scale with it and the host stops ticking below 0.01. */
  alpha = 0;
  private arr: SimNode[] = [];
  private lastAuto = '';

  constructor(
    public forces: ForceSettings,
    public display: DisplaySettings,
    private readonly random: () => number = Math.random,
  ) {}

  get all(): readonly SimNode[] {
    return this.arr;
  }

  /**
   * Rebuild nodes and links from the host's graph, keeping position, velocity and pin of nodes that
   * remain. New nodes start next to an existing neighbour, or scattered if they have none.
   * @returns `fresh` when most nodes are new (first display, or a different graph), so the host should
   * settle the layout with `warmUp` and fit the view instead of animating.
   */
  sync(input: SimInput): { fresh: boolean } {
    const old = this.nodes;
    const next = new Map<string, SimNode>();
    const created: SimNode[] = [];
    for (const n of input.nodes) {
      let s = old.get(n.id);
      if (!s) {
        s = { id: n.id, x: 0, y: 0, vx: 0, vy: 0, pinned: false, dragging: false, deg: 0, labelWidth: 0 };
        created.push(s);
      }
      s.labelWidth = n.labelWidth;
      next.set(n.id, s);
    }
    const fresh = old.size === 0 || created.length > old.size / 2;

    const dist = this.forces.distance;
    const R = dist * Math.max(1, Math.sqrt(created.length) / 2);
    const neighbours = new Map<string, string[]>();
    for (const l of input.links) {
      (neighbours.get(l.source) ?? neighbours.set(l.source, []).get(l.source)!).push(l.target);
      (neighbours.get(l.target) ?? neighbours.set(l.target, []).get(l.target)!).push(l.source);
    }
    for (const s of created) {
      const nb = neighbours.get(s.id)?.find((id) => old.has(id));
      const q = nb ? old.get(nb) : undefined;
      if (q) {
        s.x = q.x + (this.random() - 0.5) * dist;
        s.y = q.y + (this.random() - 0.5) * dist;
      } else {
        const a = this.random() * TAU;
        const d = R * Math.sqrt(this.random());
        s.x = Math.cos(a) * d;
        s.y = Math.sin(a) * d;
      }
    }

    for (const s of next.values()) s.deg = 0;
    this.links = [];
    const seen = new Set<string>();
    for (const l of input.links) {
      const a = next.get(l.source);
      const b = next.get(l.target);
      if (!a || !b || a === b) continue;
      const key = l.source < l.target ? `${l.source}\n${l.target}` : `${l.target}\n${l.source}`;
      if (seen.has(key)) continue;
      seen.add(key);
      a.deg++;
      b.deg++;
      this.links.push({ source: a, target: b, type: l.type, labelWidth: edgeLabelWidth(l.type) });
    }
    for (const s of next.values()) if (!s.deg) s.deg = 1;
    this.nodes = next;
    this.arr = [...next.values()];
    return { fresh };
  }

  /**
   * Pin these nodes: the first at the origin, the others on a ring around it. Does nothing while the
   * list is the same as last time, so a user's later unpinning sticks across refreshes.
   */
  autoPin(ids: string[]): void {
    const present = ids.filter((id) => this.nodes.has(id));
    const key = present.join('\n');
    if (key === this.lastAuto) return;
    this.lastAuto = key;
    present.forEach((id, i) => {
      const s = this.nodes.get(id)!;
      const a = (TAU * (i - 1)) / Math.max(1, present.length - 1);
      s.pinned = true;
      s.vx = s.vy = 0;
      s.x = i ? Math.cos(a) * this.forces.distance * 1.5 : 0;
      s.y = i ? Math.sin(a) * this.forces.distance * 1.5 : 0;
    });
  }

  reheat(alpha: number): void {
    this.alpha = Math.max(this.alpha, alpha);
  }

  /** Run the whole cool-down at once, then tidy labels; used for the first display of a graph. */
  warmUp(): void {
    this.alpha = 1;
    const steps = this.arr.length < 250 ? 150 : 60;
    for (let i = 0; i < steps; i++) this.step();
    this.alpha = 0;
    this.relaxLabels();
  }

  /** One animation frame. Returns false once the simulation has cooled and the host should stop. */
  tick(): boolean {
    this.step();
    if (this.alpha > 0.01) return true;
    this.relaxLabels();
    return false;
  }

  step(): void {
    const L = this.forces;
    const al = this.alpha;
    const arr = this.arr;
    const n = arr.length;
    const kc = L.center * 0.05 * al;
    for (const s of arr) {
      s.vx -= s.x * kc;
      s.vy -= s.y * kc;
    }
    const kr = L.repel * 15 * al;
    if (kr > 0) {
      for (let i = 0; i < n; i++) {
        const p = arr[i]!;
        for (let j = i + 1; j < n; j++) {
          const q = arr[j]!;
          let dx = q.x - p.x;
          let dy = q.y - p.y;
          let d2 = dx * dx + dy * dy;
          if (d2 > 360000) continue;
          if (d2 < 400) {
            if (d2 === 0) {
              dx = this.random() - 0.5;
              dy = this.random() - 0.5;
            }
            d2 = 400;
          }
          const w = kr / d2;
          p.vx -= dx * w;
          p.vy -= dy * w;
          q.vx += dx * w;
          q.vy += dy * w;
        }
      }
    }
    for (const l of this.links) {
      const s = l.source;
      const t = l.target;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (((d - L.distance) / d) * al * L.link * 0.5) / Math.min(s.deg, t.deg);
      const b = s.deg / (s.deg + t.deg);
      t.vx -= dx * f * b;
      t.vy -= dy * f * b;
      s.vx += dx * f * (1 - b);
      s.vy += dy * f * (1 - b);
    }
    this.edgeRepel(al);
    for (const s of arr) {
      if (s.pinned || s.dragging) {
        s.vx = s.vy = 0;
        continue;
      }
      s.vx = Math.max(-60, Math.min(60, s.vx * 0.6));
      s.vy = Math.max(-60, Math.min(60, s.vy * 0.6));
      s.x += s.vx;
      s.y += s.vy;
    }
    this.labelRepel(al);
    this.alpha *= 0.977;
  }

  /** A node lying on an edge is pushed off the edge line; the edge's end nodes take the opposite push. */
  private edgeRepel(al: number): void {
    const ke = this.forces.edgeRepel * al * 0.3;
    if (ke <= 0) return;
    const rg = Math.max(20, Math.min(70, 24 * this.display.nodeSize + 14));
    const rg2 = rg * rg;
    for (const l of this.links) {
      const s = l.source;
      const t = l.target;
      const ex = t.x - s.x;
      const ey = t.y - s.y;
      const e2 = ex * ex + ey * ey;
      if (e2 < 1) continue;
      const x0 = Math.min(s.x, t.x) - rg;
      const x1 = Math.max(s.x, t.x) + rg;
      const y0 = Math.min(s.y, t.y) - rg;
      const y1 = Math.max(s.y, t.y) + rg;
      for (const p of this.arr) {
        if (p === s || p === t || p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
        const u = ((p.x - s.x) * ex + (p.y - s.y) * ey) / e2;
        if (u <= 0 || u >= 1) continue;
        let dx = p.x - (s.x + u * ex);
        let dy = p.y - (s.y + u * ey);
        const d2 = dx * dx + dy * dy;
        if (d2 >= rg2) continue;
        let d = Math.sqrt(d2);
        if (d < 1) {
          const el = Math.sqrt(e2);
          dx = -ey / el;
          dy = ex / el;
          d = 0;
        } else {
          dx /= d;
          dy /= d;
        }
        const f = (rg - d) * ke;
        p.vx += dx * f;
        p.vy += dy * f;
        s.vx -= dx * f * (1 - u);
        s.vy -= dy * f * (1 - u);
        t.vx -= dx * f * u;
        t.vy -= dy * f * u;
      }
    }
  }

  /**
   * Overlapping label boxes push each other apart by moving their nodes. This is a position
   * correction after integration (like a collision constraint), not a velocity, so the springs do not
   * drown it out. Sweeps along x to skip far pairs.
   */
  private labelRepel(al: number): void {
    const k = this.forces.labelRepel * Math.max(0.4, Math.min(1, al * 5)) * 0.6;
    if (k <= 0) return;
    const boxes = this.labelBoxes();
    const fixed = (s: SimNode) => s.pinned || s.dragging;
    const movable = (b: LabelBox) => !(fixed(b.o1) && (!b.o2 || fixed(b.o2)));
    // A node label moves its node; an edge label sits at the midpoint, so its free end nodes move 2/n times as far.
    const shift = (b: LabelBox, x: number, y: number) => {
      const n = (fixed(b.o1) ? 0 : 1) + (b.o2 && !fixed(b.o2) ? 1 : 0);
      const m = b.o2 ? 2 / n : 1;
      for (const o of [b.o1, b.o2]) {
        if (o && !fixed(o)) {
          o.x += x * m;
          o.y += y * m;
        }
      }
    };
    boxes.sort((a, b) => a.l - b.l);
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i]!;
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j]!;
        if (b.l >= a.r) break;
        const ox = Math.min(a.r, b.r) - b.l;
        const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (oy <= 0) continue;
        if (a.o1 === b.o1 && a.o2 === b.o2) continue;
        const ma = movable(a);
        const mb = movable(b);
        if (!ma && !mb) continue;
        let px = 0;
        let py = 0;
        if (ox < oy) px = (a.l + a.r < b.l + b.r ? -1 : 1) * ox * k;
        else py = (a.t + a.b < b.t + b.b ? -1 : 1) * oy * k;
        const sa = ma ? (mb ? 0.5 : 1) : 0;
        const sb = mb ? (ma ? 0.5 : 1) : 0;
        shift(a, px * sa, py * sa);
        shift(b, -px * sb, -py * sb);
      }
    }
  }

  private labelBoxes(): LabelBox[] {
    const ns = this.display.nodeSize;
    const hide = new Set(this.display.hide);
    const boxes: LabelBox[] = [];
    for (const s of this.arr) {
      if (!s.labelWidth) continue;
      const cy = s.y + 12 * ns + 4 + 6.5;
      boxes.push({ l: s.x - s.labelWidth / 2, r: s.x + s.labelWidth / 2, t: cy - 6.5, b: cy + 6.5, o1: s, o2: null });
    }
    if (this.display.edgeLabels) {
      for (const l of this.links) {
        if (!l.labelWidth || hide.has(l.type)) continue;
        const cx = (l.source.x + l.target.x) / 2;
        const cy = (l.source.y + l.target.y) / 2;
        boxes.push({ l: cx - l.labelWidth / 2, r: cx + l.labelWidth / 2, t: cy - 5.5, b: cy + 5.5, o1: l.source, o2: l.target });
      }
    }
    return boxes;
  }

  /** Final label clean-up once the simulation has cooled down. */
  relaxLabels(): void {
    for (let i = 0; i < 25; i++) this.labelRepel(1);
  }

  /** Number of label box pairs that currently overlap; used by tests and diagnostics. */
  overlappingLabels(): number {
    const boxes = this.labelBoxes();
    let c = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if (Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0) c++;
      }
    }
    return c;
  }
}

/** Zoom and pan that fit the graph around the origin, where the centre node sits. */
// @tg: implements:: [[openspec:graph-ui#Forces, pinning and controls]]
export function fitAroundOrigin(nodes: readonly { x: number; y: number }[], width: number, height: number): { zoom: number; pan: { x: number; y: number } } | null {
  if (!width || !height || nodes.length === 0) return null;
  let mx = 40;
  let my = 40;
  for (const s of nodes) {
    mx = Math.max(mx, Math.abs(s.x) + 30);
    my = Math.max(my, Math.abs(s.y) + 50);
  }
  return { zoom: Math.max(0.1, Math.min(1.2, width / 2 / mx, height / 2 / my)), pan: { x: width / 2, y: height / 2 } };
}
