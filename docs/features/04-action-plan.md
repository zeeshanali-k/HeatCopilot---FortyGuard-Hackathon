# Feature 4 — Generate Action Plan (AI narrative)

**User story:** As a planner, I click "Generate Action Plan" on a scored zone and get a written briefing I could paste into a memo — why this score, what to do, what the evidence says.

## Scope

- Backend `POST /api/action-plan`: deterministic zone data → LLM (OpenAI-compatible endpoint, base URL + key from env) → narrative prose. The LLM never calls tools or decides what to compute; it only writes from supplied data.
- Frontend: "Generate Action Plan" button in ZoneCard → skeleton loader → narrative renders in card.
- Stretch (only if Premium confirmed + time): Heat Intelligence PDF for the top zone, linked as `evidencePdfUrl`.

## Backend tasks

- [x] `llm.js`: prompt template = zone stats + breakdown + intervention + assets + guardrails ("write 150–200 words, no invented figures, cite only supplied numbers")
- [x] `/api/action-plan` route per `docs/api-contract.md`; 30s timeout, `upstream_error` on failure
- [ ] Stretch: `heat_intelligence` submit/poll/download for top zone; cache PDF in fixtures

## Frontend tasks

- [x] Action-plan section in ZoneCard with loading skeleton and error retry
- [x] Stretch: "Download evidence report (PDF)" link when `evidencePdfUrl` present

## Acceptance criteria

- Click Generate Action Plan on the top Phoenix zone → narrative appears citing only real numbers from the zone card (spot-check: no invented figures).
- LLM failure shows a retry state; app otherwise unaffected.

## Depends on

Feature 3 (zone data exists). LLM API key available (Day-1 open item).
