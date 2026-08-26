/**
 * Intervention unit-cost table
 *
 * Rough municipal estimates per zone (~500 m grid cell), used by the budget
 * optimizer. These are order-of-magnitude planning figures only — always
 * display them with "~" and cite this table as the source.
 *
 * Sources: compiled from typical US municipal project budgets (urban forestry
 * programs, transit shade pilots, cool-pavement coatings, school shade
 * grants, pocket-park conversions). Labeled as estimates, not quotes.
 */

export const INTERVENTION_COSTS = {
  tree_planting: { perZone: 120_000, note: '~200 trees @ $600 planted+maintained' },
  shade_structures: { perZone: 45_000, note: '3 bus-stop shade structures @ $15k' },
  cool_pavement: { perZone: 250_000, note: '~1 lane-km coating' },
  school_cooling: { perZone: 180_000, note: 'shade canopy + cool roof per school' },
  green_space: { perZone: 300_000, note: 'pocket park conversion' },
  // Escalated recommendation: tree planting + shade structures package.
  combined: { perZone: 165_000, note: 'tree planting + shade structures package' },
};

export function costForIntervention(intervention) {
  return INTERVENTION_COSTS[intervention]?.perZone ?? null;
}
