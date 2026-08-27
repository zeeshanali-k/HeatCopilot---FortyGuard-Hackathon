/**
 * CompareView component
 *
 * Bottom sheet that appears when two or more history entries are selected.
 * Shows a side-by-side comparison table with palette-colored columns.
 */

import { useEffect, useRef, useState } from 'react';
import { useStore, HISTORY_PALETTE } from '../state';
import { scoreColor } from '../colors';

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function topZone(zones) {
  if (!zones || zones.length === 0) return null;
  return zones.reduce((best, z) => (z.score > best.score ? z : best), zones[0]);
}

function totalAssets(zones) {
  return zones.reduce(
    (sum, z) => ({
      busStops: sum.busStops + (z.assets?.busStops || 0),
      schools: sum.schools + (z.assets?.schools || 0),
      parks: sum.parks + (z.assets?.parks || 0),
    }),
    { busStops: 0, schools: 0, parks: 0 }
  );
}

const ROWS = [
  { key: 'score', label: 'Top score', format: (z) => z?.score ?? '—', color: (z) => scoreColor(z?.score ?? 0) },
  { key: 'heat', label: 'Heat intensity', format: (z) => Math.round(z?.breakdown?.heat ?? 0) },
  { key: 'duration', label: 'Heat duration', format: (z) => Math.round(z?.breakdown?.duration ?? 0) },
  { key: 'exposure', label: 'Public exposure', format: (z) => Math.round(z?.breakdown?.exposure ?? 0) },
  { key: 'greenery', label: 'Greenery deficit', format: (z) => Math.round(z?.breakdown?.greenery ?? 0) },
  {
    key: 'intervention',
    label: 'Top intervention',
    format: (z) => z?.interventionLabel || '—',
    fullWidth: true,
  },
  {
    key: 'assets',
    label: 'Assets',
    format: (z, entry) => {
      const totals = totalAssets(entry.zones);
      const parts = [];
      if (totals.busStops) parts.push(`${totals.busStops} bus`);
      if (totals.schools) parts.push(`${totals.schools} school`);
      if (totals.parks) parts.push(`${totals.parks} park`);
      return parts.length ? parts.join(' · ') : '—';
    },
    fullWidth: true,
  },
];

export default function CompareView() {
  const history = useStore((s) => s.history);
  const selectedIds = useStore((s) => s.selectedHistoryIds);
  const clearHistorySelection = useStore((s) => s.clearHistorySelection);

  const sheetRef = useRef(null);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartYRef = useRef(0);

  const selected = selectedIds
    .map((id) => history.find((h) => h.id === id))
    .filter(Boolean);

  useEffect(() => {
    if (selected.length < 2) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') clearHistorySelection();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected.length, clearHistorySelection]);

  function onTouchStart(e) {
    dragStartYRef.current = e.touches[0].clientY;
    setIsDragging(true);
  }

  function onTouchMove(e) {
    if (!isDragging) return;
    const y = e.touches[0].clientY;
    const delta = Math.max(0, y - dragStartYRef.current);
    setTranslateY(delta);
  }

  function onTouchEnd() {
    setIsDragging(false);
    if (translateY > 80) {
      clearHistorySelection();
    } else {
      setTranslateY(0);
    }
  }

  if (selected.length < 2) return null;

  return (
    <div
      ref={sheetRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        position: 'fixed',
        left: 296,
        right: 16,
        bottom: 16,
        height: '50vh',
        maxHeight: 500,
        minHeight: 220,
        borderRadius: 16,
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid var(--glass-border)',
        boxShadow: 'var(--glass-shadow)',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transform: `translateY(${translateY}px)`,
        transition: isDragging ? 'none' : 'transform 0.3s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 4,
              borderRadius: 2,
              background: 'var(--border-strong)',
            }}
          />
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-l)',
            }}
          >
            Compare analyses
          </div>
        </div>
        <button
          onClick={clearHistorySelection}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-l)',
            fontSize: 20,
            lineHeight: 1,
            cursor: 'pointer',
            borderRadius: 6,
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Close comparison"
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${selected.length}, minmax(140px, 1fr))`, gap: 0 }}>
          {/* Header row */}
          <div style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }} />
          {selected.map((entry, idx) => {
            const color = HISTORY_PALETTE[idx % HISTORY_PALETTE.length];
            return (
              <div
                key={entry.id}
                style={{
                  padding: '10px 8px',
                  borderBottom: `2px solid ${color}`,
                  animation: `compareFadeIn 0.3s ease ${idx * 60}ms both`,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {entry.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-l)', marginTop: 2 }}>{formatDate(entry.createdAt)}</div>
              </div>
            );
          })}

          {/* Data rows */}
          {ROWS.map((row) => (
            <>
              <div
                key={`label-${row.key}`}
                style={{
                  padding: '10px 8px',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 12,
                  color: 'var(--text-l)',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {row.label}
              </div>
              {selected.map((entry, idx) => {
                const top = topZone(entry.zones);
                const value = row.format(top, entry);
                const color = row.color?.(top);
                return (
                  <div
                    key={`${entry.id}-${row.key}`}
                    style={{
                      padding: '10px 8px',
                      borderBottom: '1px solid var(--border)',
                      fontSize: 12,
                      color: color || 'var(--text-h)',
                      fontWeight: row.key === 'score' ? 700 : 400,
                      animation: `compareFadeIn 0.3s ease ${idx * 60}ms both`,
                      whiteSpace: row.fullWidth ? 'normal' : 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {value}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}
