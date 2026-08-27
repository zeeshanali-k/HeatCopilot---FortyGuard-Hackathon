/**
 * API client
 *
 * Thin wrapper around the HeatCopilot backend and Nominatim. All FortyGuard
 * calls go through the backend so API keys stay server-side.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

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

export async function allocateBudget(aoi, { date, budgetUsd } = {}) {
  return post('/api/allocate', {
    aoi,
    date: date || '2026-07-15',
    budgetUsd,
  });
}

export async function generateActionPlan(zoneId, zoneData) {
  return post('/api/action-plan', { zoneId, zoneData });
}

export async function searchNominatim(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=us&limit=5`;
  const res = await fetch(url, { headers: { 'User-Agent': 'HeatCopilot/1.0' } });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}
