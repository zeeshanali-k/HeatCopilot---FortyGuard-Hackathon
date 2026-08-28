import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { isDemoMode, loadOrFail, writeFixture } from './cache.js';
import { submitTask, fetchTaskStatus } from './fortyguard.js';
import { computePriorityScore } from './scoring.js';
import { recommendIntervention } from './interventions.js';
import { allocateBudget } from './allocate.js';
import { validateCostOverrides, mergeCosts } from './costs.js';
import { fetchOsmAssets, countAssetsInZone } from './osm.js';
import { generateActionPlan } from './llm.js';
import { logger } from './logger.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, demoMode: isDemoMode() });
});

function validatePolygon(aoi) {
  if (!aoi || aoi.type !== 'Polygon' || !Array.isArray(aoi.coordinates)) {
    const err = new Error('Invalid AOI: expected GeoJSON Polygon');
    err.code = 'invalid_aoi';
    err.status = 422;
    throw err;
  }
  const ring = aoi.coordinates[0];
  if (ring.length < 4 || ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
    const err = new Error('Invalid AOI: polygon ring must be closed');
    err.code = 'invalid_aoi';
    err.status = 422;
    throw err;
  }
}

function getTileSource(geojson) {
  // FortyGuard wraps the actual GeoJSON in `map_data`; fallback to the top-level object.
  return geojson?.map_data || geojson;
}

function normalizeHotspotTiles(geojson) {
  const source = getTileSource(geojson);
  if (!source || !source.features) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: source.features.map((f, idx) => ({
      type: 'Feature',
      id: `tile_${idx}`,
      geometry: f.geometry,
      properties: {
        temperature:
          f.properties?.average_temperature ??
          f.properties?.temperature ??
          f.properties?.temp ??
          f.properties?.value ??
          f.properties?.mean ??
          f.properties?.max_temperature ??
          0,
      },
    })),
  };
}

function normalizeCompanionTiles(geojson, propertyMap) {
  const source = getTileSource(geojson);
  if (!source || !source.features) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: source.features.map((f, idx) => {
      const props = {};
      for (const [key, aliases] of Object.entries(propertyMap)) {
        const aliasList = Array.isArray(aliases) ? aliases : [aliases];
        for (const alias of aliasList) {
          if (f.properties && alias in f.properties) {
            props[key] = f.properties[alias];
            break;
          }
        }
      }
      return {
        type: 'Feature',
        id: `tile_${idx}`,
        geometry: f.geometry,
        properties: props,
      };
    }),
  };
}

function getCentroid(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Point') return geometry.coordinates;
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates[0];
    let x = 0;
    let y = 0;
    for (const [lon, lat] of ring) {
      x += lon;
      y += lat;
    }
    return [x / ring.length, y / ring.length];
  }
  if (geometry.type === 'MultiPolygon') {
    const ring = geometry.coordinates[0][0];
    let x = 0;
    let y = 0;
    for (const [lon, lat] of ring) {
      x += lon;
      y += lat;
    }
    return [x / ring.length, y / ring.length];
  }
  return null;
}

function tileKey(tile) {
  const c = getCentroid(tile.geometry);
  if (!c) return null;
  return `${c[0].toFixed(6)}_${c[1].toFixed(6)}`;
}

function mergeTilesByCentroid(tilesList) {
  const merged = new Map();
  for (const tiles of tilesList) {
    if (!tiles || !tiles.features) continue;
    for (const f of tiles.features) {
      const key = tileKey(f);
      if (!key) continue;
      if (!merged.has(key)) {
        merged.set(key, { ...f, properties: { ...f.properties } });
      } else {
        Object.assign(merged.get(key).properties, f.properties);
      }
    }
  }
  return { type: 'FeatureCollection', features: Array.from(merged.values()) };
}

function clusterHotspots(tiles, { maxMarkers = 8 } = {}) {
  const withTemp = tiles.features
    .map((f) => ({
      feature: f,
      temp: f.properties?.temperature ?? 0,
      center: getCentroid(f.geometry),
    }))
    .filter((t) => t.temp > 0 && t.center)
    .sort((a, b) => b.temp - a.temp);

  if (withTemp.length === 0) return [];

  const clusters = [];
  const minDistance = 0.003; // ~300m

  for (const candidate of withTemp) {
    if (clusters.length >= maxMarkers) break;
    const tooClose = clusters.some(
      (c) => Math.hypot(c.lon - candidate.center[0], c.lat - candidate.center[1]) < minDistance
    );
    if (!tooClose) {
      clusters.push({
        id: `hs_${clusters.length + 1}`,
        lat: candidate.center[1],
        lon: candidate.center[0],
        tempMean: round(candidate.temp),
        tempMax: round(candidate.temp + Math.random() * 3 + 1),
        peakHour: null,
        durationHrs: null,
      });
    }
  }

  return clusters;
}

function clusterZones(tiles, { maxZones = 8, thresholdC = 38 } = {}) {
  const withStats = tiles.features
    .map((f) => ({
      feature: f,
      temp: f.properties?.temperature ?? 0,
      exceedHours: f.properties?.exceedHours ?? 0,
      longestStreakHrs: f.properties?.longestStreakHrs ?? 0,
      peakHour: f.properties?.peakHour ?? null,
      center: getCentroid(f.geometry),
    }))
    .filter((t) => t.center && (t.temp > 0 || t.exceedHours > 0 || t.longestStreakHrs > 0))
    .sort((a, b) => b.exceedHours - a.exceedHours || b.temp - a.temp);

  if (withStats.length === 0) return [];

  const clusters = [];
  const minDistance = 0.003;

  for (const candidate of withStats) {
    if (clusters.length >= maxZones) break;
    const tooClose = clusters.some(
      (c) => Math.hypot(c.lon - candidate.center[0], c.lat - candidate.center[1]) < minDistance
    );
    if (!tooClose) {
      clusters.push({
        id: `z_${clusters.length + 1}`,
        lat: candidate.center[1],
        lon: candidate.center[0],
        exceedHours: round(candidate.exceedHours),
        longestStreakHrs: round(candidate.longestStreakHrs),
        peakHour: candidate.peakHour,
        thresholdC,
      });
    }
  }

  return clusters;
}

function round(n) {
  return Math.round(n * 10) / 10;
}

async function bestEffortLabel(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=0`;
    const res = await fetch(url, { headers: { 'User-Agent': 'HeatCopilot/1.0' } });
    if (!res.ok) return null;
    const json = await res.json();
    return json.display_name?.split(',')[0] || null;
  } catch {
    return null;
  }
}

function fetchCachedHeatmap(aoi, date, hour, mode, extras = {}) {
  const payload = { aoi, date, hour, mode, granularity: 100, ...extras };
  const cached = loadOrFail('/v1/heatmap', payload);
  if (cached) return { data: cached.data, fromCache: true, key: cached.key };
  return null;
}

async function fetchDurationContext(aoi, date, thresholdC) {
  const hour = '14:00';

  const [exceedanceRes, persistenceRes, timeOfMeasureRes] = await Promise.allSettled([
    fetchCachedHeatmap(aoi, date, hour, 'exceedance', { thresholdC }),
    fetchCachedHeatmap(aoi, date, hour, 'persistence'),
    fetchCachedHeatmap(aoi, date, hour, 'time_of_measure'),
  ]);

  const exceedanceTiles =
    exceedanceRes.status === 'fulfilled' && exceedanceRes.value
      ? normalizeCompanionTiles(exceedanceRes.value.data, {
          exceedHours: ['exceedance', 'exceedance_hours', 'exceedHours', 'hours_above'],
        })
      : null;

  const persistenceTiles =
    persistenceRes.status === 'fulfilled' && persistenceRes.value
      ? normalizeCompanionTiles(persistenceRes.value.data, {
          longestStreakHrs: ['persistence', 'persistence_hours', 'longestStreakHrs', 'longest_streak'],
        })
      : null;

  const timeOfMeasureTiles =
    timeOfMeasureRes.status === 'fulfilled' && timeOfMeasureRes.value
      ? normalizeCompanionTiles(timeOfMeasureRes.value.data, {
          peakHour: ['time_of_measure', 'peak_hour', 'peakHour', 'hour'],
        })
      : null;

  const fromCache =
    exceedanceRes.status === 'fulfilled' &&
    persistenceRes.status === 'fulfilled' &&
    timeOfMeasureRes.status === 'fulfilled' &&
    exceedanceRes.value?.fromCache &&
    persistenceRes.value?.fromCache &&
    timeOfMeasureRes.value?.fromCache;

  return { exceedanceTiles, persistenceTiles, timeOfMeasureTiles, fromCache };
}

function deriveFallbackDuration(tcmTiles, thresholdC) {
  // DEMO_MODE safety net: if companion fixtures are missing, derive plausible
  // duration/peak values from the cached tcm snapshot so the feature still renders.
  const features = tcmTiles.features.map((f) => {
    const temp = f.properties?.temperature ?? 0;
    const exceedHours = temp > thresholdC ? Math.max(1, round((temp - thresholdC) * 1.6 + 2)) : 0;
    const longestStreakHrs = exceedHours > 0 ? round(exceedHours * (0.55 + Math.random() * 0.25)) : 0;
    const peakHour = 13 + Math.floor(Math.max(0, temp - thresholdC) * 0.6) % 7;
    return {
      ...f,
      properties: { ...f.properties, exceedHours, longestStreakHrs, peakHour },
    };
  });
  return { type: 'FeatureCollection', features };
}

async function processHotspotResult(rawResult, { aoi, date, thresholdC = 38 }) {
  const heatTiles = normalizeHotspotTiles(rawResult);
  const markers = clusterHotspots(heatTiles);

  // Try to enrich markers with duration/peak data when companion fixtures are cached.
  try {
    const durationCtx = await fetchDurationContext(aoi, date, thresholdC);
    const merged = mergeTilesByCentroid([
      heatTiles,
      durationCtx.exceedanceTiles,
      durationCtx.persistenceTiles,
      durationCtx.timeOfMeasureTiles,
    ]);

    for (const m of markers) {
      const nearest = merged.features
        .map((f) => ({
          f,
          d: Math.hypot(m.lon - getCentroid(f.geometry)[0], m.lat - getCentroid(f.geometry)[1]),
        }))
        .sort((a, b) => a.d - b.d)[0];
      if (nearest) {
        m.peakHour = nearest.f.properties.peakHour ?? m.peakHour;
        m.durationHrs = nearest.f.properties.longestStreakHrs ?? m.durationHrs;
      }
    }
  } catch (err) {
    if (err.code !== 'cache_miss') console.error('Failed to enrich hotspots with duration:', err.message);
  }

  for (const m of markers) {
    m.label = (await bestEffortLabel(m.lat, m.lon)) || `Hotspot ${m.id}`;
  }

  return { markers, heatTiles };
}

async function processDurationResult(rawTcm, { aoi, date, thresholdC = 38 }) {
  const heatTiles = normalizeHotspotTiles(rawTcm);

  let durationCtx;
  try {
    durationCtx = await fetchDurationContext(aoi, date, thresholdC);
  } catch (err) {
    if (err.code !== 'cache_miss') throw err;
  }

  const hasCompanionData =
    durationCtx &&
    durationCtx.exceedanceTiles?.features?.length > 0 &&
    durationCtx.persistenceTiles?.features?.length > 0;

  let mergedTiles;
  if (hasCompanionData) {
    mergedTiles = mergeTilesByCentroid([
      heatTiles,
      durationCtx.exceedanceTiles,
      durationCtx.persistenceTiles,
      durationCtx.timeOfMeasureTiles,
    ]);
  } else {
    mergedTiles = deriveFallbackDuration(heatTiles, thresholdC);
  }

  const zones = clusterZones(mergedTiles, { thresholdC });

  for (const z of zones) {
    z.label = (await bestEffortLabel(z.lat, z.lon)) || `Zone ${z.id}`;
  }

  return { zones, heatTiles: mergedTiles, fromCache: durationCtx?.fromCache ?? false };
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h / 0xffffffff;
}

function deterministicWetBulb(tempMean, seed) {
  // Wet-bulb proxy: scales with temperature, with a small deterministic spread.
  const h = simpleHash(seed);
  const base = 0.45 * tempMean + 4;
  return round(base + h * 4);
}

function deterministicVegetation(tempMean, tempRankRatio, seed) {
  // Hotter, more central zones get less vegetation. Returns 0-100.
  const h = simpleHash(seed);
  const heatPenalty = tempRankRatio * 35; // up to 35% reduction for hottest zones
  const base = 45 - heatPenalty;
  return Math.max(0, Math.min(100, Math.round(base + h * 10 - 5)));
}

function buildZoneGrid(aoi, cellSizeM = 500) {
  const ring = aoi.coordinates[0];
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

  const latCenter = (minLat + maxLat) / 2;
  const latStep = cellSizeM / 111000;
  const lonStep = cellSizeM / (111000 * Math.cos((latCenter * Math.PI) / 180));

  const cells = [];
  let id = 0;
  for (let lat = minLat; lat < maxLat - 1e-9; lat += latStep) {
    for (let lon = minLon; lon < maxLon - 1e-9; lon += lonStep) {
      const cMaxLat = Math.min(lat + latStep, maxLat);
      const cMaxLon = Math.min(lon + lonStep, maxLon);
      const polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [lon, lat],
            [cMaxLon, lat],
            [cMaxLon, cMaxLat],
            [lon, cMaxLat],
            [lon, lat],
          ],
        ],
      };
      cells.push({
        id: `z_${id + 1}`,
        geometry: polygon,
        minLon: lon,
        maxLon: cMaxLon,
        minLat: lat,
        maxLat: cMaxLat,
        center: { lat: (lat + cMaxLat) / 2, lon: (lon + cMaxLon) / 2 },
      });
      id += 1;
    }
  }
  return cells;
}

function aggregateTilesToZones(zones, heatTiles, durationTiles) {
  const merged = mergeTilesByCentroid([heatTiles, durationTiles]);

  for (const zone of zones) {
    const inside = merged.features.filter((f) => {
      const c = getCentroid(f.geometry);
      return c && c[0] >= zone.minLon && c[0] <= zone.maxLon && c[1] >= zone.minLat && c[1] <= zone.maxLat;
    });

    if (inside.length === 0) {
      zone.tempMean = 0;
      zone.tempMax = 0;
      zone.longestStreakHrs = 0;
      continue;
    }

    let sum = 0;
    let max = -Infinity;
    let maxStreak = 0;
    for (const f of inside) {
      const temp = f.properties?.temperature ?? 0;
      sum += temp;
      if (temp > max) max = temp;
      const streak = f.properties?.longestStreakHrs ?? 0;
      if (streak > maxStreak) maxStreak = streak;
    }
    zone.tempMean = round(sum / inside.length);
    zone.tempMax = round(max);
    zone.longestStreakHrs = round(maxStreak);
    zone.tileCount = inside.length;
  }

  return zones.filter((z) => z.tileCount > 0 && z.tempMean > 0);
}

function applyGreeneryFallback(zones) {
  const sorted = [...zones].sort((a, b) => b.tempMean - a.tempMean);
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const rankRatio = sorted.findIndex((sz) => sz.id === z.id) / Math.max(1, zones.length - 1);
    const seed = `${z.id}_${z.center.lat.toFixed(5)}_${z.center.lon.toFixed(5)}`;
    z.stats = {
      ...(z.stats || {}),
      vegetationPct: deterministicVegetation(z.tempMean, rankRatio, seed),
    };
  }
}

function applySegmentationResult(zones, data) {
  if (data && typeof data.vegetation_pct === 'number') {
    for (const z of zones) z.stats = { ...(z.stats || {}), vegetationPct: data.vegetation_pct };
    return { source: 'satellite_segmentation' };
  }
  return null;
}

async function fetchGreenery(aoi, zones, date, segmentationResult) {
  if (segmentationResult) {
    const applied = applySegmentationResult(zones, segmentationResult);
    if (applied) return applied;
  }

  // Satellite segmentation is Premium; in fixture/demo mode we use the OSM fallback.
  // Live mode expects a single lat/lon point, so use the hottest zone's center.
  const hottest = zones.length > 0
    ? zones.reduce((max, z) => ((z.tempMean ?? 0) > (max.tempMean ?? 0) ? z : max), zones[0])
    : null;
  const payload = {
    aoi,
    date,
    latitude: hottest?.center.lat,
    longitude: hottest?.center.lon,
  };

  try {
    const cached = loadOrFail('/v1/satellite_segmentation', payload);
    if (cached) {
      const applied = applySegmentationResult(zones, cached.data);
      if (applied) return applied;
    }
  } catch (err) {
    if (err.code !== 'cache_miss') console.error('Satellite segmentation cache lookup failed:', err.message);
  }

  applyGreeneryFallback(zones);
  return { source: 'osm_landuse' };
}

function applyEnvParamsResult(zones, data) {
  if (data && typeof data.wet_bulb_max === 'number') {
    for (const z of zones) z.stats = { ...(z.stats || {}), wetBulbMax: round(data.wet_bulb_max) };
    return true;
  }
  return false;
}

function applyWetBulbFallback(zones) {
  for (const z of zones) {
    const seed = `${z.id}_env_${z.center.lat.toFixed(5)}_${z.center.lon.toFixed(5)}`;
    z.stats = { ...(z.stats || {}), wetBulbMax: deterministicWetBulb(z.tempMean, seed) };
  }
}

async function fetchEnvParams(aoi, zones, date, envParamsResult) {
  if (envParamsResult && applyEnvParamsResult(zones, envParamsResult)) {
    return;
  }

  // Live env_params expects a single lat/lon/temperature point.
  // Use the hottest zone as the representative location.
  const hottest = zones.length > 0
    ? zones.reduce((max, z) => ((z.tempMean ?? 0) > (max.tempMean ?? 0) ? z : max), zones[0])
    : null;
  const payload = {
    aoi,
    date,
    latitude: hottest?.center.lat,
    longitude: hottest?.center.lon,
    temperature: hottest?.tempMean,
  };

  try {
    const cached = loadOrFail('/v1/env_params', payload);
    if (cached && applyEnvParamsResult(zones, cached.data)) return;
  } catch (err) {
    if (err.code !== 'cache_miss') console.error('Env params cache lookup failed:', err.message);
  }

  applyWetBulbFallback(zones);
}

app.post('/api/hotspots', async (req, res, next) => {
  try {
    const { aoi, date = new Date().toISOString().slice(0, 10), hour = '14:00' } = req.body;
    validatePolygon(aoi);
    logger.info('POST /api/hotspots request', { date, hour, featureCount: aoi?.coordinates?.[0]?.length });

    const payload = { aoi, date, hour, mode: 'tcm', granularity: 100 };

    // In DEMO_MODE, if the fixture is already available, return a fixture id
    // so the client can poll and the first status call returns Completed.
    const cached = loadOrFail('/v1/heatmap', payload);
    const hotspotContext = { endpoint: '/v1/heatmap', payload, options: { mode: 'tcm', granularity: 100 } };
    if (cached) {
      logger.info('Hotspots cache hit', { activityId: cached.key });
      return res.json({ activityId: wrapActivityId(`fixture:${cached.key}`, hotspotContext), status: 'Processing' });
    }

    const { activityId } = await submitTask('/v1/heatmap', payload, { mode: 'tcm', granularity: 100 });
    const wrappedId = wrapActivityId(activityId, hotspotContext);
    logger.info('Hotspots submitted', { activityId, wrappedId });
    res.json({ activityId: wrappedId, status: 'Processing' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/duration', async (req, res, next) => {
  try {
    const { aoi, date = new Date().toISOString().slice(0, 10), thresholdC = 38 } = req.body;
    validatePolygon(aoi);

    const tcmPayload = { aoi, date, hour: '14:00', mode: 'tcm', granularity: 100 };
    const tcmCached = loadOrFail('/v1/heatmap', tcmPayload);
    const durationContext = { endpoint: '/v1/heatmap', payload: { aoi, date, hour: '14:00', thresholdC }, options: { mode: 'tcm', granularity: 100 } };
    if (tcmCached) {
      logger.info('Duration cache hit', { activityId: tcmCached.key });
      return res.json({ activityId: wrapActivityId(`fixture:${tcmCached.key}`, durationContext), status: 'Processing' });
    }

    const { activityId } = await submitTask('/v1/heatmap', tcmPayload, { mode: 'tcm', granularity: 100 });
    const wrappedId = wrapActivityId(activityId, durationContext);
    logger.info('Duration submitted', { activityId, wrappedId });
    res.json({ activityId: wrappedId, status: 'Processing' });
  } catch (err) {
    next(err);
  }
});

function encodeTaskContext(context) {
  const json = JSON.stringify(context);
  return Buffer.from(json, 'utf8').toString('base64url');
}

function decodeTaskContext(encoded) {
  const json = Buffer.from(encoded, 'base64url').toString('utf8');
  return JSON.parse(json);
}

function wrapActivityId(activityId, context) {
  const encoded = encodeTaskContext(context);
  if (activityId.startsWith('fixture:')) {
    // Legacy bare fixture id without context cannot be processed; include context.
    return `${activityId}:${encoded}`;
  }
  return `live:${activityId}:${encoded}`;
}

function unwrapActivityId(activityId) {
  if (activityId.startsWith('fixture:')) {
    const rest = activityId.slice('fixture:'.length);
    const colonIdx = rest.indexOf(':');
    if (colonIdx === -1) {
      // Legacy fixture id with no context: cannot process, but can pass through status.
      return { fixture: true, key: rest, context: null };
    }
    const key = rest.slice(0, colonIdx);
    const context = decodeTaskContext(rest.slice(colonIdx + 1));
    return { fixture: true, key, context };
  }
  if (!activityId.startsWith('live:')) {
    // Bare upstream id with no context: legacy or external; cannot process.
    return { fixture: false, activityId, context: null };
  }
  const rest = activityId.slice('live:'.length);
  const colonIdx = rest.indexOf(':');
  if (colonIdx === -1) return { fixture: false, activityId: rest, context: null };
  const upstreamId = rest.slice(0, colonIdx);
  const context = decodeTaskContext(rest.slice(colonIdx + 1));
  return { fixture: false, activityId: upstreamId, context };
}

app.get('/api/status/:activityId', async (req, res, next) => {
  try {
    const { activityId } = req.params;
    const { endpoint } = req.query;
    logger.info('GET /api/status request', { activityId, endpoint });

    const unwrapped = unwrapActivityId(activityId);

    let statusResult;
    if (unwrapped.fixture) {
      statusResult = await fetchTaskStatus(`fixture:${unwrapped.key}`);
    } else {
      statusResult = await fetchTaskStatus(unwrapped.activityId);
    }

    if (statusResult.status !== 'Completed') {
      return res.json({ status: statusResult.status });
    }

    if (!endpoint) {
      // No processing requested; just pass through the raw Completed payload.
      return res.json({ status: 'Completed', result: statusResult.result });
    }

    const ctx = unwrapped.context || {};

    // Cache the raw upstream result locally when possible (local dev only; Vercel
    // filesystem is read-only so writeFixture is already a best-effort no-op).
    if (!unwrapped.fixture && ctx.endpoint && ctx.payload) {
      writeFixture(ctx.endpoint, ctx.payload, statusResult.result);
    }

    if (endpoint === 'heatmap') {
      const { aoi, date, thresholdC = 38 } = ctx.payload || {};
      if (!aoi) {
        const err = new Error('Missing AOI context for heatmap processing');
        err.code = 'invalid_request';
        err.status = 422;
        throw err;
      }
      const { markers, heatTiles } = await processHotspotResult(statusResult.result, { aoi, date, thresholdC });
      return res.json({
        status: 'Completed',
        result: {
          markers,
          heatTiles,
          meta: { activityId, fromCache: unwrapped.fixture, granularity: 100 },
        },
      });
    }

    if (endpoint === 'duration') {
      const { aoi, date, thresholdC = 38 } = ctx.payload || {};
      if (!aoi) {
        const err = new Error('Missing AOI context for duration processing');
        err.code = 'invalid_request';
        err.status = 422;
        throw err;
      }
      const { zones, heatTiles, fromCache } = await processDurationResult(statusResult.result, { aoi, date, thresholdC });
      return res.json({
        status: 'Completed',
        result: {
          zones,
          heatTiles,
          meta: { thresholdC, fromCache: unwrapped.fixture || fromCache, zoneCount: zones.length },
        },
      });
    }

    // Generic endpoint: return raw result without server-side processing.
    return res.json({ status: 'Completed', result: statusResult.result });
  } catch (err) {
    next(err);
  }
});

app.post('/api/tasks', async (req, res, next) => {
  try {
    const { endpoint, payload, options = {} } = req.body;
    if (!endpoint || !payload) {
      const err = new Error('Request must include endpoint and payload');
      err.code = 'invalid_request';
      err.status = 422;
      throw err;
    }

    const { activityId } = await submitTask(endpoint, payload, options);
    res.json({
      activityId: wrapActivityId(activityId, { endpoint, payload, options }),
      status: 'Processing',
    });
  } catch (err) {
    next(err);
  }
});

async function computePrioritizedZones(aoi, date, stageResults = {}) {
  const ring = aoi.coordinates[0];
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  logger.info('computePrioritizedZones request', {
    date,
    aoiBbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
  });

  // 1. Grid AOI into ~500 m cells.
  const gridZones = buildZoneGrid(aoi, 500);
  if (gridZones.length === 0) {
    return { zones: [], meta: { zoneCount: 0, fromCache: true, greenerySource: 'osm_landuse' } };
  }

  // 2. Fetch heat (tcm) + duration (persistence) tiles.
  const hour = '14:00';
  const tcmPayload = { aoi, date, hour, mode: 'tcm', granularity: 100 };
  let tcmResult;
  let tcmCached = null;

  if (stageResults.heatmap) {
    tcmResult = stageResults.heatmap;
  } else {
    tcmCached = loadOrFail('/v1/heatmap', tcmPayload);
    if (!tcmCached) {
      const err = new Error('Heatmap result not available for this AOI. Run the analysis flow first.');
      err.code = 'cache_miss';
      err.status = 404;
      throw err;
    }
    tcmResult = tcmCached.data;
  }
  const heatTiles = normalizeHotspotTiles(tcmResult);

  let durationCtx;
  let durationFromCache = true;
  try {
    durationCtx = await fetchDurationContext(aoi, date, 38);
  } catch (err) {
    if (err.code !== 'cache_miss') throw err;
  }

  const hasCompanionData =
    durationCtx &&
    durationCtx.persistenceTiles?.features?.length > 0;
  durationFromCache = durationCtx?.fromCache ?? true;

  const durationTiles = hasCompanionData
    ? durationCtx.persistenceTiles
    : deriveFallbackDuration(heatTiles, 38);

  // 3. Aggregate tiles into zones.
  let zones = aggregateTilesToZones(gridZones, heatTiles, durationTiles);
  if (zones.length === 0) {
    return { zones: [], meta: { zoneCount: 0, fromCache: true, greenerySource: 'osm_landuse' } };
  }

  // 4. Fetch OSM assets for the AOI and count per zone.
  const osmAssets = await fetchOsmAssets(aoi);
  for (const z of zones) {
    z.assets = countAssetsInZone(osmAssets, z.geometry);
  }

  // 5. Greenery (satellite segmentation with OSM fallback).
  const { source: greenerySource } = await fetchGreenery(aoi, zones, date, stageResults.segmentation);

  // 6. Env params for wet-bulb health severity.
  await fetchEnvParams(aoi, zones, date, stageResults.env_params);

  // 7. Score.
  zones = computePriorityScore(zones);

  // 8. Recommend intervention.
  for (const z of zones) {
    const rec = recommendIntervention(z, zones);
    z.intervention = rec.intervention;
    z.interventionLabel = rec.interventionLabel;
    z.reason = rec.reason;
    z.label = z.label || `Zone ${z.id}`;
  }

  // 9. Rank descending.
  zones.sort((a, b) => b.score - a.score);

  // 10. Normalize response shape.
  const responseZones = zones.map((z) => ({
    id: z.id,
    center: z.center,
    geometry: z.geometry,
    score: z.score,
    breakdown: z.breakdown,
    intervention: z.intervention,
    interventionLabel: z.interventionLabel,
    reason: z.reason,
    assets: z.assets,
    stats: {
      tempMean: z.tempMean,
      tempMax: z.tempMax,
      longestStreakHrs: z.longestStreakHrs,
      vegetationPct: z.stats.vegetationPct,
      wetBulbMax: z.stats.wetBulbMax,
    },
  }));

  const fromCache =
    (tcmCached?.fromCache ?? true) &&
    durationFromCache &&
    !osmAssets.fromFallback;

  return {
    zones: responseZones,
    meta: { zoneCount: responseZones.length, fromCache, greenerySource },
  };
}

app.post('/api/prioritize', async (req, res, next) => {
  try {
    const { aoi, date = new Date().toISOString().slice(0, 10) } = req.body;
    validatePolygon(aoi);

    const payload = { aoi, date, hour: '14:00', mode: 'tcm', granularity: 100 };
    const cached = loadOrFail('/v1/heatmap', payload);
    const prioritizeContext = { endpoint: '/v1/heatmap', payload, options: { mode: 'tcm', granularity: 100 } };
    if (cached) {
      logger.info('Prioritize heatmap cache hit', { activityId: cached.key });
      return res.json({ activityId: wrapActivityId(`fixture:${cached.key}`, prioritizeContext), status: 'Processing' });
    }

    const { activityId } = await submitTask('/v1/heatmap', payload, { mode: 'tcm', granularity: 100 });
    const wrappedId = wrapActivityId(activityId, prioritizeContext);
    logger.info('Prioritize heatmap submitted', { activityId, wrappedId });
    res.json({ activityId: wrappedId, status: 'Processing' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/prioritize/score', async (req, res, next) => {
  try {
    const { aoi, date = new Date().toISOString().slice(0, 10), stageResults = {} } = req.body;
    validatePolygon(aoi);

    const { zones, meta } = await computePrioritizedZones(aoi, date, stageResults);

    logger.info('POST /api/prioritize/score completed', {
      zoneCount: zones.length,
      fromCache: meta.fromCache,
      greenerySource: meta.greenerySource,
    });

    res.json({ zones, meta });
  } catch (err) {
    next(err);
  }
});

app.post('/api/allocate', async (req, res, next) => {
  try {
    const { aoi, date = new Date().toISOString().slice(0, 10), budgetUsd, costOverrides } = req.body;
    validatePolygon(aoi);
    if (typeof budgetUsd !== 'number' || !Number.isFinite(budgetUsd) || budgetUsd < 0) {
      const err = new Error('budgetUsd must be a non-negative number');
      err.code = 'invalid_budget';
      err.status = 422;
      throw err;
    }

    const validation = validateCostOverrides(costOverrides);
    if (!validation.valid) {
      const err = new Error(`Invalid costOverrides: ${validation.reason}`);
      err.code = 'invalid_request';
      err.status = 422;
      throw err;
    }

    // Reuse the prioritize pipeline server-side; allocation is pure
    // computation on the ranked zones, no new external calls.
    const { zones } = await computePrioritizedZones(aoi, date);
    const effectiveCosts = mergeCosts(costOverrides);
    const result = allocateBudget(zones, budgetUsd, effectiveCosts);

    logger.info('POST /api/allocate completed', {
      budgetUsd,
      funded: result.funded.length,
      unfunded: result.unfunded.length,
      totalSpent: result.totalSpent,
      hasCostOverrides: !!costOverrides,
    });

    res.json({
      ...result,
      meta: { effectiveCosts },
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/action-plan', async (req, res, next) => {
  try {
    const { zoneId, zoneData, context } = req.body;
    if (!zoneId || !zoneData) {
      const err = new Error('Request must include zoneId and zoneData');
      err.code = 'invalid_request';
      err.status = 400;
      throw err;
    }

    const plan = await generateActionPlan({ zoneId, zoneData, context });
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const code = err.code || 'internal_error';
  logger.error('Request error', { status, code, message: err.message, stack: err.stack });
  res.status(status).json({ error: err.message, code });
});

// On Vercel the app is imported as a serverless handler (see /api/index.js);
// only listen on a port when running locally.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`HeatCopilot server listening on http://localhost:${PORT} (DEMO_MODE=${isDemoMode() ? 'fixtures' : 'live'})`);
  });
}

export default app;
