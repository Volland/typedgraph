import { afterEach, describe, expect, it, vi } from 'vitest';
import { statusCount } from '../src/status-count';

afterEach(() => vi.useRealTimers());

describe('status bar count', () => {
  // @tg: verifies:: [[openspec:graph-model#Deferred diagnostics count#Burst of changes]] {since: "0.25.0", level: unit}
  // @lat: [[tests/vault-indexing#Diagnostics counted once changes settle]]
  it('shows graph size at once and counts diagnostics once, after a burst of changes settles', () => {
    vi.useFakeTimers();
    const texts: string[] = [];
    let nodes = 1;
    const count = vi.fn(() => 3);
    const s = statusCount((t) => texts.push(t), () => ({ nodes, edges: 0 }), count, () => true, 1000);
    for (let i = 0; i < 5; i++) {
      nodes++;
      s.update();
      vi.advanceTimersByTime(200);
    }
    expect(count).not.toHaveBeenCalled();
    expect(texts.at(-1)).toBe('Typed Graph: 6 nodes, 0 edges');
    vi.advanceTimersByTime(1000);
    expect(count).toHaveBeenCalledTimes(1);
    expect(texts.at(-1)).toBe('Typed Graph: 6 nodes, 0 edges · 3 issues');
    s.dispose();
  });

  // @lat: [[tests/vault-indexing#Diagnostics count off]]
  it('never counts diagnostics while the count is hidden', () => {
    vi.useFakeTimers();
    const texts: string[] = [];
    const count = vi.fn(() => 3);
    const s = statusCount((t) => texts.push(t), () => ({ nodes: 2, edges: 1 }), count, () => false, 10);
    s.update();
    vi.advanceTimersByTime(100);
    expect(count).not.toHaveBeenCalled();
    expect(texts).toEqual(['Typed Graph: 2 nodes, 1 edges']);
  });
});
