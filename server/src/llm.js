/**
 * LLM action-plan narrative
 *
 * Generates a concise, evidence-based briefing for a prioritized zone.
 * The LLM only writes prose from deterministic inputs; it never calls tools or
 * decides what to compute. When no LLM API key is configured, a deterministic
 * fallback narrative is returned so the demo path still works.
 */

import nodeFetch from 'node-fetch';

// Mutable fetch implementation so tests can mock the upstream LLM call.
let fetchImpl = nodeFetch;
export function __setFetchImpl(impl) {
  fetchImpl = impl;
}

const REQUEST_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_TOKENS = 1200;
const MIN_NARRATIVE_LENGTH = 400;

function readEnv(key, defaultValue) {
  const raw = process.env[key];
  if (raw == null || raw === '') return defaultValue;
  return raw.trim().replace(/^["']|["']$/g, '');
}

function getLlmProvider() {
  return readEnv('LLM_PROVIDER', 'openai').toLowerCase();
}

function getLlmBaseUrl() {
  return readEnv('LLM_BASE_URL', 'https://api.openai.com/v1');
}

function getLlmModel() {
  return readEnv('LLM_MODEL', 'gpt-4o-mini');
}

function isOllama() {
  return getLlmProvider() === 'ollama';
}

function getApiKey() {
  return readEnv('LLM_API_KEY', '');
}

function formatNumber(value) {
  if (value == null) return '—';
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(1);
}

function formatUsd(value) {
  if (value == null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return `${value}`;
}

function ordinal(n) {
  if (n == null) return '—';
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}

function budgetShare(estimated, total) {
  if (!total || total <= 0) return null;
  return Math.round((estimated / total) * 100);
}

function buildPrompt(zoneId, zoneData, context = {}) {
  const { score, breakdown, interventionLabel, reason, stats, assets } = zoneData;
  const {
    areaLabel,
    date,
    rank,
    zoneCount,
    topZones,
    budget,
    alternatives,
  } = context;

  const areaLine = areaLabel ? ` analyzed in ${areaLabel}` : '';
  const rankLine = rank != null && zoneCount != null
    ? ` It ranks ${ordinal(rank)} of ${zoneCount} zones${areaLine}.`
    : '';

  let budgetBlock = '';
  if (budget) {
    const share = budgetShare(budget.estimatedCostUsd, budget.budgetUsd);
    const shareLine = share != null ? `, approximately ${share}% of the $${formatUsd(budget.budgetUsd)} allocation` : '';
    const fundedLine = budget.funded ? 'This zone is funded in the current budget.' : 'This zone is not yet funded in the current budget.';
    budgetBlock = `
COST & BUDGET FIT:
- Estimated intervention cost: ~$${formatUsd(budget.estimatedCostUsd)}${shareLine}.
- Running total after this zone: ~$${formatUsd(budget.runningTotalUsd)}.
- ${fundedLine}`;
  }

  let comparisonBlock = '';
  if (topZones && topZones.length > 0) {
    const list = topZones
      .map((z) => `Zone ${z.id} (${formatNumber(z.score)}/100, ${z.interventionLabel})`)
      .join('; ');
    comparisonBlock = `
HOW IT COMPARES:
- Top zones: ${list}.`;
  }

  let alternativesBlock = '';
  if (alternatives && alternatives.length > 0) {
    const list = alternatives
      .map((a) => `${a.interventionLabel} — ${a.tradeoff}`)
      .join('; ');
    alternativesBlock = `
ALTERNATIVE INTERVENTIONS:
- ${list}.`;
  }

  return `You are a heat-mitigation planner writing a concise, evidence-based action plan for a high-priority hot zone.

Use ONLY the figures supplied below. Do not invent, assume, or round any numbers. Cite the supplied values explicitly.

DATA FOR ZONE ${zoneId}:
- Priority Score: ${formatNumber(score)}/100
- Heat intensity: ${formatNumber(breakdown?.heat)}/100
- Heat duration: ${formatNumber(breakdown?.duration)}/100
- Public exposure: ${formatNumber(breakdown?.exposure)}/100
- Greenery deficit: ${formatNumber(breakdown?.greenery)}/100
- Mean temperature: ${formatNumber(stats?.tempMean)}°C
- Max temperature: ${formatNumber(stats?.tempMax)}°C
- Longest dangerous heat streak: ${formatNumber(stats?.longestStreakHrs)} hours
- Vegetation cover: ${formatNumber(stats?.vegetationPct)}%
- Wet-bulb max: ${formatNumber(stats?.wetBulbMax)}°C
- Bus stops: ${formatNumber(assets?.busStops)}
- Schools: ${formatNumber(assets?.schools)}
- Parks: ${formatNumber(assets?.parks)}
- Recommended intervention: ${interventionLabel}
- Reason: ${reason}

CONTEXT:${rankLine}
- Analysis date: ${date || '—'}${budgetBlock}${comparisonBlock}${alternativesBlock}

FORMAT:
Return the response as Markdown using this exact structure:

1. A bold heading on its own line: **MEMORANDUM: URGENT HEAT MITIGATION ACTION PLAN – ZONE ${zoneId}**
2. A one-line summary: Priority Score: ${formatNumber(score)}/100. Primary intervention: **${interventionLabel}**.
3. A "Why this zone ranks highly" paragraph (2-3 sentences) citing only the supplied numbers, including its rank and score breakdown.
4. A "Key stats" bullet list with the most important supplied figures.
${budget ? '5. A "Cost & budget fit" paragraph with the estimated cost, share of budget, running total, and funded status.\n' : ''}${topZones?.length ? `${budget ? '6' : '5'}. A "How it compares" paragraph positioning this zone vs. the top zones.\n` : ''}${budget || topZones?.length ? `${(budget ? 1 : 0) + (topZones?.length ? 1 : 0) + 5}.` : '5.'} A "Recommended next steps" bullet list with 3 short, practical actions, referencing the primary intervention and named assets.

Keep the total length between 250 and 350 words. Use **bold** for emphasis and bullet points for lists. Do not mention a PDF unless one is explicitly linked.`;
}

function deterministicNarrative(zoneId, zoneData, context = {}) {
  const { score, breakdown, interventionLabel, reason, stats, assets } = zoneData || {};
  const {
    areaLabel,
    date,
    rank,
    zoneCount,
    topZones,
    budget,
    alternatives,
  } = context;

  const areaText = areaLabel ? ` in ${areaLabel}` : '';
  const dateText = date ? ` on ${date}` : '';
  const rankText = rank != null && zoneCount != null
    ? `It ranks ${ordinal(rank)} of ${zoneCount} zones analyzed${areaText}${dateText}. `
    : '';

  const lines = [
    `**MEMORANDUM: URGENT HEAT MITIGATION ACTION PLAN – ZONE ${zoneId}**`,
    '',
    `Priority Score: ${formatNumber(score)}/100. Primary intervention: **${interventionLabel}**.`,
    '',
    '**Why this zone ranks highly**',
    '',
    `${rankText}This zone scores ${formatNumber(score)}/100, driven by heat intensity (${formatNumber(breakdown?.heat)}), heat duration (${formatNumber(breakdown?.duration)}), public exposure (${formatNumber(breakdown?.exposure)}), and greenery deficit (${formatNumber(breakdown?.greenery)}). ${reason}`,
    '',
    '**Key stats**',
    '',
    `- Mean temperature: ${formatNumber(stats?.tempMean)}°C (max ${formatNumber(stats?.tempMax)}°C)`,
    `- Longest dangerous heat streak: ${formatNumber(stats?.longestStreakHrs)} hours`,
    `- Vegetation cover: ${formatNumber(stats?.vegetationPct)}%`,
    `- Wet-bulb max: ${formatNumber(stats?.wetBulbMax)}°C`,
    `- Public assets: ${formatNumber(assets?.busStops)} bus stop(s), ${formatNumber(assets?.schools)} school(s), ${formatNumber(assets?.parks)} park(s)`,
  ];

  if (budget) {
    const share = budgetShare(budget.estimatedCostUsd, budget.budgetUsd);
    const shareText = share != null ? ` — approximately ${share}% of the $${formatUsd(budget.budgetUsd)} allocation` : '';
    lines.push(
      '',
      '**Cost & budget fit**',
      '',
      `The recommended intervention is estimated at ~$${formatUsd(budget.estimatedCostUsd)}${shareText}. The running total after funding this zone is ~$${formatUsd(budget.runningTotalUsd)}. ${budget.funded ? 'This zone is funded in the current budget.' : 'This zone is not yet funded in the current budget.'}`
    );
  }

  if (topZones && topZones.length > 0) {
    const list = topZones
      .map((z) => `Zone ${z.id} (${formatNumber(z.score)}/100, ${z.interventionLabel})`)
      .join('; ');
    lines.push(
      '',
      '**How it compares**',
      '',
      `Compared with the top-ranked zones — ${list} — this zone remains a high-priority candidate based on its score and asset exposure.`
    );
  }

  if (alternatives && alternatives.length > 0) {
    const list = alternatives
      .map((a) => `${a.interventionLabel} (${a.tradeoff})`)
      .join('; ');
    lines.push(
      '',
      '**Alternative interventions**',
      '',
      `Other options to consider: ${list}.`
    );
  }

  lines.push(
    '',
    '**Recommended next steps**',
    '',
    `- Confirm site conditions and the ${formatNumber(assets?.busStops)} bus stop(s), ${formatNumber(assets?.schools)} school(s), and ${formatNumber(assets?.parks)} park(s) with a rapid field survey.`,
    `- Coordinate with asset owners or operators to prepare ${interventionLabel} implementation.`,
    `- Sequence implementation to protect the most exposed areas first, adding shade and hydration support during peak heat.`
  );

  return lines.join('\n');
}

function upstreamError(message, code = 'upstream_error', status = 502) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function expectedHeading(zoneId) {
  return `**MEMORANDUM: URGENT HEAT MITIGATION ACTION PLAN – ZONE ${zoneId}**`;
}

function isNarrativeValid(narrative, zoneId) {
  if (!narrative || narrative.length < MIN_NARRATIVE_LENGTH) return false;
  return narrative.includes(expectedHeading(zoneId));
}

async function callLlm(prompt) {
  const baseUrl = getLlmBaseUrl();
  const model = getLlmModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers = { 'Content-Type': 'application/json' };
    const apiKey = getApiKey();
    if (apiKey && !isOllama()) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: MAX_TOKENS,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown error');
      throw upstreamError(`LLM request failed: ${res.status} ${text}`);
    }

    const json = await res.json();
    const message = json.choices?.[0]?.message;
    const narrative = message?.content?.trim();
    const finishReason = json.choices?.[0]?.finish_reason;

    if (!narrative) {
      throw upstreamError('LLM returned an empty narrative');
    }

    return { narrative, finishReason };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw upstreamError('LLM request timed out after 10 minutes', 'upstream_timeout', 504);
    }
    if (err.code) throw err;
    throw upstreamError(`LLM request failed: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateActionPlan({ zoneId, zoneData, context }) {
  if (!zoneId || !zoneData) {
    throw upstreamError('zoneId and zoneData are required', 'invalid_request', 400);
  }

  const apiKey = getApiKey();
  if (!apiKey && !isOllama()) {
    return {
      narrative: deterministicNarrative(zoneId, zoneData, context),
      evidencePdfUrl: null,
    };
  }

  const prompt = buildPrompt(zoneId, zoneData, context);
  let result = await callLlm(prompt);

  // If the response was truncated by the token limit, retry once with a
  // stronger instruction to shorten. If the retry also fails or is still
  // truncated, fall back to the deterministic narrative rather than serving a
  // cut-off memo.
  if (result.finishReason === 'length') {
    const shortPrompt = `${prompt}\n\nIMPORTANT: Your previous response was too long and was truncated. Please shorten your response to fit within the available length while keeping all required sections and every supplied number intact.`;
    try {
      result = await callLlm(shortPrompt);
    } catch {
      return {
        narrative: deterministicNarrative(zoneId, zoneData, context),
        evidencePdfUrl: null,
      };
    }
    if (result.finishReason === 'length') {
      return {
        narrative: deterministicNarrative(zoneId, zoneData, context),
        evidencePdfUrl: null,
      };
    }
  }

  // Final serve guard: never render a half-finished memo.
  if (!isNarrativeValid(result.narrative, zoneId)) {
    return {
      narrative: deterministicNarrative(zoneId, zoneData, context),
      evidencePdfUrl: null,
    };
  }

  return {
    narrative: result.narrative,
    evidencePdfUrl: null,
  };
}
