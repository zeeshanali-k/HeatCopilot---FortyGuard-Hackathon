/**
 * Intervention rule engine
 *
 * Rule-based recommendation derived from the data already fetched for a zone.
 * No ML — the rules are defensible and match project-core-idea.md §8.
 *
 * Intervention enum:
 *   tree_planting | shade_structures | cool_pavement | school_cooling |
 *   green_space | combined
 */

export const INTERVENTION_LABELS = {
  tree_planting: 'Tree planting',
  shade_structures: 'Bus-stop shade structures',
  cool_pavement: 'Cool pavement',
  school_cooling: 'School cooling / shade canopy',
  green_space: 'Green space expansion',
  combined: 'Combined intervention',
};

function median(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function isTopDurationDecile(zone, allZones) {
  if (!allZones || allZones.length === 0) return false;
  const sorted = [...allZones].sort((a, b) => b.longestStreakHrs - a.longestStreakHrs);
  const cutoffIndex = Math.max(0, Math.ceil(sorted.length * 0.1) - 1);
  const cutoff = sorted[cutoffIndex].longestStreakHrs;
  return zone.longestStreakHrs >= cutoff;
}

function wetBulbTier(wetBulbMax) {
  if (wetBulbMax == null) return null;
  if (wetBulbMax >= 30) return { level: 'extreme', label: 'extreme wet-bulb danger' };
  if (wetBulbMax >= 27) return { level: 'danger', label: 'wet-bulb danger threshold' };
  return null;
}

/**
 * Recommend an intervention for a single zone.
 *
 * @param {object} zone   — zone with assets, stats, longestStreakHrs, tempMean
 * @param {object[]} allZones — full ranked list (for decile / median context)
 * @returns {object} { intervention, interventionLabel, reason }
 */
export function recommendIntervention(zone, allZones) {
  const assets = zone.assets || { busStops: 0, schools: 0, parks: 0 };
  const stats = zone.stats || {};
  const vegetationPct = stats.vegetationPct ?? 0;
  const longestStreakHrs = zone.longestStreakHrs ?? 0;
  const wetBulb = wetBulbTier(stats.wetBulbMax);

  const medianDuration = median(allZones.map((z) => z.longestStreakHrs ?? 0));
  const topDuration = isTopDurationDecile(zone, allZones);

  // Open-space proxy: parks present (we don't have building density)
  const openSpacePresent = assets.parks > 0;
  const roadHeavy =
    assets.busStops > 0 && assets.parks === 0 && assets.schools === 0 && vegetationPct < 15;

  const reasons = [];
  let primary = null;

  // Rule 4: school in high-persistence zone
  if (assets.schools > 0 && longestStreakHrs >= medianDuration) {
    primary = 'school_cooling';
    reasons.push(`${assets.schools} school${assets.schools === 1 ? '' : 's'} in a high-persistence zone`);
  }

  // Rule 1: vegetation < 15% + open space present
  if (!primary && vegetationPct < 15 && openSpacePresent) {
    primary = 'tree_planting';
    reasons.push(`Vegetation ${vegetationPct}% (< 15% threshold) with open space present`);
  }

  // Rule 2: bus stops in top heat-duration decile
  if (!primary && assets.busStops > 0 && topDuration) {
    primary = 'shade_structures';
    reasons.push(`${assets.busStops} bus stop${assets.busStops === 1 ? '' : 's'} in the top heat-duration decile`);
  }

  // Rule 3: high asphalt / road-heavy zone
  if (!primary && roadHeavy) {
    primary = 'cool_pavement';
    reasons.push(`Road-heavy zone with low vegetation (${vegetationPct}%)`);
  }

  // Fallback
  if (!primary) {
    primary = 'green_space';
    if (vegetationPct < 30) {
      reasons.push(`Low vegetation (${vegetationPct}%); expand green cover`);
    } else {
      reasons.push(`Moderate heat; expand green cover to maintain cooling`);
    }
  }

  // Rule 5: wet-bulb danger tier escalates priority / recommendation
  if (wetBulb) {
    if (wetBulb.level === 'extreme') {
      primary = 'combined';
    }
    reasons.push(`${wetBulb.label} (wet-bulb max ${stats.wetBulbMax}°C)`);
  }

  const reason = reasons.join('; ') + '.';

  return {
    intervention: primary,
    interventionLabel: INTERVENTION_LABELS[primary],
    reason,
  };
}
