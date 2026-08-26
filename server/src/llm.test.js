/**
 * Tests for the action-plan LLM module.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { generateActionPlan } from './llm.js';

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

describe('generateActionPlan', () => {
  test('returns a deterministic narrative when no LLM API key is configured', async () => {
    const result = await generateActionPlan({ zoneId: 'z_1', zoneData: SAMPLE_ZONE });
    assert.ok(result.narrative.includes('z_1'));
    assert.ok(result.narrative.includes('92/100'));
    assert.ok(result.narrative.includes('Tree planting + bus-stop shade'));
    assert.ok(result.narrative.includes('43.1°C'));
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
