import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS } from './commands/agents.mjs';
import { renderConditions } from './template-conditions.mjs';

/** Other tools `tg init` can fit the generated instructions, skills and spec steps to, chosen with `--integrations`. */
// @tg: implements:: [[openspec:tg-agent-integration#Integrations]]
export const INTEGRATIONS = [
  { id: 'lat', name: 'lat.md CLI: also require `lat check` (lat.md\'s own validator) wherever `tg check` is required' },
] as const;

export type IntegrationId = (typeof INTEGRATIONS)[number]['id'];
export const INTEGRATION_IDS: IntegrationId[] = INTEGRATIONS.map((i) => i.id);

/** Parse an `--integrations` value: comma-separated ids or `none`; null with the message for an unknown one. */
export function parseIntegrations(flag: string | true): { ids: IntegrationId[] } | { error: string } {
  const ids = (flag === true ? '' : flag).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (ids.length === 1 && ids[0] === 'none') return { ids: [] };
  const bad = ids.filter((id) => !(INTEGRATION_IDS as string[]).includes(id));
  if (bad.length || !ids.length) return { error: `unknown integration "${bad.join(', ') || flag}"; expected one or more of ${INTEGRATION_IDS.join(', ')}, comma-separated, or none` };
  return { ids: INTEGRATION_IDS.filter((id) => ids.includes(id)) };
}

/** Template text for a project using these integrations: the `{{if:lat-integration}}` sections are kept for `lat`. */
// @tg: implements:: [[openspec:tg-agent-integration#Integrations]]
export const forIntegrations = (text: string, ids: readonly IntegrationId[]): string => renderConditions(text, { 'lat-integration': ids.includes('lat') });

/**
 * Whether generated text asks the agent to run `lat check`. A sentence that
 * only mentions it (the `--keep-lat` note "for teams that still run
 * `lat check`") does not count.
 */
export const asksForLatCheck = (text: string): boolean => text.split('\n').some((line) => /`lat check`|^lat check\b/.test(line) && !line.includes('still run `lat check`'));

/**
 * The integrations an earlier `tg init` chose, judged by the agent
 * instructions and tg skills it wrote: `tg init`, `tg upgrade`, `tg gen` and
 * the hooks follow them.
 */
// @tg: implements:: [[openspec:tg-agent-integration#Integrations]]
export function detectIntegrations(root: string): IntegrationId[] {
  const files = new Set(AGENTS.flatMap((a) => [a.instructions, `${a.skills}/tg-docs/SKILL.md`]));
  for (const rel of files) {
    let text: string;
    try {
      text = readFileSync(join(root, rel), 'utf8');
    } catch {
      continue;
    }
    if (asksForLatCheck(text)) return ['lat'];
  }
  return [];
}
