/**
 * LLM action-plan narrative
 *
 * Generates a concise, evidence-based briefing for a prioritized zone.
 * The LLM only writes prose from deterministic inputs; it never calls tools or
 * decides what to compute. When no LLM API key is configured, a deterministic
 * fallback narrative is returned so the demo path still works.
 */

import nodeFetch from 'node-fetch';
import { WEIGHTS } from './scoring.js';

// Mutable fetch implementation so tests can mock the upstream LLM call.
let fetchImpl = nodeFetch;
export function __setFetchImpl(impl) {
  fetchImpl = impl;
}

const REQUEST_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_TOKENS = 1600;
const MIN_NARRATIVE_LENGTH = 500;

function readEnv(key, defaultValue) {
  const raw = process.env[key];
  if (raw == null || raw === '') return defaultValue;
  return raw.trim().replace(/^["']|["']$/g, '');
}

function getLlmProvider() {
  return readEnv('LLM_PROVIDER', 'openai').toLowerCase();
}

function getLlmBaseUrl() {
  return readEnv('LLM_BASE_URL', 'https://api.openai.com/v1').replace(/\/+$/, '');
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

function round1(n) {
  return Math.round(n * 10) / 10;
}

function weightedContributions(breakdown) {
  return {
    heat: round1((breakdown?.heat ?? 0) * WEIGHTS.heat),
    duration: round1((breakdown?.duration ?? 0) * WEIGHTS.duration),
    exposure: round1((breakdown?.exposure ?? 0) * WEIGHTS.exposure),
    greenery: round1((breakdown?.greenery ?? 0) * WEIGHTS.greenery),
  };
}

function scoreTotal(contributions) {
  return round1(
    (contributions?.heat ?? 0) +
    (contributions?.duration ?? 0) +
    (contributions?.exposure ?? 0) +
    (contributions?.greenery ?? 0)
  );
}

function riskCategory(score) {
  if (score >= 80) {
    return { level: 'Critical Heat Risk', urgency: 'Immediate intervention' };
  }
  if (score >= 60) {
    return { level: 'High Heat Risk', urgency: 'Priority intervention' };
  }
  if (score >= 40) {
    return { level: 'Moderate Heat Risk', urgency: 'Planned intervention' };
  }
  return { level: 'Low Heat Risk', urgency: 'Monitor and maintain' };
}

function persistenceLabel(hours) {
  if (hours >= 6) return 'High';
  if (hours >= 3) return 'Moderate';
  if (hours > 0) return 'Low';
  return 'None';
}

function formatAssets(assets) {
  const parts = [];
  if (assets?.busStops) parts.push(`${assets.busStops} bus stop${assets.busStops === 1 ? '' : 's'}`);
  if (assets?.schools) parts.push(`${assets.schools} school${assets.schools === 1 ? '' : 's'}`);
  if (assets?.parks) parts.push(`${assets.parks} park${assets.parks === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(', ') : 'None identified';
}

function beneficiaryText(assets) {
  const parts = [];
  if (assets?.schools) parts.push('students');
  if (assets?.busStops) parts.push('commuters');
  if (assets?.parks) parts.push('park visitors');
  return parts.length > 0 ? parts.join(' and ') : 'residents';
}

function priorityBeneficiaries(assets) {
  if (assets?.schools && assets?.busStops) {
    return 'Schools and transit stops (high-risk public locations)';
  }
  if (assets?.schools) return 'Schools (high-risk public locations)';
  if (assets?.busStops) return 'Bus stops (high-risk public locations)';
  if (assets?.parks) return 'Parks and recreational users';
  return 'Residents in the zone';
}

function deriveActionSteps(interventionLabel, assets) {
  const hasSchools = assets?.schools > 0;
  const hasBusStops = assets?.busStops > 0;
  const hasParks = assets?.parks > 0;

  const immediateTargets = [
    hasSchools ? 'schools' : '',
    hasBusStops ? 'bus stops' : '',
    hasParks ? 'parks' : '',
  ].filter(Boolean);

  let immediate = 'Deploy temporary shade and hydration stations during peak heat.';
  if (immediateTargets.length > 0) {
    immediate = `Install temporary shade canopies near ${immediateTargets.join(' and ')} before the next heat season.`;
  }

  const medium = interventionLabel
    ? `Implement ${interventionLabel.toLowerCase()} to reduce surface and ambient heat.`
    : 'Increase vegetation and cool surfaces in the zone.';

  const longTerm = 'Develop a long-term urban cooling strategy integrating green infrastructure, cool surfaces, and ongoing heat monitoring.';

  return { immediate, medium, longTerm };
}

function whyThisRecommendation(zoneData) {
  const { breakdown, stats, assets, reason } = zoneData;
  const bullets = [
    `Heat intensity scores ${formatNumber(breakdown?.heat)}/100 with a mean temperature of ${formatNumber(stats?.tempMean)}°C.`,
    `Public exposure is ${formatNumber(breakdown?.exposure)}/100 based on ${formatAssets(assets)} in the zone.`,
    `Vegetation coverage is only ${formatNumber(stats?.vegetationPct)}%, limiting natural evaporative cooling.`,
    `Heat persists for ${formatNumber(stats?.longestStreakHrs)} hours, creating prolonged dangerous conditions.`,
  ];
  if (reason) bullets.push(reason);
  return bullets;
}

function reportPreamble(zoneId, zoneData, context = {}) {
  const { score, breakdown, stats, assets, interventionLabel } = zoneData;
  const { areaLabel, date, rank, zoneCount, topZones, budget } = context;

  const areaLine = areaLabel ? ` in ${areaLabel}` : '';
  const rankLine = rank != null && zoneCount != null
    ? `It ranks ${ordinal(rank)} of ${zoneCount} zones${areaLine}.`
    : '';

  const risk = riskCategory(score);
  const contrib = weightedContributions(breakdown);
  const computedTotal = scoreTotal(contrib);
  const persistence = persistenceLabel(stats?.longestStreakHrs);
  const actionSteps = deriveActionSteps(interventionLabel, assets);

  return {
    date,
    areaLine,
    rankLine,
    risk,
    contrib,
    computedTotal,
    persistence,
    actionSteps,
    assetList: formatAssets(assets),
    beneficiaries: beneficiaryText(assets),
    priorityBeneficiaries: priorityBeneficiaries(assets),
    why: whyThisRecommendation(zoneData),
    budget,
    topZones,
  };
}

function buildPrompt(zoneId, zoneData, context = {}) {
  const { score, breakdown, interventionLabel, reason, stats, assets } = zoneData;
  const {
    date,
    areaLine,
    rankLine,
    risk,
    contrib,
    computedTotal,
    persistence,
    actionSteps,
    assetList,
    beneficiaries,
    priorityBeneficiaries,
    why,
    budget,
    topZones,
  } = reportPreamble(zoneId, zoneData, context);

  let budgetBlock = '';
  if (budget) {
    const share = budgetShare(budget.estimatedCostUsd, budget.budgetUsd);
    const shareLine = share != null ? ` (approximately ${share}% of the $${formatUsd(budget.budgetUsd)} allocation)` : '';
    const fundedLine = budget.funded ? 'This zone is funded in the current budget.' : 'This zone is not yet funded in the current budget.';
    budgetBlock = `
COST & BUDGET FIT:
- Available budget: $${formatUsd(budget.budgetUsd)}
- Estimated intervention cost for this zone: ~$${formatUsd(budget.estimatedCostUsd)}${shareLine}
- Running total after this zone: ~$${formatUsd(budget.runningTotalUsd)}
- Funding status: ${fundedLine}`;
  }

  let comparisonBlock = '';
  if (topZones && topZones.length > 0) {
    const list = topZones
      .map((z, idx) => `${idx + 1}. Zone ${z.id} — ${formatNumber(z.score)}/100, ${z.interventionLabel}`)
      .join('\n');
    comparisonBlock = `
ZONE RANKING COMPARISON:
${list}`;
  }

  const whyBlock = why.map((line) => `- ${line}`).join('\n');

  return `You are a heat-mitigation planner writing a professional, evidence-based recommendation report for a municipality.

Use ONLY the figures supplied below. Do not invent, assume, or round any numbers. Cite the supplied values explicitly.

DATA FOR ZONE ${zoneId}:
- Priority Score: ${formatNumber(score)}/100
- Heat intensity raw score: ${formatNumber(breakdown?.heat)}/100 (weight ${Math.round(WEIGHTS.heat * 100)}%, contributes ${formatNumber(contrib.heat)} points)
- Heat duration raw score: ${formatNumber(breakdown?.duration)}/100 (weight ${Math.round(WEIGHTS.duration * 100)}%, contributes ${formatNumber(contrib.duration)} points)
- Public exposure raw score: ${formatNumber(breakdown?.exposure)}/100 (weight ${Math.round(WEIGHTS.exposure * 100)}%, contributes ${formatNumber(contrib.exposure)} points)
- Greenery deficit raw score: ${formatNumber(breakdown?.greenery)}/100 (weight ${Math.round(WEIGHTS.greenery * 100)}%, contributes ${formatNumber(contrib.greenery)} points)
- Weighted score total: ${formatNumber(computedTotal)}/100
- Mean temperature: ${formatNumber(stats?.tempMean)}°C
- Max temperature: ${formatNumber(stats?.tempMax)}°C
- Longest dangerous heat streak: ${formatNumber(stats?.longestStreakHrs)} hours (${persistence} persistence)
- Vegetation cover: ${formatNumber(stats?.vegetationPct)}%
- Wet-bulb max: ${formatNumber(stats?.wetBulbMax)}°C
- Vulnerable assets: ${assetList}
- Recommended intervention: ${interventionLabel}
- Reason: ${reason}
- Risk category: ${risk.level}
- Recommended urgency: ${risk.urgency}

CONTEXT:
- Analysis date: ${date || '—'}${rankLine ? `\n- ${rankLine}` : ''}${budgetBlock}${comparisonBlock}

ACTION STEPS TO PRESENT:
- Immediate Action: ${actionSteps.immediate}
- Medium-Term Action: ${actionSteps.medium}
- Long-Term Action: ${actionSteps.longTerm}

WHY THIS RECOMMENDATION:
${whyBlock}

EXPECTED IMPACT:
- Affected population: ${beneficiaries}
- Priority beneficiaries: ${priorityBeneficiaries}
- Expected benefit: Reduction of heat exposure for vulnerable groups during peak heat. Do not claim exact temperature reductions.

FORMAT:
Return the response as Markdown using this exact structure and headings:

1. A level-1 heading on its own line: # Heat Mitigation Recommendation Report – Zone ${zoneId}
2. A "## Heat Risk Summary" section as a bullet list including location, average temperature, heat persistence, vulnerable assets, vegetation coverage, wet-bulb max, priority score, risk level, primary intervention, and recommended urgency.
3. A "## Explainable Priority Score" section that shows each of the four factors with raw score, weight, and weighted contribution, followed by the final score. Present as a Markdown bullet list.
4. A "## Recommended Action" section with Immediate, Medium-Term, and Long-Term bullets.
5. A "## Why This Recommendation?" section with 4-5 bullets drawn only from the supplied why lines.
6. A "## Expected Impact" section with Affected population, Priority beneficiaries, and Expected benefit bullets.
${topZones?.length ? "7. A \"## Zone Ranking Comparison\" section with a numbered list of the top zones.\n" : ''}${budget ? `${topZones?.length ? '8' : '7'}. A "## Cost & Budget Fit" section with available budget, estimated cost, running total, and funding status.\n` : ''}
Keep the total length between 350 and 500 words. Use **bold** for labels and values. Do not mention a PDF unless one is explicitly linked.`;
}

function deterministicNarrative(zoneId, zoneData, context = {}) {
  const { score, breakdown, interventionLabel, stats, assets } = zoneData || {};
  const {
    date,
    areaLine,
    rankLine,
    risk,
    contrib,
    computedTotal,
    persistence,
    actionSteps,
    assetList,
    beneficiaries,
    priorityBeneficiaries,
    why,
    budget,
    topZones,
  } = reportPreamble(zoneId, zoneData, context);

  const dateText = context?.date ? ` on ${context.date}` : '';
  const rankText = rankLine ? `${rankLine} ` : '';

  const lines = [
    `# Heat Mitigation Recommendation Report – Zone ${zoneId}`,
    '',
    '## Heat Risk Summary',
    '',
    `- **Location:** Zone ${zoneId}${areaLine}`,
    `- **Average Temperature:** ${formatNumber(stats?.tempMean)}°C (max ${formatNumber(stats?.tempMax)}°C)`,
    `- **Heat Persistence:** ${persistence} (${formatNumber(stats?.longestStreakHrs)} hours longest dangerous streak)`,
    `- **Vulnerable Assets:** ${assetList}`,
    `- **Vegetation Coverage:** ${formatNumber(stats?.vegetationPct)}%`,
    `- **Wet-bulb Max:** ${formatNumber(stats?.wetBulbMax)}°C`,
    `- **Priority Score:** ${formatNumber(score)}/100`,
    `- **Risk Level:** ${risk.level}`,
    `- **Primary Intervention:** ${interventionLabel}`,
    `- **Recommended Action:** ${risk.urgency}`,
    '',
    '## Explainable Priority Score',
    '',
    `${rankText}The Priority Score is a weighted, evidence-based calculation:`
  ];

  if (rankText) {
    lines.push('');
  }

  lines.push(
    `- **Heat Intensity:** ${formatNumber(breakdown?.heat)}/100 × ${Math.round(WEIGHTS.heat * 100)}% = **${formatNumber(contrib.heat)} points**`,
    `- **Heat Duration:** ${formatNumber(breakdown?.duration)}/100 × ${Math.round(WEIGHTS.duration * 100)}% = **${formatNumber(contrib.duration)} points**`,
    `- **Public Exposure:** ${formatNumber(breakdown?.exposure)}/100 × ${Math.round(WEIGHTS.exposure * 100)}% = **${formatNumber(contrib.exposure)} points**`,
    `- **Greenery Deficit:** ${formatNumber(breakdown?.greenery)}/100 × ${Math.round(WEIGHTS.greenery * 100)}% = **${formatNumber(contrib.greenery)} points**`,
    `- **Final Score:** **${formatNumber(score)}/100** (weighted total ${formatNumber(computedTotal)})`,
    '',
    '## Recommended Action',
    '',
    `- **Immediate Action:** ${actionSteps.immediate}`,
    `- **Medium-Term Action:** ${actionSteps.medium}`,
    `- **Long-Term Action:** ${actionSteps.longTerm}`,
    '',
    '## Why This Recommendation?',
    '',
    ...why.map((line) => `- ${line}`),
    '',
    '## Expected Impact',
    '',
    `- **Affected population:** ${beneficiaries}`,
    `- **Priority beneficiaries:** ${priorityBeneficiaries}`,
    `- **Expected benefit:** Reduction of heat exposure for vulnerable groups during peak heat.`,
  );

  if (topZones && topZones.length > 0) {
    const list = topZones
      .map((z, idx) => `${idx + 1}. **Zone ${z.id}** — ${formatNumber(z.score)}/100, ${z.interventionLabel}`)
      .join('\n');
    lines.push(
      '',
      '## Zone Ranking Comparison',
      '',
      list,
    );
  }

  if (budget) {
    const share = budgetShare(budget.estimatedCostUsd, budget.budgetUsd);
    const shareText = share != null ? ` (approximately ${share}% of the $${formatUsd(budget.budgetUsd)} allocation)` : '';
    lines.push(
      '',
      '## Cost & Budget Fit',
      '',
      `- **Available budget:** $${formatUsd(budget.budgetUsd)}`,
      `- **Estimated intervention cost for this zone:** ~$${formatUsd(budget.estimatedCostUsd)}${shareText}`,
      `- **Running total after this zone:** ~$${formatUsd(budget.runningTotalUsd)}`,
      `- **Funding status:** ${budget.funded ? 'This zone is funded in the current budget.' : 'This zone is not yet funded in the current budget.'}`,
    );
  }

  return lines.join('\n');
}

function upstreamError(message, code = 'upstream_error', status = 502) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function expectedHeading(zoneId) {
  return `# Heat Mitigation Recommendation Report – Zone ${zoneId}`;
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

    const res = await fetchImpl(`${baseUrl}chat/completions`, {
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
  // cut-off report.
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

  // Final serve guard: never render a half-finished report.
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
