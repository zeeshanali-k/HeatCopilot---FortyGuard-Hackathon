/**
 * Client-side copy of the default intervention cost assumptions.
 *
 * Keep this in sync with server/src/costs.js. The client only stores user
 * overrides in localStorage; this table provides the baseline for display.
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

export const COST_KEYS = Object.keys(DEFAULT_COSTS);

export const COST_LABELS = {
  tree_planting: 'Tree planting',
  shade_structures: 'Shade structures',
  cool_pavement: 'Cool pavement',
  school_cooling: 'School cooling',
  green_space: 'Green space',
};

export function mergeCosts(overrides) {
  const merged = structuredClone(DEFAULT_COSTS);
  if (!overrides) return merged;
  for (const key of COST_KEYS) {
    if (overrides[key]) {
      merged[key] = { ...merged[key], ...overrides[key] };
    }
  }
  return merged;
}
