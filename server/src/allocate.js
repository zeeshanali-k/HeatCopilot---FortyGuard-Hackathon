/**
 * Budget optimizer
 *
 * Greedy selection down the priority-ranked zone list: fund each zone's
 * recommended intervention (unit cost from costs.js) until the budget is
 * exhausted. Pure function — no I/O, no external calls.
 */

import { estimateZoneCost, cloneDefaultCosts } from './costs.js';

/**
 * @param {object[]} rankedZones — zones sorted by priority score (desc),
 *   each with at least { id, intervention, stats, assets }
 * @param {number} budgetUsd — total available budget in USD
 * @param {object} [costs] — cost table (defaults used if omitted)
 * @returns {object} { funded, unfunded, totalSpent, budgetUsd }
 *   funded entries carry cost + runningTotal; unfunded entries are "next in
 *   line" when more budget is available.
 */
export function allocateBudget(rankedZones, budgetUsd, costs) {
  const effectiveCosts = costs || cloneDefaultCosts();
  const funded = [];
  const unfunded = [];
  let totalSpent = 0;

  for (const zone of rankedZones || []) {
    const cost = estimateZoneCost(zone, effectiveCosts);
    if (cost != null && totalSpent + cost <= budgetUsd) {
      totalSpent += cost;
      funded.push({ ...zone, cost, runningTotal: totalSpent });
    } else {
      unfunded.push({ ...zone, cost });
    }
  }

  const fundedDangerHours = funded.reduce(
    (sum, z) => sum + (z.stats?.longestStreakHrs ?? z.longestStreakHrs ?? 0),
    0
  );

  return {
    funded,
    unfunded,
    totalSpent,
    budgetUsd,
    impact: {
      zonesFunded: funded.length,
      dangerHoursAddressed: Math.round(fundedDangerHours * 10) / 10,
    },
  };
}
