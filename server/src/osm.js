/**
 * OpenStreetMap asset fetcher
 *
 * Queries Overpass API for public-exposure assets inside an AOI, then returns
 * the raw points so the prioritize pipeline can count them per zone.
 *
 * Assets:
 *   - highway=bus_stop
 *   - amenity=school
 *   - leisure=park
 *
 * If Overpass fails or DEMO_MODE is active, a deterministic fallback is used
 * so the demo path remains stable and offline-capable.
 */

import fetch from 'node-fetch';

function isDemoMode() {
  return process.env.DEMO_MODE === 'fixtures';
}

function pointInPolygon(point, polygon) {
  const [lon, lat] = point;
  const ring = polygon.coordinates[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function bbox(aoi) {
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
  return { minLon, maxLon, minLat, maxLat };
}

function buildOverpassQuery(aoi) {
  const { minLon, minLat, maxLon, maxLat } = bbox(aoi);
  const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;
  return `
    [out:json][timeout:15];
    (
      node["highway"="bus_stop"](${bboxStr});
      node["amenity"="school"](${bboxStr});
      node["leisure"="park"](${bboxStr});
    );
    out body;
  `;
}

function parseOsmResponse(json) {
  const busStops = [];
  const schools = [];
  const parks = [];

  for (const element of json.elements || []) {
    if (element.type !== 'node' || element.lat == null || element.lon == null) continue;
    const pt = { lat: element.lat, lon: element.lon };
    const tags = element.tags || {};
    if (tags.highway === 'bus_stop') busStops.push(pt);
    else if (tags.amenity === 'school') schools.push(pt);
    else if (tags.leisure === 'park') parks.push(pt);
  }

  return { busStops, schools, parks };
}

function simpleHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

function lcgSequence(seedStr, count) {
  // Simple deterministic LCG returning count floats in [0, 1).
  let seed = simpleHash(seedStr) * 2147483647;
  const out = [];
  for (let i = 0; i < count; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    out.push(seed / 2147483648);
  }
  return out;
}

/**
 * Deterministic fallback asset counts for fixture/offline mode.
 * Produces stable, plausible counts keyed to the AOI centroid.
 */
function deterministicFallbackAssets(aoi) {
  const ring = aoi.coordinates[0];
  const minLon = Math.min(...ring.map((p) => p[0]));
  const maxLon = Math.max(...ring.map((p) => p[0]));
  const minLat = Math.min(...ring.map((p) => p[1]));
  const maxLat = Math.max(...ring.map((p) => p[1]));

  const seed = `${((minLon + maxLon) / 2).toFixed(6)}_${((minLat + maxLat) / 2).toFixed(6)}`;
  const h = simpleHash(seed);

  // Roughly 3-8 bus stops, 0-2 schools, 0-1 parks per 1 km² buffer
  const areaDeg = (maxLon - minLon) * (maxLat - minLat);
  const areaFactor = Math.max(0.5, areaDeg / 0.0002); // ~1 km² ≈ 0.0002 deg²

  const busCount = Math.floor(3 + h * 6 * areaFactor);
  const schoolCount = Math.floor((h * 3) % 3);
  const parkCount = h > 0.6 ? 1 : 0;

  function pointsFor(type, count) {
    const values = lcgSequence(`${seed}_${type}`, count * 2);
    return Array.from({ length: count }, (_, i) => ({
      lat: minLat + values[i * 2] * (maxLat - minLat),
      lon: minLon + values[i * 2 + 1] * (maxLon - minLon),
      fallback: true,
    }));
  }

  const busStops = pointsFor('bus', busCount);
  const schools = pointsFor('school', schoolCount);
  const parks = pointsFor('park', parkCount);

  return { busStops, schools, parks, fromFallback: true };
}

export function countAssetsInZone(assets, zoneGeometry) {
  return {
    busStops: assets.busStops.filter((p) => pointInPolygon([p.lon, p.lat], zoneGeometry)).length,
    schools: assets.schools.filter((p) => pointInPolygon([p.lon, p.lat], zoneGeometry)).length,
    parks: assets.parks.filter((p) => pointInPolygon([p.lon, p.lat], zoneGeometry)).length,
  };
}

/**
 * Fetch OSM assets inside the AOI.
 * Returns { busStops, schools, parks, fromFallback }.
 */
export async function fetchOsmAssets(aoi) {
  if (isDemoMode()) {
    return { ...deterministicFallbackAssets(aoi), fromFallback: true };
  }

  try {
    const query = buildOverpassQuery(aoi);
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    const json = await res.json();
    const parsed = parseOsmResponse(json);
    return { ...parsed, fromFallback: false };
  } catch (err) {
    console.error('OSM fetch failed, using fallback:', err.message);
    return { ...deterministicFallbackAssets(aoi), fromFallback: true };
  }
}
