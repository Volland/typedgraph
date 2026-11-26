export type PropValue = string | number | boolean | null | PropValue[];
export type Props = Record<string, PropValue>;

/**
 * A wikilink as Obsidian highlights it: `[[`, then no bracket or line break, then `]]`.
 * Sticky, so it only matches where `lastIndex` points.
 */
// @lat: [[edge-syntax#Links in property values]]
export const PROPERTY_LINK = /\[\[[^[\]\r\n]*\]\]/y;

// @tg: implements:: [[openspec:edge-parsing#Malformed property blocks]]
export class PropsSyntaxError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
  }
}

/**
 * Parse a tolerant JSON5-like property block such as
 * `{since: 2020, label: "met at conf", tags: [a, b], place: [[Paris]],}`.
 * An unquoted wikilink is a string, so a nested list holding one word is `[[a],]` or `[ [a] ]`.
 * Returns the props and the offset just past the closing brace.
 */
// @tg: implements:: [[openspec:edge-parsing#Inline edge form]]
// @tg: implements:: [[openspec:edge-parsing#Weight is independent of sign]]
// @tg: implements:: [[openspec:edge-parsing#Links in property values]]
export function parseProps(src: string, start = 0): { props: Props; end: number } {
  let i = start;

  const fail = (msg: string): never => {
    throw new PropsSyntaxError(msg, i);
  };
  const ws = () => {
    while (i < src.length && /\s/.test(src[i]!)) i++;
  };
  const expect = (ch: string) => {
    ws();
    if (src[i] !== ch) fail(`expected '${ch}'`);
    i++;
  };

  const parseString = (): string => {
    const quote = src[i]!;
    i++;
    let out = '';
    while (i < src.length && src[i] !== quote) {
      if (src[i] === '\\' && i + 1 < src.length) {
        const next = src[i + 1]!;
        out += next === 'n' ? '\n' : next === 't' ? '\t' : next;
        i += 2;
      } else {
        out += src[i++];
      }
    }
    if (i >= src.length) fail('unterminated string');
    i++;
    return out;
  };

  const parseKey = (): string => {
    ws();
    if (src[i] === '"' || src[i] === "'") return parseString();
    const m = /^[\p{L}_$][\p{L}\p{N}_$-]*/u.exec(src.slice(i));
    if (!m) fail('expected property name');
    i += m![0].length;
    return m![0];
  };

  const parseValue = (): PropValue => {
    ws();
    const ch = src[i];
    if (ch === undefined) fail('unexpected end of property block');
    if (ch === '"' || ch === "'") return parseString();
    if (ch === '[') {
      // An unquoted [[Wikilink]] is treated as a string instead of a nested array
      PROPERTY_LINK.lastIndex = i;
      const link = PROPERTY_LINK.exec(src)?.[0];
      if (link) {
        i += link.length;
        return link;
      }
      i++;
      const items: PropValue[] = [];
      ws();
      while (src[i] !== ']') {
        items.push(parseValue());
        ws();
        if (src[i] === ',') {
          i++;
          ws();
        } else if (src[i] !== ']') fail("expected ',' or ']'");
      }
      i++;
      return items;
    }
    // Bare token: number, boolean, null, or unquoted word.
    const m = /^[^,}\]\s][^,}\]]*/.exec(src.slice(i));
    if (!m) fail('expected value');
    const raw = m![0].trimEnd();
    i += m![0].length;
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(raw)) return Number(raw);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null') return null;
    return raw;
  };

  expect('{');
  const props: Props = {};
  ws();
  while (src[i] !== '}') {
    if (i >= src.length) fail("expected '}'");
    const key = parseKey();
    expect(':');
    props[key] = parseValue();
    ws();
    if (src[i] === ',') {
      i++;
      ws();
    } else if (src[i] !== '}') fail("expected ',' or '}'");
  }
  i++;
  return { props, end: i };
}
