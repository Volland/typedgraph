import type { Annotation } from '../code/annotations.js';
import { isSpecTarget, type SpecIndex, type SpecRequirement, type SpecScenario } from './index.js';

/** Where an annotation edge to a requirement or scenario was written. */
export interface TraceLink {
  type: string;
  file: string;
  line: number;
  /** `Class#method` or a top-level name when the annotation sits on a declaration. */
  symbol: string | null;
  /** The test name when the annotation sits on a test call. */
  test: string | null;
}

export interface ScenarioTrace {
  scenario: SpecScenario;
  verifiedBy: TraceLink[];
}

export interface RequirementTrace {
  requirement: SpecRequirement;
  implementedBy: TraceLink[];
  /** `verifies` edges to the requirement itself. */
  verifiedBy: TraceLink[];
  /** Any other edge type to the requirement or its scenarios. */
  other: TraceLink[];
  scenarios: ScenarioTrace[];
  /** lat.md files whose `openspec:` or `specs:` frontmatter names the requirement or its group. */
  documentedIn: string[];
  implemented: boolean;
  verified: boolean;
  documented: boolean;
}

export interface TraceDoc {
  /** Project-relative lattice file. */
  file: string;
  /** Frontmatter entries: `openspec:` ones as written and `specs:` ones with their scheme. */
  openspec: string[];
}

/**
 * The traceability matrix: for every requirement, the annotations that
 * implement or verify it and the lattice files that explain it. A requirement
 * is implemented when an `implements` edge reaches it or one of its scenarios,
 * and verified when every scenario has a `verifies` edge (or, with no
 * scenarios, the requirement has one). Decision records need no test, so they
 * count as verified. Negative edges are ignored.
 */
// @tg: implements:: [[cli#Requirement trace]] {since: "2026-10-08"}
// @lat: [[cli#Requirement trace]]
// @tg: implements:: [[openspec:tg-trace#Trace command]]
// @tg: implements:: [[openspec:spec-frameworks#Trace across frameworks]]
export function traceRequirements(specs: SpecIndex, annotations: Annotation[], docs: TraceDoc[]): RequirementTrace[] {
  const rows = new Map<string, RequirementTrace>();
  const scenRows = new Map<string, ScenarioTrace>();
  for (const r of specs.requirements()) {
    const scenarios = r.scenarios.map((scenario) => ({ scenario, verifiedBy: [] as TraceLink[] }));
    for (const s of scenarios) scenRows.set(s.scenario.id, s);
    rows.set(r.id, { requirement: r, implementedBy: [], verifiedBy: [], other: [], scenarios, documentedIn: [], implemented: false, verified: false, documented: false });
  }
  for (const a of annotations) {
    if (a.kind !== 'tg') continue;
    for (const e of a.edges) {
      if (e.sign < 0 || !isSpecTarget(e.target)) continue;
      const res = specs.resolve(e.target);
      if (res.kind === 'missing') continue;
      const row = rows.get(res.requirement.id)!;
      const link: TraceLink = { type: e.type, file: a.file, line: a.line, symbol: a.source.kind === 'symbol' ? a.source.symbolPath : null, test: typeof e.props.test === 'string' ? e.props.test : null };
      if (e.type === 'implements') row.implementedBy.push(link);
      else if (e.type === 'verifies' && res.kind === 'scenario') scenRows.get(res.scenario.id)!.verifiedBy.push(link);
      else if (e.type === 'verifies') row.verifiedBy.push(link);
      else row.other.push(link);
    }
  }
  for (const d of docs) {
    for (const entry of d.openspec) {
      for (const r of specs.entries(entry)) {
        const row = rows.get(r.id)!;
        if (!row.documentedIn.includes(d.file)) row.documentedIn.push(d.file);
      }
    }
  }
  for (const row of rows.values()) {
    row.implemented = row.implementedBy.length > 0;
    row.verified = row.requirement.kind === 'decision' || (row.scenarios.length ? row.scenarios.every((s) => s.verifiedBy.length > 0) : row.verifiedBy.length > 0);
    row.documented = row.documentedIn.length > 0;
  }
  return [...rows.values()];
}
