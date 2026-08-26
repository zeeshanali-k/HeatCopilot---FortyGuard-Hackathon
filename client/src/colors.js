/**
 * Shared color constants
 *
 * Heat scale used for temperature overlays and markers, plus score badges for
 * prioritized zones.
 */

export const heatColorScale = ['#2b83ba', '#abdda4', '#ffffbf', '#fdae61', '#d7191c'];

export function scoreColor(score) {
  if (score >= 80) return '#e5484d';
  if (score >= 60) return '#f76b15';
  if (score >= 40) return '#ffc53d';
  return '#8b8f98';
}
