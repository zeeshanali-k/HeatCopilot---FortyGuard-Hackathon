/**
 * Priority scoring engine
 *
 * Pure functions that turn per-zone heat, duration, exposure, and greenery
 * inputs into a transparent 0-100 Priority Score with a four-part breakdown.
 *
 * Formula (from project-core-idea.md §7):
 *   Score = 0.35 * HeatIntensity
 *         + 0.25 * HeatDuration
 *         + 0.20 * Exposure
 *         + 0.20 * GreeneryDeficit
 *
 * Each input is normalized to 0-100 across the analyzed zones before weighting.
 */

export const WEIGHTS = {
  heat: 0.35,
  duration: 0.25,
  exposure: 0.20,
  greenery: 0.20,
};

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Min-max normalize an array of numbers to a 0-100 scale.
 * Returns 50 for every element when all values are identical.
 */
export function normalize(values) {
  if (!values || values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 50);
  return values.map((v) => ((v - min) / (max - min)) * 100);
}

/**
 * Compute a Priority Score and per-pillar breakdown for each zone.
 *
 * Input zones must contain:
 *   - tempMean (number, °C)
 *   - longestStreakHrs (number)
 *   - assets.busStops (number)
 *   - assets.schools (number)
 *   - stats.vegetationPct (number, 0-100)
 *
 * Returns zones (shallow copies) augmented with:
 *   - score (number, 0-100, rounded to 1 decimal)
 *   - breakdown { heat, duration, exposure, greenery } each 0-100
 */
export function computePriorityScore(zones) {
  if (!zones || zones.length === 0) return [];

  const minTemp = Math.min(...zones.map((z) => z.tempMean ?? 0));

  const heatRaw = zones.map((z) => (z.tempMean ?? 0) - minTemp);
  const durationRaw = zones.map((z) => z.longestStreakHrs ?? 0);
  const exposureRaw = zones.map(
    (z) => (z.assets?.busStops ?? 0) + (z.assets?.schools ?? 0)
  );
  const greeneryDeficitRaw = zones.map(
    (z) => 100 - (z.stats?.vegetationPct ?? 0)
  );

  const heatNorm = normalize(heatRaw);
  const durationNorm = normalize(durationRaw);
  const exposureNorm = normalize(exposureRaw);
  const greeneryNorm = normalize(greeneryDeficitRaw);

  return zones.map((z, i) => {
    const score =
      WEIGHTS.heat * heatNorm[i] +
      WEIGHTS.duration * durationNorm[i] +
      WEIGHTS.exposure * exposureNorm[i] +
      WEIGHTS.greenery * greeneryNorm[i];

    return {
      ...z,
      score: Math.round(score),
      breakdown: {
        heat: round1(heatNorm[i]),
        duration: round1(durationNorm[i]),
        exposure: round1(exposureNorm[i]),
        greenery: round1(greeneryNorm[i]),
      },
    };
  });
}
