import { useState, useCallback, useRef } from 'react';
import { submitPrioritizeStage, submitGenericTask, scorePrioritizedZones } from '../api';

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_INTERVAL_MS = 30000;
const CLIENT_BUDGET_MS = 10 * 60 * 1000;

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3001').replace(/\/+$/, '');

async function fetchStatus(activityId, endpoint) {
  const url = new URL(`${API_BASE}/api/status/${encodeURIComponent(activityId)}`);
  if (endpoint) url.searchParams.set('endpoint', endpoint);
  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Status request failed: ${res.status}`);
    err.code = data.code || 'unknown';
    throw err;
  }
  return data;
}

async function pollToCompletion(activityId, endpoint, { onStatus, shouldStop }) {
  const startedAt = Date.now();
  let interval = POLL_INTERVAL_MS;

  while (Date.now() - startedAt < CLIENT_BUDGET_MS) {
    if (shouldStop && shouldStop()) {
      const err = new Error('Polling cancelled');
      err.code = 'cancelled';
      throw err;
    }

    const data = await fetchStatus(activityId, endpoint);
    onStatus?.(data.status);

    if (data.status === 'Completed') {
      return data.result;
    }
    if (data.status === 'Failed') {
      const err = new Error(data.message || 'Upstream task failed');
      err.code = 'upstream_error';
      throw err;
    }

    interval = Math.min(interval + POLL_INTERVAL_MS, MAX_POLL_INTERVAL_MS);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  const err = new Error('Polling exceeded the client-side time budget');
  err.code = 'upstream_timeout';
  throw err;
}

function polygonCentroid(polygon) {
  if (!polygon || polygon.type !== 'Polygon') return [0, 0];
  const ring = polygon.coordinates[0];
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

function heatmapMaxTemperature(heatmapResult) {
  const tiles = heatmapResult?.heatTiles || heatmapResult;
  if (!tiles?.features) return null;
  let max = -Infinity;
  for (const f of tiles.features) {
    const temp = f.properties?.temperature ?? f.properties?.max_temperature ?? f.properties?.average_temperature ?? 0;
    if (temp > max) max = temp;
  }
  return Number.isFinite(max) ? max : null;
}

export function usePrioritizePipeline({ onCompleted, onFailed, onStage } = {}) {
  const [status, setStatus] = useState('idle');
  const [stage, setStage] = useState(null);
  const [error, setError] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const runningRef = useRef(false);
  const elapsedTimerRef = useRef(null);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = null;
  }, []);

  const run = useCallback(async (aoi, date = '2026-07-15') => {
    runningRef.current = true;
    setStatus('processing');
    setStage('heatmap');
    onStage?.('heatmap');
    setError(null);
    setElapsedSeconds(0);

    const startedAt = Date.now();
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - startedAt) / 1000));
    }, 1000);

    try {
      // Stage 1: heatmap
      const { activityId: heatmapActivityId } = await submitPrioritizeStage(aoi, { date });
      const heatmapResult = await pollToCompletion(heatmapActivityId, null, {
        onStatus: (s) => {
          const stageName = s === 'Completed' ? 'heatmap' : 'heatmap';
          setStage(stageName);
          onStage?.(stageName);
        },
        shouldStop: () => !runningRef.current,
      });

      // Stage 2: environment params (best-effort; falls back in score route).
      const [lon, lat] = polygonCentroid(aoi);
      const representativeTemp = heatmapMaxTemperature(heatmapResult) || 40;

      setStage('environment');
      onStage?.('environment');
      const envPromise = submitGenericTask('/v1/env_params', {
        aoi,
        date,
        latitude: lat,
        longitude: lon,
        temperature: representativeTemp,
      }).then(({ activityId }) => pollToCompletion(activityId, null, {
        onStatus: () => {
          setStage('environment');
          onStage?.('environment');
        },
        shouldStop: () => !runningRef.current,
      }));

      setStage('segmentation');
      onStage?.('segmentation');
      const segPromise = submitGenericTask('/v1/satellite_segmentation', {
        aoi,
        date,
        latitude: lat,
        longitude: lon,
      }).then(({ activityId }) => pollToCompletion(activityId, null, {
        onStatus: () => {
          setStage('segmentation');
          onStage?.('segmentation');
        },
        shouldStop: () => !runningRef.current,
      }));

      const [envResult, segResult] = await Promise.all([envPromise, segPromise]);

      // Stage 3: scoring
      setStage('scoring');
      onStage?.('scoring');
      const { zones, meta } = await scorePrioritizedZones(aoi, date, {
        heatmap: heatmapResult,
        env_params: envResult,
        segmentation: segResult,
      });

      stop();
      setStatus('completed');
      onCompleted?.({ zones, meta });
      return { zones, meta };
    } catch (err) {
      stop();
      setError(err);
      setStatus('error');
      onFailed?.(err);
      throw err;
    }
  }, [onCompleted, onFailed, onStage, stop]);

  return { status, stage, error, elapsedSeconds, run, stop };
}
