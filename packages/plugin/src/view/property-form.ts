import type { GraphNode, PropertySchema } from '@obsigraph/core';
import { candidateName, chosenOptions, coerceInput, fieldSpec, formatInput, fromLinkItems, linkItems, suggestLinks, type FieldSpec } from '@obsigraph/graph-ui';
import { AbstractInputSuggest, Menu, TFile, setIcon, type App } from 'obsidian';
import { valueLines } from './view-state';

/** Everything the details pane knows about one property row. */
export interface FieldContext {
  app: App;
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
  candidates: () => Iterable<GraphNode>;
  open: (href: string, source: string, newTab: boolean) => void;
  commit: (value: unknown) => void;
}

const containsLink = (value: unknown, source: string | null): boolean => valueLines(value, source).some((parts) => parts.some((p) => 'link' in p));

/**
 * One property as a form field. Read mode draws the same fields as edit mode, only read-only (so the
 * text can still be selected and scrolled); a property that holds links draws them as clickable links
 * in both modes, and in edit mode offers matching notes while typing a new one.
 */
// @tg: implements:: [[visualization#Editable details]] {since: "2026-10-24"}
// @lat: [[visualization#Editable details]]
// @tg: implements:: [[openspec:graph-view#Editable details]] {since: "2026-10-24"}
export function renderField(td: HTMLElement, c: FieldContext): void {
  const isLink = c.links && (c.link !== null || (c.hasValue && containsLink(c.value, c.source)));
  if (isLink) return linkField(td, c);
  const spec = fieldSpec(c.hasValue ? c.value : null, c.declared);
  if (!c.editable) return readOnlyField(td, c, spec);
  const error = td.createDiv({ cls: 'obsigraph-edit-error' });
  const commit = (raw: string | boolean | string[], control?: HTMLElement) => {
    const r = coerceInput(spec, raw);
    control?.toggleClass('is-invalid', !r.ok);
    error.setText(r.ok ? '' : r.error);
    if (r.ok) c.commit(r.value);
  };
  editorControl(td, spec, c.hasValue ? c.value : null, commit);
  td.append(error); // below the control
}

const plain = (spec: FieldSpec, c: FieldContext): string => {
  if (!c.hasValue) return c.text;
  if (Array.isArray(c.value)) return c.value.flat(Infinity).map(String).join(', ');
  return formatInput(spec, c.value);
};

function readOnlyField(td: HTMLElement, c: FieldContext, spec: FieldSpec): void {
  if (c.hasValue && spec.kind === 'boolean') {
    const box = td.createEl('input', { attr: { type: 'checkbox', disabled: '' } });
    box.checked = c.value === true;
    return;
  }
  const text = plain(spec, c);
  if (text.includes('\n')) {
    const area = td.createEl('textarea', { attr: { readonly: '' } });
    area.value = text;
    area.rows = Math.min(4, text.split('\n').length);
    return;
  }
  const input = td.createEl('input', { attr: { type: 'text', readonly: '' } });
  input.value = text;
}

function chevron(host: HTMLElement): void {
  setIcon(host.createSpan({ cls: 'obsigraph-chevron' }), 'chevron-down');
}

function editorControl(td: HTMLElement, spec: FieldSpec, value: unknown, commit: (raw: string | boolean | string[], control?: HTMLElement) => void): void {
  switch (spec.kind) {
    case 'boolean': {
      const box = td.createEl('input', { attr: { type: 'checkbox' } });
      box.checked = value === true;
      box.addEventListener('change', () => commit(box.checked, box));
      return;
    }
    case 'enum': {
      const wrap = td.createDiv({ cls: 'obsigraph-field' });
      const select = wrap.createEl('select');
      select.createEl('option', { value: '', text: '' });
      const current = chosenOptions(value)[0];
      const options = spec.options.map(String);
      if (current !== undefined && !options.includes(current)) options.push(current);
      for (const o of options) select.createEl('option', { value: o, text: o });
      select.value = current ?? '';
      select.addEventListener('change', () => commit(select.value, select));
      chevron(wrap);
      return;
    }
    case 'enum-list': {
      const wrap = td.createDiv({ cls: 'obsigraph-field obsigraph-field-button' });
      const chosen = new Set(chosenOptions(value));
      const options = [...new Set([...spec.options.map(String), ...chosen])];
      const label = wrap.createSpan({ cls: 'obsigraph-field-text' });
      const draw = () => {
        label.setText([...chosen].join(', '));
        label.toggleClass('obsigraph-muted', chosen.size === 0);
      };
      draw();
      chevron(wrap);
      wrap.addEventListener('click', (ev) => {
        const menu = new Menu();
        for (const o of options) {
          menu.addItem((i) =>
            i
              .setTitle(o)
              .setChecked(chosen.has(o))
              .onClick(() => {
                if (!chosen.delete(o)) chosen.add(o);
                draw();
                commit(options.filter((x) => chosen.has(x)), wrap);
              }),
          );
        }
        menu.showAtMouseEvent(ev);
      });
      return;
    }
    case 'longtext': {
      const area = td.createEl('textarea');
      area.value = formatInput(spec, value);
      area.rows = Math.min(6, Math.max(2, area.value.split('\n').length));
      area.addEventListener('change', () => commit(area.value, area));
      return;
    }
    default: {
      const date = spec.kind === 'date' && /^(\d{4}-\d{2}-\d{2})?$/.test(formatInput(spec, value));
      const input = td.createEl('input', { attr: { type: date ? 'date' : 'text', ...(spec.kind === 'datetime' ? { placeholder: 'YYYY-MM-DDTHH:mm' } : {}), ...(spec.kind === 'list' ? { placeholder: 'a, b, c' } : {}) } });
      input.value = formatInput(spec, value);
      input.addEventListener('change', () => commit(input.value, input));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
      });
    }
  }
}

/** Notes matching the typed text, offered under the link field's input. */
class NoteSuggest extends AbstractInputSuggest<GraphNode> {
  constructor(
    app: App,
    input: HTMLInputElement,
    private readonly c: FieldContext,
    private readonly choose: (n: GraphNode) => void,
  ) {
    super(app, input);
  }

  getSuggestions(query: string): GraphNode[] {
    return suggestLinks(this.c.candidates(), query, this.c.link?.targets ?? null);
  }

  renderSuggestion(n: GraphNode, el: HTMLElement): void {
    el.createSpan({ text: candidateName(n) });
    if (n.labels.length > 0) el.createSpan({ cls: 'obsigraph-muted', text: `  ${n.labels.join(', ')}` });
  }

  selectSuggestion(n: GraphNode): void {
    this.choose(n);
    this.close();
  }
}

/** A property of links: each a clickable chip; in edit mode removable, with an input to add a note. */
function linkField(td: HTMLElement, c: FieldContext): void {
  const many = !!c.link?.many || Array.isArray(c.value);
  const items = c.hasValue ? linkItems(c.value) : [];
  const box = td.createDiv({ cls: `obsigraph-field obsigraph-link-field${c.editable ? ' is-editable' : ''}` });
  const save = () => c.commit(fromLinkItems(items, many));
  const draw = () => {
    box.empty();
    items.forEach((item, i) => {
      const chip = box.createSpan({ cls: 'obsigraph-chip' });
      appendLinks(chip, item, c);
      if (!c.editable) return;
      const remove = chip.createSpan({ cls: 'obsigraph-chip-remove', text: '×', attr: { 'aria-label': 'Remove' } });
      remove.addEventListener('click', () => {
        items.splice(i, 1);
        save();
        draw();
      });
    });
    if (!c.editable || (!many && items.length > 0)) return;
    const input = box.createEl('input', { cls: 'obsigraph-link-input', attr: { type: 'text', placeholder: items.length ? '' : 'Add a link…' } });
    const add = (link: string) => {
      items.push(link);
      save();
      draw();
    };
    const suggest = new NoteSuggest(c.app, input, c, (n) => {
      const file = n.stub ? null : c.app.vault.getAbstractFileByPath(n.id);
      add(`[[${file instanceof TFile ? c.app.metadataCache.fileToLinktext(file, c.source ?? '', true) : n.id}]]`);
    });
    // Enter on typed text that matches nothing offered adds it as written; a chosen suggestion has cleared the input by then.
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      window.setTimeout(() => {
        const text = input.value.trim();
        if (!text) return;
        suggest.close();
        add(text.includes('[[') ? text : `[[${text}]]`);
      }, 0);
    });
  };
  draw();
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
