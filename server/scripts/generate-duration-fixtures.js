import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

const DEMO_AOI = {
  type: 'Polygon',
  coordinates: [[[-112.1, 33.4], [-112.0, 33.4], [-112.0, 33.5], [-112.1, 33.5], [-112.1, 33.4]]],
};
const DEMO_DATE = '2026-07-15';
const DEMO_HOUR = '14:00';
const DEMO_GRANULARITY = 100;
const THRESHOLD_C = 38;

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

function generateExceedance(tcmGeojson) {
  return {
    type: 'FeatureCollection',
    features: tcmGeojson.features.map((f) => {
      const temp = f.properties?.temperature ?? 0;
      const exceedance = temp > THRESHOLD_C ? Math.max(1, round((temp - THRESHOLD_C) * 1.6 + 2)) : 0;
      return {
        type: 'Feature',
        geometry: f.geometry,
        properties: { exceedance },
      };
    }),
  };
}

function generatePersistence(tcmGeojson, exceedanceGeojson) {
  return {
    type: 'FeatureCollection',
    features: tcmGeojson.features.map((f, idx) => {
      const exceedHours = exceedanceGeojson.features[idx]?.properties?.exceedance ?? 0;
      // Longest streak is typically 55-80 % of total exceedance hours.
      const persistence = exceedHours > 0 ? round(exceedHours * (0.55 + ((idx % 5) / 100) * 5)) : 0;
      return {
        type: 'Feature',
        geometry: f.geometry,
        properties: { persistence },
      };
    }),
  };
}

function generateTimeOfMeasure(tcmGeojson) {
  return {
    type: 'FeatureCollection',
    features: tcmGeojson.features.map((f, idx) => {
      const temp = f.properties?.temperature ?? 0;
      // Hotter areas peak later in the afternoon, typically 15-18 in Phoenix.
      const baseHour = 13;
      const offset = temp > THRESHOLD_C ? Math.min(4, Math.floor((temp - THRESHOLD_C) * 0.5)) : 0;
      const peakHour = baseHour + offset + (idx % 2);
      return {
        type: 'Feature',
        geometry: f.geometry,
        properties: { time_of_measure: peakHour },
      };
    }),
  };
}

function writeFixture(key, data) {
  const path = fixturePath(key);
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`Wrote ${path} (${data.features.length} features)`);
}

const tcmKey = cacheKey('/v1/heatmap', {
  aoi: DEMO_AOI,
  date: DEMO_DATE,
  hour: DEMO_HOUR,
  mode: 'tcm',
  granularity: DEMO_GRANULARITY,
});
const tcmPath = fixturePath(tcmKey);
console.log(`Reading TCM fixture: ${tcmPath}`);
const tcmGeojson = JSON.parse(readFileSync(tcmPath, 'utf8'));

const exceedance = generateExceedance(tcmGeojson);
const persistence = generatePersistence(tcmGeojson, exceedance);
const timeOfMeasure = generateTimeOfMeasure(tcmGeojson);

writeFixture(
  cacheKey('/v1/heatmap', {
    aoi: DEMO_AOI,
    date: DEMO_DATE,
    hour: DEMO_HOUR,
    mode: 'exceedance',
    granularity: DEMO_GRANULARITY,
    thresholdC: THRESHOLD_C,
  }),
  exceedance
);

writeFixture(
  cacheKey('/v1/heatmap', {
    aoi: DEMO_AOI,
    date: DEMO_DATE,
    hour: DEMO_HOUR,
    mode: 'persistence',
    granularity: DEMO_GRANULARITY,
  }),
  persistence
);

writeFixture(
  cacheKey('/v1/heatmap', {
    aoi: DEMO_AOI,
    date: DEMO_DATE,
    hour: DEMO_HOUR,
    mode: 'time_of_measure',
    granularity: DEMO_GRANULARITY,
  }),
  timeOfMeasure
);
