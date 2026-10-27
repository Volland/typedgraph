import agents from '../../templates/agents.md';
import cursor from '../../templates/cursor-rules.md';
import docsSkill from '../../templates/skills/tg-docs/SKILL.md';
import graphSkill from '../../templates/skills/tg-graph/SKILL.md';
import traceSkill from '../../templates/skills/tg-trace/SKILL.md';
import impactSkill from '../../templates/skills/tg-impact/SKILL.md';
import auditSkill from '../../templates/skills/tg-audit/SKILL.md';
import migrateSkill from '../../templates/skills/tg-migrate/SKILL.md';
import openspecPropose from '../../templates/openspec/propose.md';
import openspecApply from '../../templates/openspec/apply.md';
import openspecArchive from '../../templates/openspec/archive.md';
import openspecExplore from '../../templates/openspec/explore.md';
import ontologyGuide from '../../templates/ontology/code-ontology.md';
import ontologySchema from '../../templates/ontology/code-types.md';
import decisionTemplate from '../../templates/ontology/templates/Decision.md';
import requirementTemplate from '../../templates/ontology/templates/Requirement.md';
import scenarioTemplate from '../../templates/ontology/templates/Scenario.md';
import constraintTemplate from '../../templates/ontology/templates/Constraint.md';
import conceptTemplate from '../../templates/ontology/templates/Concept.md';
import changeTemplate from '../../templates/ontology/templates/Change.md';
import openspecRules from '../../templates/openspec/config-rules.md';
import stageAuthor from '../../templates/specs/stage-author.md';
import stagePlan from '../../templates/specs/stage-plan.md';
import stageTasks from '../../templates/specs/stage-tasks.md';
import stageImplement from '../../templates/specs/stage-implement.md';
import kiroSteering from '../../templates/specs/kiro-steering.md';
import adrTemplate from '../../templates/specs/adr-template.md';
import adrFirst from '../../templates/specs/adr-first.md';
import { detectSpecs, forSpecs, forStage, SPEC_SETUPS, SPEC_STAGES, specOntology, specSection, type SpecStage } from '../specs.mjs';
import { EXIT_ERROR, EXIT_OK, register, type Command } from '../cli.mjs';

// @tg: implements:: [[openspec:tg-agent-integration#Bundled skills]]
export const TEMPLATES = { agents, cursor, docsSkill, graphSkill, traceSkill, impactSkill, auditSkill, ontologyGuide, ontologySchema };

/** Skills installed for Claude Code, by folder name under `.claude/skills/`. */
// @tg: implements:: [[openspec:tg-agent-integration#Bundled skills]]
export const SKILLS: Record<string, string> = { 'tg-docs': docsSkill, 'tg-graph': graphSkill, 'tg-trace': traceSkill, 'tg-impact': impactSkill, 'tg-audit': auditSkill, 'tg-migrate': migrateSkill };

/** Blocks appended to OpenSpec's skills and commands, by workflow stage. */
/** Template notes for the code ontology's types, by type name; `tg init` writes them to `Templates/<Type>.md`. */
export const ONTOLOGY_TEMPLATES: Record<string, string> = {
  Decision: decisionTemplate,
  Requirement: requirementTemplate,
  Scenario: scenarioTemplate,
  Constraint: constraintTemplate,
  Concept: conceptTemplate,
  Change: changeTemplate,
};

export const OPENSPEC_PATCHES = { propose: openspecPropose, apply: openspecApply, archive: openspecArchive, explore: openspecExplore };

/** Blocks appended to other spec frameworks' skills and commands, by stage; `{{requirement}}` and the like are filled per framework. */
export const STAGE_PATCHES: Record<SpecStage, string> = { author: stageAuthor, plan: stagePlan, tasks: stageTasks, implement: stageImplement };

/** Files tg writes for a chosen framework: Kiro's steering file, a first ADR and the ADR template. */
export const SPEC_TEMPLATES = { kiroSteering, adrTemplate, adrFirst };

// @tg: implements:: [[openspec:tg-agent-integration#Instruction generation]]
// @tg: implements:: [[openspec:tg-agent-integration#Skill text available]]
const TARGETS: Record<string, string> = {
  'agents.md': agents,
  'claude.md': agents,
  'cursor-rules.md': cursor,
  'skill.md': docsSkill,
  'graph-skill.md': graphSkill,
  'trace-skill.md': traceSkill,
  'impact-skill.md': impactSkill,
  'audit-skill.md': auditSkill,
  'migrate-skill.md': migrateSkill,
  'openspec-propose.md': openspecPropose,
  'openspec-apply.md': openspecApply,
  'openspec-archive.md': openspecArchive,
  'openspec-explore.md': openspecExplore,
  'ontology.md': ontologyGuide,
  'ontology-schema.md': ontologySchema,
  'openspec-rules.md': openspecRules,
  ...Object.fromEntries(Object.entries(ONTOLOGY_TEMPLATES).map(([type, text]) => [`template-${type.toLowerCase()}.md`, text])),
  'kiro-steering.md': kiroSteering,
  'adr-template.md': adrTemplate,
  ...Object.fromEntries(SPEC_SETUPS.map((s) => [`spec-${s.id}.md`, specSection(s.id)])),
  ...Object.fromEntries(SPEC_SETUPS.filter((s) => Object.keys(s.patches).length).flatMap((s) => SPEC_STAGES.filter((st) => s.patches[st]).map((st) => [`${s.id}-${st}.md`, forStage(STAGE_PATCHES[st], s)]))),
};

// @tg: implements:: [[openspec:tg-agent-integration#Instruction generation]]
// @tg: implements:: [[openspec:spec-frameworks#Skills follow the frameworks]]
export const gen: Command = {
  name: 'gen',
  summary: 'Print agent instructions, skills, spec framework patch blocks and the spec ontology (tg gen <target>; an unknown target lists them all)',
  usage: 'gen <target>',
  noProject: true,
  run(ctx, args) {
    // Text that names spec frameworks is filled for the ones this folder uses (OpenSpec when none).
    const specs = detectSpecs(ctx.cwd);
    const target = (args[0] ?? '').toLowerCase();
    const text = target === 'spec-ontology.md' ? specOntology(specs.length ? specs : SPEC_SETUPS.map((s) => s.id)) : TARGETS[target];
    if (text === undefined || text === null) {
      ctx.err(`unknown target "${args[0] ?? ''}"; supported: ${[...Object.keys(TARGETS), 'spec-ontology.md'].join(', ')}\n`);
      return EXIT_ERROR;
    }
    ctx.out(forSpecs(text, specs));
    return EXIT_OK;
  },
};

register(gen);
