import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { isMap, isScalar, isSeq, parse as parseYaml, parseDocument, visit, type Document, type Node } from 'yaml';
import type { SpecFrameworkId } from '@obsigraph/core';
import { EXIT_OK, register, VERSION, type Command, type Ctx } from '../cli.mjs';
import { unifiedDiff } from '../diff.mjs';
import { existingDocsDir, type DocsDir } from '../root.mjs';
import { detectSpecs, SPEC_ONTOLOGY_FILE } from '../specs.mjs';
import { offerUpdate } from '../update.mjs';
import { AGENTS, detectAgents, type Agent } from './agents.mjs';
import { SKILLS, TEMPLATES } from './gen.mjs';
import { BEGIN, forDocs, planInit, type Change, type Part } from './init.mjs';

const ONTOLOGY_SCHEMA = 'Types/code-types.md';
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

function read(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** What an earlier `tg init` set up in a project, judged by the files it left. */
export interface Setup {
  agents: Agent[];
  parts: Part[];
  docs: DocsDir;
  specs: SpecFrameworkId[];
}

/**
 * The agents and parts a project already has: agents whose instruction file
 * holds the tg block or whose skills folder holds tg skills, the hooks and MCP
 * entry, the spec frameworks in use and the ontology. Upgrading refreshes
 * these and adds nothing the project never chose.
 */
// @tg: implements:: [[openspec:tg-upgrade#Project refresh]]
export function detectSetup(root: string): Setup {
  const hasBlock = (a: Agent) => (a.instructions === '.cursor/rules/tg.mdc' ? existsSync(join(root, a.instructions)) : (read(join(root, a.instructions)) ?? '').includes(BEGIN));
  const hasSkills = (a: Agent) => Object.keys(SKILLS).some((s) => existsSync(join(root, a.skills, s, 'SKILL.md')));
  // Agents that share AGENTS.md or a skills folder count only when their own folder is there too.
  let agents = AGENTS.filter((a) => hasSkills(a) || (hasBlock(a) && (a.instructions !== 'AGENTS.md' || a.markers.some((m) => existsSync(join(root, m))))));
  if (!agents.length) agents = detectAgents(root);
  const parts: Part[] = [];
  if (AGENTS.some(hasBlock)) parts.push('instructions');
  if ((read(join(root, '.claude/settings.json')) ?? '').includes('tg hook claude') || (read(join(root, '.mcp.json')) ?? '').includes('"tg"')) parts.push('hooks');
  if (AGENTS.some(hasSkills)) parts.push('skills');
  const specs = detectSpecs(root);
  if (specs.length) parts.push('specs');
  const docs = existingDocsDir(root) ?? 'lat.md';
  if (existsSync(join(root, ONTOLOGY_SCHEMA)) || existsSync(join(root, docs, 'code-ontology.md'))) parts.push('ontology');
  return { agents, parts, docs, specs };
}

const SHORT = 40;
/** Leaf mappings read best inline, as in the bundled schema (`{values: [a, b], description: ...}`); a mapping of prose, such as element descriptions by tag, stays in block style. */
function styleNew(node: Node): void {
  visit(node, {
    Map: (_, n) => {
      const prose = n.items.some((p) => isScalar(p.value) && typeof p.value.value === 'string' && p.value.value.length > SHORT && !(isScalar(p.key) && p.key.value === 'description'));
      n.flow = !prose && n.items.every((p) => isScalar(p.value) || isSeq(p.value));
    },
    Seq: (_, n) => void (n.flow = true),
  });
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Bring what a newer bundled ontology says into the project's own schema note
 * without overwriting anything: a declaration both have gains the
 * `description`, `elements` and `sections` it lacks, and so do its properties.
 * Types, edges and values the project added, changed or removed stay as they
 * are, and no declaration is added back. Null when there is nothing to add.
 */
// @tg: implements:: [[openspec:tg-upgrade#Ontology enrichment]]
export function enrichOntology(existing: string, bundled: string): { text: string; added: string[] } | null {
  const mine = FRONTMATTER.exec(existing);
  const theirs = FRONTMATTER.exec(bundled);
  if (!mine || !theirs) return null;
  const doc = parseDocument(mine[1]!);
  if (doc.errors.length || !isMap(doc.contents)) return null;
  const source = parseYaml(theirs[1]!) as Record<string, unknown>;
  const added: string[] = [];
  const addKey = (target: unknown, key: string, value: unknown, where: string, first = false) => {
    if (!isMap(target) || target.has(key) || value === undefined) return;
    const node = doc.createNode(value) as Node;
    styleNew(node);
    const pair = doc.createPair(key, node);
    if (first) target.items.unshift(pair);
    else target.items.push(pair);
    added.push(`${where}.${key}`);
  };
  const enrichProps = (props: unknown, from: unknown, where: string) => {
    if (!isMap(props) || !isRecord(from)) return;
    for (const [name, decl] of Object.entries(from)) {
      if (!isRecord(decl) || typeof decl.description !== 'string') continue;
      const cur = props.get(name, true);
      if (isMap(cur)) addKey(cur, 'description', decl.description, `${where}.${name}`);
      else if (cur === undefined || cur === null || (isScalar(cur) && (cur.value === null || typeof cur.value === 'string'))) {
        // A kind shorthand (`date: date`, `owner:`) becomes a mapping so it can hold the description.
        if (!props.has(name)) continue;
        const kind = isScalar(cur) && typeof cur.value === 'string' ? cur.value : 'text';
        const node = doc.createNode({ kind, description: decl.description }) as Node;
        styleNew(node);
        props.set(name, node);
        added.push(`${where}.${name}.description`);
      }
    }
  };
  const enrich = (group: 'schemas' | 'edgeTypes', keys: string[]) => {
    const from = source[group];
    const into = doc.get(group, true);
    if (!isRecord(from) || !isMap(into)) return;
    for (const [name, decl] of Object.entries(from)) {
      const target = into.get(name, true);
      if (!isMap(target) || !isRecord(decl)) continue;
      addKey(target, 'description', decl.description, name, true);
      for (const k of keys) addKey(target, k, decl[k], name);
      enrichProps(target.get('properties', true), decl.properties, `${name}.properties`);
    }
  };
  enrich('schemas', ['sections', 'elements']);
  enrich('edgeTypes', []);
  if (!added.length) return null;
  // The new keys are TGS 0.4; a note that declares an older version says so.
  const v = doc.get('tgs', true);
  if (isScalar(v) && typeof source.tgs === 'string' && String(v.value) < source.tgs) v.value = source.tgs;
  const yaml = (doc as Document).toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd();
  return { text: `---\n${yaml}\n---${mine[2] ?? '\n'}${existing.slice(mine[0].length)}`, added };
}

/** Changes that refresh what the project has; new files only for tg skills and the spec ontology tg owns. */
// @tg: implements:: [[openspec:tg-upgrade#Project refresh]]
export function planUpgrade(root: string, setup: Setup): { changes: Change[]; notes: string[]; ontology: string[] } {
  const { changes, notes } = planInit(root, setup.agents, false, { parts: setup.parts, docs: setup.docs, specs: setup.specs });
  const skillDirs = new Set(setup.agents.map((a) => a.skills));
  const owned = (c: Change) => c.before !== null || c.path === SPEC_ONTOLOGY_FILE || [...skillDirs].some((d) => Object.keys(SKILLS).some((s) => c.path === `${d}/${s}/SKILL.md`));
  const kept = changes.filter(owned);
  // A note about a file upgrade does not create (a proposed `.tg/config.json`, a docs index) would only confuse.
  const dropped = changes.filter((c) => !owned(c)).map((c) => c.path);
  const keptNotes = notes.filter((n) => !dropped.some((p) => n.includes(p)));
  notes.length = 0;
  notes.push(...keptNotes);
  let ontology: string[] = [];
  if (setup.parts.includes('ontology')) {
    const existing = read(join(root, ONTOLOGY_SCHEMA));
    const r = existing === null ? null : enrichOntology(existing, forDocs(TEMPLATES.ontologySchema, setup.docs));
    if (r) {
      kept.push({ path: ONTOLOGY_SCHEMA, before: existing, after: r.text });
      ontology = r.added;
    }
    const guide = `${setup.docs}/code-ontology.md`;
    const text = read(join(root, guide));
    const body = (t: string) => t.replace(FRONTMATTER, '').trim();
    if (text !== null && body(text) !== body(forDocs(TEMPLATES.ontologyGuide, setup.docs))) {
      notes.push(`${guide} differs from the guide in this tg version; it is yours, so it is left as is. Compare with tg gen ontology.md.`);
    }
  }
  return { changes: kept, notes, ontology };
}

export const upgrade: Command = {
  name: 'upgrade',
  summary: 'Check for a newer tg, then refresh the instructions, skills, hooks, spec steps and ontology an earlier tg init set up (asks in a terminal; --dry-run only prints the diff)',
  usage: 'upgrade [dir] [--dry-run] [--yes] [--no-update-check]',
  flags: { 'dry-run': 'bool', yes: 'bool', 'no-update-check': 'bool' },
  noProject: true,
  // @tg: implements:: [[openspec:tg-upgrade#Upgrade command]]
  async run(ctx: Ctx, args, flags) {
    const root = resolve(ctx.cwd, args[0] ?? ctx.root);
    const interactive = !!ctx.select && !ctx.json && !flags.has('yes');
    const update = await offerUpdate(ctx, 'upgrade', args, flags, interactive);
    if (update.relaunched !== null) return update.relaunched;
    const setup = detectSetup(root);
    if (!setup.parts.length) {
      if (ctx.json) ctx.out(`${JSON.stringify({ root, version: ctx.version ?? VERSION, latest: update.latest, setup: null, changes: [], notes: update.notes })}\n`);
      else ctx.out(`${basename(root)} has no tg setup to upgrade; run tg init.\n`);
      return EXIT_OK;
    }
    const plan = planUpgrade(root, setup);
    const notes = [...update.notes, ...plan.notes];
    const dryRun = flags.has('dry-run');
    let write = !dryRun;
    if (ctx.json) {
      ctx.out(
        `${JSON.stringify({ root, version: ctx.version ?? VERSION, latest: update.latest, write, setup: { agents: setup.agents.map((a) => a.id), parts: setup.parts, docs: setup.docs, specs: setup.specs }, changes: plan.changes.map((c) => ({ path: c.path, created: c.before === null })), ontology: plan.ontology, notes })}\n`,
      );
    } else if (!plan.changes.length) {
      for (const n of notes) ctx.out(`Note: ${n}\n`);
      ctx.out(`${basename(root)} is up to date with tg ${ctx.version ?? VERSION}; nothing to change.\n`);
      return EXIT_OK;
    } else {
      ctx.out(`tg ${ctx.version ?? VERSION} has newer files for ${basename(root)} (${setup.parts.join(', ')}; ${setup.agents.map((a) => a.name).join(', ')}):\n`);
      for (const c of plan.changes) ctx.out(`  ${c.before === null ? '+ new    ' : '~ updated'} ${c.path}\n`);
      if (plan.ontology.length) ctx.out(`  ${ONTOLOGY_SCHEMA} gains ${plan.ontology.length} description${plan.ontology.length === 1 ? '' : 's'} or declaration${plan.ontology.length === 1 ? '' : 's'}; nothing in it is overwritten.\n`);
      for (const n of notes) ctx.out(`Note: ${n}\n`);
      if (dryRun) {
        for (const c of plan.changes) ctx.out(`\n${unifiedDiff(c.path, c.before, c.after)}\n`);
        ctx.out(`\nDry run: ${plan.changes.length} file${plan.changes.length === 1 ? '' : 's'} would change. Run tg upgrade without --dry-run to apply.\n`);
      } else if (interactive) {
        let pick = await ctx.select!('Apply these changes?', [
          { id: 'apply', label: 'Apply' },
          { id: 'diff', label: 'Show the diff first' },
          { id: 'cancel', label: 'Cancel' },
        ]);
        if (pick === 'diff') {
          for (const c of plan.changes) ctx.out(`\n${unifiedDiff(c.path, c.before, c.after)}\n`);
          pick = await ctx.select!('Apply these changes?', [
            { id: 'apply', label: 'Apply' },
            { id: 'cancel', label: 'Cancel' },
          ]);
        }
        write = pick === 'apply';
        if (!write) ctx.out('Nothing changed.\n');
      }
    }
    if (write) {
      for (const c of plan.changes) {
        const full = join(root, c.path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, c.after);
      }
      if (!ctx.json && plan.changes.length) ctx.out(`Wrote ${plan.changes.length} file${plan.changes.length === 1 ? '' : 's'}. Run tg check and tg ontology check.\n`);
    }
    return EXIT_OK;
  },
};

register(upgrade);
