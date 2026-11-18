import { isMap, isScalar, parseDocument, type Document } from 'yaml';

/** The shared core: edge types several ontologies use, the same file in tg projects and in every gallery download. */
// @tg: implements:: [[openspec:ontology-gallery#Gallery and tg share their files]]
export const CORE_ONTOLOGY_FILE = 'Types/core-types.md';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;
/** Edge types that moved from the code ontology to the shared core, with the properties the old bundled declaration had. */
const MOVED: Record<string, readonly string[]> = { contradicts: ['until', 'ticket', 'reason'] };
const PLAIN_KEYS = new Set(['description', 'from', 'to', 'properties', 'visualization', 'style']);

/**
 * A project's code ontology without the edge types the shared core now declares, so both can sit in `Types/`
 * without a duplicate declaration. A declaration the project changed (a property or key the bundled one never
 * had) is kept and reported in `kept`: tg will not drop what someone wrote, and the core is then left out.
 * `text` is null when there is nothing to move.
 */
// @tg: implements:: [[openspec:tg-agent-integration#Shared core ontology]]
export function moveToCore(existing: string): { text: string | null; moved: string[]; kept: string[] } {
  const none = { text: null, moved: [], kept: [] };
  const m = FRONTMATTER.exec(existing);
  if (!m) return none;
  const doc = parseDocument(m[1]!);
  if (doc.errors.length || !isMap(doc.contents)) return none;
  const edgeTypes = doc.get('edgeTypes', true);
  if (!isMap(edgeTypes)) return none;
  const moved: string[] = [];
  const kept: string[] = [];
  for (const [name, props] of Object.entries(MOVED)) {
    const decl = edgeTypes.get(name, true);
    if (decl === undefined) continue;
    const keys = isMap(decl) ? decl.items.map((p) => (isScalar(p.key) ? String(p.key.value) : '')) : [];
    const declared = isMap(decl) ? decl.get('properties', true) : undefined;
    const propNames = isMap(declared) ? declared.items.map((p) => (isScalar(p.key) ? String(p.key.value) : '')) : [];
    if (keys.every((k) => PLAIN_KEYS.has(k)) && propNames.every((p) => props.includes(p))) {
      edgeTypes.delete(name);
      moved.push(name);
    } else kept.push(name);
  }
  if (!moved.length) return { text: null, moved, kept };
  const yaml = (doc as Document).toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd();
  return { text: `---\n${yaml}\n---${m[2] ?? '\n'}${existing.slice(m[0].length)}`, moved, kept };
}
