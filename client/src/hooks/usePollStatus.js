import { useEffect, useRef, useState, useCallback } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3001').replace(/\/+$/, '');

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_INTERVAL_MS = 30000;
const CLIENT_BUDGET_MS = 10 * 60 * 1000;

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

export function usePollStatus({ activityId, endpoint, onCompleted, onFailed }) {
  const [status, setStatus] = useState('Processing');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const runningRef = useRef(false);
  const tickingRef = useRef(false);
  const timeoutRef = useRef(null);
  const startedAtRef = useRef(0);
  const currentIntervalRef = useRef(POLL_INTERVAL_MS);
  const elapsedTimerRef = useRef(null);
  const budgetTimerRef = useRef(null);
  const onCompletedRef = useRef(onCompleted);
  const onFailedRef = useRef(onFailed);

  // Keep callbacks fresh without restarting the poll loop.
  useEffect(() => {
    onCompletedRef.current = onCompleted;
    onFailedRef.current = onFailed;
  });

  const stop = useCallback(() => {
    runningRef.current = false;
    tickingRef.current = false;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    if (budgetTimerRef.current) clearTimeout(budgetTimerRef.current);
    timeoutRef.current = null;
    elapsedTimerRef.current = null;
    budgetTimerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    stop();
    tickingRef.current = false;
    setStatus('Processing');
    setResult(null);
    setError(null);
    setElapsedSeconds(0);
    currentIntervalRef.current = POLL_INTERVAL_MS;
  }, [stop]);

  useEffect(() => {
    // Resetting state when the activity id changes keeps the hook self-contained.
    // eslint-disable-next-line react/set-state-in-effect
    reset();
    if (!activityId) return;

    runningRef.current = true;
    startedAtRef.current = Date.now();

    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - startedAtRef.current) / 1000));
    }, 1000);

    budgetTimerRef.current = setTimeout(() => {
      const err = new Error('Polling exceeded the client-side time budget');
      err.code = 'upstream_timeout';
      setError(err);
      stop();
      onFailedRef.current?.(err);
    }, CLIENT_BUDGET_MS);

    const tick = async () => {
      if (!runningRef.current || tickingRef.current) return;
      tickingRef.current = true;

      try {
        const data = await fetchStatus(activityId, endpoint);
        setStatus(data.status);

        if (data.status === 'Completed') {
          setResult(data.result);
          stop();
          onCompletedRef.current?.(data.result);
          return;
        }

        if (data.status === 'Failed') {
          const err = new Error(data.message || 'Upstream task failed');
          err.code = 'upstream_error';
          setError(err);
          stop();
          onFailedRef.current?.(err);
          return;
        }

        // Back off the poll interval up to a cap while still processing.
        currentIntervalRef.current = Math.min(
          currentIntervalRef.current + POLL_INTERVAL_MS,
          MAX_POLL_INTERVAL_MS
        );

        if (runningRef.current) {
          timeoutRef.current = setTimeout(() => {
            tickingRef.current = false;
            tick();
          }, currentIntervalRef.current);
        }
      } catch (err) {
        setError(err);
        stop();
        onFailedRef.current?.(err);
      }
    };

    // Immediate first poll.
    tick();

    return () => {
      stop();
    };
  }, [activityId, endpoint, reset, stop]);

  return { status, result, error, elapsedSeconds, stop, reset };
}
