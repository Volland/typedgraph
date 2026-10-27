import { parseSpec, type SpecRequirement, type SpecScenario } from './index.js';

/**
 * Spec-driven development frameworks whose requirement files `tg` reads. Each
 * framework has its own id scheme, so `openspec:auth#Login`,
 * `speckit:001-auth#FR-001`, `kiro:auth#Requirement 1#1.2` and `adr:0003`
 * live side by side in one project and never collide with lat.md section ids.
 */
export type SpecFrameworkId = 'openspec' | 'speckit' | 'kiro' | 'bmad' | 'gsd' | 'adr';

export interface SpecFrameworkInfo {
  id: SpecFrameworkId;
  name: string;
  /** Target prefix, `<id>:`. */
  scheme: string;
  /** Flat frameworks address a record directly (`adr:0003`); the others as `<group>#<requirement>`. */
  flat: boolean;
}

export const SPEC_FRAMEWORKS: readonly SpecFrameworkInfo[] = [
  { id: 'openspec', name: 'OpenSpec', scheme: 'openspec:', flat: false },
  { id: 'speckit', name: 'Spec Kit', scheme: 'speckit:', flat: false },
  { id: 'kiro', name: 'Kiro specs', scheme: 'kiro:', flat: false },
  { id: 'bmad', name: 'BMAD Method', scheme: 'bmad:', flat: false },
  { id: 'gsd', name: 'Get Shit Done', scheme: 'gsd:', flat: false },
  { id: 'adr', name: 'Architecture decision records', scheme: 'adr:', flat: true },
];

export function specFramework(id: string): SpecFrameworkInfo | undefined {
  return SPEC_FRAMEWORKS.find((f) => f.id === id);
}

/** The framework whose scheme starts `target`, ignoring case. */
export function frameworkOfTarget(target: string): SpecFrameworkInfo | undefined {
  const t = target.slice(0, 10).toLowerCase();
  return SPEC_FRAMEWORKS.find((f) => t.startsWith(f.scheme));
}

/** Folders that hold architecture decision records, by the tools that create them (adr-tools, MADR, log4brains). */
export const ADR_DIRS = ['docs/adr', 'doc/adr', 'docs/adrs', 'adr', 'adrs', 'docs/decisions', 'docs/architecture/decisions', 'docs/architecture-decisions', 'architecture/decisions'] as const;

/** Where a spec file sits: its framework, group (capability, feature, epic) and, for OpenSpec deltas, the change. */
export interface SpecLocation {
  framework: SpecFrameworkId;
  group: string;
  change: string | null;
}

/** Recognize a project-relative path as a requirements file of one of the frameworks. */
export function locateSpecFile(path: string): SpecLocation | null {
  const main = /(?:^|\/)openspec\/specs\/([^/]+)\/spec\.md$/.exec(path);
  if (main) return { framework: 'openspec', group: main[1]!, change: null };
  const delta = /(?:^|\/)openspec\/changes\/([^/]+)\/specs\/([^/]+)\/spec\.md$/.exec(path);
  if (delta) return delta[1] === 'archive' ? null : { framework: 'openspec', group: delta[2]!, change: delta[1]! };
  const kit = /^specs\/([^/]+)\/spec\.md$/.exec(path);
  if (kit) return { framework: 'speckit', group: kit[1]!, change: null };
  // Kiro, cc-sdd and spec-workflow-mcp share one requirements format.
  const kiro = /^(?:\.kiro|\.spec-workflow)\/specs\/([^/]+)\/requirements\.md$/.exec(path);
  if (kiro) return { framework: 'kiro', group: kiro[1]!, change: null };
  if (path === '.planning/REQUIREMENTS.md') return { framework: 'gsd', group: 'requirements', change: null };
  const bmad = bmadLocation(path);
  if (bmad) return bmad;
  for (const dir of ADR_DIRS) {
    if (path.startsWith(`${dir}/`) && ADR_FILE.test(path.slice(dir.length + 1))) return { framework: 'adr', group: 'adr', change: null };
  }
  return null;
}

const ADR_FILE = /^(?:adr[-_]?)?(\d+)[-_. ]+(.+)\.md$/i;

/** BMAD's PRD (`docs/prd.md`, sharded `docs/prd/*.md`, or the v6 planning output) and its story files. */
function bmadLocation(path: string): SpecLocation | null {
  if (/^(?:docs|_bmad-output\/planning-artifacts)\/prd\.md$/.test(path)) return { framework: 'bmad', group: 'prd', change: null };
  if (/^docs\/prd\/[^/]+\.md$/.test(path) && !/\/index\.md$/.test(path)) return { framework: 'bmad', group: 'prd', change: null };
  // v4 names stories `1.2.<slug>.md`, v6 `1-2-<slug>.md`.
  const story = /^(?:docs\/stories|_bmad-output\/implementation-artifacts(?:\/stories)?)\/(\d+)[.-](\d+)[^/]*\.md$/.exec(path);
  if (story) return { framework: 'bmad', group: `epic-${story[1]!}`, change: null };
  return null;
}

export interface ParsedSpecFile {
  requirements: SpecRequirement[];
  /** Requirement names an OpenSpec change removes or renames away. */
  removed: string[];
}

/** Parse one located spec file into requirements with framework ids, labels and properties. */
export function parseSpecFile(path: string, text: string, at: SpecLocation): ParsedSpecFile {
  switch (at.framework) {
    case 'openspec':
      return parseSpec(path, text, at.group, at.change);
    case 'speckit':
      return { requirements: parseSpecKit(path, text, at.group), removed: [] };
    case 'kiro':
      return { requirements: parseKiro(path, text, at.group), removed: [] };
    case 'bmad':
      return { requirements: parseBmad(path, text, at.group), removed: [] };
    case 'gsd':
      return { requirements: parseGsd(path, text), removed: [] };
    case 'adr':
      return { requirements: parseAdr(path, text), removed: [] };
  }
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** Lines outside fenced code, with their 0-based index. */
function* prose(text: string): Generator<[string, number]> {
  let fence: string | null = null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const f = FENCE.exec(line);
    if (f) {
      if (!fence) fence = f[1]![0]!;
      else if (f[1]![0] === fence) fence = null;
      continue;
    }
    if (!fence) yield [line, i];
  }
}

const strip = (s: string): string => s.replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();

function requirement(framework: SpecFrameworkId, group: string, name: string, path: string, line: number, extra: Partial<SpecRequirement> = {}): SpecRequirement {
  const info = specFramework(framework)!;
  const id = info.flat ? `${info.scheme}${name}` : `${info.scheme}${group}#${name}`;
  return { id, capability: group, name, text: '', file: path, line, status: 'active', change: null, removedBy: [], scenarios: [], framework, labels: [], aliases: [], props: {}, relations: [], kind: 'requirement', ...extra };
}

function scenario(req: SpecRequirement, name: string, line: number, extra: Partial<SpecScenario> = {}): SpecScenario {
  return { id: `${req.id}#${name}`, name, file: req.file, line, aliases: [], labels: [], props: {}, ...extra };
}

const LABEL_BY_PREFIX: Record<string, string> = { FR: 'FunctionalRequirement', NFR: 'NonFunctionalRequirement', SC: 'SuccessCriterion' };

/**
 * Spec Kit `specs/<feature>/spec.md`: each `### User Story N - Title (Priority: P1)`
 * is a requirement `USN` whose numbered `**Given** … **When** … **Then**`
 * acceptance scenarios are `Scenario 1`, `Scenario 2`, …; each `- **FR-001**:`,
 * `- **SC-001**:` or other `**XX-NNN**` item is a requirement of that id.
 */
// @tg: implements:: [[openspec:spec-frameworks#Spec Kit reader]]
export function parseSpecKit(path: string, text: string, feature: string): SpecRequirement[] {
  const out: SpecRequirement[] = [];
  let story: SpecRequirement | null = null;
  let wantText = false;
  let inAcceptance = false;
  for (const [line, i] of prose(text)) {
    const us = /^###\s+User Story\s+(\d+)\s*(?:[-–—:]\s*(.*?))?\s*(?:\(\s*Priority:\s*(P\d+)\s*\))?\s*$/i.exec(line);
    if (us) {
      const title = strip(us[2] ?? '');
      story = requirement('speckit', feature, `US${us[1]!}`, path, i + 1, { labels: ['UserStory'], aliases: [`User Story ${us[1]!}`, ...(title ? [title] : [])], props: us[3] ? { priority: us[3].toUpperCase(), title } : { title } });
      out.push(story);
      wantText = true;
      inAcceptance = false;
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      story = null;
      inAcceptance = false;
      wantText = false;
    }
    const item = /^\s*[-*]\s+\*\*([A-Z]{1,5}-\d+)\*\*\s*:?\s*(.*)$/.exec(line);
    if (item) {
      const name = item[1]!;
      const label = LABEL_BY_PREFIX[name.slice(0, name.indexOf('-'))];
      const r = requirement('speckit', feature, name, path, i + 1, { labels: label ? [label] : [], text: strip(item[2]!) });
      if (/NEEDS CLARIFICATION/i.test(r.text)) r.props = { clarification: 'needed' };
      out.push(r);
      continue;
    }
    if (!story) continue;
    if (/^\*\*Acceptance Scenarios\*\*/i.test(line.trim())) {
      inAcceptance = true;
      wantText = false;
      continue;
    }
    if (/^\*\*[^*]+\*\*:/.test(line.trim())) {
      inAcceptance = false;
      wantText = false;
      continue;
    }
    const n = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (inAcceptance && n) {
      story.scenarios.push(scenario(story, `Scenario ${n[1]!}`, i + 1, { aliases: [n[1]!, `AS${n[1]!}`], props: { text: strip(n[2]!) } }));
      continue;
    }
    if (wantText) {
      if (line.trim()) story.text = story.text ? `${story.text} ${line.trim()}` : line.trim();
      else if (story.text) wantText = false;
    }
  }
  return out;
}

/** EARS pattern of an acceptance criterion, from its leading keyword. */
export function earsPattern(text: string): string {
  const t = text.replace(/^\*\*|\*\*/g, '').trim().toUpperCase();
  if (/^WHILE\b/.test(t)) return 'state-driven';
  if (/^WHEN\b/.test(t)) return 'event-driven';
  if (/^IF\b/.test(t)) return 'unwanted';
  if (/^WHERE\b/.test(t)) return 'optional';
  return /\bSHALL\b/.test(t) ? 'ubiquitous' : 'free';
}

/**
 * Kiro and cc-sdd `.kiro/specs/<feature>/requirements.md`: each
 * `### Requirement N` (optionally `: Title`) is a requirement whose numbered
 * acceptance criteria are scenarios `N.1`, `N.2`, … — the ids Kiro's own tasks
 * cite as `_Requirements: 1.1, 2.3_` — tagged with their EARS pattern.
 */
// @tg: implements:: [[openspec:spec-frameworks#Kiro reader]]
export function parseKiro(path: string, text: string, feature: string): SpecRequirement[] {
  const out: SpecRequirement[] = [];
  let req: SpecRequirement | null = null;
  let num = '';
  let inCriteria = false;
  let wantText = false;
  for (const [line, i] of prose(text)) {
    const h = /^###\s+(?:Requirement\s+)?(\d+(?:\.\d+)*)\s*[:.\-–—]?\s*(.*?)\s*$/i.exec(line);
    if (h) {
      num = h[1]!;
      const title = strip(h[2] ?? '');
      req = requirement('kiro', feature, `Requirement ${num}`, path, i + 1, { aliases: [num, ...(title ? [title] : [])], props: title ? { title } : {} });
      out.push(req);
      inCriteria = false;
      wantText = true;
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      req = null;
      continue;
    }
    if (!req) continue;
    if (/^####\s+Acceptance Criteria/i.test(line)) {
      inCriteria = true;
      wantText = false;
      continue;
    }
    if (/^####\s/.test(line)) {
      inCriteria = false;
      continue;
    }
    const story = /^\s*\*\*(?:User Story|Objective)\s*:?\*\*\s*:?\s*(.*)$/i.exec(line);
    if (story && !inCriteria) {
      req.text = strip(story[1]!);
      wantText = false;
      continue;
    }
    const n = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (inCriteria && n) {
      const crit = strip(n[2]!);
      req.scenarios.push(scenario(req, `${num}.${n[1]!}`, i + 1, { aliases: [n[1]!], labels: ['AcceptanceCriterion'], props: { text: crit, ears: earsPattern(crit) } }));
      continue;
    }
    if (wantText && !req.text) {
      if (line.trim()) req.text = strip(line);
    }
  }
  return out;
}

/**
 * BMAD: the PRD's `FR1:` items (v4) or `#### FR-1: name` headings (v6), and
 * their `NFR` counterparts, are requirements; a story file (`docs/stories/1.2.<slug>.md`,
 * `_bmad-output/implementation-artifacts/1-2-<slug>.md`) is a requirement
 * `Story 1.2` whose numbered acceptance criteria are scenarios `AC1`, `AC2`, ….
 */
// @tg: implements:: [[openspec:spec-frameworks#BMAD reader]]
export function parseBmad(path: string, text: string, group: string): SpecRequirement[] {
  const out: SpecRequirement[] = [];
  if (group === 'prd') {
    for (const [line, i] of prose(text)) {
      const m = /^\s*(?:[-*]\s+|#{2,6}\s+)?(?:\*\*)?(N?FR-?\d+)(?:\*\*)?\s*[:.\-–—]\s*(?:\*\*)?\s*(.+)$/.exec(line);
      if (!m) continue;
      const name = m[1]!;
      out.push(requirement('bmad', 'prd', name, path, i + 1, { labels: [name.startsWith('NFR') ? 'NonFunctionalRequirement' : 'FunctionalRequirement'], text: strip(m[2]!) }));
    }
    return out;
  }
  const num = /(\d+)[.-](\d+)[^/]*\.md$/.exec(path.slice(path.lastIndexOf('/') + 1));
  if (!num) return out;
  const name = `Story ${num[1]!}.${num[2]!}`;
  let story: SpecRequirement | null = null;
  let section = '';
  for (const [line, i] of prose(text)) {
    const title = /^#\s+(?:Story\s+[\d.]+\s*[:.\-–—]?\s*)?(.*)$/i.exec(line);
    if (title && !story) {
      story = requirement('bmad', group, name, path, i + 1, { labels: ['Story'], aliases: [`${num[1]!}.${num[2]!}`, ...(strip(title[1]!) ? [strip(title[1]!)] : [])], props: { epic: num[1]!, title: strip(title[1]!) } });
      out.push(story);
      continue;
    }
    if (!story) continue;
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      section = h[1]!.toLowerCase();
      continue;
    }
    const props = (story.props ??= {});
    const statusLine = /^Status:\s*(.+)$/i.exec(line.trim());
    if (statusLine && !props.status) {
      props.status = strip(statusLine[1]!).toLowerCase();
      if (props.status === 'draft' || props.status === 'backlog') story.status = 'pending';
      continue;
    }
    if (section === 'status' && line.trim() && !props.status) {
      props.status = strip(line).toLowerCase();
      if (props.status === 'draft') story.status = 'pending';
      continue;
    }
    if (section === 'story' && line.trim() && !story.text) {
      story.text = strip(line);
      continue;
    }
    const ac = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (section.startsWith('acceptance criteria') && ac) {
      story.scenarios.push(scenario(story, `AC${ac[1]!}`, i + 1, { aliases: [ac[1]!], labels: ['AcceptanceCriterion'], props: { text: strip(ac[2]!) } }));
    }
  }
  return out;
}

/**
 * Get Shit Done `.planning/REQUIREMENTS.md`: each `- [ ] **AUTH-01**: …` item is
 * a requirement of that id, with its `### Category` and whether it is checked off.
 */
// @tg: implements:: [[openspec:spec-frameworks#GSD reader]]
export function parseGsd(path: string, text: string): SpecRequirement[] {
  const out: SpecRequirement[] = [];
  let category = '';
  let scope = '';
  for (const [line, i] of prose(text)) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      scope = h2[1]!;
      category = '';
      continue;
    }
    const h3 = /^###\s+(.+?)\s*$/.exec(line);
    if (h3) {
      category = h3[1]!;
      continue;
    }
    const m = /^\s*[-*]\s+(?:\[([ xX])\]\s+)?\*\*([A-Z][A-Z0-9]*-\d+)\*\*\s*:?\s*(.*)$/.exec(line);
    if (!m) continue;
    // Requirements a project moved out of scope are kept, retired.
    const out_of_scope = /out of scope/i.test(scope);
    out.push(requirement('gsd', 'requirements', m[2]!, path, i + 1, { text: strip(m[3]!), status: out_of_scope ? 'retired' : 'active', props: { ...(category ? { category } : {}), ...(scope ? { scope } : {}), done: m[1] && m[1] !== ' ' ? 'true' : 'false' } }));
  }
  return out;
}

/** ADR statuses by lifecycle: proposed records are pending, superseded, deprecated and rejected ones retired. */
function adrStatus(raw: string): { status: SpecRequirement['status']; value: string } {
  const v = raw.trim().toLowerCase().replace(/[^a-z].*$/, '');
  if (/^(proposed|draft|open)/.test(v)) return { status: 'pending', value: v };
  if (/^(superseded|deprecated|rejected|obsolete)/.test(v)) return { status: 'retired', value: v };
  return { status: 'active', value: v || 'accepted' };
}

/**
 * An architecture decision record (Nygard, adr-tools or MADR): one `Decision`
 * per file, addressed as `adr:<number>`, with its title, status (frontmatter,
 * `## Status` section or `* Status:` line), date, and `Supersedes` or `Amends`
 * links to earlier records as typed relations.
 */
// @tg: implements:: [[openspec:spec-frameworks#ADR reader]]
export function parseAdr(path: string, text: string): SpecRequirement[] {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const m = ADR_FILE.exec(base);
  if (!m) return [];
  const number = m[1]!;
  const slug = m[2]!;
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const fmValue = (key: string): string | null => {
    const v = fm ? new RegExp(`^${key}:\\s*(.+)$`, 'mi').exec(fm[1]!) : null;
    return v ? v[1]!.trim().replace(/^["']|["']$/g, '') : null;
  };
  let title = '';
  let titleLine = 1;
  let rawStatus = fmValue('status') ?? '';
  let date = fmValue('date') ?? '';
  let section = '';
  let decision = '';
  let first = '';
  const relations: SpecRequirement['relations'] = [];
  for (const [line, i] of prose(text)) {
    if (fm && i <= fm[0].split(/\r?\n/).length - 1) continue;
    const h1 = /^#\s+(.+?)\s*$/.exec(line);
    if (h1 && !title) {
      title = strip(h1[1]!).replace(/^(?:ADR[-\s]?)?\d+[.:]?\s*[-–—:]?\s*/i, '');
      titleLine = i + 1;
      continue;
    }
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      section = h2[1]!.toLowerCase();
      continue;
    }
    const bullet = /^\s*[-*]\s+(Status|Date)\s*:\s*(.+)$/i.exec(line);
    if (bullet) {
      if (bullet[1]!.toLowerCase() === 'status' && !rawStatus) rawStatus = bullet[2]!;
      if (bullet[1]!.toLowerCase() === 'date' && !date) date = bullet[2]!.trim();
      continue;
    }
    const dateLine = /^Date:\s*(.+)$/i.exec(line.trim());
    if (dateLine && !date) date = dateLine[1]!.trim();
    const rel = /^\s*(?:[-*]\s+)?(Supersedes|Amends)\b[^[(]*\[[^\]]*\]\(([^)]+)\)/i.exec(line);
    if (rel) {
      const target = ADR_FILE.exec(rel[2]!.slice(rel[2]!.lastIndexOf('/') + 1));
      if (target) relations.push({ type: rel[1]!.toLowerCase() === 'supersedes' ? 'supersedes' : 'amends', target: `adr:${target[1]!}` });
    }
    if (section === 'status' && line.trim() && !rawStatus) {
      rawStatus = line.trim();
      continue;
    }
    if (/^decision( outcome)?$/.test(section) && line.trim() && !decision) decision = strip(line);
    if (!section && title && line.trim() && !first && !/^\w+:\s/.test(line.trim())) first = strip(line);
  }
  const st = adrStatus(rawStatus);
  const r = requirement('adr', 'adr', number, path, titleLine, {
    kind: 'decision',
    labels: ['ADR'],
    status: st.status,
    text: decision || first || title,
    aliases: [String(Number(number)), `ADR-${number}`, `ADR-${Number(number)}`, slug, ...(title ? [title] : [])],
    props: { number, title: title || slug, adrStatus: st.value, ...(date ? { date } : {}) },
    relations,
  });
  return [r];
}
