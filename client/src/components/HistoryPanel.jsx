/**
 * HistoryPanel component
 *
 * List of saved Prioritize Zones runs. Supports loading an entry back into the
 * live state, multi-selecting entries for comparison, rerunning an analysis,
 * and deleting entries.
 */

import { useState } from 'react';
import { useStore, HISTORY_PALETTE } from '../state';
import { prioritizeZones } from '../api';
import { scoreColor } from '../colors';

const steps = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'processing', label: 'Processing' },
  { key: 'completed', label: 'Completed' },
];

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function topScore(zones) {
  if (!zones || zones.length === 0) return 0;
  return Math.max(...zones.map((z) => z.score));
}

function Checkbox({ checked, onChange, disabled }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      style={{ cursor: disabled ? 'not-allowed' : 'pointer', width: 16, height: 16, accentColor: 'var(--accent)' }}
    />
  );
}

export default function HistoryPanel() {
  const history = useStore((s) => s.history);
  const selectedIds = useStore((s) => s.selectedHistoryIds);
  const activeId = useStore((s) => s.activeHistoryId);

  const loadHistoryEntry = useStore((s) => s.loadHistoryEntry);
  const toggleHistorySelection = useStore((s) => s.toggleHistorySelection);
  const deleteHistoryEntry = useStore((s) => s.deleteHistoryEntry);
  const clearHistory = useStore((s) => s.clearHistory);
  const setHistoryEntryRerun = useStore((s) => s.setHistoryEntryRerun);
  const clearHistoryRerun = useStore((s) => s.clearHistoryRerun);
  const saveToHistory = useStore((s) => s.saveToHistory);
  const flashHistoryScores = useStore((s) => s.flashHistoryScores);

  const [maxHintId, setMaxHintId] = useState(null);

  function handleToggle(id) {
    const state = history.find((h) => h.id === id);
    if (!state) return;
    const wasSelected = selectedIds.includes(id);
    if (!wasSelected && selectedIds.length >= HISTORY_PALETTE.length) {
      setMaxHintId(id);
      window.setTimeout(() => setMaxHintId((current) => (current === id ? null : current)), 2000);
      return;
    }
    toggleHistorySelection(id);
    setMaxHintId(null);
  }

  async function handleRerun(entry, e) {
    e.stopPropagation();
    setHistoryEntryRerun(entry.id, { status: 'submitted' });
    loadHistoryEntry(entry.id);

    try {
      setHistoryEntryRerun(entry.id, { status: 'processing' });
      const data = await prioritizeZones(entry.aoi, { date: entry.date });
      await saveToHistory({
        aoi: entry.aoi,
        aoiMode: entry.aoiMode,
        date: entry.date,
        hotspots: entry.hotspots,
        duration: entry.duration,
        zones: data.zones || [],
        fromCache: data.meta?.fromCache,
      });
      clearHistoryRerun(entry.id);
      flashHistoryScores(entry.id);
    } catch (err) {
      console.error(err);
      setHistoryEntryRerun(entry.id, { status: 'error', error: err });
    }
  }

  if (history.length === 0) {
    return (
      <div style={{ padding: '16px 4px', color: 'var(--text-l)', fontSize: 13, textAlign: 'center' }}>
        No saved analyses yet. Run <strong style={{ color: 'var(--text-h)' }}>Analyze this zone</strong> on a hotspot to
        build history.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--text-l)' }}>{history.length} saved run{history.length === 1 ? '' : 's'}</div>
        <button
          onClick={clearHistory}
          style={{
            fontSize: 11,
            color: 'var(--danger)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 4px',
          }}
        >
          Clear all
        </button>
      </div>

      {history.map((entry) => {
        const selected = selectedIds.includes(entry.id);
        const active = activeId === entry.id;
        const paletteIndex = selectedIds.indexOf(entry.id);
        const paletteColor = paletteIndex >= 0 ? HISTORY_PALETTE[paletteIndex] : null;
        const rerunStatus = entry.rerunStatus;
        const rerunStepIndex = rerunStatus ? steps.findIndex((s) => s.key === rerunStatus) : -1;
        const busy = rerunStatus === 'submitted' || rerunStatus === 'processing';

        return (
          <div
            key={entry.id}
            onClick={() => loadHistoryEntry(entry.id)}
            style={{
              position: 'relative',
              padding: 10,
              borderRadius: 10,
              background: active ? 'var(--accent-bg)' : 'var(--track-bg)',
              border: `1px solid ${paletteColor || 'transparent'}`,
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.2s',
              overflow: 'hidden',
            }}
          >
            {entry.flashScores && (
              <div
                key={entry.flashScores}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(76, 159, 254, 0.2)',
                  animation: 'historyFlash 0.8s ease-out forwards',
                  pointerEvents: 'none',
                }}
              />
            )}

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div onClick={(e) => e.stopPropagation()} style={{ paddingTop: 2 }}>
                <Checkbox checked={selected} onChange={() => handleToggle(entry.id)} disabled={busy} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-h)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {entry.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-l)', marginTop: 2 }}>{formatDate(entry.createdAt)}</div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-m)' }}>
                    {entry.zones.length} zone{entry.zones.length === 1 ? '' : 's'}
                  </div>
                  {entry.zones.length > 0 && (
                    <div style={{ fontSize: 12, fontWeight: 600, color: scoreColor(topScore(entry.zones)) }}>
                      Top {topScore(entry.zones)}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={(e) => handleRerun(entry, e)}
                  disabled={busy}
                  title="Rerun analysis"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    border: '1px solid var(--glass-border)',
                    background: 'var(--glass-bg)',
                    color: 'var(--text-m)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 4v6h-6M1 20v-6h6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                  </svg>
                </button>
                <button
                  onClick={() => deleteHistoryEntry(entry.id)}
                  disabled={busy}
                  title="Delete"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    border: '1px solid var(--glass-border)',
                    background: 'var(--glass-bg)',
                    color: 'var(--danger)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>

            {busy && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {steps.map((step, idx) => {
                  const isActive = idx === rerunStepIndex;
                  const isDone = idx < rerunStepIndex || rerunStatus === 'completed';
                  return (
                    <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: isDone || isActive ? 'var(--accent)' : 'var(--border-strong)',
                        }}
                      />
                      <div style={{ flex: 1, fontSize: 11, color: isActive || isDone ? 'var(--text-h)' : 'var(--text-l)' }}>
                        {step.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {rerunStatus === 'error' && entry.rerunError && (
              <div
                style={{
                  marginTop: 10,
                  padding: 8,
                  borderRadius: 6,
                  background: 'var(--danger-bg)',
                  color: 'var(--danger)',
                  fontSize: 12,
                }}
              >
                {entry.rerunError.code === 'cache_miss'
                  ? 'No cached fixture for this area. Switch to live mode or use the Phoenix demo area.'
                  : entry.rerunError.message}
              </div>
            )}

            {maxHintId === entry.id && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: 'var(--text-l)',
                }}
              >
                Deselect another analysis first (max {HISTORY_PALETTE.length}).
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
