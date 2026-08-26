# Feature 8 — Action Plan v2 (quantitative, non-truncated LLM briefings)

**Problem with v1:** the memo is generic and sometimes cut off mid-sentence.

Root causes found in the current code:

1. **Truncation:** `server/src/llm.js:152` sets `max_tokens: 500` while the prompt demands a heading + summary + paragraph + two bullet lists — the model runs out of tokens. Worse, `finish_reason` is never checked (`llm.js:163` accepts `choices[0].message.content` unconditionally), so a token-limited response is served as if complete. It is *not* a UI text limit.
2. **Generic content:** `buildPrompt` (`llm.js:45-79`) receives only one zone's bare stats. It gets no rank ("3rd of 12 zones"), no budget or allocation context (Feature 5), no intervention cost estimate, no comparison to other zones, no location/date context. The LLM literally cannot be quantitative about those things — the numbers aren't in the prompt.

## Fixes

### A. Stop truncated responses (backend, `llm.js`)

- [ ] Raise `max_tokens` to **1200** (structure + context sections fit comfortably; cost is negligible on gpt-4o-mini-class models).
- [ ] Check `finish_reason`: if `'length'`, retry once with a "shorten to fit" instruction; if still truncated, **fall back to `deterministicNarrative`** rather than serving a cut response.
- [ ] Serve guard: if the final narrative is < 400 chars or lacks the required heading, return the deterministic fallback. The UI should never render half a memo.
- [ ] Update `llm.test.js`: mock a `finish_reason: 'length'` response → assert fallback is returned.

### B. Make the plan quantitative (richer context object)

Extend `POST /api/action-plan` to accept an optional `context` alongside `zoneData`, and extend `buildPrompt` to use it:

```json
{
  "zoneId": "z_4",
  "zoneData": { "...": "existing, unchanged" },
  "context": {
    "areaLabel": "Downtown Phoenix",
    "date": "2026-07-15",
    "rank": 3,
    "zoneCount": 12,
    "topZones": [
      { "id": "z_1", "score": 92, "interventionLabel": "Tree planting + bus-stop shade" },
      { "id": "z_2", "score": 87, "interventionLabel": "Cool pavement" }
    ],
    "budget": {
      "budgetUsd": 2000000,
      "funded": true,
      "estimatedCostUsd": 120000,
      "runningTotalUsd": 465000
    },
    "alternatives": [
      { "interventionLabel": "Shade structures", "tradeoff": "lower cost, smaller coverage" }
    ]
  }
}
```

- `budget` comes from Feature 5's allocation result when the user has run the optimizer; omitted otherwise (prompt section skipped — no invented figures).
- `alternatives` comes from the rule engine's ranked candidates (Feature 5 change: rules emit candidates, first = recommended).
- Frontend (`api.js` / ZoneCard) assembles `context` from the store: rank = index in `zones`, budget = allocation result, areaLabel from search/last geocode.
- Frontend motion: skeleton shimmer while loading (existing), then the narrative **fades in block-by-block** (top-level Markdown blocks, 100ms stagger, `--ease-out`) instead of appearing all at once.

### C. New prompt structure (llm.js `buildPrompt`)

Same guardrails (only supplied numbers, no invented figures), richer sections:

1. Heading + one-line summary (unchanged).
2. **Why this zone ranks highly** — now includes rank ("3rd of 12 zones analyzed in Downtown Phoenix") and score breakdown.
3. **Key stats** (unchanged bullets).
4. **Cost & budget fit** *(only when `context.budget` present)* — estimated cost, share of budget ("~$120k of the $2.0M allocation, 6%"), running total.
5. **How it compares** *(only when `topZones` present)* — one sentence positioning vs. the top zones.
6. **Recommended next steps** — 3 actions, referencing the primary intervention and named assets ("the 6 bus stops on the worst-decile corridor").

Word target raised to 250–350; truncation guards from section A make this safe.

### D. Deterministic fallback parity

`deterministicNarrative` gets the same context parameter and renders the same sections — demo mode and LLM-failure mode produce equally quantitative output.

## API contract change

`docs/api-contract.md` → `POST /api/action-plan` request gains optional `context` object (shape above). Response unchanged. Backward compatible: v1 clients sending only `zoneData` still work; new sections simply don't appear.

## Acceptance criteria

- 20 consecutive Generate Action Plan calls (LLM + fallback) → no narrative ends mid-sentence; mocked `finish_reason: 'length'` returns the fallback.
- With budget optimizer run at $2M: the memo mentions the estimated cost and budget share for the zone, its rank among analyzed zones, and at least one named asset count — all numbers matching the ZoneCard exactly.
- Without budget context: memo renders cleanly with no cost section and no placeholder text.
- Fallback narrative contains the same quantitative sections as the LLM path.

## Depends on

Feature 3 (exists, implemented). Soft dependency on Feature 5 for the `budget` context — without it, everything else still ships.
