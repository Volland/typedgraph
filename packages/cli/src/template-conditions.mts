/**
 * Conditional text in the bundled templates: `{{if:<name>}}...{{end}}` keeps
 * its text only when the condition is on, and `{{if:<name>}}...{{else}}...{{end}}`
 * picks one of two texts. A marker alone on its line is removed with that line,
 * so whole lines can be wrapped without leaving blank ones behind. Conditions
 * do not nest.
 */

/** The conditions a template may test, with what turns each one on. */
export const CONDITIONS = {
  /** `tg init --integrations lat`: also ask for `lat check` wherever `tg check` is asked for. */
  'lat-integration': 'tg init --integrations lat',
} as const;

export type Condition = keyof typeof CONDITIONS;

const STANDALONE = /^[ \t]*(\{\{(?:if:[\w-]+|else|end)\}\})[ \t]*\r?\n/gm;
const BLOCK = /\{\{if:([\w-]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{end\}\}/g;

/** Render the conditional sections of a template; an unknown condition or a stray marker is an error. */
// @tg: implements:: [[openspec:tg-agent-integration#Integrations]]
export function renderConditions(text: string, values: Record<Condition, boolean>): string {
  const out = text.replace(STANDALONE, '$1').replace(BLOCK, (_, name: string, then: string, otherwise: string | undefined) => {
    if (!(name in CONDITIONS)) throw new Error(`unknown template condition "${name}"; expected ${Object.keys(CONDITIONS).join(', ')}`);
    if (/\{\{if:/.test(then) || /\{\{if:/.test(otherwise ?? '')) throw new Error(`template conditions do not nest ("${name}")`);
    return values[name as Condition] ? then : (otherwise ?? '');
  });
  const stray = /\{\{(?:if:[\w-]+|else|end)\}\}/.exec(out);
  if (stray) throw new Error(`unbalanced template marker ${stray[0]}`);
  return out;
}
