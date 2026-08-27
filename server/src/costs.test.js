import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COSTS,
  cloneDefaultCosts,
  validateCostOverrides,
  mergeCosts,
  estimateUnitsForIntervention,
  estimateZoneCost,
  costForIntervention,
} from './costs.js';

describe('costs', () => {
  describe('cloneDefaultCosts', () => {
    it('returns a deep copy of the default cost table', () => {
      const copy = cloneDefaultCosts();
      assert.notStrictEqual(copy, DEFAULT_COSTS);
      assert.deepEqual(copy, DEFAULT_COSTS);
      copy.tree_planting.costPerUnitUsd = 999;
      assert.notEqual(DEFAULT_COSTS.tree_planting.costPerUnitUsd, 999);
    });
  });

  describe('validateCostOverrides', () => {
    it('accepts null/undefined overrides', () => {
      assert.deepEqual(validateCostOverrides(null), { valid: true });
      assert.deepEqual(validateCostOverrides(undefined), { valid: true });
    });

    it('accepts valid partial overrides', () => {
      const overrides = {
        tree_planting: { costPerUnitUsd: 900 },
        shade_structures: { unitsPerZone: 5 },
      };
      assert.deepEqual(validateCostOverrides(overrides), { valid: true });
    });

    it('rejects non-object overrides', () => {
      const result = validateCostOverrides('oops');
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'costOverrides must be an object');
    });

    it('rejects unknown intervention keys', () => {
      const result = validateCostOverrides({ tree_planting: { costPerUnitUsd: 900 }, magic: {} });
      assert.equal(result.valid, false);
      assert.equal(result.key, 'magic');
    });

    it('rejects negative numbers', () => {
      const result = validateCostOverrides({ tree_planting: { costPerUnitUsd: -1 } });
      assert.equal(result.valid, false);
      assert.equal(result.reason, '"costPerUnitUsd" must be a non-negative number');
    });

    it('rejects non-numeric values', () => {
      const result = validateCostOverrides({ cool_pavement: { unitsPerZone: 'many' } });
      assert.equal(result.valid, false);
      assert.equal(result.reason, '"unitsPerZone" must be a non-negative number');
    });

    it('rejects NaN and Infinity', () => {
      assert.equal(validateCostOverrides({ tree_planting: { costPerUnitUsd: NaN } }).valid, false);
      assert.equal(validateCostOverrides({ tree_planting: { costPerUnitUsd: Infinity } }).valid, false);
    });
  });

  describe('mergeCosts', () => {
    it('returns defaults when overrides are omitted', () => {
      assert.deepEqual(mergeCosts(), DEFAULT_COSTS);
    });

    it('merges overrides without mutating defaults', () => {
      const overrides = { tree_planting: { costPerUnitUsd: 900, unitsPerZone: 150 } };
      const merged = mergeCosts(overrides);
      assert.equal(merged.tree_planting.costPerUnitUsd, 900);
      assert.equal(merged.tree_planting.unitsPerZone, 150);
      assert.equal(merged.tree_planting.unitLabel, DEFAULT_COSTS.tree_planting.unitLabel);
      assert.equal(DEFAULT_COSTS.tree_planting.costPerUnitUsd, 600);
    });
  });

  describe('estimateUnitsForIntervention', () => {
    it('returns default units for simple interventions', () => {
      const zone = { intervention: 'tree_planting', assets: {} };
      assert.equal(estimateUnitsForIntervention('tree_planting', zone, DEFAULT_COSTS), 200);
    });

    it('scales shade structures with bus-stop count up to 2× default', () => {
      const costs = DEFAULT_COSTS;
      assert.equal(estimateUnitsForIntervention('shade_structures', { assets: { busStops: 1 } }, costs), 3);
      assert.equal(estimateUnitsForIntervention('shade_structures', { assets: { busStops: 4 } }, costs), 4);
      assert.equal(estimateUnitsForIntervention('shade_structures', { assets: { busStops: 10 } }, costs), 6);
    });

    it('returns null for unknown interventions', () => {
      assert.equal(estimateUnitsForIntervention('unknown', {}, DEFAULT_COSTS), null);
    });
  });

  describe('estimateZoneCost', () => {
    it('computes default tree-planting cost', () => {
      const zone = { intervention: 'tree_planting' };
      assert.equal(estimateZoneCost(zone, DEFAULT_COSTS), 200 * 600);
    });

    it('computes shade-structure cost scaled by bus stops', () => {
      const zone = { intervention: 'shade_structures', assets: { busStops: 4 } };
      assert.equal(estimateZoneCost(zone, DEFAULT_COSTS), 4 * 15000);
    });

    it('computes combined as tree planting + shade structures', () => {
      const zone = { intervention: 'combined', assets: { busStops: 3 } };
      const expected = 200 * 600 + 3 * 15000;
      assert.equal(estimateZoneCost(zone, DEFAULT_COSTS), expected);
    });

    it('applies cost overrides', () => {
      const zone = { intervention: 'tree_planting' };
      const costs = mergeCosts({ tree_planting: { costPerUnitUsd: 900 } });
      assert.equal(estimateZoneCost(zone, costs), 200 * 900);
    });

    it('returns null for unknown interventions', () => {
      assert.equal(estimateZoneCost({ intervention: 'unknown' }, DEFAULT_COSTS), null);
    });

    it('returns null when zone is missing', () => {
      assert.equal(estimateZoneCost(null, DEFAULT_COSTS), null);
    });
  });

  describe('costForIntervention', () => {
    it('matches default per-zone totals for every known intervention', () => {
      assert.equal(costForIntervention('tree_planting'), 200 * 600);
      assert.equal(costForIntervention('shade_structures'), 3 * 15000);
      assert.equal(costForIntervention('cool_pavement'), 1 * 250000);
      assert.equal(costForIntervention('school_cooling'), 1 * 180000);
      assert.equal(costForIntervention('green_space'), 1 * 300000);
      assert.equal(costForIntervention('combined'), 200 * 600 + 3 * 15000);
    });

    it('returns null for unknown interventions', () => {
      assert.equal(costForIntervention('unknown'), null);
    });
  });
});
