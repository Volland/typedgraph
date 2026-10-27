import { qualifiedGroup, specEntries, traceRequirements, type RequirementTrace, type TraceLink } from '@obsigraph/core';
import { EXIT_ERROR, EXIT_FINDINGS, EXIT_OK, register, type Command } from '../cli.mjs';
import { NoLatDir, Project } from '../project.mjs';

const loc = (l: TraceLink): string => `${l.file}${l.symbol ? `#${l.symbol}` : ''}:${l.line}${l.test ? ` "${l.test}"` : ''}`;

function gaps(r: RequirementTrace): string[] {
  const out: string[] = [];
  if (!r.implemented) out.push('unimplemented');
  if (!r.verified) out.push('unverified');
  if (r.requirement.status === 'retired') return [];
  if (!r.documented) out.push('undocumented');
  return out;
}

// @tg: implements:: [[cli#Requirement trace]] {since: "2026-10-08"}
// @lat: [[cli#Requirement trace]]
// @tg: implements:: [[openspec:tg-trace#Trace command]]
// @tg: implements:: [[openspec:spec-frameworks#Trace across frameworks]]
export const trace: Command = {
  name: 'trace',
  summary: 'Show which code implements, which tests verify and which lat.md files explain each requirement of the project\'s spec frameworks (OpenSpec, Spec Kit, Kiro, BMAD, GSD, ADRs)',
  usage: 'trace [capability...] [--gaps] [--strict]',
  flags: { gaps: 'bool', strict: 'bool' },
  run(ctx, args, flags) {
    let project: Project;
    try {
      project = new Project(ctx.root);
    } catch (e) {
      if (e instanceof NoLatDir) {
        ctx.err(`${e.message}\n`);
        return EXIT_ERROR;
      }
      throw e;
    }
    const specs = project.specIndex();
    if (!specs) {
      ctx.err(`no spec framework in ${ctx.root}: tg reads openspec/, Spec Kit specs/ (with .specify/), .kiro/specs/, BMAD, .planning/REQUIREMENTS.md and docs/adr/; run tg init to set one up\n`);
      return EXIT_ERROR;
    }
    const unknown = args.filter((c) => !specs.hasCapability(c));
    if (unknown.length) {
      ctx.err(`unknown capabilit${unknown.length === 1 ? 'y' : 'ies'}: ${unknown.join(', ')}\nknown: ${specs.capabilities().join(', ')}\n`);
      return EXIT_ERROR;
    }
    const docs = [...project.index().files].flatMap(([file, p]) => {
      const entries = specEntries(p.frontmatter).map((e) => e.entry);
      return entries.length ? [{ file, openspec: entries }] : [];
    });
    const wanted = new Set(args.flatMap((c) => specs.ofCapability(c).map((r) => r.id)));
    // Retired records (superseded or rejected decisions, out-of-scope requirements) are shown but never a gap.
    const gap = (r: RequirementTrace) => r.requirement.status !== 'retired' && (!r.implemented || !r.verified);
    const all = traceRequirements(specs, project.annotations().annotations, docs).filter((r) => !wanted.size || wanted.has(r.requirement.id));
    const rows = flags.has('gaps') ? all.filter(gap) : all;
    const failing = all.some(gap);
    const exit = flags.has('strict') && failing ? EXIT_FINDINGS : EXIT_OK;

    if (ctx.json) {
      ctx.out(`${JSON.stringify(rows.map((r) => ({ ...r, requirement: { ...r.requirement, scenarios: undefined } })), null, 2)}\n`);
      return exit;
    }
    const lines: string[] = [];
    let cap = '';
    for (const r of rows) {
      const q = r.requirement;
      if (qualifiedGroup(q) !== cap) {
        cap = qualifiedGroup(q);
        const of = all.filter((x) => qualifiedGroup(x.requirement) === cap);
        lines.push('', `${cap}  ${of.length} req · ${of.filter((x) => x.implemented).length} implemented · ${of.filter((x) => x.verified).length} verified · ${of.filter((x) => x.documented).length} documented`);
      }
      const g = gaps(r);
      const status = [q.status === 'pending' ? (q.change ? `pending in ${q.change}` : 'pending') : '', q.status === 'retired' ? `retired${q.props?.adrStatus ? `: ${q.props.adrStatus}` : ''}` : '', q.removedBy.length ? `removed by ${q.removedBy.join(', ')}` : ''].filter(Boolean).join(', ');
      lines.push(`  ${r.implemented && r.verified ? '✓' : q.status === 'retired' ? '·' : '✗'} ${q.name}${q.props?.title && q.props.title !== q.name ? ` ${q.props.title}` : ''}${status ? ` (${status})` : ''}${g.length ? `  — ${g.join(', ')}` : ''}`);
      for (const l of r.implementedBy) lines.push(`      implements  ${loc(l)}`);
      for (const l of r.verifiedBy) lines.push(`      verifies    ${loc(l)}`);
      for (const s of r.scenarios) {
        if (!s.verifiedBy.length) lines.push(`      ✗ scenario  ${s.scenario.name}`);
        else for (const l of s.verifiedBy) lines.push(`      ✓ scenario  ${s.scenario.name}  ${loc(l)}`);
      }
      for (const f of r.documentedIn) lines.push(`      doc         ${f}`);
    }
    const n = all.length;
    lines.push('', `${n} requirement${n === 1 ? '' : 's'}: ${all.filter((x) => x.implemented).length} implemented, ${all.filter((x) => x.verified).length} verified, ${all.filter((x) => x.documented).length} documented`);
    ctx.out(`${lines.join('\n').replace(/^\n/, '')}\n`);
    return exit;
  },
};

register(trace);
