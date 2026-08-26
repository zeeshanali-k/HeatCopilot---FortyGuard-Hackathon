import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recommendIntervention, INTERVENTION_LABELS } from './interventions.js';

describe('recommendIntervention', () => {
  function makeZone(overrides = {}) {
    return {
      id: 'z_1',
      tempMean: 42,
      longestStreakHrs: 6,
      assets: { busStops: 0, schools: 0, parks: 0 },
      stats: { vegetationPct: 20, wetBulbMax: 25 },
      ...overrides,
    };
  }

  it('recommends tree planting when vegetation is low and open space (park) is present', () => {
    const zone = makeZone({ stats: { vegetationPct: 9, wetBulbMax: 25 }, assets: { busStops: 0, schools: 0, parks: 1 } });
    const rec = recommendIntervention(zone, [zone]);
    assert.equal(rec.intervention, 'tree_planting');
    assert.equal(rec.interventionLabel, INTERVENTION_LABELS.tree_planting);
    assert.ok(rec.reason.toLowerCase().includes('vegetation'));
  });

  it('recommends shade structures when bus stops are in top duration decile', () => {
    const low = makeZone({ id: 'low', longestStreakHrs: 1, assets: { busStops: 0 } });
    const high = makeZone({ id: 'high', longestStreakHrs: 10, assets: { busStops: 4 } });
    const rec = recommendIntervention(high, [low, high]);
    assert.equal(rec.intervention, 'shade_structures');
    assert.ok(rec.reason.toLowerCase().includes('bus stop'));
  });

  it('recommends cool pavement for road-heavy low-vegetation zones', () => {
    const hot = makeZone({ id: 'hot', longestStreakHrs: 12, assets: { busStops: 0 } });
    const road = makeZone({ id: 'road', longestStreakHrs: 4, stats: { vegetationPct: 8, wetBulbMax: 25 }, assets: { busStops: 3, schools: 0, parks: 0 } });
    const rec = recommendIntervention(road, [hot, road]);
    assert.equal(rec.intervention, 'cool_pavement');
    assert.ok(rec.reason.toLowerCase().includes('road-heavy'));
  });

  it('recommends school cooling for schools in high-persistence zones', () => {
    const zone = makeZone({ longestStreakHrs: 8, assets: { busStops: 0, schools: 2, parks: 0 } });
    const rec = recommendIntervention(zone, [zone]);
    assert.equal(rec.intervention, 'school_cooling');
    assert.ok(rec.reason.toLowerCase().includes('school'));
  });

  it('escalates to combined intervention on extreme wet-bulb danger', () => {
    const zone = makeZone({ stats: { vegetationPct: 30, wetBulbMax: 31 }, assets: { busStops: 0, schools: 0, parks: 0 } });
    const rec = recommendIntervention(zone, [zone]);
    assert.equal(rec.intervention, 'combined');
    assert.ok(rec.reason.toLowerCase().includes('wet-bulb'));
  });

  it('falls back to green space expansion when no rule matches', () => {
    const zone = makeZone({ stats: { vegetationPct: 40, wetBulbMax: 24 }, assets: { busStops: 0, schools: 0, parks: 0 } });
    const rec = recommendIntervention(zone, [zone]);
    assert.equal(rec.intervention, 'green_space');
  });

  it('always returns a known intervention label', () => {
    const zone = makeZone();
    const rec = recommendIntervention(zone, [zone]);
    assert.ok(INTERVENTION_LABELS[rec.intervention]);
  });
});
