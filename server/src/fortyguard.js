import fetch from 'node-fetch';
import { writeFixture, isDemoMode } from './cache.js';
import { logger } from './logger.js';

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_MS = 10 * 60 * 1000;

function getBaseUrl() {
  return readEnv('FORTYGUARD_BASE_URL', 'https://api.fortyguard.com');
}

function readEnv(key, defaultValue) {
  const raw = process.env[key];
  if (raw == null || raw === '') return defaultValue;
  return raw.trim().replace(/^["']|["']$/g, '');
}

function getApiKey() {
  return readEnv('FORTYGUARD_API_KEY', '');
}

function authHeaders() {
  const key = getApiKey();
  if (!key) {
    const err = new Error('FORTYGUARD_API_KEY not configured');
    err.code = 'not_configured';
    err.status = 500;
    throw err;
  }
  return {
    'Content-Type': 'application/json',
    'api-key': key,
  };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toFeatureCollection(aoi) {
  if (!aoi) return undefined;
  if (aoi.type === 'FeatureCollection') return aoi;
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: aoi,
      },
    ],
  };
}

function buildDateTime(date, hour) {
  if (!date) return undefined;
  return {
    start_date: date,
    start_time: hour || '00:00',
    filter_type: 1,
  };
}

/**
 * Map our internal request shape to the FortyGuard API shape.
 * Endpoint reference: https://docs-api.fortyguard.com/docs/create-heatmap
 */
function toFortyGuardPayload(endpoint, payload, mode, granularity) {
  const { aoi, date, hour, latitude, longitude, temperature, thresholdC, ...rest } = payload;
  const upstream = { ...rest };

  if (endpoint === '/v1/heatmap') {
    if (aoi) upstream.polygon_aoi = toFeatureCollection(aoi);
    upstream.date_time = buildDateTime(date, hour);
    if (mode != null) upstream.mode = mode;
    if (granularity != null) upstream.granularity = granularity;
    if (mode === 'exceedance' || mode === 'persistence') {
      upstream.threshold = thresholdC ?? 38;
      upstream.threshold_direction = 'above';
    }
    return upstream;
  }

  if (endpoint === '/v1/env_params') {
    if (latitude != null) upstream.latitude = latitude;
    if (longitude != null) upstream.longitude = longitude;
    if (temperature != null) upstream.temperature = temperature;
    upstream.date_time = buildDateTime(date, hour);
    return upstream;
  }

  if (endpoint === '/v1/satellite_segmentation') {
    if (latitude != null && longitude != null) {
      upstream.satellite_data = { latitude, longitude };
    }
    upstream.date_time = buildDateTime(date, hour);
    if (granularity != null) upstream.granularity = granularity;
    return upstream;
  }

  // Fallback: best-effort mapping for any other endpoint.
  if (aoi) upstream.polygon_aoi = toFeatureCollection(aoi);
  if (date) upstream.date_time = buildDateTime(date, hour);
  if (mode != null) upstream.mode = mode;
  if (granularity != null) upstream.granularity = granularity;
  return upstream;
}

export async function submitAndPoll(endpoint, payload, { mode, granularity = 100 } = {}) {
  if (isDemoMode()) {
    const err = new Error('DEMO_MODE=fixtures does not call upstream APIs');
    err.code = 'cache_miss';
    err.status = 404;
    throw err;
  }

  const url = `${getBaseUrl()}${endpoint}`;
  const body = toFortyGuardPayload(endpoint, payload, mode, granularity);
  logger.info('FortyGuard submit', { endpoint, bodyKeys: Object.keys(body) });

  const submitRes = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text();
    const err = new Error(`FortyGuard submit failed: ${submitRes.status} ${text}`);
    err.code = 'upstream_error';
    err.status = 502;
    throw err;
  }

  const submitJson = await submitRes.json();
  logger.info('FortyGuard submit response', { endpoint, responseKeys: Object.keys(submitJson) });
  const activityId = submitJson.data?.activity_id || submitJson.activity_id || submitJson.id;
  if (!activityId) {
    const err = new Error('FortyGuard response missing activity_id');
    err.code = 'upstream_error';
    err.status = 502;
    throw err;
  }
  logger.info('FortyGuard polling started', { endpoint, activityId });

  const startedAt = Date.now();
  while (Date.now() - startedAt < MAX_POLL_MS) {
    await sleep(POLL_INTERVAL_MS);
    const statusRes = await fetch(`${getBaseUrl()}/v1/status/${activityId}`, {
      headers: authHeaders(),
    });
    if (!statusRes.ok) {
      const text = await statusRes.text();
      const err = new Error(`FortyGuard status failed: ${statusRes.status} ${text}`);
      err.code = 'upstream_error';
      err.status = 502;
      throw err;
    }
    const statusJson = await statusRes.json();
    const task = statusJson.data || statusJson;
    logger.debug('FortyGuard status poll', { endpoint, activityId, status: task.status || task.state, keys: Object.keys(task) });
    if (task.status === 'Completed' || task.state === 'Completed') {
      const result = task.result || task.data || task;
      logger.info('FortyGuard completed', { endpoint, activityId, resultKeys: Object.keys(result || {}), nestedFeatureCount: result?.features?.length ?? result?.map_data?.features?.length ?? null });
      writeFixture(endpoint, { ...payload, mode, granularity }, result);
      return { activityId, result };
    }
    if (task.status === 'Failed' || task.state === 'Failed') {
      const err = new Error(task.message || 'FortyGuard task failed');
      err.code = 'upstream_error';
      err.status = 502;
      throw err;
    }
  }

  const err = new Error('FortyGuard task polling exceeded time budget');
  err.code = 'upstream_timeout';
  err.status = 504;
  throw err;
}
