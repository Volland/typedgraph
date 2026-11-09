import type { App } from 'obsidian';

/** Which notes the plugin indexes, from its settings. */
export interface NoteScopeOptions {
  /** Folders to index, one per line; empty means the whole vault. */
  include: string;
  /** Folders never indexed, one per line; wins over `include`. */
  exclude: string;
  /** Also leave out what Obsidian's "Excluded files" option hides. */
  obsidianExcluded: boolean;
  /** The schema folder is always indexed, so excluding a folder never drops the types. */
  schemaFolder: string;
}

/** A vault-relative folder list from a setting: one per line (or comma separated), without leading `./` or slashes. */
export function folderList(text: string): string[] {
  const folders = text
    .split(/[\n,]/)
    .map((f) => f.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+|\/+$/g, ''))
    .filter((f) => f && f !== '.');
  return [...new Set(folders)];
}

const under = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`);

/**
 * Predicate for paths the plugin indexes. A note in the schema folder is always in; otherwise an
 * excluded folder or a path Obsidian ignores is out, and a non-empty include list must contain it.
 */
// @tg: implements:: [[openspec:graph-model#Indexed folders]] {since: "0.25.0"}
export function noteScope(opts: NoteScopeOptions, userIgnored: (path: string) => boolean = () => false): (path: string) => boolean {
  const include = folderList(opts.include);
  const exclude = folderList(opts.exclude);
  const schema = folderList(opts.schemaFolder)[0] ?? null;
  return (path) => {
    if (schema && under(path, schema)) return true;
    if (exclude.some((f) => under(path, f))) return false;
    if (opts.obsidianExcluded && userIgnored(path)) return false;
    return include.length === 0 || include.some((f) => under(path, f));
  };
}

/**
 * Obsidian's "Excluded files" check. Uses the metadata cache's own (unexported) `isUserIgnored` when
 * present, else reads `userIgnoreFilters`: `/regex/` entries match by pattern, the rest by path prefix.
 */
export function obsidianIgnored(app: App): (path: string) => boolean {
  const cache = app.metadataCache as unknown as { isUserIgnored?: (path: string) => boolean };
  if (typeof cache.isUserIgnored === 'function') return (path) => cache.isUserIgnored!.call(app.metadataCache, path);
  const vault = app.vault as unknown as { getConfig?: (key: string) => unknown };
  const raw = vault.getConfig?.('userIgnoreFilters');
  return ignoreFilters(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
}

/** Matcher for Obsidian's `userIgnoreFilters` entries: `/regex/` or a path prefix such as `Archive/`. */
export function ignoreFilters(filters: string[]): (path: string) => boolean {
  const tests = filters.flatMap((f): ((p: string) => boolean)[] => {
    if (f.length > 2 && f.startsWith('/') && f.endsWith('/')) {
      try {
        const re = new RegExp(f.slice(1, -1));
        return [(p) => re.test(p)];
      } catch {
        return [];
      }
    }
    const prefix = f.trim();
    return prefix ? [(p) => p.startsWith(prefix)] : [];
  });
  return (path) => tests.some((t) => t(path));
}
