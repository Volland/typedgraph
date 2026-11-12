import type { LinkResolver } from './graph.js';

const NOTE_EXT = /\.(?:md|adoc)$/i;

/** Best match for one candidate file name: an exact path, else a path ending with it, nearest folder first. */
function best(all: string[], name: string, sourcePath: string): string | null {
  if (all.includes(name)) return name;
  const lower = name.toLowerCase();
  const matches = all.filter((p) => {
    const lp = p.toLowerCase();
    return lp === lower || lp.endsWith(`/${lower}`);
  });
  if (matches.length === 0) return null;
  const folder = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1) : '';
  const local = matches.find((p) => p.toLowerCase() === `${folder}${name}`.toLowerCase());
  if (local) return local;
  return matches.sort((a, b) => a.length - b.length || a.localeCompare(b))[0]!;
}

const RELATIVE = /^\.\.?\//;

/**
 * A `./` or `../` link joined to the source note's folder, with `.` and `..` segments removed, or null when
 * it climbs above the vault root.
 */
function anchored(target: string, sourcePath: string): string | null {
  const parts = sourcePath.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}

/** Exact, case-insensitive match for an anchored relative path; relative links never fall back to suffix matching. */
function exact(all: string[], name: string): string | null {
  if (all.includes(name)) return name;
  const lower = name.toLowerCase();
  return all.find((p) => p.toLowerCase() === lower) ?? null;
}

/**
 * Obsidian-like link resolution over a set of note paths, for hosts without
 * Obsidian (the sidecar): an exact path wins; otherwise a note whose path ends
 * with the link, preferring the source note's folder, then the shortest path.
 * A bare link matches `.md` and `.adoc` notes; when both exist it is ambiguous, resolves to nothing and
 * is reported through the resolver's `ambiguous` method. An explicit extension matches that file only.
 */
// @tg: implements:: [[sidecar#Shared core]] {since: "2026-10-03"}
// @lat: [[sidecar#Shared core]]
// @tg: implements:: [[openspec:asciidoc-notes#Link resolution across formats]]
export function pathResolver(paths: () => Iterable<string>): LinkResolver {
  const candidates = (link: string, sourcePath: string): string[] => {
    const raw = link.trim();
    const relative = RELATIVE.test(raw);
    const target = relative ? anchored(raw, sourcePath) : raw.replace(/^\/+/, '');
    if (!target) return [];
    const all = [...paths()];
    const names = NOTE_EXT.test(target) ? [target] : [`${target}.md`, `${target}.adoc`];
    const find = relative ? (n: string) => exact(all, n) : (n: string) => best(all, n, sourcePath);
    return names.map(find).filter((p): p is string => p !== null);
  };
  const resolve: LinkResolver = (link, sourcePath) => {
    const found = candidates(link, sourcePath);
    return found.length === 1 ? found[0]! : null;
  };
  resolve.ambiguous = (link, sourcePath) => {
    const found = candidates(link, sourcePath);
    return found.length > 1 ? found : null;
  };
  return resolve;
}
