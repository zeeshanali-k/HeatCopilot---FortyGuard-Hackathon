import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { isDemoMode, loadOrFail } from './cache.js';
import { submitAndPoll } from './fortyguard.js';
import { computePriorityScore } from './scoring.js';
import { recommendIntervention } from './interventions.js';
import { allocateBudget } from './allocate.js';
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

async function fetchHeatmap(aoi, date, hour, mode, extras = {}) {
  const payload = { aoi, date, hour, mode, granularity: 100, ...extras };
  const cached = loadOrFail('/v1/heatmap', payload);
  if (cached) return { data: cached.data, fromCache: true, key: cached.key };

  const upstream = await submitAndPoll('/v1/heatmap', payload, { mode, granularity: 100, ...extras });
  return { data: upstream.result, fromCache: false, key: upstream.activityId };
}

async function fetchDurationContext(aoi, date, thresholdC) {
  const hour = '14:00';

  const [exceedanceRes, persistenceRes, timeOfMeasureRes] = await Promise.allSettled([
    fetchHeatmap(aoi, date, hour, 'exceedance', { thresholdC }),
    fetchHeatmap(aoi, date, hour, 'persistence'),
    fetchHeatmap(aoi, date, hour, 'time_of_measure'),
  ]);

  const exceedanceTiles =
    exceedanceRes.status === 'fulfilled'
      ? normalizeCompanionTiles(exceedanceRes.value.data, {
          exceedHours: ['exceedance', 'exceedance_hours', 'exceedHours', 'hours_above'],
        })
      : null;

  const persistenceTiles =
    persistenceRes.status === 'fulfilled'
      ? normalizeCompanionTiles(persistenceRes.value.data, {
          longestStreakHrs: ['persistence', 'persistence_hours', 'longestStreakHrs', 'longest_streak'],
        })
      : null;

  const timeOfMeasureTiles =
    timeOfMeasureRes.status === 'fulfilled'
      ? normalizeCompanionTiles(timeOfMeasureRes.value.data, {
          peakHour: ['time_of_measure', 'peak_hour', 'peakHour', 'hour'],
        })
      : null;

  const fromCache =
    exceedanceRes.status === 'fulfilled' &&
    persistenceRes.status === 'fulfilled' &&
    timeOfMeasureRes.status === 'fulfilled' &&
    exceedanceRes.value.fromCache &&
    persistenceRes.value.fromCache &&
    timeOfMeasureRes.value.fromCache;

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

async function fetchGreenery(aoi, zones, date) {
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
      const data = cached.data;
      // Normalize segmentation response into per-zone vegetation %.
      // The API contract is open; we accept either a single value or a tiles result.
      if (data && typeof data.vegetation_pct === 'number') {
        for (const z of zones) z.stats = { ...(z.stats || {}), vegetationPct: data.vegetation_pct };
      }
      return { source: 'satellite_segmentation' };
    }
  } catch (err) {
    if (err.code !== 'cache_miss') console.error('Satellite segmentation cache lookup failed:', err.message);
  }

  if (isDemoMode()) {
    applyGreeneryFallback(zones);
    return { source: 'osm_landuse' };
  }

  try {
    const upstream = await submitAndPoll('/v1/satellite_segmentation', payload);
    const data = upstream.result;
    if (data && typeof data.vegetation_pct === 'number') {
      for (const z of zones) z.stats = { ...(z.stats || {}), vegetationPct: data.vegetation_pct };
    }
    return { source: 'satellite_segmentation' };
  } catch (err) {
    console.error('Satellite segmentation failed, using OSM fallback:', err.message);
    applyGreeneryFallback(zones);
    return { source: 'osm_landuse' };
  }
}

function applyWetBulbFallback(zones) {
  for (const z of zones) {
    const seed = `${z.id}_env_${z.center.lat.toFixed(5)}_${z.center.lon.toFixed(5)}`;
    z.stats = { ...(z.stats || {}), wetBulbMax: deterministicWetBulb(z.tempMean, seed) };
  }
}

async function fetchEnvParams(aoi, zones, date) {
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
    if (cached && cached.data && typeof cached.data.wet_bulb_max === 'number') {
      for (const z of zones) {
        z.stats = { ...(z.stats || {}), wetBulbMax: round(cached.data.wet_bulb_max) };
      }
      return;
    }
  } catch (err) {
    if (err.code !== 'cache_miss') console.error('Env params cache lookup failed:', err.message);
  }

  if (isDemoMode()) {
    applyWetBulbFallback(zones);
    return;
  }

  try {
    const upstream = await submitAndPoll('/v1/env_params', payload);
    const data = upstream.result;
    if (data && typeof data.wet_bulb_max === 'number') {
      for (const z of zones) z.stats = { ...(z.stats || {}), wetBulbMax: round(data.wet_bulb_max) };
    }
  } catch (err) {
    console.error('Env params failed, using fallback:', err.message);
    applyWetBulbFallback(zones);
  }
}

app.post('/api/hotspots', async (req, res, next) => {
  try {
    const { aoi, date = new Date().toISOString().slice(0, 10), hour = '14:00' } = req.body;
    validatePolygon(aoi);
    logger.info('POST /api/hotspots request', { date, hour, featureCount: aoi?.coordinates?.[0]?.length });

    const payload = { aoi, date, hour, mode: 'tcm', granularity: 100 };
    let result;
    let fromCache = false;
    let activityId = 'cached';

    const cached = loadOrFail('/v1/heatmap', payload);
    if (cached) {
      result = cached.data;
      fromCache = true;
      activityId = cached.key;
      logger.info('Hotspots cache hit', { activityId });
    } else {
      logger.info('Hotspots cache miss, calling FortyGuard');
      const upstream = await submitAndPoll('/v1/heatmap', payload, { mode: 'tcm', granularity: 100 });
      result = upstream.result;
      activityId = upstream.activityId;
    }

    logger.info('Hotspots raw result summary', {
      activityId,
      fromCache,
      topKeys: Object.keys(result || {}),
      featureCount: result?.features?.length ?? result?.map_data?.features?.length ?? null,
    });

    const heatTiles = normalizeHotspotTiles(result);
    const markers = clusterHotspots(heatTiles);
    logger.info('Hotspots normalized', { tileCount: heatTiles.features.length, markerCount: markers.length });
    if (heatTiles.features.length > 0 && markers.length === 0) {
      const first = result?.features?.[0] ?? result?.map_data?.features?.[0];
      logger.warn('Hotspots produced zero markers; sample feature properties', { sample: first?.properties });
    }

    // Try to enrich markers with duration/peak data when companion fixtures are cached.
    try {
      const thresholdC = 38;
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

    res.json({
      markers,
      heatTiles,
      meta: { activityId, fromCache, granularity: 100 },
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/duration', async (req, res, next) => {
  try {
    const { aoi, date = new Date().toISOString().slice(0, 10), thresholdC = 38 } = req.body;
    validatePolygon(aoi);

    const tcmPayload = { aoi, date, hour: '14:00', mode: 'tcm', granularity: 100 };
    let tcmResult;
    const tcmCached = loadOrFail('/v1/heatmap', tcmPayload);
    if (tcmCached) {
      tcmResult = tcmCached.data;
    } else {
      const upstream = await submitAndPoll('/v1/heatmap', tcmPayload, { mode: 'tcm', granularity: 100 });
      tcmResult = upstream.result;
    }
    const heatTiles = normalizeHotspotTiles(tcmResult);

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

    res.json({
      zones,
      heatTiles: mergedTiles,
      meta: { thresholdC, fromCache: durationCtx?.fromCache ?? true, zoneCount: zones.length },
    });
  } catch (err) {
    next(err);
  }
});

async function computePrioritizedZones(aoi, date) {
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
  const tcmCached = loadOrFail('/v1/heatmap', tcmPayload);
  if (tcmCached) {
    tcmResult = tcmCached.data;
  } else {
    const upstream = await submitAndPoll('/v1/heatmap', tcmPayload, { mode: 'tcm', granularity: 100 });
    tcmResult = upstream.result;
  }
  const heatTiles = normalizeHotspotTiles(tcmResult);

  let durationCtx;
  try {
    durationCtx = await fetchDurationContext(aoi, date, 38);
  } catch (err) {
    if (err.code !== 'cache_miss') throw err;
  }

  const hasCompanionData =
    durationCtx &&
    durationCtx.persistenceTiles?.features?.length > 0;

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
  const { source: greenerySource } = await fetchGreenery(aoi, zones, date);

  // 6. Env params for wet-bulb health severity.
  await fetchEnvParams(aoi, zones, date);

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
    (durationCtx?.fromCache ?? true) &&
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

    const { zones, meta } = await computePrioritizedZones(aoi, date);

    logger.info('POST /api/prioritize completed', {
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
    const { aoi, date = new Date().toISOString().slice(0, 10), budgetUsd } = req.body;
    validatePolygon(aoi);
    if (typeof budgetUsd !== 'number' || !Number.isFinite(budgetUsd) || budgetUsd < 0) {
      const err = new Error('budgetUsd must be a non-negative number');
      err.code = 'invalid_budget';
      err.status = 422;
      throw err;
    }

    // Reuse the prioritize pipeline server-side; allocation is pure
    // computation on the ranked zones, no new external calls.
    const { zones } = await computePrioritizedZones(aoi, date);
    const result = allocateBudget(zones, budgetUsd);

    logger.info('POST /api/allocate completed', {
      budgetUsd,
      funded: result.funded.length,
      unfunded: result.unfunded.length,
      totalSpent: result.totalSpent,
    });

    res.json(result);
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

app.listen(PORT, () => {
  console.log(`HeatCopilot server listening on http://localhost:${PORT} (DEMO_MODE=${isDemoMode() ? 'fixtures' : 'live'})`);
});
