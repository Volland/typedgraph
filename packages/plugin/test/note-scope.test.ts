import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { folderList, ignoreFilters, noteScope, obsidianIgnored } from '../src/note-scope';

const opts = { include: '', exclude: '', obsidianExcluded: false, schemaFolder: 'Types/' };

describe('note scope', () => {
  // @lat: [[tests/vault-indexing#Folder lists]]
  it('reads one folder per line or comma, without slashes, ./ or duplicates', () => {
    expect(folderList(' Records/ \n./Scratch,\n\n/Inbox/Today/,Records\n.')).toEqual(['Records', 'Scratch', 'Inbox/Today']);
  });

  // @tg: verifies:: [[openspec:graph-model#Indexed folders#Excluded folder]] {since: "0.25.0", level: unit}
  // @tg: verifies:: [[openspec:graph-model#Indexed folders#Include list]] {since: "0.25.0", level: unit}
  // @lat: [[tests/vault-indexing#Include and exclude]]
  it('keeps the whole vault by default, narrows to included folders, drops excluded ones and keeps the schema folder', () => {
    expect(noteScope(opts)('Any/Note.md')).toBe(true);
    const scope = noteScope({ ...opts, include: 'Records', exclude: 'Records/Drafts\nTypes' });
    expect(scope('Records/Court/1820.md')).toBe(true);
    expect(scope('RecordsOld/x.md')).toBe(false);
    expect(scope('Records/Drafts/x.md')).toBe(false);
    expect(scope('Manuals/How.md')).toBe(false);
    expect(scope('Types/Person.md')).toBe(true);
  });

  // @tg: verifies:: [[openspec:graph-model#Indexed folders#Obsidian excluded files]] {since: "0.25.0", level: unit}
  // @lat: [[tests/vault-indexing#Obsidian excluded files]]
  it("follows Obsidian's excluded files only when asked, through isUserIgnored or the userIgnoreFilters config", () => {
    const ignored = (p: string) => p.startsWith('Archive/');
    expect(noteScope(opts, ignored)('Archive/a.md')).toBe(true);
    expect(noteScope({ ...opts, obsidianExcluded: true }, ignored)('Archive/a.md')).toBe(false);

    const withApi = { metadataCache: { isUserIgnored: (p: string) => p === 'x.md' }, vault: {} } as unknown as App;
    expect(obsidianIgnored(withApi)('x.md')).toBe(true);
    const withConfig = { metadataCache: {}, vault: { getConfig: (k: string) => (k === 'userIgnoreFilters' ? ['Archive/', '/\\.excalidraw\\.md$/', '/[/'] : null) } } as unknown as App;
    const fromConfig = obsidianIgnored(withConfig);
    expect(fromConfig('Archive/old.md')).toBe(true);
    expect(fromConfig('Draw/a.excalidraw.md')).toBe(true);
    expect(fromConfig('Notes/a.md')).toBe(false);
    expect(ignoreFilters([])('a.md')).toBe(false);
  });
});
