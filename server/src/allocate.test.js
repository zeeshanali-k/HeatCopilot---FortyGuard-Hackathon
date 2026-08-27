import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { allocateBudget } from './allocate.js';
import { INTERVENTION_COSTS } from './costs.js';

function makeZone(id, intervention, overrides = {}) {
  return {
    id,
    intervention,
    stats: { longestStreakHrs: 4 },
    ...overrides,
  };
}

describe('allocateBudget', () => {
  it('funds zones in priority order until the budget is exhausted', () => {
    const zones = [
      makeZone('z_1', 'shade_structures'), // 45k
      makeZone('z_2', 'tree_planting'), // 120k
      makeZone('z_3', 'green_space'), // 300k
    ];
    const res = allocateBudget(zones, 200_000);
    assert.deepEqual(
      res.funded.map((z) => z.id),
      ['z_1', 'z_2']
    );
    assert.deepEqual(
      res.unfunded.map((z) => z.id),
      ['z_3']
    );
    assert.equal(res.totalSpent, 165_000);
    assert.equal(res.budgetUsd, 200_000);
  });

  it('skips a zone that does not fit and keeps funding cheaper ones down the list', () => {
    const zones = [
      makeZone('z_1', 'green_space'), // 300k — does not fit
      makeZone('z_2', 'shade_structures'), // 45k — fits
    ];
    const res = allocateBudget(zones, 100_000);
    assert.deepEqual(
      res.funded.map((z) => z.id),
      ['z_2']
    );
    assert.deepEqual(
      res.unfunded.map((z) => z.id),
      ['z_1']
    );
    assert.equal(res.totalSpent, 45_000);
  });

  it('tracks a running total across funded zones', () => {
    const zones = [
      makeZone('z_1', 'shade_structures'), // 45k
      makeZone('z_2', 'tree_planting'), // 120k
    ];
    const res = allocateBudget(zones, 500_000);
    assert.equal(res.funded[0].runningTotal, 45_000);
    assert.equal(res.funded[1].runningTotal, 165_000);
  });

  it('funds nothing when the budget is zero', () => {
    const res = allocateBudget([makeZone('z_1', 'shade_structures')], 0);
    assert.equal(res.funded.length, 0);
    assert.equal(res.unfunded.length, 1);
    assert.equal(res.totalSpent, 0);
  });

  it('puts zones with unknown intervention costs in the unfunded list', () => {
    const res = allocateBudget([makeZone('z_1', 'unknown_intervention')], 1_000_000);
    assert.equal(res.funded.length, 0);
    assert.equal(res.unfunded.length, 1);
    assert.equal(res.unfunded[0].cost, null);
  });

  it('sums funded danger-hours from zone stats', () => {
    const zones = [
      makeZone('z_1', 'shade_structures', { stats: { longestStreakHrs: 6 } }),
      makeZone('z_2', 'shade_structures', { stats: { longestStreakHrs: 2.5 } }),
    ];
    const res = allocateBudget(zones, 100_000);
    assert.equal(res.impact.zonesFunded, 2);
    assert.equal(res.impact.dangerHoursAddressed, 8.5);
  });

  it('handles an empty zone list', () => {
    const res = allocateBudget([], 100_000);
    assert.equal(res.funded.length, 0);
    assert.equal(res.unfunded.length, 0);
    assert.equal(res.totalSpent, 0);
  });

  it('covers every intervention the rule engine can emit', () => {
    for (const key of ['tree_planting', 'shade_structures', 'cool_pavement', 'school_cooling', 'green_space', 'combined']) {
      assert.ok(INTERVENTION_COSTS[key], `missing cost for ${key}`);
    }
  });
});
