import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { ADR_DIRS, SPEC_FRAMEWORKS, type SpecFile, type SpecFrameworkId } from '@obsigraph/core';
import { Document, isMap, isScalar, isSeq, visit } from 'yaml';
import type { Agent } from './commands/agents.mjs';
import openspecSection from '../templates/specs/openspec.md';
import speckitSection from '../templates/specs/speckit.md';
import kiroSection from '../templates/specs/kiro.md';
import bmadSection from '../templates/specs/bmad.md';
import gsdSection from '../templates/specs/gsd.md';
import adrSection from '../templates/specs/adr.md';

/**
 * What `tg` knows about each spec-driven development framework beyond parsing
 * it: how to detect it in a project, which files hold its requirements, how to
 * install it, which of its agent skills and commands get tg steps, the ids
 * agents write, and the ontology types its spec nodes carry.
 */
export interface SpecSetup {
  id: SpecFrameworkId;
  name: string;
  /** One line for the setup wizard. */
  blurb: string;
  /** Example ids, for skills and patch blocks. */
  ids: { requirement: string; scenario: string | null; file: string; frontmatter: string };
  /** Skill folder names and command file base names that get a tg block, by workflow stage. */
  patches: Partial<Record<SpecStage, { skills: string[]; commands: string[] }>>;
}

/** Workflow stages that get their own tg block: writing the spec, planning, breaking into tasks, implementing. */
export type SpecStage = 'author' | 'plan' | 'tasks' | 'implement';
export const SPEC_STAGES: SpecStage[] = ['author', 'plan', 'tasks', 'implement'];

// @tg: implements:: [[openspec:spec-frameworks#Framework registry]]
export const SPEC_SETUPS: readonly SpecSetup[] = [
  {
    id: 'openspec',
    name: 'OpenSpec',
    blurb: 'OpenSpec — capability specs plus change proposals with deltas; best for evolving an existing codebase',
    ids: { requirement: 'openspec:<capability>#<Requirement>', scenario: 'openspec:<capability>#<Requirement>#<Scenario>', file: 'openspec/specs/<capability>/spec.md', frontmatter: 'openspec: [<capability>]' },
    // OpenSpec's own skills are patched by stage name in init (propose, apply, archive, explore).
    patches: {},
  },
  {
    id: 'speckit',
    name: 'Spec Kit',
    blurb: 'GitHub Spec Kit — specs/<feature>/spec.md with user stories, FR-### and SC-### ids; best for new features end to end',
    ids: { requirement: 'speckit:<feature>#FR-001', scenario: 'speckit:<feature>#US1#Scenario 1', file: 'specs/<feature>/spec.md', frontmatter: 'specs: ["speckit:<feature>"]' },
    patches: {
      author: { skills: ['speckit-specify', 'speckit-clarify'], commands: ['speckit.specify', 'speckit.clarify'] },
      plan: { skills: ['speckit-plan'], commands: ['speckit.plan'] },
      tasks: { skills: ['speckit-tasks'], commands: ['speckit.tasks'] },
      implement: { skills: ['speckit-implement'], commands: ['speckit.implement'] },
    },
  },
  {
    id: 'kiro',
    name: 'Kiro specs',
    blurb: 'Kiro-style specs (Kiro IDE, cc-sdd, spec-workflow-mcp) — .kiro/specs/<feature>/requirements.md with EARS acceptance criteria',
    ids: { requirement: 'kiro:<feature>#Requirement 1', scenario: 'kiro:<feature>#Requirement 1#1.2', file: '.kiro/specs/<feature>/requirements.md', frontmatter: 'specs: ["kiro:<feature>"]' },
    patches: {
      author: { skills: ['kiro-spec-requirements'], commands: ['kiro/spec-requirements'] },
      plan: { skills: ['kiro-spec-design'], commands: ['kiro/spec-design'] },
      tasks: { skills: ['kiro-spec-tasks'], commands: ['kiro/spec-tasks'] },
      implement: { skills: ['kiro-spec-impl'], commands: ['kiro/spec-impl'] },
    },
  },
  {
    id: 'bmad',
    name: 'BMAD Method',
    blurb: 'BMAD Method — agent personas writing a PRD (FR-#) and story files with acceptance criteria',
    ids: { requirement: 'bmad:prd#FR-1', scenario: 'bmad:epic-1#Story 1.2#AC1', file: '_bmad-output/planning-artifacts/prd.md and story files', frontmatter: 'specs: ["bmad:prd", "bmad:epic-1"]' },
    patches: {
      author: { skills: ['bmad-create-prd', 'bmad-create-story'], commands: [] },
      implement: { skills: ['bmad-dev-story'], commands: [] },
    },
  },
  {
    id: 'gsd',
    name: 'Get Shit Done',
    blurb: 'Get Shit Done — .planning/REQUIREMENTS.md with CATEGORY-NN ids, phased roadmap',
    ids: { requirement: 'gsd:requirements#AUTH-01', scenario: null, file: '.planning/REQUIREMENTS.md', frontmatter: 'specs: ["gsd:requirements"]' },
    patches: {
      plan: { skills: ['gsd-plan-phase'], commands: ['gsd/plan-phase'] },
      implement: { skills: ['gsd-execute-phase'], commands: ['gsd/execute-phase'] },
    },
  },
  {
    id: 'adr',
    name: 'ADRs',
    blurb: 'Architecture decision records (MADR, Nygard, adr-tools, log4brains) — docs/adr/NNNN-title.md; pairs with any of the above',
    ids: { requirement: 'adr:0003', scenario: null, file: 'docs/adr/0003-<title>.md', frontmatter: 'specs: ["adr:0003"]' },
    patches: {},
  },
];

export const SPEC_IDS = SPEC_SETUPS.map((s) => s.id);

export function specSetup(id: string): SpecSetup | undefined {
  return SPEC_SETUPS.find((s) => s.id === id);
}

const isDir = (root: string, rel: string): boolean => existsSync(join(root, rel));

function subdirs(root: string, rel: string): string[] {
  try {
    return readdirSync(join(root, rel), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch {
    return [];
  }
}

function mdFiles(root: string, rel: string): string[] {
  try {
    return readdirSync(join(root, rel), { withFileTypes: true }).filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.md')).map((d) => `${rel}/${d.name}`).sort();
  } catch {
    return [];
  }
}

const ADR_NAME = /^(?:adr[-_]?)?\d+[-_. ].+\.md$/i;

/** ADR folders of a project: the one `.adr-dir` names (adr-tools), else the conventional folders that hold numbered records. */
// @tg: implements:: [[openspec:spec-frameworks#Framework detection]]
export function adrDirs(root: string): string[] {
  const out: string[] = [];
  try {
    const named = readFileSync(join(root, '.adr-dir'), 'utf8').trim().replace(/^\.\//, '').replace(/\/$/, '');
    if (named) out.push(named);
  } catch {
    /* no .adr-dir */
  }
  for (const d of ADR_DIRS) if (!out.includes(d) && mdFiles(root, d).some((f) => ADR_NAME.test(f.slice(d.length + 1)))) out.push(d);
  if (!out.length && isDir(root, '.log4brains.yml')) out.push('docs/adr');
  return out;
}

/** Frameworks a project already uses, judged by the folders their tools create. */
// @tg: implements:: [[openspec:spec-frameworks#Framework detection]]
export function detectSpecs(root: string): SpecFrameworkId[] {
  const found: Record<SpecFrameworkId, boolean> = {
    openspec: isDir(root, 'openspec'),
    speckit: isDir(root, '.specify'),
    kiro: isDir(root, '.kiro/specs') || isDir(root, '.spec-workflow') || (isDir(root, '.kiro') && subdirs(root, '.kiro').length > 0),
    bmad: isDir(root, '_bmad') || isDir(root, '.bmad-core') || isDir(root, '_bmad-output'),
    gsd: isDir(root, '.planning/REQUIREMENTS.md') || isDir(root, '.planning/PROJECT.md'),
    adr: adrDirs(root).length > 0 || isDir(root, '.adr-dir') || isDir(root, '.log4brains.yml'),
  };
  return SPEC_IDS.filter((id) => found[id]);
}

/** The requirement files of one framework in a project, project-relative. */
export function specFiles(root: string, id: SpecFrameworkId): Omit<SpecFile, 'text'>[] {
  switch (id) {
    case 'openspec': {
      const paths = subdirs(root, 'openspec/specs').map((c) => `openspec/specs/${c}/spec.md`);
      for (const ch of subdirs(root, 'openspec/changes')) if (ch !== 'archive') paths.push(...subdirs(root, `openspec/changes/${ch}/specs`).map((c) => `openspec/changes/${ch}/specs/${c}/spec.md`));
      return paths.map((path) => ({ path }));
    }
    case 'speckit':
      return subdirs(root, 'specs').map((f) => ({ path: `specs/${f}/spec.md` }));
    case 'kiro':
      return ['.kiro/specs', '.spec-workflow/specs'].flatMap((d) => subdirs(root, d).map((f) => ({ path: `${d}/${f}/requirements.md` })));
    case 'bmad':
      return [
        'docs/prd.md',
        '_bmad-output/planning-artifacts/prd.md',
        ...mdFiles(root, 'docs/prd'),
        ...mdFiles(root, 'docs/stories'),
        ...mdFiles(root, '_bmad-output/implementation-artifacts'),
        ...mdFiles(root, '_bmad-output/implementation-artifacts/stories'),
      ].map((path) => ({ path }));
    case 'gsd':
      return [{ path: '.planning/REQUIREMENTS.md' }];
    case 'adr':
      return adrDirs(root).flatMap((d) => mdFiles(root, d).filter((f) => ADR_NAME.test(f.slice(d.length + 1))).map((path) => ({ path, at: { framework: 'adr' as const, group: 'adr', change: null } })));
  }
}

/** True when an executable named `bin` is on the PATH of `env`. */
export function onPath(bin: string, env: Record<string, string | undefined>): boolean {
  const exts = process.platform === 'win32' ? ['', '.cmd', '.exe'] : [''];
  return (env.PATH ?? '').split(delimiter).filter(Boolean).some((dir) => exts.some((e) => existsSync(join(dir, `${bin}${e}`))));
}

/** One way to set a framework up: the commands to run, in order. */
export interface InstallOption {
  /** `run` uses a tool already installed, `once` fetches it for one run (npx, uvx), `global` installs it first. */
  id: 'run' | 'once' | 'global';
  label: string;
  steps: string[][];
}

export const showCommand = (steps: string[][]): string => steps.map((s) => s.map((a) => (/[\s"']/.test(a) ? `"${a}"` : a)).join(' ')).join(' && ');

/**
 * How `tg init` can install a framework in this project for these agents, most
 * direct first, with a note when nothing can run (a missing prerequisite) or
 * the framework needs no tool. ADRs need none: tg writes the first record itself.
 */
// @tg: implements:: [[openspec:spec-frameworks#Framework install]]
export function installOptions(id: SpecFrameworkId, agents: readonly Agent[], env: Record<string, string | undefined>, interactive: boolean): { options: InstallOption[]; note: string | null } {
  const opt = (oid: InstallOption['id'], steps: string[][], what: string): InstallOption => ({ id: oid, label: `${what}: ${showCommand(steps)}`, steps });
  const options: InstallOption[] = [];
  switch (id) {
    case 'openspec': {
      // OpenSpec's tool ids are tg's agent ids.
      const args = ['init', '--tools', agents.map((a) => a.id).join(',') || 'claude'];
      if (onPath('openspec', env)) options.push(opt('run', [['openspec', ...args]], 'Run'));
      else {
        if (onPath('npx', env)) options.push(opt('once', [['npx', '-y', '@fission-ai/openspec@latest', ...args]], 'Run once with npx'));
        if (onPath('npm', env)) options.push(opt('global', [['npm', 'install', '-g', '@fission-ai/openspec@latest'], ['openspec', ...args]], 'Install the openspec CLI, then run'));
      }
      return { options, note: options.length ? null : 'OpenSpec needs Node.js 20.19+ (npm): https://nodejs.org' };
    }
    case 'speckit': {
      const key = agents.find((a) => a.speckit)?.speckit ?? 'claude';
      const args = ['init', '--here', '--force', '--integration', key];
      if (onPath('specify', env)) options.push(opt('run', [['specify', ...args]], 'Run'));
      else {
        if (onPath('uvx', env)) options.push(opt('once', [['uvx', '--from', 'specify-cli', 'specify', ...args]], 'Run once with uvx'));
        if (onPath('uv', env)) options.push(opt('global', [['uv', 'tool', 'install', 'specify-cli'], ['specify', ...args]], 'Install the specify CLI, then run'));
      }
      return { options, note: options.length ? null : 'Spec Kit needs uv: https://docs.astral.sh/uv/getting-started/installation/' };
    }
    case 'kiro': {
      // The Kiro IDE writes specs itself; cc-sdd brings the same workflow to other agents.
      const flag = agents.some((a) => a.id === 'claude') ? ['--claude-skills'] : agents.some((a) => a.id === 'codex') ? ['--codex-skills'] : [];
      if (onPath('npx', env)) options.push(opt('once', [['npx', '-y', 'cc-sdd@latest', ...flag, ...(interactive ? [] : ['-y'])]], 'Install cc-sdd (Kiro-style specs for your agent) with npx'));
      return { options, note: options.length ? 'In the Kiro IDE, create specs from its Specs panel instead.' : 'cc-sdd needs Node.js (npx): https://nodejs.org' };
    }
    case 'bmad': {
      const tools = agents.some((a) => a.id === 'claude') ? 'claude-code' : agents[0]?.id ?? 'claude-code';
      if (onPath('npx', env)) options.push(opt('once', [['npx', '-y', 'bmad-method@latest', 'install', ...(interactive ? [] : ['--yes', '--directory', '.', '--tools', tools])]], 'Run the BMAD installer with npx'));
      return { options, note: options.length ? null : 'BMAD needs Node.js 20.12+ (npx), Python 3.10+ and uv' };
    }
    case 'gsd':
      // Its installer asks where to install, so it only runs for a person at the terminal.
      if (onPath('npx', env) && interactive) options.push(opt('once', [['npx', '-y', 'get-shit-done-cc@latest']], 'Run the GSD installer with npx'));
      return { options, note: options.length ? null : 'Install GSD with `npx get-shit-done-cc@latest` in a terminal, then run its new-project command.' };
    case 'adr':
      return { options, note: null };
  }
}

/** Split so the annotation scanner never reads the template strings below as annotations of tg itself. */
const TG = '@' + 'tg:';

/** Example ids and the one-line rule an agent instruction block carries for a framework. */
export function specBullet(s: SpecSetup): string {
  const scen = s.ids.scenario ? ` and tests at the ${s.id === 'kiro' ? 'acceptance criterion' : 'scenario'} they prove with \`// ${TG} verifies:: [[${s.ids.scenario}]]\` directly above the \`it(\`` : '';
  const what = s.id === 'adr' ? 'the decision it realizes' : 'the requirement it realizes';
  return `- **${s.name}** (\`${s.ids.file}\`): point code at ${what} with \`// ${TG} implements:: [[${s.ids.requirement}]]\`${scen}. List what a lat.md file explains as \`${s.ids.frontmatter}\` in its frontmatter.`;
}

const SECTIONS: Record<SpecFrameworkId, string> = { openspec: openspecSection, speckit: speckitSection, kiro: kiroSection, bmad: bmadSection, gsd: gsdSection, adr: adrSection };

/** Framework sections of the tg-trace skill: the id grammar and conventions of each framework the project uses. */
export function specSection(id: SpecFrameworkId): string {
  return SECTIONS[id].trimEnd();
}

/**
 * Fill the spec placeholders of a bundled text for the frameworks a project uses
 * (OpenSpec when none): `{{spec-frameworks}}` with each framework's section,
 * `{{spec-bullets}}` with one instruction line per framework, `{{spec-names}}`
 * with their names.
 */
// @tg: implements:: [[openspec:spec-frameworks#Skills follow the frameworks]]
export function forSpecs(text: string, ids: readonly SpecFrameworkId[]): string {
  const used = SPEC_SETUPS.filter((s) => (ids.length ? ids : ['openspec']).includes(s.id));
  return text
    .replaceAll('{{spec-frameworks}}', used.map((s) => specSection(s.id)).join('\n\n'))
    .replaceAll('{{spec-bullets}}', used.map(specBullet).join('\n'))
    .replaceAll('{{spec-names}}', used.map((s) => s.name).join(', '));
}

/** Fill a stage patch template for one framework. */
export function forStage(text: string, s: SpecSetup): string {
  return text
    .replaceAll('{{name}}', s.name)
    .replaceAll('{{requirement}}', s.ids.requirement)
    .replaceAll('{{scenario}}', s.ids.scenario ?? s.ids.requirement)
    .replaceAll('{{file}}', s.ids.file)
    .replaceAll('{{frontmatter}}', s.ids.frontmatter)
    .replaceAll('{{group}}', s.ids.requirement.slice(0, s.ids.requirement.indexOf('#') === -1 ? undefined : s.ids.requirement.indexOf('#')));
}

interface TypeDecl {
  properties?: Record<string, unknown>;
  visualization?: Record<string, string>;
}
interface EdgeDecl {
  from: string[];
  to: string[];
  properties?: Record<string, unknown>;
}

/**
 * Ontology fragments per framework: the labels its spec nodes carry beside the
 * base `Requirement`, `Scenario` or `Decision`, and the edges between them.
 * Composed into one schema note, so frameworks never declare a name twice.
 */
const FRAGMENTS: Record<SpecFrameworkId, { types: Record<string, TypeDecl>; edges: Record<string, EdgeDecl> }> = {
  openspec: {
    types: { Capability: { properties: { status: { values: ['draft', 'stable', 'deprecated'], default: 'draft' }, owner: 'text' }, visualization: { color: '#0284c7', shape: 'barrel' } } },
    edges: { part_of: { from: ['Requirement', 'Decision', 'Concept'], to: ['Capability'] } },
  },
  speckit: {
    types: {
      Feature: { properties: { status: { values: ['draft', 'planned', 'in-progress', 'done'], default: 'draft' }, branch: 'text' }, visualization: { color: '#0284c7', shape: 'barrel' } },
      UserStory: { properties: { priority: { values: ['P1', 'P2', 'P3', 'P4', 'P5'] }, title: 'text' }, visualization: { color: '#22c55e', shape: 'round-rectangle' } },
      FunctionalRequirement: { properties: { clarification: { values: ['needed'] } } },
      SuccessCriterion: { visualization: { color: '#84cc16', shape: 'round-rectangle' } },
      Principle: { properties: { article: 'text' }, visualization: { color: '#f97316', shape: 'diamond' } },
    },
    edges: {
      part_of: { from: ['Requirement', 'Decision', 'Concept'], to: ['Feature'] },
      governs: { from: ['Principle'], to: ['Requirement', 'Decision', 'Feature'], properties: { note: 'text' } },
    },
  },
  kiro: {
    types: {
      Feature: { properties: { status: { values: ['draft', 'planned', 'in-progress', 'done'], default: 'draft' }, branch: 'text' }, visualization: { color: '#0284c7', shape: 'barrel' } },
      AcceptanceCriterion: { properties: { ears: { values: ['ubiquitous', 'event-driven', 'state-driven', 'unwanted', 'optional', 'free'] }, text: 'text' }, visualization: { color: '#14b8a6', shape: 'round-rectangle' } },
    },
    edges: { part_of: { from: ['Requirement', 'Decision', 'Concept'], to: ['Feature'] } },
  },
  bmad: {
    types: {
      Epic: { properties: { status: { values: ['backlog', 'in-progress', 'done'] } }, visualization: { color: '#7c3aed', shape: 'barrel' } },
      Story: { properties: { status: 'text', epic: 'text', title: 'text' }, visualization: { color: '#22c55e', shape: 'round-rectangle' } },
      FunctionalRequirement: { properties: { clarification: { values: ['needed'] } } },
      NonFunctionalRequirement: {},
      AcceptanceCriterion: { properties: { ears: { values: ['ubiquitous', 'event-driven', 'state-driven', 'unwanted', 'optional', 'free'] }, text: 'text' }, visualization: { color: '#14b8a6', shape: 'round-rectangle' } },
    },
    edges: { part_of: { from: ['Requirement', 'Decision', 'Concept'], to: ['Epic'] } },
  },
  gsd: {
    types: { Phase: { properties: { status: { values: ['planned', 'in-progress', 'done'] } }, visualization: { color: '#7c3aed', shape: 'barrel' } } },
    edges: { delivered_in: { from: ['Requirement'], to: ['Phase'], properties: { note: 'text' } } },
  },
  adr: {
    types: { ADR: { properties: { adrStatus: { values: ['proposed', 'accepted', 'deprecated', 'superseded', 'rejected'] }, number: 'text', date: 'date', title: 'text' }, visualization: { color: '#6366f1', shape: 'hexagon' } } },
    edges: { amends: { from: ['Decision'], to: ['Decision'], properties: { since: 'text', note: 'text' } } },
  },
};

export const SPEC_ONTOLOGY_FILE = 'Types/spec-types.md';

/**
 * The spec ontology note for the chosen frameworks: their node labels as types
 * and their edges, merged so a type or edge shared by two frameworks (Feature,
 * `part_of`) is declared once with the union of its endpoints. tg rewrites it on
 * every `tg init`; project vocabulary belongs in `Types/code-types.md`.
 */
// @tg: implements:: [[openspec:spec-frameworks#Ontology per framework]]
export function specOntology(ids: readonly SpecFrameworkId[]): string | null {
  const used = SPEC_IDS.filter((id) => ids.includes(id));
  if (!used.length) return null;
  const schemas: Record<string, TypeDecl> = {};
  const edgeTypes: Record<string, EdgeDecl> = {};
  for (const id of used) {
    for (const [t, d] of Object.entries(FRAGMENTS[id].types)) schemas[t] ??= d;
    for (const [e, d] of Object.entries(FRAGMENTS[id].edges)) {
      const prev = edgeTypes[e];
      edgeTypes[e] = prev ? { ...prev, from: [...new Set([...prev.from, ...d.from])], to: [...new Set([...prev.to, ...d.to])] } : { ...d, properties: d.properties ?? { note: 'text' } };
    }
  }
  const names = used.map((id) => SPEC_SETUPS.find((s) => s.id === id)!.name).join(', ');
  const doc = new Document({ tgs: '0.1', schemas, edgeTypes });
  // Leaf maps and lists read better inline, as in code-types.md: `status: {values: [a, b], default: a}`.
  visit(doc, {
    Seq: (_, n) => void (n.flow = true),
    Map: (_, n) => void (n.flow = n.items.every((p) => isScalar(p.value) || isSeq(p.value) || (isMap(p.value) && p.value.items.every((q) => isScalar(q.value))))),
  });
  const yaml = doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd();
  return `---\n${yaml}\n---\n# Spec Framework Ontology\n\nTypes and edges for the spec frameworks this project uses (${names}), written by \`tg init\` and rewritten on every run: keep project vocabulary in \`Types/code-types.md\`.\n\n## How spec nodes are labelled\n\nEvery requirement \`tg\` reads from a spec file keeps the base label the code ontology's edges allow — \`Requirement\`, \`Scenario\` or \`Decision\` — and adds its framework's own label from this note, so \`implements\` and \`verifies\` work everywhere and \`MATCH (u:UserStory)\` finds just the user stories. Type a lat.md section with one of these labels to describe a feature, epic or principle in prose.\n`;
}

export { SPEC_FRAMEWORKS };
