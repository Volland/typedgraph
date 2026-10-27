import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Coding agents `tg init` sets up, with OpenSpec's tool ids. */
export interface Agent {
  id: string;
  name: string;
  /** Where the tg instructions go: `CLAUDE.md`, `AGENTS.md` or Cursor's rules file. */
  instructions: 'CLAUDE.md' | 'AGENTS.md' | '.cursor/rules/tg.mdc';
  /** Folder holding one `<name>/SKILL.md` per skill. */
  skills: string;
  /** Paths whose presence means the project uses this agent. */
  markers: string[];
  /** Folders where spec frameworks write this agent's slash commands or prompts (Spec Kit, cc-sdd, OpenSpec's `/opsx`). */
  commands: string[];
  /** The agent's key for Spec Kit's `specify init --integration`, when it has one. */
  speckit?: string;
}

// @tg: implements:: [[openspec:tg-agent-integration#Skills per agent]]
// @tg: implements:: [[openspec:tg-agent-integration#Agent detection]]
export const AGENTS: readonly Agent[] = [
  { id: 'claude', name: 'Claude Code', instructions: 'CLAUDE.md', skills: '.claude/skills', markers: ['.claude', 'CLAUDE.md'], commands: ['.claude/commands'], speckit: 'claude' },
  { id: 'codex', name: 'Codex', instructions: 'AGENTS.md', skills: '.agents/skills', markers: ['.codex'], commands: ['.codex/prompts'], speckit: 'codex' },
  { id: 'cursor', name: 'Cursor', instructions: '.cursor/rules/tg.mdc', skills: '.cursor/skills', markers: ['.cursor'], commands: ['.cursor/commands'], speckit: 'cursor-agent' },
  { id: 'github-copilot', name: 'GitHub Copilot', instructions: 'AGENTS.md', skills: '.github/skills', markers: ['.github/skills', '.github/copilot-instructions.md'], commands: ['.github/prompts', '.github/agents'], speckit: 'copilot' },
  { id: 'opencode', name: 'OpenCode', instructions: 'AGENTS.md', skills: '.opencode/skills', markers: ['.opencode'], commands: ['.opencode/command', '.opencode/commands'], speckit: 'opencode' },
  { id: 'kilocode', name: 'Kilo Code', instructions: 'AGENTS.md', skills: '.kilocode/skills', markers: ['.kilocode'], commands: ['.kilocode/workflows'], speckit: 'kilocode' },
  { id: 'pi', name: 'Pi', instructions: 'AGENTS.md', skills: '.pi/skills', markers: ['.pi'], commands: ['.pi/prompts'], speckit: 'pi' },
  { id: 'oh-my-pi', name: 'Oh My Pi', instructions: 'AGENTS.md', skills: '.omp/skills', markers: ['.omp'], commands: [] },
  { id: 'agents', name: 'Other agents (AGENTS.md, .agents/skills)', instructions: 'AGENTS.md', skills: '.agents/skills', markers: ['.agents', 'AGENTS.md'], commands: [] },
];

export const AGENT_IDS = AGENTS.map((a) => a.id);

export function agentById(id: string): Agent | undefined {
  return AGENTS.find((a) => a.id === id);
}

/** Parse a comma-separated `--agent` value; unknown ids are returned separately. */
export function parseAgents(value: string): { agents: Agent[]; unknown: string[] } {
  const ids = value.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = ids.filter((id) => !agentById(id));
  return { agents: AGENTS.filter((a) => ids.includes(a.id)), unknown };
}

/** OpenSpec writes `openspec-*` skill folders into the skills folder of each tool it set up. */
function hasOpenspecSkills(root: string, skills: string): boolean {
  try {
    return readdirSync(join(root, skills)).some((n) => n.startsWith('openspec-'));
  } catch {
    return false;
  }
}

/** Agents the project already uses, judged by their folders, instruction files and OpenSpec skills. */
// @tg: implements:: [[openspec:tg-agent-integration#Agent detection]]
export function detectAgents(root: string): Agent[] {
  return AGENTS.filter((a) => a.markers.some((m) => existsSync(join(root, m))) || hasOpenspecSkills(root, a.skills));
}
