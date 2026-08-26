/**
 * Fixture cache
 *
 * Disk-backed cache for FortyGuard responses keyed by endpoint + AOI + date +
 * hour + mode + granularity (+ threshold for exceedance). In DEMO_MODE the
 * backend never calls upstream; it serves exact fixture matches or falls back
 * to the pre-generated master Phoenix demo area clipped to the requested AOI.
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

if (!existsSync(FIXTURES_DIR)) {
  mkdirSync(FIXTURES_DIR, { recursive: true });
}

// Master Phoenix demo AOI: ~18 km × ~22 km around downtown.
const PHOENIX_MASTER_AOI = {
  type: 'Polygon',
  coordinates: [[[-112.2, 33.3], [-112.0, 33.3], [-112.0, 33.5], [-112.2, 33.5], [-112.2, 33.3]]],
};
const PHOENIX_MASTER_DATE = '2026-07-15';
const PHOENIX_MASTER_HOUR = '14:00';
const PHOENIX_MASTER_GRANULARITY = 100;

function demoModeEnabled() {
  return process.env.DEMO_MODE === 'fixtures';
}

function cacheKey(endpoint, payload) {
  const { aoi, date, hour, mode, granularity, thresholdC } = payload;
  const base = JSON.stringify({ endpoint, aoi, date, hour, mode, granularity, thresholdC });
  return createHash('sha256').update(base).digest('hex').slice(0, 24);
}

function fixturePath(key) {
  return join(FIXTURES_DIR, `${key}.json`);
}

function bbox(polygon) {
  const ring = polygon.coordinates[0];
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return { minLon, maxLon, minLat, maxLat };
}

function bboxContains(outer, inner) {
  return (
    inner.minLon >= outer.minLon - 1e-9 &&
    inner.maxLon <= outer.maxLon + 1e-9 &&
    inner.minLat >= outer.minLat - 1e-9 &&
    inner.maxLat <= outer.maxLat + 1e-9
  );
}

function pointInBbox(point, box) {
  const [lon, lat] = point;
  return lon >= box.minLon && lon <= box.maxLon && lat >= box.minLat && lat <= box.maxLat;
}

function getCentroid(geometry) {
  if (!geometry) return null;
  const ring = geometry.type === 'Polygon'
    ? geometry.coordinates[0]
    : geometry.coordinates[0][0];
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

function clipToAoi(geojson, aoi) {
  const box = bbox(aoi);
  return {
    type: 'FeatureCollection',
    features: geojson.features.filter((f) => pointInBbox(getCentroid(f.geometry), box)),
  };
}

export function readFixture(endpoint, payload) {
  const key = cacheKey(endpoint, payload);
  const path = fixturePath(key);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    return { key, data, fromCache: true };
  } catch (err) {
    console.error('Cache read failed:', err.message);
    return null;
  }
}

export function writeFixture(endpoint, payload, data) {
  const key = cacheKey(endpoint, payload);
  const path = fixturePath(key);
  try {
    writeFileSync(path, JSON.stringify(data, null, 2));
    return key;
  } catch (err) {
    console.error('Cache write failed:', err.message);
    return key;
  }
}

function tryDemoFallback(endpoint, payload) {
  if (endpoint !== '/v1/heatmap') return null;

  const requestedBox = bbox(payload.aoi);
  const masterBox = bbox(PHOENIX_MASTER_AOI);
  if (!bboxContains(masterBox, requestedBox)) return null;

  // Match date/hour/granularity; fall back to master demo values otherwise.
  const date = payload.date === PHOENIX_MASTER_DATE ? payload.date : PHOENIX_MASTER_DATE;
  const hour = payload.hour === PHOENIX_MASTER_HOUR ? payload.hour : PHOENIX_MASTER_HOUR;
  const granularity = payload.granularity === PHOENIX_MASTER_GRANULARITY ? payload.granularity : PHOENIX_MASTER_GRANULARITY;

  const masterPayload = {
    aoi: PHOENIX_MASTER_AOI,
    date,
    hour,
    mode: payload.mode,
    granularity,
    thresholdC: payload.thresholdC,
  };
  const master = readFixture(endpoint, masterPayload);
  if (!master) return null;

  const clipped = clipToAoi(master.data, payload.aoi);
  if (clipped.features.length === 0) return null;

  return { key: master.key, data: clipped, fromCache: true };
}

export function loadOrFail(endpoint, payload) {
  const cached = readFixture(endpoint, payload);
  if (cached) return cached;

  const fallback = tryDemoFallback(endpoint, payload);
  if (fallback) return fallback;

  if (demoModeEnabled()) {
    const error = new Error('No fixture for this request in DEMO_MODE');
    error.code = 'cache_miss';
    error.status = 404;
    throw error;
  }
  return null;
}

export function isDemoMode() {
  return demoModeEnabled();
}
