/**
 * ResultsPanel component
 *
 * Right-hand ranked list of prioritized zones. Hidden until the first
 * prioritize analysis completes. Clicking a row flies the map to the zone and
 * opens the ZoneCard.
 */

import { useStore } from '../state';
import { scoreColor } from '../colors';
import ZoneCard from './ZoneCard';

function findNearestHotspot(hotspots, lon, lat) {
  if (!hotspots || hotspots.length === 0) return null;
  return hotspots
    .map((h) => ({
      hotspot: h,
      dist: Math.hypot(h.lon - lon, h.lat - lat),
    }))
    .sort((a, b) => a.dist - b.dist)[0].hotspot;
}

export default function ResultsPanel() {
  const map = useStore((s) => s.mapRef);
  const zones = useStore((s) => s.prioritizeZones);
  const hotspots = useStore((s) => s.hotspots);
  const status = useStore((s) => s.prioritizeStatus);
  const error = useStore((s) => s.prioritizeError);
  const show = useStore((s) => s.showResultsPanel);
  const selectedZone = useStore((s) => s.selectedZone);

  const setSelectedZone = useStore((s) => s.setSelectedZone);
  const setSelectedHotspot = useStore((s) => s.setSelectedHotspot);
  const setShowResultsPanel = useStore((s) => s.setShowResultsPanel);

  if (!show) return null;

  function handleSelect(zone) {
    setSelectedZone(zone);

    const nearest = findNearestHotspot(hotspots, zone.center.lon, zone.center.lat);
    if (nearest) {
      setSelectedHotspot(nearest);
      if (map) {
        map.flyTo({ center: [nearest.lon, nearest.lat], zoom: 15, essential: true });
      }
    } else if (map) {
      map.flyTo({ center: [zone.center.lon, zone.center.lat], zoom: 15, essential: true });
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        right: 16,
        width: 340,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 96px)',
        borderRadius: 16,
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid var(--glass-border)',
        padding: 16,
        zIndex: 10,
        overflowY: 'auto',
        boxShadow: 'var(--glass-shadow)',
        color: 'var(--text-h)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-l)',
          }}
        >
          Prioritized Zones
        </div>
        <button
          onClick={() => setShowResultsPanel(false)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-l)',
            fontSize: 18,
            lineHeight: 1,
            cursor: 'pointer',
            borderRadius: 6,
            width: 28,
            height: 28,
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--accent-bg)';
            e.currentTarget.style.color = 'var(--text-h)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-l)';
          }}
          aria-label="Close results"
        >
          ×
        </button>
      </div>

      {status === 'processing' && (
        <div style={{ color: 'var(--text-l)', fontSize: 13, padding: '12px 0' }}>Analyzing zones…</div>
      )}

      {status === 'error' && error && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            fontSize: 13,
          }}
        >
          {error.code === 'cache_miss'
            ? 'No cached fixture for this area. Switch to live mode or use the Phoenix demo area.'
            : error.message}
        </div>
      )}

      {selectedZone && <ZoneCard />}

      <div style={{ marginTop: selectedZone ? 0 : 0 }}>
        {zones.map((zone, idx) => {
          const selected = selectedZone?.id === zone.id;
          const color = scoreColor(zone.score);
          return (
            <div
              key={zone.id}
              onClick={() => handleSelect(zone)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 8px',
                borderRadius: 10,
                cursor: 'pointer',
                background: selected ? 'var(--accent-bg)' : 'transparent',
                borderBottom: '1px solid var(--border)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!selected) e.currentTarget.style.background = 'var(--accent-bg)';
              }}
              onMouseLeave={(e) => {
                if (!selected) e.currentTarget.style.background = 'transparent';
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--track-bg)',
                  color: 'var(--text-l)',
                  fontSize: 12,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {idx + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)' }}>Zone {zone.id}</div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-l)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {zone.interventionLabel}
                </div>
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color,
                  fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0,
                }}
              >
                {zone.score}
              </div>
            </div>
          );
        })}
      </div>

      {zones.length > 0 && status === 'completed' && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-l)' }}>
          {zones.length} zone{zones.length === 1 ? '' : 's'} ranked by priority score.
        </div>
      )}
    </div>
  );
}
