/**
 * Generate master Phoenix demo fixtures
 *
 * Creates a larger, synthetic Phoenix AOI (0.2° × 0.2° around downtown) so the
 * demo works for any viewport inside that area, not just the original small
 * box. Outputs TCM, exceedance, persistence, and time_of_measure fixtures.
 */

import { createHash } from 'crypto';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

if (!existsSync(FIXTURES_DIR)) {
  mkdirSync(FIXTURES_DIR, { recursive: true });
}

// ~18 km (E-W) × ~22 km (N-S) centered on downtown Phoenix.
const MASTER_AOI = {
  type: 'Polygon',
  coordinates: [[[-112.2, 33.3], [-112.0, 33.3], [-112.0, 33.5], [-112.2, 33.5], [-112.2, 33.3]]],
};
const DEMO_DATE = '2026-07-15';
const DEMO_HOUR = '14:00';
const GRANULARITY = 100;
const THRESHOLD_C = 38;

// Downtown hot core and secondary warm pockets.
const HOT_CORE = { lon: -112.07, lat: 33.45 };
const WARM_POCKETS = [
  { lon: -112.13, lat: 33.38, strength: 0.6 },
  { lon: -112.05, lat: 33.41, strength: 0.5 },
  { lon: -112.09, lat: 33.47, strength: 0.55 },
];

function cacheKey(endpoint, payload) {
  const { aoi, date, hour, mode, granularity, thresholdC } = payload;
  const base = JSON.stringify({ endpoint, aoi, date, hour, mode, granularity, thresholdC });
  return createHash('sha256').update(base).digest('hex').slice(0, 24);
}

function fixturePath(key) {
  return join(FIXTURES_DIR, `${key}.json`);
}

function round(n) {
  return Math.round(n * 10) / 10;
}

function gridCells() {
  const cells = [];
  const lonStep = 0.008333333333333333;
  const latStep = 0.008333333333333333;
  const minLon = MASTER_AOI.coordinates[0][0][0];
  const minLat = MASTER_AOI.coordinates[0][0][1];
  const maxLon = MASTER_AOI.coordinates[0][1][0];
  const maxLat = MASTER_AOI.coordinates[0][2][1];

  for (let lat = minLat; lat < maxLat - 1e-9; lat += latStep) {
    for (let lon = minLon; lon < maxLon - 1e-9; lon += lonStep) {
      cells.push({ lon, lat });
    }
  }
  return { cells, lonStep, latStep };
}

function polygonForCell(lon, lat, lonStep, latStep) {
  return {
    type: 'Polygon',
    coordinates: [[
      [lon, lat],
      [lon + lonStep, lat],
      [lon + lonStep, lat + latStep],
      [lon, lat + latStep],
      [lon, lat],
    ]],
  };
}

function temperatureAt(lon, lat) {
  // Distance-decay from hot core + warm pockets + bounded noise.
  const dx = (lon - HOT_CORE.lon) * 92; // approx km per deg lon at Phoenix lat
  const dy = (lat - HOT_CORE.lat) * 111;
  let base = 43.5 - Math.hypot(dx, dy) * 0.35;

  for (const p of WARM_POCKETS) {
    const pdx = (lon - p.lon) * 92;
    const pdy = (lat - p.lat) * 111;
    base += p.strength * Math.exp(-Math.hypot(pdx, pdy) / 2.5);
  }

  // Deterministic pseudo-noise based on coordinates.
  const noise = (Math.sin(lon * 100) + Math.cos(lat * 100)) * 0.8;
  const temp = base + noise;
  return round(Math.max(34, Math.min(50, temp)));
}

function generateTcm() {
  const { cells, lonStep, latStep } = gridCells();
  return {
    type: 'FeatureCollection',
    features: cells.map(({ lon, lat }) => ({
      type: 'Feature',
      geometry: polygonForCell(lon, lat, lonStep, latStep),
      properties: { temperature: temperatureAt(lon, lat) },
    })),
  };
}

function generateExceedance(tcmGeojson) {
  return {
    type: 'FeatureCollection',
    features: tcmGeojson.features.map((f) => {
      const temp = f.properties?.temperature ?? 0;
      const exceedance = temp > THRESHOLD_C ? Math.max(1, round((temp - THRESHOLD_C) * 1.6 + 2)) : 0;
      return { type: 'Feature', geometry: f.geometry, properties: { exceedance } };
    }),
  };
}

function generatePersistence(tcmGeojson, exceedanceGeojson) {
  return {
    type: 'FeatureCollection',
    features: tcmGeojson.features.map((f, idx) => {
      const exceedHours = exceedanceGeojson.features[idx]?.properties?.exceedance ?? 0;
      const lat = f.geometry.coordinates[0][0][1];
      const lon = f.geometry.coordinates[0][0][0];
      const phase = Math.sin(lon * 50 + lat * 80);
      const persistence = exceedHours > 0 ? round(exceedHours * (0.55 + phase * 0.1 + 0.05)) : 0;
      return { type: 'Feature', geometry: f.geometry, properties: { persistence } };
    }),
  };
}

function generateTimeOfMeasure(tcmGeojson) {
  return {
    type: 'FeatureCollection',
    features: tcmGeojson.features.map((f) => {
      const temp = f.properties?.temperature ?? 0;
      const lon = f.geometry.coordinates[0][0][0];
      const phase = Math.cos(lon * 120);
      const baseHour = 13;
      const offset = temp > THRESHOLD_C ? Math.min(4, Math.floor((temp - THRESHOLD_C) * 0.5)) : 0;
      const peakHour = baseHour + offset + Math.round(phase);
      return { type: 'Feature', geometry: f.geometry, properties: { time_of_measure: peakHour } };
    }),
  };
}

function writeFixture(key, data) {
  const path = fixturePath(key);
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`Wrote ${path} (${data.features.length} features)`);
}

const tcm = generateTcm();
const exceedance = generateExceedance(tcm);
const persistence = generatePersistence(tcm, exceedance);
const timeOfMeasure = generateTimeOfMeasure(tcm);

writeFixture(
  cacheKey('/v1/heatmap', {
    aoi: MASTER_AOI,
    date: DEMO_DATE,
    hour: DEMO_HOUR,
    mode: 'tcm',
    granularity: GRANULARITY,
  }),
  tcm
);

writeFixture(
  cacheKey('/v1/heatmap', {
    aoi: MASTER_AOI,
    date: DEMO_DATE,
    hour: DEMO_HOUR,
    mode: 'exceedance',
    granularity: GRANULARITY,
    thresholdC: THRESHOLD_C,
  }),
  exceedance
);

writeFixture(
  cacheKey('/v1/heatmap', {
    aoi: MASTER_AOI,
    date: DEMO_DATE,
    hour: DEMO_HOUR,
    mode: 'persistence',
    granularity: GRANULARITY,
  }),
  persistence
);

writeFixture(
  cacheKey('/v1/heatmap', {
    aoi: MASTER_AOI,
    date: DEMO_DATE,
    hour: DEMO_HOUR,
    mode: 'time_of_measure',
    granularity: GRANULARITY,
  }),
  timeOfMeasure
);
