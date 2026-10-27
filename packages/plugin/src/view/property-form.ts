import type { GraphNode, PropertySchema } from '@obsigraph/core';
import { candidateName, chosenOptions, coerceInput, fieldSpec, formatInput, fromLinkItems, linkItems, suggestLinks, type FieldSpec } from '@obsigraph/graph-ui';
import { AbstractInputSuggest, TFile, setIcon, type App } from 'obsidian';
import { valueLines } from './view-state';

/** Everything the details pane knows about one property row. */
export interface FieldContext {
  app: App;
  key: string;
  /** Note that relative links resolve from, or null. */
  source: string | null;
  /** The value as written; meaningful when `hasValue`. */
  value: unknown;
  hasValue: boolean;
  /** Text of a row that has no value of its own (labels, style origins, edge ends). */
  text: string;
  declared?: PropertySchema;
  /** Set when the property holds links to notes: the types it may point at and whether it holds several. */
  link: { targets: string[] | null; many: boolean } | null;
  /** The field can be changed: edit mode is on and the property is writable. */
  editable: boolean;
  /** Draw [[links]] as clickable links. */
  links: boolean;
  /** Heights the user dragged text boxes to, by property name; kept while Obsidian runs. */
  heights: Map<string, number>;
  candidates: () => Iterable<GraphNode>;
  open: (href: string, source: string, newTab: boolean) => void;
  commit: (value: unknown) => void;
}

const containsLink = (value: unknown, source: string | null): boolean => valueLines(value, source).some((parts) => parts.some((p) => 'link' in p));

/** One entry of a field's dropdown: what is stored when it is chosen, and how it looks in the list. */
interface Suggestion {
  value: string;
  render: (el: HTMLElement) => void;
}

/** How a field of chips (links, tags, enum list items) draws and adds its items. */
interface ChipConfig {
  many: boolean;
  chip: (host: HTMLElement, item: string) => void;
  suggest: (query: string, items: string[]) => Suggestion[];
  /** What Enter on typed text adds, or null to refuse it. */
  normalize: (text: string) => string | null;
  placeholder: string;
}

const isTagKey = (key: string): boolean => key === 'tags' || key === 'tag';

/**
 * One property as a form field. Read mode draws the same fields as edit mode, only read-only (so the
 * text can still be selected and scrolled). Properties that hold links, tags or several enum values
 * are fields of chips: links open their note, tags look like Obsidian tags, and in edit mode a chip can
 * be removed and an input adds one from a list of suggestions (matching notes for links).
 */
// @tg: implements:: [[visualization#Editable details]] {since: "2026-10-24"}
// @lat: [[visualization#Editable details]]
// @tg: implements:: [[openspec:graph-view#Editable details]] {since: "2026-10-24"}
export function renderField(td: HTMLElement, c: FieldContext): void {
  if (isTagKey(c.key) && (c.hasValue || c.editable)) return chipField(td, c, tagConfig(c));
  if (c.links && (c.link !== null || (c.hasValue && containsLink(c.value, c.source)))) return chipField(td, c, linkConfig(c));
  const spec = fieldSpec(c.hasValue ? c.value : null, c.declared);
  if (spec.kind === 'enum-list' && (c.hasValue || c.editable)) return chipField(td, c, enumListConfig(c, spec));
  if (!c.editable) return readOnlyField(td, c, spec);
  const error = td.createDiv({ cls: 'obsigraph-edit-error' });
  const commit = (raw: string | boolean | string[], control?: HTMLElement) => {
    const r = coerceInput(spec, raw);
    control?.toggleClass('is-invalid', !r.ok);
    error.setText(r.ok ? '' : r.error);
    if (r.ok) c.commit(r.value);
  };
  editorControl(td, c, spec, c.hasValue ? c.value : null, commit);
  td.append(error); // below the control
}

const plain = (spec: FieldSpec, c: FieldContext): string => {
  if (!c.hasValue) return c.text;
  if (Array.isArray(c.value)) return c.value.flat(Infinity).map(String).join(', ');
  return formatInput(spec, c.value);
};

/** A text box the user can drag taller; the height is remembered per property while Obsidian runs. */
function textBox(td: HTMLElement, c: FieldContext, text: string, readonly: boolean, rows: number): HTMLTextAreaElement {
  const area = td.createEl('textarea', { attr: { rows: String(rows), ...(readonly ? { readonly: '' } : {}) } });
  area.value = text;
  const saved = c.heights.get(c.key);
  if (saved) area.style.height = `${saved}px`;
  let before = 0;
  area.addEventListener('pointerdown', () => (before = area.offsetHeight));
  area.addEventListener('pointerup', () => {
    if (area.offsetHeight > 0 && area.offsetHeight !== before) c.heights.set(c.key, area.offsetHeight);
  });
  return area;
}

function readOnlyField(td: HTMLElement, c: FieldContext, spec: FieldSpec): void {
  if (c.hasValue && spec.kind === 'boolean') {
    const box = td.createEl('input', { attr: { type: 'checkbox', disabled: '' } });
    box.checked = c.value === true;
    return;
  }
  const text = plain(spec, c);
  // The note's type is one line that cannot be resized.
  if (c.key === 'type') return void textBox(td, c, text, true, 1).addClass('obsigraph-fixed');
  textBox(td, c, text, true, Math.min(4, Math.max(1, text.split('\n').length)));
}

function chevron(host: HTMLElement): void {
  setIcon(host.createSpan({ cls: 'obsigraph-chevron' }), 'chevron-down');
}

/** An input whose focus opens a list of suggestions, styled like Obsidian's own. */
class ListSuggest extends AbstractInputSuggest<Suggestion> {
  constructor(
    app: App,
    input: HTMLInputElement,
    private readonly get: (query: string) => Suggestion[],
    private readonly choose: (s: Suggestion) => void,
  ) {
    super(app, input);
    // Show the list on focus and click, not only after typing.
    const show = () => input.dispatchEvent(new Event('input'));
    input.addEventListener('focus', show);
    input.addEventListener('click', show);
  }

  getSuggestions(query: string): Suggestion[] {
    return this.get(query);
  }

  renderSuggestion(s: Suggestion, el: HTMLElement): void {
    s.render(el);
  }

  selectSuggestion(s: Suggestion): void {
    this.choose(s);
    this.close();
  }
}

/** Typing `[[` in a text box suggests notes (of the types the schema allows) by the characters typed after it. */
class TextLinkSuggest extends AbstractInputSuggest<Suggestion> {
  constructor(
    app: App,
    private readonly area: HTMLTextAreaElement,
    private readonly find: (query: string) => Suggestion[],
  ) {
    super(app, area as unknown as HTMLInputElement);
  }

  /** The characters between an unclosed `[[` and the caret, or null when the caret is not inside one. */
  private pending(): { start: number; query: string } | null {
    const caret = this.area.selectionStart ?? this.area.value.length;
    const m = /\[\[([^[\]|\n]*)$/.exec(this.area.value.slice(0, caret));
    return m ? { start: m.index, query: m[1]! } : null;
  }

  getSuggestions(): Suggestion[] {
    const o = this.pending();
    return o ? this.find(o.query) : [];
  }

  renderSuggestion(s: Suggestion, el: HTMLElement): void {
    s.render(el);
  }

  selectSuggestion(s: Suggestion): void {
    const o = this.pending();
    if (o) {
      const caret = this.area.selectionStart ?? this.area.value.length;
      const rest = this.area.value.slice(caret).replace(/^\]\]/, '');
      this.area.value = this.area.value.slice(0, o.start) + s.value + rest;
      const at = o.start + s.value.length;
      this.area.setSelectionRange(at, at);
      this.area.dispatchEvent(new Event('change'));
    }
    this.close();
  }
}

function editorControl(td: HTMLElement, c: FieldContext, spec: FieldSpec, value: unknown, commit: (raw: string | boolean | string[], control?: HTMLElement) => void): void {
  switch (spec.kind) {
    case 'boolean': {
      const box = td.createEl('input', { attr: { type: 'checkbox' } });
      box.checked = value === true;
      box.addEventListener('change', () => commit(box.checked, box));
      return;
    }
    case 'enum': {
      const wrap = td.createDiv({ cls: 'obsigraph-field is-editable' });
      const input = wrap.createEl('input', { attr: { type: 'text', placeholder: 'Choose…' } });
      let committed = chosenOptions(value)[0] ?? '';
      input.value = committed;
      const options = spec.options.map(String);
      if (committed && !options.includes(committed)) options.push(committed);
      new ListSuggest(
        c.app,
        input,
        (q) => {
          const t = q === committed ? '' : q.trim().toLowerCase();
          return ['', ...options].filter((o) => o.toLowerCase().includes(t)).map((o) => ({ value: o, render: (el) => el.setText(o || '(empty)') }));
        },
        (s) => {
          committed = s.value;
          input.value = s.value;
          commit(s.value, input);
        },
      );
      // Typing only filters the list; leaving without a choice restores the value.
      input.addEventListener('blur', () => window.setTimeout(() => (input.value = committed), 150));
      chevron(wrap);
      return;
    }
    case 'longtext': {
      const text = formatInput(spec, value);
      const area = textBox(td, c, text, false, Math.min(6, Math.max(2, text.split('\n').length)));
      area.addEventListener('change', () => commit(area.value, area));
      suggestNotes(area, c);
      return;
    }
    case 'text':
    case 'list': {
      const area = textBox(td, c, formatInput(spec, value), false, 1);
      if (spec.kind === 'list') area.placeholder = 'a, b, c';
      suggestNotes(area, c);
      area.addEventListener('change', () => commit(area.value, area));
      area.addEventListener('keydown', (e) => {
        // Enter inside an unclosed [[ belongs to the note suggestions.
        if (e.key === 'Enter' && !e.shiftKey && !/\[\[[^[\]|\n]*$/.test(area.value.slice(0, area.selectionStart ?? 0))) {
          e.preventDefault();
          area.blur();
        }
      });
      return;
    }
    default: {
      const date = spec.kind === 'date' && /^(\d{4}-\d{2}-\d{2})?$/.test(formatInput(spec, value));
      const input = td.createEl('input', { attr: { type: date ? 'date' : 'text', ...(spec.kind === 'datetime' ? { placeholder: 'YYYY-MM-DDTHH:mm' } : {}) } });
      input.value = formatInput(spec, value);
      input.addEventListener('change', () => commit(input.value, input));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
      });
    }
  }
}

function suggestNotes(area: HTMLTextAreaElement, c: FieldContext): void {
  const cfg = linkConfig(c);
  new TextLinkSuggest(c.app, area, (q) => cfg.suggest(q, []));
}

/** Links: a note name as a link, the type at the other end beside it as plain text. */
function linkConfig(c: FieldContext): ChipConfig {
  return {
    many: !!c.link?.many || Array.isArray(c.value),
    chip: (host, item) => appendLinks(host, item, c),
    suggest: (q) =>
      suggestLinks(c.candidates(), q, c.link?.targets ?? null).map((n) => ({
        value: `[[${linkText(c, n)}]]`,
        render: (el) => {
          el.createEl('a', { cls: 'internal-link obsigraph-suggest-link', text: candidateName(n) });
          if (n.labels.length > 0) el.createSpan({ cls: 'obsigraph-suggest-type', text: n.labels.join(', ') });
        },
      })),
    normalize: (text) => (text.includes('[[') ? text : `[[${text}]]`),
    placeholder: 'Add a link…',
  };
}

function linkText(c: FieldContext, n: GraphNode): string {
  const file = n.stub ? null : c.app.vault.getAbstractFileByPath(n.id);
  return file instanceof TFile ? c.app.metadataCache.fileToLinktext(file, c.source ?? '', true) : n.id;
}

const cleanTag = (t: string): string => t.trim().replace(/^#+/, '').replace(/\s+/g, '-');

/** Tags drawn the way Obsidian draws them; suggestions are the tags in use in the vault. */
function tagConfig(c: FieldContext): ChipConfig {
  const tag = (host: HTMLElement, name: string) => host.createEl('a', { cls: 'tag', text: name, attr: { href: `#${name}` } });
  return {
    many: true,
    chip: (host, item) => {
      const a = tag(host, cleanTag(item));
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        // The core Search plugin has no public API; without it the tag just is not clickable.
        (c.app as unknown as { internalPlugins?: { getPluginById(id: string): { instance?: { openGlobalSearch?(q: string): void } } | undefined } }).internalPlugins?.getPluginById('global-search')?.instance?.openGlobalSearch?.(`tag:#${cleanTag(item)}`);
      });
    },
    suggest: (q, items) => {
      const t = cleanTag(q).toLowerCase();
      return Object.keys((c.app.metadataCache as unknown as { getTags(): Record<string, number> }).getTags())
        .map(cleanTag)
        .filter((n) => !items.map(cleanTag).includes(n) && n.toLowerCase().includes(t))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 12)
        .map((n) => ({ value: n, render: (el) => void tag(el, n) }));
    },
    normalize: (text) => cleanTag(text) || null,
    placeholder: 'Add a tag…',
  };
}

/** A list of enum values: the chosen ones as chips, the rest offered from the dropdown. */
function enumListConfig(c: FieldContext, spec: FieldSpec): ChipConfig {
  const options = spec.options.map(String);
  return {
    many: true,
    chip: (host, item) => host.appendText(item),
    suggest: (q, items) => options.filter((o) => !items.includes(o) && o.toLowerCase().includes(q.trim().toLowerCase())).map((o) => ({ value: o, render: (el) => el.setText(o) })),
    normalize: (text) => options.find((o) => o.toLowerCase() === text.trim().toLowerCase()) ?? null,
    placeholder: options.length ? 'Choose…' : '',
  };
}

/** A field of chips: each removable in edit mode, with an input that adds one from the suggestions. */
function chipField(td: HTMLElement, c: FieldContext, cfg: ChipConfig): void {
  const items = c.hasValue ? linkItems(c.value) : [];
  const box = td.createDiv({ cls: `obsigraph-field obsigraph-chip-field${c.editable ? ' is-editable' : ''}` });
  const save = () => c.commit(fromLinkItems(items, cfg.many));
  const draw = (focus = false) => {
    box.empty();
    items.forEach((item, i) => {
      const chip = box.createSpan({ cls: 'obsigraph-chip' });
      cfg.chip(chip, item);
      if (!c.editable) return;
      chip.createSpan({ cls: 'obsigraph-chip-remove', text: '×', attr: { 'aria-label': 'Remove' } }).addEventListener('click', () => {
        items.splice(i, 1);
        save();
        draw();
      });
    });
    if (!c.editable) return;
    if (cfg.many || items.length === 0) {
      const input = box.createEl('input', { cls: 'obsigraph-chip-input', attr: { type: 'text', placeholder: items.length ? '' : cfg.placeholder } });
      const add = (value: string) => {
        if (!items.includes(value)) items.push(value);
        save();
        draw(true);
      };
      const suggest = new ListSuggest(c.app, input, (q) => cfg.suggest(q, items), (s) => add(s.value));
      // Enter on text that matches no suggestion adds it as typed; a chosen suggestion has already cleared the input.
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        window.setTimeout(() => {
          const text = input.value.trim();
          const value = text ? cfg.normalize(text) : null;
          if (!value) return;
          suggest.close();
          add(value);
        }, 0);
      });
      if (focus) input.focus();
    }
    chevron(box);
  };
  draw();
  box.addEventListener('click', (ev) => {
    if (ev.target === box) box.querySelector('input')?.focus();
  });
}

/** Text and links of one value; links open their note, in a new tab with Cmd/Ctrl. */
function appendLinks(host: HTMLElement, value: unknown, c: FieldContext): void {
  for (const part of valueLines(value, c.source).flat()) {
    if ('text' in part) {
      host.appendText(part.text);
      continue;
    }
    const { target, subpath, label } = part.link;
    const href = subpath ? `${target}#${subpath}` : target;
    const a = host.createEl('a', { cls: 'internal-link', text: label, attr: { href, 'data-href': href, title: href } });
    if (!c.app.metadataCache.getFirstLinkpathDest(target, c.source ?? '')) a.addClass('is-unresolved');
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      c.open(href, c.source ?? '', ev.ctrlKey || ev.metaKey);
    });
  }
}
