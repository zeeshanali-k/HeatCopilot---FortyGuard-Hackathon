/**
 * FeaturePanel component
 *
 * Left floating panel that drives the analysis pipeline. Provides the primary
 * "Find Hotspots" action and the secondary "Heat Duration" action, including
 * a configurable temperature threshold and a layer visibility toggle. Also
 * displays progress, errors, and summary counts.
 */

import { useEffect, useRef } from 'react';
import { useStore } from '../state';
import { findHotspots, fetchDuration } from '../api';

const DEMO_DATE = '2026-07-15';
const DEMO_HOUR = '14:00';

const steps = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'processing', label: 'Processing' },
  { key: 'completed', label: 'Completed' },
];

export default function FeaturePanel() {
  const aoi = useStore((s) => s.aoi);
  const analysisStatus = useStore((s) => s.analysisStatus);
  const analysisError = useStore((s) => s.analysisError);
  const analysisElapsed = useStore((s) => s.analysisElapsed);
  const hotspots = useStore((s) => s.hotspots);

  const durationStatus = useStore((s) => s.durationStatus);
  const durationError = useStore((s) => s.durationError);
  const durationZones = useStore((s) => s.durationZones);
  const durationThresholdC = useStore((s) => s.durationThresholdC);
  const showDurationLayer = useStore((s) => s.showDurationLayer);

  const setAnalysisStatus = useStore((s) => s.setAnalysisStatus);
  const setAnalysisError = useStore((s) => s.setAnalysisError);
  const setAnalysisElapsed = useStore((s) => s.setAnalysisElapsed);
  const setHotspots = useStore((s) => s.setHotspots);
  const setHeatTiles = useStore((s) => s.setHeatTiles);
  const setSelectedHotspot = useStore((s) => s.setSelectedHotspot);

  const setDurationStatus = useStore((s) => s.setDurationStatus);
  const setDurationError = useStore((s) => s.setDurationError);
  const setDurationZones = useStore((s) => s.setDurationZones);
  const setDurationTiles = useStore((s) => s.setDurationTiles);
  const setDurationThresholdC = useStore((s) => s.setDurationThresholdC);
  const setShowDurationLayer = useStore((s) => s.setShowDurationLayer);

  const timerRef = useRef(null);
  const startRef = useRef(0);

  useEffect(() => {
    if (analysisStatus === 'submitted' || analysisStatus === 'processing') {
      startRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setAnalysisElapsed(Math.round((Date.now() - startRef.current) / 1000));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [analysisStatus, setAnalysisElapsed]);

  async function handleFindHotspots() {
    if (!aoi) return;
    setAnalysisStatus('submitted');
    setAnalysisError(null);
    setAnalysisElapsed(0);
    setSelectedHotspot(null);

    try {
      setAnalysisStatus('processing');
      const data = await findHotspots(aoi, { date: DEMO_DATE, hour: DEMO_HOUR });
      setHotspots(data.markers);
      setHeatTiles(data.heatTiles);
      setAnalysisStatus('completed');
    } catch (err) {
      console.error(err);
      setAnalysisError(err);
      setAnalysisStatus('error');
    }
  }

  async function handleHeatDuration() {
    if (!aoi) return;
    setDurationStatus('submitted');
    setDurationError(null);
    setSelectedHotspot(null);

    try {
      setDurationStatus('processing');
      const data = await fetchDuration(aoi, { date: DEMO_DATE, thresholdC: durationThresholdC });
      setDurationZones(data.zones);
      setDurationTiles(data.heatTiles);
      setShowDurationLayer(true);
      setDurationStatus('completed');
    } catch (err) {
      console.error(err);
      setDurationError(err);
      setDurationStatus('error');
    }
  }

  const activeStepIndex = steps.findIndex((s) => s.key === analysisStatus);
  const canRun = aoi && (analysisStatus === 'idle' || analysisStatus === 'completed' || analysisStatus === 'error');
  const canRunDuration = aoi && hotspots.length > 0 && (durationStatus === 'idle' || durationStatus === 'completed' || durationStatus === 'error');
  const durationBusy = durationStatus === 'submitted' || durationStatus === 'processing';

  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        left: 16,
        width: 280,
        borderRadius: 16,
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid var(--glass-border)',
        padding: 16,
        zIndex: 10,
        boxShadow: 'var(--glass-shadow)',
        color: 'var(--text-h)',
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-l)',
          marginBottom: 12,
        }}
      >
        Features
      </div>

      <button
        onClick={handleFindHotspots}
        disabled={!canRun}
        title={!aoi ? 'Pan the map to define an area first' : 'Run heatmap analysis'}
        style={{
          width: '100%',
          height: 44,
          borderRadius: 10,
          border: 'none',
          background: canRun ? 'var(--accent)' : 'var(--accent-bg)',
          color: '#fff',
          fontWeight: 600,
          fontSize: 14,
          cursor: canRun ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: canRun ? 1 : 0.6,
          transition: 'filter 0.15s, transform 0.1s',
        }}
        onMouseEnter={(e) => canRun && (e.currentTarget.style.filter = 'brightness(1.08)')}
        onMouseLeave={(e) => canRun && (e.currentTarget.style.filter = 'brightness(1)')}
        onMouseDown={(e) => canRun && (e.currentTarget.style.transform = 'scale(0.98)')}
        onMouseUp={(e) => canRun && (e.currentTarget.style.transform = 'scale(1)')}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        Find Hotspots
      </button>

      <div style={{ marginTop: 12 }}>
        <button
          onClick={handleHeatDuration}
          disabled={!canRunDuration || durationBusy}
          title={hotspots.length === 0 ? 'Run Find Hotspots first' : 'Analyze heat duration and peak hours'}
          style={{
            width: '100%',
            height: 44,
            borderRadius: 10,
            border: '1px solid var(--glass-border)',
            background: canRunDuration && !durationBusy ? 'var(--accent-bg)' : 'rgba(var(--accent-rgb), 0.06)',
            color: canRunDuration && !durationBusy ? 'var(--text-h)' : 'var(--text-l)',
            fontWeight: 600,
            fontSize: 14,
            cursor: canRunDuration && !durationBusy ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => canRunDuration && !durationBusy && (e.currentTarget.style.background = 'var(--accent-bg-strong)')}
          onMouseLeave={(e) => canRunDuration && !durationBusy && (e.currentTarget.style.background = 'var(--accent-bg)')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Heat Duration
        </button>

        {hotspots.length > 0 && (
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <label style={{ color: 'var(--text-l)', fontSize: 12, flexShrink: 0 }}>Threshold</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min={30}
                max={50}
                value={durationThresholdC}
                onChange={(e) => setDurationThresholdC(Number(e.target.value))}
                disabled={durationBusy}
                style={{
                  width: 56,
                  height: 28,
                  borderRadius: 8,
                  border: '1px solid var(--glass-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--text-h)',
                  fontSize: 13,
                  textAlign: 'center',
                }}
              />
              <span style={{ color: 'var(--text-l)', fontSize: 12 }}>°C</span>
            </div>
          </div>
        )}

        {durationZones.length > 0 && durationStatus === 'completed' && (
          <label
            style={{
              marginTop: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--text-m)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={showDurationLayer}
              onChange={(e) => setShowDurationLayer(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Show duration layer
          </label>
        )}
      </div>

      {analysisStatus !== 'idle' && (
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-l)',
              marginBottom: 10,
            }}
          >
            Progress
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {steps.map((step, idx) => {
              const isActive = idx === activeStepIndex;
              const isDone = idx < activeStepIndex || analysisStatus === 'completed';
              return (
                <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: isDone || isActive ? 'var(--accent)' : 'var(--track-bg)',
                      boxShadow: isActive ? '0 0 0 4px var(--accent-bg)' : 'none',
                    }}
                  />
                  <div style={{ flex: 1, color: isActive || isDone ? 'var(--text-h)' : 'var(--text-l)', fontSize: 13 }}>
                    {step.label}
                  </div>
                  {isActive && (
                    <div style={{ color: 'var(--text-l)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                      {analysisElapsed}s
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {analysisStatus === 'error' && analysisError && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            fontSize: 13,
          }}
        >
          {analysisError.code === 'cache_miss'
            ? 'No cached fixture for this area. Switch to live mode or use the Phoenix demo area.'
            : analysisError.message}
        </div>
      )}

      {durationStatus === 'error' && durationError && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            fontSize: 13,
          }}
        >
          {durationError.code === 'cache_miss'
            ? 'No cached duration fixture for this area. Switch to live mode or use the Phoenix demo area.'
            : durationError.message}
        </div>
      )}

      {hotspots.length > 0 && analysisStatus === 'completed' && (
        <div style={{ marginTop: 16, color: 'var(--text-l)', fontSize: 12 }}>
          Found {hotspots.length} hotspot{hotspots.length === 1 ? '' : 's'}.
          {durationZones.length > 0 && durationStatus === 'completed' && (
            <div style={{ marginTop: 4 }}>
              Duration analysis returned {durationZones.length} zone{durationZones.length === 1 ? '' : 's'} (≥ {durationThresholdC}°C).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
