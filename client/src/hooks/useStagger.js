/**
 * Per-index transition-delay helper honoring the stagger cap.
 *
 * Stagger cap: 6 items × 50ms steps; longer lists animate as one block.
 *
 * @param {number} index - item index in the list
 * @param {number} [step=50] - delay per step in ms
 * @param {number} [cap=6] - maximum number of items to stagger
 * @returns {{ transitionDelay: string }} style object ready for JSX
 */
export function useStagger(index, { step = 50, cap = 6 } = {}) {
  const clampedIndex = Math.min(Math.max(index, 0), cap - 1);
  const delay = clampedIndex < cap ? clampedIndex * step : 0;
  return { transitionDelay: `${delay}ms` };
}
