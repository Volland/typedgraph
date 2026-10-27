import type { Theme } from '@obsigraph/graph-ui';

/** Read Obsidian theme colors so the graph matches light and dark mode. */
export function themeFrom(el: HTMLElement): Theme {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    text: v('--text-normal', '#222'),
    muted: v('--text-faint', '#999'),
    background: v('--background-primary', '#fff'),
    accent: v('--interactive-accent', '#e0a030'),
  };
}
