import { VERSION, type Ctx } from './cli.mjs';

/** The npm package `tg` ships in. */
export const PACKAGE = '@typedgraph/cli';
/** Registry document of the newest published version. */
export const LATEST_URL = `https://registry.npmjs.org/${PACKAGE}/latest`;

/** Newest published version from the npm registry, or null when it cannot be read within the timeout. */
export async function fetchLatestVersion(fetchFn: typeof fetch = fetch, timeoutMs = 3000): Promise<string | null> {
  try {
    const r = await fetchFn(LATEST_URL, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    const body = (await r.json()) as { version?: unknown };
    return typeof body.version === 'string' ? body.version : null;
  } catch {
    return null;
  }
}

/** `[major, minor, patch]` of a release version; null for prereleases, `dev` and anything else. */
function parse(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True when `latest` is a release newer than `current`. */
export function isNewer(latest: string, current: string): boolean {
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}

/** The command line that runs `name` again with the same arguments and flags. */
export function argvOf(name: string, args: readonly string[], flags: Map<string, string | true>, extra: string[] = []): string[] {
  const out = [name, ...args];
  for (const [k, v] of flags) {
    if (k === 'no-update-check') continue;
    out.push(k.length === 1 ? `-${k}` : `--${k}`);
    if (v !== true) out.push(v);
  }
  return [...out, ...extra];
}

export interface UpdateOutcome {
  /** The newest version, when it is newer than the running one. */
  latest: string | null;
  /** Exit code of the command run again with the new version; null when this process should carry on. */
  relaunched: number | null;
  notes: string[];
}

/**
 * Before `tg init` or `tg upgrade` writes anything: ask npm for the newest
 * `tg`, and when it is newer offer to install it (or, under `npx`, to run the
 * newer one) and run the same command again with it, so the files written
 * come from the newest templates. Only a person at a terminal is asked:
 * scripts, `--yes` and `--json` runs never reach the network. Skipped
 * with `--no-update-check`, `TG_NO_UPDATE_CHECK=1`, in CI, for a development
 * build, and when the registry does not answer within three seconds.
 */
// @tg: implements:: [[openspec:tg-upgrade#Update check]]
// @tg: implements:: [[openspec:tg-upgrade#Install with consent]]
export async function offerUpdate(ctx: Ctx, name: string, args: readonly string[], flags: Map<string, string | true>, interactive: boolean): Promise<UpdateOutcome> {
  const none: UpdateOutcome = { latest: null, relaunched: null, notes: [] };
  const current = ctx.version ?? VERSION;
  // Scripts, `--yes` and `--json` runs never wait on the network or install anything.
  if (!interactive || ctx.json || flags.has('no-update-check') || flags.has('dry-run') || ctx.env.TG_NO_UPDATE_CHECK === '1' || ctx.env.CI || !ctx.latestVersion || !parse(current)) return none;
  const latest = await ctx.latestVersion();
  if (!latest || !isNewer(latest, current)) return none;
  const viaNpx = ctx.env.npm_command === 'exec';
  const install = [process.platform === 'win32' ? 'npm.cmd' : 'npm', 'install', '-g', `${PACKAGE}@${latest}`];
  const hint = viaNpx ? `npx ${PACKAGE}@latest ${name}` : `npm install -g ${PACKAGE}@latest`;
  if (!ctx.exec) return { latest, relaunched: null, notes: [`tg ${latest} is available (this is ${current}); run ${hint} to get the newest instructions and skills.`] };
  const pick = await ctx.select!(`tg ${latest} is available; this is ${current}. Its instructions, skills and ontology may be newer.`, [
    { id: 'update', label: viaNpx ? `Run tg ${latest} for this ${name} (npx ${PACKAGE}@${latest})` : `Install tg ${latest} and continue with it (${install.join(' ')})` },
    { id: 'continue', label: `Continue with tg ${current}` },
  ]);
  if (pick !== 'update') return { latest, relaunched: null, notes: [] };
  if (!viaNpx) {
    ctx.err(`$ ${install.join(' ')}\n`);
    const code = await ctx.exec(install, ctx.cwd);
    if (code !== 0) return { latest, relaunched: null, notes: [`${install.join(' ')} exited with ${code}; continuing with tg ${current}.`] };
  }
  const again = viaNpx ? ['npx', '-y', `${PACKAGE}@${latest}`, ...argvOf(name, args, flags, ['--no-update-check'])] : ['tg', ...argvOf(name, args, flags, ['--no-update-check'])];
  ctx.err(`$ ${again.join(' ')}\n`);
  return { latest, relaunched: await ctx.exec(again, ctx.cwd), notes: [] };
}
