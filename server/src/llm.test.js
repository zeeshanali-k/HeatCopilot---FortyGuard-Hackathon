/**
 * Tests for the action-plan LLM module.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { generateActionPlan, __setFetchImpl } from './llm.js';

const SAMPLE_ZONE = {
  score: 92,
  breakdown: { heat: 96, duration: 88, exposure: 74, greenery: 91 },
  interventionLabel: 'Tree planting + bus-stop shade',
  reason: 'Vegetation 9% with open space present; 6 bus stops in top heat-duration decile.',
  stats: {
    tempMean: 43.1,
    tempMax: 47.8,
    longestStreakHrs: 8.2,
    vegetationPct: 9,
    wetBulbMax: 29.4,
  },
  assets: { busStops: 6, schools: 2, parks: 0 },
};

const SAMPLE_CONTEXT = {
  areaLabel: 'Downtown Phoenix',
  date: '2026-07-15',
  rank: 1,
  zoneCount: 12,
  topZones: [
    { id: 'z_1', score: 92, interventionLabel: 'Tree planting + bus-stop shade' },
    { id: 'z_2', score: 87, interventionLabel: 'Cool pavement' },
  ],
  budget: {
    budgetUsd: 2000000,
    funded: true,
    estimatedCostUsd: 120000,
    runningTotalUsd: 120000,
  },
};

describe('generateActionPlan', () => {
  test('returns a deterministic narrative when no LLM API key is configured', async () => {
    const result = await generateActionPlan({ zoneId: 'z_1', zoneData: SAMPLE_ZONE });
    assert.ok(result.narrative.includes('z_1'));
    assert.ok(result.narrative.includes('92/100'));
    assert.ok(result.narrative.includes('Tree planting + bus-stop shade'));
    assert.ok(result.narrative.includes('43.1°C'));
    assert.ok(result.narrative.includes('# Heat Mitigation Recommendation Report – Zone z_1'));
    assert.ok(result.narrative.includes('## Heat Risk Summary'));
    assert.ok(result.narrative.includes('## Explainable Priority Score'));
    assert.ok(result.narrative.includes('## Recommended Action'));
    assert.ok(result.narrative.includes('## Why This Recommendation?'));
    assert.ok(result.narrative.includes('## Expected Impact'));
    assert.ok(result.narrative.includes('Critical Heat Risk'));
    assert.strictEqual(result.evidencePdfUrl, null);
  });

  test('deterministic narrative uses context when provided', async () => {
    const result = await generateActionPlan({
      zoneId: 'z_1',
      zoneData: SAMPLE_ZONE,
      context: SAMPLE_CONTEXT,
    });
    assert.ok(result.narrative.includes('1st of 12 zones'));
    assert.ok(result.narrative.includes('~$120k'));
    assert.ok(result.narrative.includes('Zone z_2'));
    assert.strictEqual(result.evidencePdfUrl, null);
  });

  test('throws when zoneId or zoneData is missing', async () => {
    await assert.rejects(
      () => generateActionPlan({ zoneId: 'z_1' }),
      /zoneId and zoneData are required/
    );
    await assert.rejects(
      () => generateActionPlan({ zoneData: SAMPLE_ZONE }),
      /zoneId and zoneData are required/
    );
  });
});

describe('generateActionPlan with mocked LLM', () => {
  const originalApiKey = process.env.LLM_API_KEY;

  before(() => {
    process.env.LLM_API_KEY = 'test-key';
  });

  after(() => {
    __setFetchImpl(null);
    if (originalApiKey === undefined) {
      delete process.env.LLM_API_KEY;
    } else {
      process.env.LLM_API_KEY = originalApiKey;
    }
  });

  test('falls back to deterministic narrative when LLM returns finish_reason:length twice', async () => {
    let calls = 0;
    __setFetchImpl(async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'This response is intentionally cut off mid-sentence and lacks the required heading.',
                },
                finish_reason: 'length',
              },
            ],
          };
        },
      };
    });

    const result = await generateActionPlan({
      zoneId: 'z_1',
      zoneData: SAMPLE_ZONE,
      context: SAMPLE_CONTEXT,
    });

    assert.strictEqual(calls, 2, 'expected one initial call plus one retry');
    assert.ok(result.narrative.includes('# Heat Mitigation Recommendation Report – Zone z_1'));
    assert.ok(result.narrative.includes('1st of 12 zones'));
    assert.ok(result.narrative.includes('## Cost & Budget Fit'));
    assert.strictEqual(result.evidencePdfUrl, null);
  });
});
