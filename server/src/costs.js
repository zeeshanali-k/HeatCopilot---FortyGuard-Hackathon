/**
 * Intervention cost assumptions
 *
 * Unit-based municipal planning estimates. Zone cost = units × costPerUnitUsd,
 * where units defaults to unitsPerZone but can be nudged by zone data (e.g.
 * shade structures scaling with the actual bus-stop count).
 *
 * These are order-of-magnitude planning figures only — always display them
 * with "~" and cite this table as the source.
 *
 * Sources: compiled from typical US municipal project budgets (urban forestry
 * programs, transit shade pilots, cool-pavement coatings, school shade
 * grants, pocket-park conversions). Labeled as estimates, not quotes.
 */

export const DEFAULT_COSTS = {
  tree_planting: {
    unitLabel: 'tree',
    unitsPerZone: 200,
    costPerUnitUsd: 600,
    note: 'planted + 3yr maintenance',
  },
  shade_structures: {
    unitLabel: 'shade structure',
    unitsPerZone: 3,
    costPerUnitUsd: 15000,
    note: 'bus-stop scale',
  },
  cool_pavement: {
    unitLabel: 'lane-km',
    unitsPerZone: 1,
    costPerUnitUsd: 250000,
    note: 'coating, materials + labor',
  },
  school_cooling: {
    unitLabel: 'school',
    unitsPerZone: 1,
    costPerUnitUsd: 180000,
    note: 'shade canopy + cool roof',
  },
  green_space: {
    unitLabel: 'pocket park',
    unitsPerZone: 1,
    costPerUnitUsd: 300000,
    note: 'conversion incl. planting',
  },
};

const VALID_KEYS = Object.keys(DEFAULT_COSTS);

/**
 * Return a deep copy of the default cost table.
 */
export function cloneDefaultCosts() {
  return structuredClone(DEFAULT_COSTS);
}

/**
 * Validate user-supplied cost overrides.
 *
 * @param {object} overrides
 * @returns {{ valid: true } | { valid: false, key: string, reason: string }}
 */
export function validateCostOverrides(overrides) {
  if (overrides == null) return { valid: true };
  if (typeof overrides !== 'object' || Array.isArray(overrides)) {
    return { valid: false, key: '', reason: 'costOverrides must be an object' };
  }

  for (const key of Object.keys(overrides)) {
    if (!VALID_KEYS.includes(key)) {
      return { valid: false, key, reason: `unknown cost key "${key}"` };
    }
    const entry = overrides[key];
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      return { valid: false, key, reason: `cost entry for "${key}" must be an object` };
    }
    for (const field of ['unitsPerZone', 'costPerUnitUsd']) {
      if (field in entry) {
        const value = entry[field];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
          return { valid: false, key, reason: `"${field}" must be a non-negative number` };
        }
      }
    }
  }

  return { valid: true };
}

/**
 * Merge user overrides over defaults without mutating either table.
 *
 * @param {object} overrides
 * @returns {object} effective cost table
 */
export function mergeCosts(overrides) {
  const merged = cloneDefaultCosts();
  if (!overrides) return merged;
  for (const key of VALID_KEYS) {
    if (overrides[key]) {
      merged[key] = { ...merged[key], ...overrides[key] };
    }
  }
  return merged;
}

/**
 * Estimate the number of units for a single intervention in a zone.
 *
 * @param {string} intervention
 * @param {object} zone
 * @param {object} costs
 * @returns {number|null}
 */
export function estimateUnitsForIntervention(intervention, zone, costs) {
  const entry = costs[intervention];
  if (!entry) return null;

  let units = entry.unitsPerZone;

  // Shade structures scale with actual bus-stop count, capped at 2× default.
  if (intervention === 'shade_structures' && zone.assets?.busStops != null) {
    units = Math.max(units, Math.min(zone.assets.busStops, units * 2));
  }

  return units;
}

/**
 * Estimate the total cost for a zone's recommended intervention.
 *
 * @param {object} zone — zone with at least { intervention }
 * @param {object} costs — cost table (defaults or merged overrides)
 * @returns {number|null} estimated USD cost, or null for unknown intervention
 */
export function estimateZoneCost(zone, costs) {
  if (!zone || !zone.intervention) return null;

  // Combined = tree planting + shade structures package.
  if (zone.intervention === 'combined') {
    const treeUnits = estimateUnitsForIntervention('tree_planting', zone, costs);
    const shadeUnits = estimateUnitsForIntervention('shade_structures', zone, costs);
    if (treeUnits == null || shadeUnits == null) return null;
    return Math.round(treeUnits * costs.tree_planting.costPerUnitUsd + shadeUnits * costs.shade_structures.costPerUnitUsd);
  }

  const units = estimateUnitsForIntervention(zone.intervention, zone, costs);
  if (units == null) return null;

  return Math.round(units * costs[zone.intervention].costPerUnitUsd);
}

/**
 * Backward-compatible flat cost lookup used by older callers/tests.
 * Prefer estimateZoneCost for new code.
 *
 * @param {string} intervention
 * @returns {number|null}
 */
export function costForIntervention(intervention) {
  if (intervention === 'combined') {
    return (
      DEFAULT_COSTS.tree_planting.unitsPerZone * DEFAULT_COSTS.tree_planting.costPerUnitUsd +
      DEFAULT_COSTS.shade_structures.unitsPerZone * DEFAULT_COSTS.shade_structures.costPerUnitUsd
    );
  }
  const entry = DEFAULT_COSTS[intervention];
  if (!entry) return null;
  return entry.unitsPerZone * entry.costPerUnitUsd;
}
