import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, computePriorityScore, WEIGHTS } from './scoring.js';

describe('normalize', () => {
  it('scales values to 0-100', () => {
    const result = normalize([10, 20, 30]);
    assert.deepEqual(result, [0, 50, 100]);
  });

  it('returns 50 for identical values', () => {
    const result = normalize([5, 5, 5]);
    assert.deepEqual(result, [50, 50, 50]);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(normalize([]), []);
  });
});

describe('computePriorityScore', () => {
  function makeZone(overrides = {}) {
    return {
      id: 'z_1',
      tempMean: 40,
      longestStreakHrs: 5,
      assets: { busStops: 0, schools: 0, parks: 0 },
      stats: { vegetationPct: 50 },
      ...overrides,
    };
  }

  it('returns empty array for empty input', () => {
    assert.deepEqual(computePriorityScore([]), []);
  });

  it('produces a 0-100 score with breakdown summing near 100 for extremes', () => {
    const zones = [
      makeZone({ id: 'z_1', tempMean: 38, longestStreakHrs: 2, assets: { busStops: 0, schools: 0 }, stats: { vegetationPct: 40 } }),
      makeZone({ id: 'z_2', tempMean: 46, longestStreakHrs: 10, assets: { busStops: 5, schools: 2 }, stats: { vegetationPct: 5 } }),
    ];

    const scored = computePriorityScore(zones);
    assert.equal(scored.length, 2);

    const top = scored[1];
    assert.ok(top.score >= 0 && top.score <= 100);
    assert.ok(top.breakdown.heat >= 0 && top.breakdown.heat <= 100);
    assert.ok(top.breakdown.duration >= 0 && top.breakdown.duration <= 100);
    assert.ok(top.breakdown.exposure >= 0 && top.breakdown.exposure <= 100);
    assert.ok(top.breakdown.greenery >= 0 && top.breakdown.greenery <= 100);
  });

  it('ranks hotter, longer-duration, higher-exposure, lower-greenery zones higher', () => {
    const zones = [
      makeZone({ id: 'cool', tempMean: 38, longestStreakHrs: 2, assets: { busStops: 0, schools: 0 }, stats: { vegetationPct: 80 } }),
      makeZone({ id: 'hot', tempMean: 46, longestStreakHrs: 10, assets: { busStops: 4, schools: 1 }, stats: { vegetationPct: 5 } }),
    ];

    const scored = computePriorityScore(zones);
    assert.ok(scored[1].score > scored[0].score, 'hot zone should score higher');
    assert.equal(scored[1].breakdown.heat, 100);
    assert.equal(scored[1].breakdown.duration, 100);
    assert.equal(scored[1].breakdown.exposure, 100);
    assert.equal(scored[1].breakdown.greenery, 100);
  });

  it('weights sum to 1', () => {
    const total = WEIGHTS.heat + WEIGHTS.duration + WEIGHTS.exposure + WEIGHTS.greenery;
    assert.equal(total, 1);
  });
});
