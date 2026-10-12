import type { DisplaySettings } from './layout-options';
import { readEdgeStyle, readNodeStyle, type Diagnostic, type EdgeStyle, type NodeStyle } from '@obsigraph/core';

export interface Theme {
  text: string;
  muted: string;
  background: string;
  /** Colour for pinned-node borders; a warm default when the host has none. */
  accent?: string;
}

export interface StyleRule {
  selector: string;
  style: Record<string, string | number>;
}

/**
 * Cytoscape style sheet. Per-element colors, shapes, labels, icons and line
 * styles come from element data set by the styler, so the same sheet serves
 * every block and the Graph view. Negative edges always get a tee arrow.
 * With `display`, sizes, arrows, labels, the label fade zoom, hidden edge types and the pinned-node
 * border are layered on top; without it the sheet is the plain base.
 */
// @tg: implements:: [[visualization#Styling]] {since: "2026-10-04"}
// @lat: [[visualization#Styling]]
// @tg: implements:: [[openspec:graph-ui#Host-independent rendering]]
// @tg: implements:: [[openspec:graph-view#Edge presentation]]
export function buildStylesheet(theme: Theme, display?: DisplaySettings): StyleRule[] {
  const base: StyleRule[] = [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        color: theme.text,
        'font-size': 11,
        'text-valign': 'bottom',
        'text-margin-y': 4,
        'background-color': 'data(color)',
        shape: 'data(shape)',
        width: 24,
        height: 24,
      },
    },
    {
      selector: 'node[?icon]',
      style: { 'background-image': 'data(icon)', 'background-fit': 'none', 'background-width': '62%', 'background-height': '62%', 'background-clip': 'none' },
    },
    {
      selector: 'edge',
      style: {
        label: 'data(type)',
        'font-size': 9,
        color: theme.text,
        'text-rotation': 'autorotate',
        'text-background-opacity': 0.7,
        'text-background-color': theme.background,
        'text-background-padding': 1,
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        width: 1.5,
        'line-color': 'data(color)',
        'target-arrow-color': 'data(color)',
        'line-style': 'data(line)',
      },
    },
    { selector: 'edge.negative', style: { 'target-arrow-shape': 'tee' } },
    { selector: 'node.stub', style: { 'background-opacity': 0.15, 'border-width': 1.5, 'border-style': 'dashed', 'border-color': theme.muted } },
    { selector: ':selected', style: { 'overlay-opacity': 0.15, 'overlay-color': '#4e79a7' } },
  ];
  return display ? [...base, ...displayRules(theme, display)] : base;
}

/** Style overrides for the display settings; `edge.type-hidden` is toggled by the renderer. */
// @tg: implements:: [[openspec:graph-ui#Forces, pinning and controls]]
function displayRules(theme: Theme, d: DisplaySettings): StyleRule[] {
  const fade = d.fade * 14;
  const rules: StyleRule[] = [
    { selector: 'node', style: { width: 24 * d.nodeSize, height: 24 * d.nodeSize, 'min-zoomed-font-size': fade } },
    { selector: 'edge', style: { width: 1.5 * d.linkSize, 'min-zoomed-font-size': fade } },
  ];
  if (!d.arrows) rules.push({ selector: 'edge', style: { 'target-arrow-shape': 'none' } }, { selector: 'edge.negative', style: { 'target-arrow-shape': 'none' } });
  if (!d.edgeLabels) rules.push({ selector: 'edge', style: { label: '' } });
  rules.push(
    { selector: 'edge.type-hidden', style: { display: 'none' } },
    { selector: 'node.pinned', style: { 'border-width': 2, 'border-style': 'solid', 'border-color': theme.accent ?? '#e0a030' } },
  );
  return rules;
}

function parseStyleMap<T>(
  json: string,
  read: (raw: unknown, ctx: { source: string; path: null; subject: string; diagnostics: Diagnostic[] }) => T,
  what: string,
): Record<string, T> | string {
  let raw: unknown;
  try {
    raw = JSON.parse(json || '{}');
  } catch (e) {
    return `Invalid JSON: ${(e as Error).message}`;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return `Expected an object keyed by ${what}`;
  const out: Record<string, T> = {};
  const diagnostics: Diagnostic[] = [];
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return `Style for '${k}' must be an object`;
    out[k] = read(v, { source: 'settings', path: null, subject: `${what} ${k}`, diagnostics });
  }
  return diagnostics.length > 0 ? diagnostics.map((d) => d.message).join('\n') : out;
}

/** Validate node styles entered in settings; returns an error message or the styles. */
export function parseTypeStyles(json: string): Record<string, NodeStyle> | string {
  return parseStyleMap(json, readNodeStyle, 'type label');
}

/** Validate edge styles entered in settings; returns an error message or the styles. */
export function parseEdgeStyles(json: string): Record<string, EdgeStyle> | string {
  return parseStyleMap(json, readEdgeStyle, 'edge type');
}
