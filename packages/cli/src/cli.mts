import { resolve } from 'node:path';
import { parseArgs, type FlagKind } from './args.mjs';
import { findRoot, hasProject } from './root.mjs';

declare const __TG_VERSION__: string;
export const VERSION = typeof __TG_VERSION__ === 'string' ? __TG_VERSION__ : 'dev';

/** Exit codes: findings are not errors in the tool itself. */
export const EXIT_OK = 0;
// @tg: implements:: [[openspec:tg-cli#Output and exit codes]]
export const EXIT_FINDINGS = 1;
export const EXIT_ERROR = 2;

export interface Io {
  cwd: string;
  out: (text: string) => void;
  err: (text: string) => void;
  env: Record<string, string | undefined>;
  /** Network access for embeddings; injectable so tests never touch a real server. */
  fetch?: typeof fetch;
  /** Whole standard input, for hooks; absent when none is piped. */
  stdin?: () => string;
  /** Ask the person at the terminal for a line; absent when stdin or stdout is not a terminal, so commands never block. */
  ask?: (question: string) => Promise<string>;
  /** Let the person at the terminal tick items in a checklist; absent outside a terminal, like `ask`. */
  choose?: (title: string, items: { id: string; label: string; checked: boolean }[]) => Promise<string[]>;
  /** Let the person at the terminal pick one item; absent outside a terminal, like `ask`. */
  select?: (title: string, items: { id: string; label: string }[]) => Promise<string>;
  /** Run an external program in `cwd` with the terminal attached and return its exit code; absent in hosts that cannot, so installers are only suggested. */
  exec?: (argv: string[], cwd: string) => Promise<number>;
}

export interface Ctx extends Io {
  /** Project root; commands that need one never see null. */
  root: string;
  json: boolean;
  verbose: boolean;
}

export interface Command {
  name: string;
  summary: string;
  usage?: string;
  flags?: Record<string, FlagKind>;
  /** Commands that work without a project (init, gen). */
  noProject?: boolean;
  run(ctx: Ctx, args: string[], flags: Map<string, string | true>): Promise<number> | number;
}

const GLOBAL_FLAGS: Record<string, FlagKind> = { dir: 'string', json: 'bool', 'no-color': 'bool', verbose: 'bool', help: 'bool', h: 'bool', version: 'bool', V: 'bool' };

const registry: Command[] = [];

export function register(...cmds: Command[]): void {
  for (const c of cmds) if (!registry.some((r) => r.name === c.name)) registry.push(c);
}

export function commands(): readonly Command[] {
  return registry;
}

export function helpText(): string {
  const width = Math.max(...registry.map((c) => c.name.length), 8);
  const lines = registry.map((c) => `  ${c.name.padEnd(width)}  ${c.summary}`);
  return [
    'tg: map, check and query docs and code as a typed graph',
    '',
    'Usage: tg [options] <command> [args]',
    '',
    'Options:',
    '  --dir <path>   project root (default: nearest lat.md/, tg.md/ or .tg/ above the cwd)',
    '  --json         machine-readable output',
    '  --no-color     disable color',
    '  --verbose      extra diagnostics',
    '  -V, --version  print the version',
    '  -h, --help     show help',
    '',
    'Commands:',
    ...lines,
    '',
  ].join('\n');
}

/** Run the CLI; returns the exit code and never throws. */
// @tg: implements:: [[openspec:tg-cli#Output and exit codes]]
export async function run(argv: string[], io: Io): Promise<number> {
  try {
    const first = argv.findIndex((a) => !a.startsWith('-') && !isFlagValue(argv, a));
    const cmd = first === -1 ? undefined : registry.find((c) => c.name === argv[first]);
    const spec = { ...GLOBAL_FLAGS, ...(cmd?.flags ?? {}) };
    const parsed = parseArgs(argv, spec);
    if (parsed.flags.has('version') || parsed.flags.has('V')) {
      io.out(`${VERSION}\n`);
      return EXIT_OK;
    }
    const name = parsed.positionals[0];
    if (!name || parsed.flags.has('help') || parsed.flags.has('h')) {
      const sub = name ? registry.find((c) => c.name === name) : undefined;
      io.out(sub ? `${sub.name}: ${sub.summary}\n${sub.usage ? `Usage: tg ${sub.usage}\n` : ''}` : helpText());
      return name && !sub ? EXIT_ERROR : EXIT_OK;
    }
    if (parsed.errors.length) {
      io.err(`${parsed.errors.join('\n')}\n`);
      return EXIT_ERROR;
    }
    const command = registry.find((c) => c.name === name);
    if (!command) {
      io.err(`unknown command "${name}"; run tg --help\n`);
      return EXIT_ERROR;
    }
    const dirFlag = parsed.flags.get('dir');
    let root: string | null;
    if (typeof dirFlag === 'string') {
      root = resolve(io.cwd, dirFlag);
      if (!command.noProject && !hasProject(root)) {
        io.err(`${root} has no lat.md/, tg.md/ or .tg/; run tg init\n`);
        return EXIT_ERROR;
      }
    } else {
      root = findRoot(io.cwd);
      if (!root && !command.noProject) {
        io.err('no lat.md/, tg.md/ or .tg/ found here or above; run tg init\n');
        return EXIT_ERROR;
      }
    }
    const ctx: Ctx = { ...io, root: root ?? resolve(io.cwd), json: parsed.flags.has('json'), verbose: parsed.flags.has('verbose') };
    return await command.run(ctx, parsed.positionals.slice(1), parsed.flags);
  } catch (e) {
    io.err(`tg: ${e instanceof Error ? e.message : String(e)}\n`);
    return EXIT_ERROR;
  }
}

// `--dir x check`: x is a flag value, not the command.
function isFlagValue(argv: string[], a: string): boolean {
  const i = argv.indexOf(a);
  return i > 0 && argv[i - 1] === '--dir';
}
