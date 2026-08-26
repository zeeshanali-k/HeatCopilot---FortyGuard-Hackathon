import { writeFixture } from '../src/cache.js';

const aoi = {
  type: 'Polygon',
  coordinates: [[[-112.1, 33.4], [-112.0, 33.4], [-112.0, 33.5], [-112.1, 33.5], [-112.1, 33.4]]],
};

const date = '2026-07-15';
const hour = '14:00';
const mode = 'tcm';
const granularity = 100;

const rows = 12;
const cols = 12;
const minLat = 33.4;
const maxLat = 33.5;
const minLon = -112.1;
const maxLon = -112.0;
const dLat = (maxLat - minLat) / rows;
const dLon = (maxLon - minLon) / cols;

// Create a heat island slightly south-east of center
const hotspotLat = 33.445;
const hotspotLon = -112.055;

const features = [];
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const lat0 = minLat + r * dLat;
    const lon0 = minLon + c * dLon;
    const lat1 = lat0 + dLat;
    const lon1 = lon0 + dLon;

    const centerLat = (lat0 + lat1) / 2;
    const centerLon = (lon0 + lon1) / 2;
    const dist = Math.hypot(centerLon - hotspotLon, centerLat - hotspotLat);

    // Temperature falls off from hotspot, range ~38°C to ~48°C
    const base = 48 - dist * 180;
    const temp = Math.max(38, Math.min(49, base + (Math.random() - 0.5) * 2));

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [lon0, lat0],
          [lon1, lat0],
          [lon1, lat1],
          [lon0, lat1],
          [lon0, lat0],
        ]],
      },
      properties: {
        temperature: Math.round(temp * 10) / 10,
      },
    });
  }
}

const fixture = {
  type: 'FeatureCollection',
  features,
  meta: {
    mode,
    granularity,
    min_temp: 38,
    max_temp: 49,
    mean_temp: 43,
  },
};

const key = writeFixture('/v1/heatmap', { aoi, date, hour, mode, granularity }, fixture);
console.log('Seeded Phoenix fixture:', key);
