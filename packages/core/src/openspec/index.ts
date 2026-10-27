import { levenshtein } from '../latmd/index.js';
import { frameworkOfTarget, locateSpecFile, parseSpecFile, SPEC_FRAMEWORKS, specFramework, type SpecFrameworkId, type SpecFrameworkInfo, type SpecLocation } from './frameworks.js';

/** One OpenSpec file to index: project-relative posix path and text. */
export interface SpecFile {
  path: string;
  text: string;
  /** Framework and group, for files outside the conventional folders (an ADR folder named in `.adr-dir`); else read from the path. */
  at?: SpecLocation;
}

export interface SpecScenario {
  /** `<scheme>:<group>#<requirement>#<scenario>` with the names as written. */
  id: string;
  name: string;
  file: string;
  /** 1-based line of the `#### Scenario:` heading, criterion or numbered scenario. */
  line: number;
  /** Other names that resolve to it, such as a bare criterion number. */
  aliases?: string[];
  /** Graph labels beyond `Scenario`, such as `AcceptanceCriterion`. */
  labels?: string[];
  /** Framework facts such as the EARS pattern or the scenario text. */
  props?: Record<string, string>;
}

export interface SpecRequirement {
  /** `<scheme>:<group>#<requirement>` (or `adr:<number>`) with the names as written. */
  id: string;
  /** The OpenSpec capability, Spec Kit feature, Kiro spec or BMAD epic folder; `adr` for decision records. */
  capability: string;
  name: string;
  /** The first paragraph under the heading, normally the SHALL sentence. */
  text: string;
  file: string;
  line: number;
  /** `active` from `openspec/specs/`, `pending` from an unarchived change or a proposed record, `retired` for superseded, deprecated or rejected decisions. */
  status: 'active' | 'pending' | 'retired';
  /** The change that adds or modifies it, for pending requirements. */
  change: string | null;
  /** Active changes that remove or rename this requirement. */
  removedBy: string[];
  scenarios: SpecScenario[];
  /** Framework it was read from (default `openspec`). */
  framework?: SpecFrameworkId;
  /** `requirement`, or `decision` for decision records, which become `Decision` nodes and need no tests. */
  kind?: 'requirement' | 'decision';
  /** Graph labels beyond the base type, such as `UserStory` or `ADR`. */
  labels?: string[];
  /** Other names that resolve to it: a user story title, an ADR number without zeros, a slug. */
  aliases?: string[];
  /** Framework facts such as priority, title or the ADR status. */
  props?: Record<string, string>;
  /** Typed edges the file itself states, such as an ADR that supersedes another. */
  relations?: { type: string; target: string }[];
}

export type SpecResolution =
  | { kind: 'requirement'; requirement: SpecRequirement }
  | { kind: 'scenario'; requirement: SpecRequirement; scenario: SpecScenario }
  | { kind: 'missing'; message: string; suggestion: string | null };

export const SPEC_SCHEME = 'openspec:';

/** True for targets in a spec framework's scheme (`openspec:`, `speckit:`, `kiro:`, `bmad:`, `adr:`), which the spec index resolves instead of the lattice. */
export function isSpecTarget(target: string): boolean {
  return frameworkOfTarget(target) !== undefined;
}

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const REQ = /^###\s+Requirement:\s*(.+?)\s*$/;
const SCEN = /^####\s+Scenario:\s*(.+?)\s*$/;
const DELTA = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/i;
const RENAME_FROM = /^\s*-\s*FROM:\s*`?###\s+Requirement:\s*(.+?)`?\s*$/i;

interface ParsedSpec {
  requirements: SpecRequirement[];
  /** Requirement names a change removes or renames away. */
  removed: string[];
}

/**
 * Parse one spec file. `capability` is its folder name; `change` is null for
 * `openspec/specs/` and the change name for a delta, where only ADDED and
 * MODIFIED requirements are taken and REMOVED or RENAMED names are collected.
 */
export function parseSpec(path: string, text: string, capability: string, change: string | null): ParsedSpec {
  const lines = text.split(/\r?\n/);
  const requirements: SpecRequirement[] = [];
  const removed: string[] = [];
  let fence: string | null = null;
  let delta: string | null = change ? null : 'MAIN';
  let current: SpecRequirement | null = null;
  let wantText = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const f = FENCE.exec(line);
    if (f) {
      if (!fence) fence = f[1]![0]!;
      else if (f[1]![0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const d = DELTA.exec(line);
    if (d && change) {
      delta = d[1]!.toUpperCase();
      current = null;
      continue;
    }
    if (/^##\s/.test(line)) {
      if (change) delta = null;
      current = null;
      continue;
    }
    if (delta === 'REMOVED' || delta === 'RENAMED') {
      const r = delta === 'REMOVED' ? REQ.exec(line) : RENAME_FROM.exec(line);
      if (r) removed.push(r[1]!);
      continue;
    }
    if (delta !== 'MAIN' && delta !== 'ADDED' && delta !== 'MODIFIED') continue;
    const r = REQ.exec(line);
    if (r) {
      const name = r[1]!;
      current = { id: `${SPEC_SCHEME}${capability}#${name}`, capability, name, text: '', file: path, line: i + 1, status: change ? 'pending' : 'active', change, removedBy: [], scenarios: [], framework: 'openspec' };
      requirements.push(current);
      wantText = true;
      continue;
    }
    const s = SCEN.exec(line);
    if (s && current) {
      current.scenarios.push({ id: `${current.id}#${s[1]!}`, name: s[1]!, file: path, line: i + 1 });
      wantText = false;
      continue;
    }
    if (current && wantText) {
      if (line.trim()) current.text = current.text ? `${current.text} ${line.trim()}` : line.trim();
      else if (current.text) wantText = false;
    }
  }
  return { requirements, removed };
}

const fwOf = (r: SpecRequirement): SpecFrameworkInfo => specFramework(r.framework ?? 'openspec')!;

/** A requirement's group as `tg trace` and `capabilities()` name it: bare for OpenSpec, `<scheme><group>` otherwise, `adr` for decision records. */
export function qualifiedGroup(r: SpecRequirement): string {
  const fw = fwOf(r);
  return fw.id === 'openspec' ? r.capability : fw.flat ? fw.id : `${fw.scheme}${r.capability}`;
}

/**
 * Every requirement and scenario of a project's spec frameworks, addressable as
 * `openspec:<capability>#<requirement>[#<scenario>]`, `speckit:<feature>#FR-001`,
 * `kiro:<spec>#Requirement 1#1.2`, `bmad:prd#FR1` or `adr:0003`. Lookups ignore
 * case and collapse whitespace and accept each requirement's aliases; a target
 * without a scheme is OpenSpec; a main-spec requirement wins over a pending one.
 */
// @tg: implements:: [[cli#Requirement trace]] {since: "2026-10-08"}
// @lat: [[cli#Requirement trace]]
// @tg: implements:: [[openspec:tg-trace#OpenSpec reader]]
// @tg: implements:: [[openspec:tg-trace#Requirement ids]]
// @tg: implements:: [[openspec:spec-frameworks#Framework ids]]
export class SpecIndex {
  private byKey = new Map<string, SpecRequirement>();
  /** `<scheme><group>` and, for groups like `001-auth`, `<scheme>auth`, to the group as written. */
  private caps = new Map<string, string>();
  private all: SpecRequirement[] = [];

  constructor(files: SpecFile[] = []) {
    const main: SpecRequirement[] = [];
    const pending: SpecRequirement[] = [];
    const removed: { capability: string; name: string; change: string }[] = [];
    for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
      const at = f.at ?? locateSpecFile(f.path);
      if (!at) continue;
      const p = parseSpecFile(f.path, f.text, at);
      (at.change ? pending : main).push(...p.requirements);
      for (const name of p.removed) removed.push({ capability: at.group, name, change: at.change! });
    }
    for (const r of [...main, ...pending]) {
      const fw = fwOf(r);
      const key = this.key(fw, r.capability, r.name);
      const shadowed = this.byKey.get(key);
      if (shadowed) {
        // A MODIFIED requirement keeps the main one, plus any scenario the change adds.
        for (const sc of r.scenarios) if (!shadowed.scenarios.some((x) => norm(x.name) === norm(sc.name))) shadowed.scenarios.push({ ...sc, id: `${shadowed.id}#${sc.name}` });
        continue;
      }
      this.byKey.set(key, r);
      for (const a of r.aliases ?? []) if (!this.byKey.has(this.key(fw, r.capability, a))) this.byKey.set(this.key(fw, r.capability, a), r);
      this.all.push(r);
      const cap = `${fw.scheme}${norm(fw.flat ? fw.id : r.capability)}`;
      if (!this.caps.has(cap)) this.caps.set(cap, fw.flat ? fw.id : r.capability);
      const short = /^\d+[-_](.+)$/.exec(r.capability);
      if (short && !fw.flat && !this.caps.has(`${fw.scheme}${norm(short[1]!)}`)) this.caps.set(`${fw.scheme}${norm(short[1]!)}`, r.capability);
    }
    for (const x of removed) this.byKey.get(this.key(specFramework('openspec')!, x.capability, x.name))?.removedBy.push(x.change);
  }

  private key(fw: SpecFrameworkInfo, group: string, name: string): string {
    return fw.flat ? `${fw.scheme}${norm(name)}` : `${fw.scheme}${norm(group)}#${norm(name)}`;
  }

  requirements(): SpecRequirement[] {
    return this.all;
  }

  /** Frameworks that contributed at least one requirement, in registry order. */
  frameworks(): SpecFrameworkId[] {
    const seen = new Set(this.all.map((r) => r.framework ?? 'openspec'));
    return SPEC_FRAMEWORKS.filter((f) => seen.has(f.id)).map((f) => f.id);
  }

  /** Groups as `qualifiedGroup` names them, sorted. */
  capabilities(): string[] {
    return [...new Set(this.all.map(qualifiedGroup))].sort();
  }

  /** The framework and group a capability argument names: `auth`, `openspec:auth`, `speckit:001-auth`, `speckit:auth` or `adr`. */
  private group(name: string): { fw: SpecFrameworkInfo; group: string } | null {
    const fw = frameworkOfTarget(name) ?? (specFramework(norm(name)) ?? specFramework('openspec'))!;
    const body = frameworkOfTarget(name) ? name.slice(fw.scheme.length) : specFramework(norm(name)) ? '' : name;
    if (fw.flat) return body === '' && this.all.some((r) => fwOf(r) === fw) ? { fw, group: fw.id } : null;
    if (!body) return null;
    const g = this.caps.get(`${fw.scheme}${norm(body)}`);
    return g ? { fw, group: g } : null;
  }

  hasCapability(name: string): boolean {
    return this.group(name) !== null;
  }

  /** Requirements of one capability, feature, spec or framework group, in file order. */
  ofCapability(name: string): SpecRequirement[] {
    const g = this.group(name);
    if (!g) return [];
    return this.all.filter((r) => fwOf(r) === g.fw && (g.fw.flat || norm(r.capability) === norm(g.group)));
  }

  /** What a frontmatter entry names: a whole group, or one requirement. */
  entries(entry: string): SpecRequirement[] {
    if (!entry.includes('#') && this.hasCapability(entry)) return this.ofCapability(entry);
    const r = this.resolve(entry);
    return r.kind === 'missing' ? [] : [r.requirement];
  }

  /** Resolve `<scheme>:<group>#<requirement>[#<scenario>]` or `adr:<record>[#...]`; without a scheme, OpenSpec. */
  resolve(target: string): SpecResolution {
    const fw = frameworkOfTarget(target) ?? specFramework('openspec')!;
    const body = frameworkOfTarget(target) ? target.slice(fw.scheme.length) : target;
    const parts = body.split('#');
    const fwReqs = this.all.filter((r) => fwOf(r) === fw);
    if (!fwReqs.length) return { kind: 'missing', message: `no ${fw.name} ${fw.flat ? 'records' : 'specs'} in this project`, suggestion: null };
    let r: SpecRequirement | undefined;
    let rest: string[];
    if (fw.flat) {
      const [req = '', ...more] = parts;
      r = this.byKey.get(this.key(fw, '', req));
      rest = more;
      if (!r) {
        const near = closest(req, fwReqs.flatMap((x) => [x.name, ...(x.aliases ?? [])]));
        return { kind: 'missing', message: `no ${fw.name.toLowerCase()} "${req}"`, suggestion: near ? `${fw.scheme}${near}` : null };
      }
    } else {
      const [cap = '', req, ...more] = parts;
      const g = this.caps.get(`${fw.scheme}${norm(cap)}`);
      const label = fw.id === 'openspec' ? 'OpenSpec capability' : `${fw.name} group`;
      if (!g) {
        const near = closest(cap, [...new Set(fwReqs.map((x) => x.capability))]);
        return { kind: 'missing', message: `no ${label} "${cap}"`, suggestion: near ? `${fw.scheme}${near}` : null };
      }
      if (!req) return { kind: 'missing', message: `"${target}" names a ${fw.id === 'openspec' ? 'capability' : 'group'}; add #<requirement>`, suggestion: null };
      r = this.byKey.get(this.key(fw, g, req));
      rest = more;
      if (!r) {
        const near = closest(req, this.all.filter((x) => fwOf(x) === fw && norm(x.capability) === norm(g)).map((x) => x.name));
        return { kind: 'missing', message: `no requirement "${req}" in ${fw.id === 'openspec' ? 'capability' : fw.name} "${g}"`, suggestion: near ? `${fw.scheme}${g}#${near}` : null };
      }
    }
    if (!rest.length) return { kind: 'requirement', requirement: r };
    const scenario = rest.join('#');
    const s = r.scenarios.find((x) => norm(x.name) === norm(scenario)) ?? r.scenarios.find((x) => (x.aliases ?? []).some((a) => norm(a) === norm(scenario)));
    if (s) return { kind: 'scenario', requirement: r, scenario: s };
    const near = closest(scenario, r.scenarios.map((x) => x.name));
    return { kind: 'missing', message: `no scenario "${scenario}" in requirement "${r.name}"`, suggestion: near ? `${r.id}#${near}` : null };
  }
}

/** The candidate nearest to `query` by edit distance, if reasonably close. */
function closest(query: string, candidates: string[]): string | null {
  const q = norm(query);
  let best: string | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = levenshtein(q, norm(c));
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best !== null && bestD <= Math.max(2, Math.floor(q.length * 0.4)) ? best : null;
}
