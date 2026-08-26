/**
 * LLM action-plan narrative
 *
 * Generates a concise, evidence-based briefing for a prioritized zone.
 * The LLM only writes prose from deterministic inputs; it never calls tools or
 * decides what to compute. When no LLM API key is configured, a deterministic
 * fallback narrative is returned so the demo path still works.
 */

import fetch from 'node-fetch';

const REQUEST_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

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

function buildPrompt(zoneId, zoneData) {
  const { score, breakdown, interventionLabel, reason, stats, assets } = zoneData;

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

FORMAT:
Return the response as Markdown using this exact structure:

1. A bold heading on its own line: **MEMORANDUM: URGENT HEAT MITIGATION ACTION PLAN – ZONE ${zoneId}**
2. A one-line summary: Priority Score: ${formatNumber(score)}/100. Primary intervention: **${interventionLabel}**.
3. A "Why this zone ranks highly" paragraph (2-3 sentences) citing only the supplied numbers.
4. A "Key stats" bullet list with the most important supplied figures.
5. A "Recommended next steps" bullet list with 3 short, practical actions.

Keep the total length between 150 and 250 words. Use **bold** for emphasis and bullet points for lists. Do not mention a PDF unless one is explicitly linked.`;
}

function deterministicNarrative(zoneId, zoneData) {
  const { score, breakdown, interventionLabel, reason, stats, assets } = zoneData || {};

  const lines = [
    `**MEMORANDUM: URGENT HEAT MITIGATION ACTION PLAN – ZONE ${zoneId}**`,
    '',
    `Priority Score: ${formatNumber(score)}/100. Primary intervention: **${interventionLabel}**.`,
    '',
    '**Why this zone ranks highly**',
    '',
    `This zone scores ${formatNumber(score)}/100, driven by heat intensity (${formatNumber(breakdown?.heat)}), heat duration (${formatNumber(breakdown?.duration)}), public exposure (${formatNumber(breakdown?.exposure)}), and greenery deficit (${formatNumber(breakdown?.greenery)}). ${reason}`,
    '',
    '**Key stats**',
    '',
    `- Mean temperature: ${formatNumber(stats?.tempMean)}°C (max ${formatNumber(stats?.tempMax)}°C)`,
    `- Longest dangerous heat streak: ${formatNumber(stats?.longestStreakHrs)} hours`,
    `- Vegetation cover: ${formatNumber(stats?.vegetationPct)}%`,
    `- Wet-bulb max: ${formatNumber(stats?.wetBulbMax)}°C`,
    `- Public assets: ${formatNumber(assets?.busStops)} bus stop(s), ${formatNumber(assets?.schools)} school(s), ${formatNumber(assets?.parks)} park(s)`,
    '',
    '**Recommended next steps**',
    '',
    '- Confirm site conditions and asset locations with a rapid field survey.',
    '- Coordinate with the asset owners or operators identified above.',
    '- Sequence implementation to protect the most exposed areas first, adding shade and hydration support during peak heat.',
  ];

  return lines.join('\n');
}

function upstreamError(message, code = 'upstream_error', status = 502) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

export async function generateActionPlan({ zoneId, zoneData }) {
  if (!zoneId || !zoneData) {
    throw upstreamError('zoneId and zoneData are required', 'invalid_request', 400);
  }

  const apiKey = getApiKey();
  if (!apiKey && !isOllama()) {
    // Demo-safe fallback: the LLM is unavailable, but the UI can still show a
    // deterministic narrative built from the exact same zone data.
    return {
      narrative: deterministicNarrative(zoneId, zoneData),
      evidencePdfUrl: null,
    };
  }

  const baseUrl = getLlmBaseUrl();
  const model = getLlmModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers = { 'Content-Type': 'application/json' };
    // Ollama's local OpenAI-compatible endpoint does not need an API key.
    if (apiKey && !isOllama()) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: buildPrompt(zoneId, zoneData) }],
        temperature: 0.5,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown error');
      throw upstreamError(`LLM request failed: ${res.status} ${text}`);
    }

    const json = await res.json();
    const narrative = json.choices?.[0]?.message?.content?.trim();
    if (!narrative) {
      throw upstreamError('LLM returned an empty narrative');
    }

    return {
      narrative,
      evidencePdfUrl: null,
    };
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
