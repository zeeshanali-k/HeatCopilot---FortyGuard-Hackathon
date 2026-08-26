/**
 * Map visualization helpers.
 *
 * Provides color scales and formatting utilities used by the heat and
 * duration overlay layers and by hotspot markers.
 */

import { heatColorScale } from '../../colors';

/**
 * Return a marker/legend color for a temperature value (°C).
 */
export function heatColorForTemp(temp) {
  if (temp >= 47) return '#d7191c';
  if (temp >= 45) return '#fdae61';
  if (temp >= 42) return '#ffffbf';
  if (temp >= 38) return '#abdda4';
  return '#2b83ba';
}

/**
 * Build a MapLibre fill-color expression for the heat tile layer.
 */
export function heatFillExpression() {
  return [
    'interpolate',
    ['linear'],
    ['get', 'temperature'],
    38, heatColorScale[0],
    42, heatColorScale[1],
    45, heatColorScale[2],
    47, heatColorScale[3],
    49, heatColorScale[4],
  ];
}

/**
 * Build a MapLibre fill-color expression for the duration streak layer.
 */
export function durationFillExpression() {
  return [
    'interpolate',
    ['linear'],
    ['get', 'longestStreakHrs'],
    0, '#ffffb2',
    4, '#fecc5c',
    8, '#fd8d3c',
    12, '#f03b20',
    16, '#bd0026',
  ];
}

/**
 * Format an hour number as "HH:00" or return "--" when missing.
 */
export function formatHour(hour) {
  if (hour == null) return '--';
  const h = Math.floor(hour);
  return `${h.toString().padStart(2, '0')}:00`;
}
