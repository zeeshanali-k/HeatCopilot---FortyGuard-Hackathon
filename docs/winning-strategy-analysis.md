# Winning-Strategy Analysis — HeatCopilot vs. Previous Hackathon Winners

Source: `docs/HeatCopilot Previous Hackathon Deep_Analysis.docx` (review of AI x City Climate Action, ACT28, WFEO Resilient Cities winners: DUCTExplorer, Polisense.AI, EcoGuardian.AI).

## What our plan already gets right

| Lesson from winners | Where our plan covers it |
|---|---|
| Solve decisions, not problems | Core framing: "where to invest, why, what to do" — Priority Score + interventions, not just heatmaps |
| Data → actionable intelligence | Pipeline chains Heatmap → Duration → Exposure → Greenery → Intervention |
| Clear customer & impact | Municipalities/urban planners; budget-allocation use case (core idea doc §2, §12) |
| Explainable score | Transparent weighted formula, breakdown bars in ZoneCard |
| AI supports explanation, not unexplained decisions | LLM only writes narratives from computed data (Feature 4) — exactly the recommended AI strategy |
| Avoid "just another dashboard" | Feature buttons trigger decision pipeline; markers → select → prioritize flow |
| Avoid unsupported claims | LLM prompt guardrail: cite only supplied numbers (Feature 4 spec) |

## Gaps the analysis exposes

### 1. Budget optimization is only implicit — make it explicit ⭐ biggest gap
The analysis calls budget optimization "the strongest differentiator": rank zones, **compare intervention options**, support maximum-impact investment. Our current plan ranks zones and recommends one intervention, but never takes a budget as input. Winners like Polisense.AI are literally "help governments prioritize investments."

**Addition (new Feature 5):** a budget input — "I have $2M" → the system walks down the ranked zone list, applies rough per-intervention cost estimates, and returns the maximum-impact selection with a running total. Greedy selection, ~1 day of work, huge pitch payoff.

### 2. Intervention comparison, not just a single recommendation
The analysis says winners "compare intervention options." Our rule engine outputs one intervention.

**Addition:** ZoneCard shows the recommended intervention plus 1–2 alternatives with trade-off notes ("cool pavement: higher cost, longer lifespan"). Small extension of the rule table — each rule emits ranked candidates, first = recommended.

### 3. No demo script / pitch artifact
The analysis stresses: judges must understand problem, solution, and impact within the first minute, and provides a 5-slide story. Our plan has a demo flow but no scripted pitch.

**Addition:** `docs/demo-script.md` — map the analysis's 5-slide arc (Problem → Gap → Solution → How it works → Impact) onto our 5-click demo, with timing (~60s problem, ~90s live demo, ~30s impact).

### 4. Scoped Q&A on analyzed zones (optional stretch)
The analysis lists "answer questions about analysed zones" under AI strategy. This is compatible with our no-chatbot stance: it's Q&A **over computed results only**, unlocked after an analysis completes — not free-form orchestration. Optional stretch after Feature 4, same guardrails (answers may only reference supplied data).

## Things the analysis warns against — rechecked

- **Building too many features before the core workflow works** → with ~4 days left, the build order below front-loads Features 1–3; Feature 5 is only worth doing because it reuses Feature 3's outputs.
- **Unsupported climate impact claims** → no "X°C cooler" predictions anywhere in UI or narrative; we state measured data and rule-based recommendations only.
- **AI without purpose** → AI touches the project only at narrative/reporting (Feature 4) and optionally scoped Q&A.

## Revised build order (Aug 26 → Aug 30, ~4 days)

1. **Day 1 (Aug 26):** Scaffold + FortyGuard client + cache; verify plan tier; Feature 1 backend end-to-end on Phoenix, fixtures saved.
2. **Day 2 (Aug 27):** Feature 1 frontend (map, markers, popups) + Feature 2 (duration/peak) — frontend and backend in parallel if two people.
3. **Day 3 (Aug 28):** Feature 3 (prioritize: scoring, rules, Overpass, ZoneCard) — the flagship must be solid today.
4. **Day 4 (Aug 29):** Feature 5 (budget optimizer — small, high value) + Feature 4 (LLM narrative). Cut Feature 4 to a template-generated briefing if LLM time runs out.
5. **Day 5 (Aug 30):** Demo hardening in fixture mode, demo script rehearsal, video, submit. Nothing new.

**Dropped for time:** multi-city pre-computation, Heat Intelligence PDF, street-view segmentation, scoped Q&A (stretch only).
