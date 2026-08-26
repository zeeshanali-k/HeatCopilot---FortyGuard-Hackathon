# Feature 9 — Shared Motion Foundation (cross-cutting)

Most of the original UI-motion work has been merged into the features that own it:

| Motion / UI change | Lives in |
|---|---|
| Motion tokens, easing, stagger rules, reduced-motion, expand-in-place pattern | [`docs/design-guidelines.md`](../design-guidelines.md) §Motion |
| Timeline animations, marker stagger/pulse, overlay fade, popup spring, button sweep | [`01-find-hotspots.md`](01-find-hotspots.md) |
| ResultsPanel 3-state expansion, score count-up, animated breakdown bars, zone boundary draw-on, list stagger | [`03-prioritize-zones.md`](03-prioritize-zones.md) |
| CompareView bottom sheet, history overlay fades, rerun score flash | [`07-analysis-history.md`](07-analysis-history.md) |
| Narrative block-by-block reveal | [`08-action-plan-v2.md`](08-action-plan-v2.md) |

What remains here is the **shared foundation** those features rely on.

## Shared utilities

- [ ] `client/src/hooks/useCountUp.js` — rAF-based number tween; returns final value instantly under reduced-motion
- [ ] `client/src/hooks/useStagger.js` — per-index `transition-delay` helper honoring the stagger cap (6 items × 50ms)
- [ ] `client/src/theme.css` — motion tokens (spec in design guidelines §Motion)
- [ ] `client/src/index.css` — shared keyframes (pulse, shimmer, dash-draw) + the single `prefers-reduced-motion` media query

## Cross-cutting acceptance criteria

Apply to every feature using motion:

- No animation blocks interaction — buttons and map remain usable mid-motion.
- With OS/browser `prefers-reduced-motion: reduce`, the app is fully usable with fade-only transitions.
- 60fps during the heaviest sequence (marker stagger + overlay fade) on a mid-range laptop; if janky, cut staggers first.
- Every expanded view (panel or bottom sheet) dismisses via Esc, scrim/outside click, and toggle icon.

## Depends on

Nothing — land this first (or alongside the first feature that uses it: Feature 1's motion tasks). ~0.5 day.
