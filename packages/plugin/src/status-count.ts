/** Delay after the last change before the status bar recounts whole-vault diagnostics. */
export const DIAGNOSTICS_DELAY_MS = 1500;

export interface StatusCount {
  /** Show the node and edge counts now; recount issues once changes settle. */
  update(): void;
  dispose(): void;
}

/**
 * Status bar text that stays cheap on a large vault: graph size is shown on every change, while the
 * diagnostics count, which validates the whole vault, is recomputed once a burst of changes settles.
 */
// @tg: implements:: [[openspec:graph-model#Deferred diagnostics count]] {since: "0.25.0"}
export function statusCount(
  setText: (text: string) => void,
  size: () => { nodes: number; edges: number },
  countIssues: () => number,
  showIssues: () => boolean,
  delayMs = DIAGNOSTICS_DELAY_MS,
): StatusCount {
  let issues = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const render = () => {
    const { nodes, edges } = size();
    setText(`Typed Graph: ${nodes} nodes, ${edges} edges${issues ? ` · ${issues} issues` : ''}`);
  };
  const recount = () => {
    timer = null;
    issues = showIssues() ? countIssues() : 0;
    render();
  };
  return {
    update() {
      if (!showIssues()) issues = 0;
      render();
      if (timer !== null) clearTimeout(timer);
      timer = showIssues() ? setTimeout(recount, delayMs) : null;
    },
    dispose() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
