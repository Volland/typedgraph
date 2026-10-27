import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { run } from './cli.mjs';
import { askLine, checklist, select, type ChoiceItem } from './tui.mjs';
import './commands/index.mjs';

// Prompts exist only when a person is at a terminal, so scripts, CI and hooks never block.
const tty = process.stdin.isTTY && process.stdout.isTTY;

const code = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  out: (t) => void process.stdout.write(t),
  err: (t) => void process.stderr.write(t),
  env: process.env,
  stdin: () => {
    try {
      return readFileSync(0, 'utf8');
    } catch {
      return '';
    }
  },
  // Spec framework installers (`openspec init`, `specify init`, ...) run with the terminal attached, so their own prompts work;
  // their output goes to stderr so `tg init --json` still prints one document on stdout.
  exec: async (argv: string[], cwd: string) => spawnSync(argv[0]!, argv.slice(1), { cwd, stdio: [0, 2, 2], shell: process.platform === 'win32' }).status ?? 1,
  ...(tty ? { ask: (q: string) => askLine(q), choose: (title: string, items: ChoiceItem[]) => checklist(title, items), select: (title: string, items: { id: string; label: string }[]) => select(title, items) } : {}),
});
process.exitCode = code;
