/**
 * API client
 *
 * Thin wrapper around the HeatCopilot backend and Nominatim. All FortyGuard
 * calls go through the backend so API keys stay server-side.
 */

// Backend base URL. Defaults to the local dev server; set VITE_API_BASE on the
// deployed frontend (e.g. https://your-backend.vercel.app).
const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3001').replace(/\/+$/, '');

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed: ${res.status}`);
    err.code = data.code || 'unknown';
    throw err;
  }
  return data;
}

export async function findHotspots(aoi, { date, hour } = {}) {
  return post('/api/hotspots', {
    aoi,
    date: date || '2026-07-15',
    hour: hour || '14:00',
  });
}

export async function fetchDuration(aoi, { date, thresholdC } = {}) {
  return post('/api/duration', {
    aoi,
    date: date || '2026-07-15',
    thresholdC: thresholdC ?? 38,
  });
}

export async function prioritizeZones(aoi, { date } = {}) {
  return post('/api/prioritize', {
    aoi,
    date: date || '2026-07-15',
  });
}

export async function allocateBudget(aoi, { date, budgetUsd, costOverrides } = {}) {
  return post('/api/allocate', {
    aoi,
    date: date || '2026-07-15',
    budgetUsd,
    costOverrides,
  });
}

export async function generateActionPlan(zoneId, zoneData, context) {
  return post('/api/action-plan', { zoneId, zoneData, context });
}

export async function searchNominatim(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=us&limit=5`;
  const res = await fetch(url, { headers: { 'User-Agent': 'HeatCopilot/1.0' } });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=14&addressdetails=0`;
  const res = await fetch(url, { headers: { 'User-Agent': 'HeatCopilot/1.0' } });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.display_name || null;
}
