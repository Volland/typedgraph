// Print one version's section of CHANGELOG.md, used as the body of its GitHub release.
// Usage: node scripts/release-notes.mjs <x.y.z> [CHANGELOG.md]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The text under `## <version>` up to the next `## ` heading, without the heading itself, or null
 * when the changelog has no section for that version.
 */
// @tg: implements:: [[openspec:plugin-install#Release notes from the changelog]]
export function changelogSection(text, version) {
  const lines = text.split('\n');
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = lines.findIndex((l) => new RegExp(`^## ${escaped}(?:\\s|$)`).test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [version, file = 'CHANGELOG.md'] = process.argv.slice(2);
  const section = version ? changelogSection(readFileSync(file, 'utf8'), version) : null;
  if (!section) {
    console.error(version ? `release-notes: ${file} has no section for ${version}` : 'Usage: node scripts/release-notes.mjs <x.y.z> [CHANGELOG.md]');
    process.exit(1);
  }
  console.log(section);
}
