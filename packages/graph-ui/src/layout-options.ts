/** Force simulation settings, named after Obsidian's graph "Forces" section plus two repulsions of our own. */
export interface ForceSettings {
  /** Pull towards the canvas centre, 0-1. */
  center: number;
  /** Node-node repulsion, 0-20. */
  repel: number;
  /** Spring strength along links, 0-1. */
  link: number;
  /** Rest length of a link in model pixels, 30-500. */
  distance: number;
  /** Push of an edge on nodes lying across it, 0-1. */
  edgeRepel: number;
  /** Push between overlapping node and edge labels, 0-1. */
  labelRepel: number;
  /** Dragging a node pins it where it is dropped. */
  pinOnDrag: boolean;
}

/** What is drawn, and how large. */
export interface DisplaySettings {
  arrows: boolean;
  edgeLabels: boolean;
  /** Labels vanish below a zoom level that grows with this, 0-1; 0 keeps them always. */
  fade: number;
  nodeSize: number;
  linkSize: number;
  /** Edge types (as shown, so negative ones carry a leading minus) that are not drawn. */
  hide: string[];
}

export interface LayoutSettings {
  forces: ForceSettings;
  display: DisplaySettings;
}

export type ControlsMode = 'show' | 'open' | 'hide';

export const DEFAULT_FORCES: ForceSettings = { center: 0.3, repel: 19.7, link: 0.68, distance: 235, edgeRepel: 0.44, labelRepel: 0.83, pinOnDrag: true };
export const DEFAULT_DISPLAY: DisplaySettings = { arrows: true, edgeLabels: true, fade: 0.12, nodeSize: 0.75, linkSize: 0.5, hide: [] };

export const FORCE_RANGES = {
  center: [0, 1],
  repel: [0, 20],
  link: [0, 1],
  distance: [30, 500],
  edgeRepel: [0, 1],
  labelRepel: [0, 1],
} as const;

export const DISPLAY_RANGES = {
  fade: [0, 1],
  nodeSize: [0.2, 3],
  linkSize: [0.2, 4],
} as const;

type Kind = 'number' | 'boolean' | 'list';
const FORCE_SPEC: Record<string, { name: keyof ForceSettings; kind: Kind }> = {
  center: { name: 'center', kind: 'number' },
  repel: { name: 'repel', kind: 'number' },
  link: { name: 'link', kind: 'number' },
  distance: { name: 'distance', kind: 'number' },
  edgerepel: { name: 'edgeRepel', kind: 'number' },
  labelrepel: { name: 'labelRepel', kind: 'number' },
  pinondrag: { name: 'pinOnDrag', kind: 'boolean' },
};
const DISPLAY_SPEC: Record<string, { name: keyof DisplaySettings; kind: Kind }> = {
  arrows: { name: 'arrows', kind: 'boolean' },
  edgelabels: { name: 'edgeLabels', kind: 'boolean' },
  fade: { name: 'fade', kind: 'number' },
  nodesize: { name: 'nodeSize', kind: 'number' },
  linksize: { name: 'linkSize', kind: 'number' },
  hide: { name: 'hide', kind: 'list' },
};

export interface OptionResult<T> {
  value: T;
  errors: string[];
}

/** Parse `center=0.5, repel=12` (also `;`-separated) for the `forces:` header line; valid entries are kept next to the errors. */
// @lat: [[visualization#Forces and pinning]]
// @tg: implements:: [[openspec:graph-ui#Forces, pinning and controls]]
export function parseForces(value: string): OptionResult<Partial<ForceSettings>> {
  return parseSettings('forces', value, FORCE_SPEC, FORCE_RANGES as Record<string, readonly [number, number]>) as OptionResult<Partial<ForceSettings>>;
}

/** Parse the `display:` header line; `hide=a|b` lists edge types. */
// @tg: implements:: [[openspec:graph-ui#Forces, pinning and controls]]
export function parseDisplay(value: string): OptionResult<Partial<DisplaySettings>> {
  return parseSettings('display', value, DISPLAY_SPEC, DISPLAY_RANGES as Record<string, readonly [number, number]>) as OptionResult<Partial<DisplaySettings>>;
}

function parseSettings(
  key: string,
  value: string,
  spec: Record<string, { name: string; kind: Kind }>,
  ranges: Record<string, readonly [number, number]>,
): OptionResult<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const errors: string[] = [];
  const names = Object.values(spec).map((s) => s.name);
  for (const part of value.split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq <= 0) {
      errors.push(`Expected name=value in '${key}' but found '${part}'`);
      continue;
    }
    const raw = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    const entry = spec[raw.toLowerCase()];
    if (!entry) {
      errors.push(`Unknown ${key} setting '${raw}' (expected ${names.join(', ')})`);
      continue;
    }
    if (entry.kind === 'number') {
      const x = Number(v);
      const [lo, hi] = ranges[entry.name]!;
      if (Number.isFinite(x) && v !== '' && x >= lo && x <= hi) out[entry.name] = x;
      else errors.push(`Invalid ${entry.name} '${v}' (${lo}-${hi})`);
    } else if (entry.kind === 'boolean') {
      if (/^(true|on|yes|show|1)$/i.test(v)) out[entry.name] = true;
      else if (/^(false|off|no|hide|0)$/i.test(v)) out[entry.name] = false;
      else errors.push(`Invalid ${entry.name} '${v}' (expected true or false)`);
    } else {
      out[entry.name] = v.split('|').map((s) => s.trim()).filter(Boolean);
    }
  }
  return { value: out, errors };
}

/** Parse the `pin:` header line: `self`, `none`, or note names (wikilink brackets optional); `self` stays symbolic. */
// @tg: implements:: [[openspec:graph-ui#Forces, pinning and controls]]
export function parsePin(value: string): string[] {
  const list = value.split(/[,|]/).map((s) => s.trim().replace(/^\[\[|\]\]$/g, '')).filter(Boolean);
  if (list.length === 1 && list[0]!.toLowerCase() === 'none') return [];
  return list.map((s) => (s.toLowerCase() === 'self' ? 'self' : s));
}

export function parseControls(value: string): ControlsMode | null {
  const c = value.toLowerCase();
  return c === 'show' || c === 'open' || c === 'hide' ? c : null;
}

/** Complete settings from defaults overlaid with partial ones; never aliases the inputs' arrays. */
export function resolveSettings(forces?: Partial<ForceSettings>, display?: Partial<DisplaySettings>): LayoutSettings {
  const d = { ...DEFAULT_DISPLAY, ...display };
  return { forces: { ...DEFAULT_FORCES, ...forces }, display: { ...d, hide: [...d.hide] } };
}

/** The header lines that reproduce these settings, for the panel's "Copy as block options". */
// @tg: implements:: [[openspec:graph-ui#Forces, pinning and controls]]
export function formatLayoutOptions(s: LayoutSettings): string {
  const n = (x: number) => String(+x.toFixed(2));
  const f = s.forces;
  const d = s.display;
  return (
    `forces: center=${n(f.center)}, repel=${n(f.repel)}, link=${n(f.link)}, distance=${Math.round(f.distance)}, edgeRepel=${n(f.edgeRepel)}, labelRepel=${n(f.labelRepel)}, pinOnDrag=${f.pinOnDrag}\n` +
    `display: arrows=${d.arrows}, edgeLabels=${d.edgeLabels}, fade=${n(d.fade)}, nodeSize=${n(d.nodeSize)}, linkSize=${n(d.linkSize)}` +
    (d.hide.length > 0 ? `, hide=${d.hide.join('|')}` : '')
  );
}
