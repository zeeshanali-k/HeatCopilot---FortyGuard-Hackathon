/**
 * ResultsPanel component
 *
 * Right-hand ranked list of prioritized zones. Hidden until the first
 * prioritize analysis completes. Clicking a row flies the map to the zone and
 * opens the ZoneCard (without switching to the unrelated hotspot marker).
 */

import { useState } from 'react';
import { useStore } from '../state';
import { scoreColor } from '../colors';
import { allocateBudget } from '../api';
import ZoneCard from './ZoneCard';
import HistoryPanel from './HistoryPanel';
import CostAssumptionsEditor from './CostAssumptionsEditor';

const COST_TOOLTIP = 'Rough municipal unit-cost estimate — see the documented estimate table (server/src/costs.js)';

function formatUsd(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

export default function ResultsPanel() {
  const map = useStore((s) => s.mapRef);
  const aoi = useStore((s) => s.aoi);
  const zones = useStore((s) => s.prioritizeZones);
  const status = useStore((s) => s.prioritizeStatus);
  const error = useStore((s) => s.prioritizeError);
  const show = useStore((s) => s.showResultsPanel);
  const selectedZone = useStore((s) => s.selectedZone);
  const allocateStatus = useStore((s) => s.allocateStatus);
  const allocateError = useStore((s) => s.allocateError);
  const allocation = useStore((s) => s.allocation);

  const setSelectedZone = useStore((s) => s.setSelectedZone);
  const setShowResultsPanel = useStore((s) => s.setShowResultsPanel);
  const setPrioritizeZones = useStore((s) => s.setPrioritizeZones);
  const setAllocateStatus = useStore((s) => s.setAllocateStatus);
  const setAllocateError = useStore((s) => s.setAllocateError);
  const setAllocation = useStore((s) => s.setAllocation);
  const costOverrides = useStore((s) => s.costOverrides);
  const analysisDate = useStore((s) => s.analysisDate);

  const [budgetInput, setBudgetInput] = useState('');
  const [activeTab, setActiveTab] = useState('zones');

  if (!show) return null;

  const ranked = status === 'completed' && zones.length > 0;
  const fundedIds = new Set((allocation?.funded || []).map((z) => z.id));
  const fundedCostById = new Map((allocation?.funded || []).map((z) => [z.id, z.cost]));

  async function handleOptimize() {
    const budgetUsd = Number(budgetInput.replace(/[^0-9.]/g, ''));
    if (!aoi || !Number.isFinite(budgetUsd) || budgetUsd <= 0) return;
    setAllocateStatus('processing');
    setAllocateError(null);
    try {
      const data = await allocateBudget(aoi, { date: analysisDate, budgetUsd, costOverrides });
      // Keep the ranked list in sync with the optimization so the panel shows
      // exactly the zones the budget was allocated against.
      const rankedZones = [...(data.funded || []), ...(data.unfunded || [])];
      if (rankedZones.length > 0) {
        setPrioritizeZones(rankedZones);
      }
      setAllocation(data);
      setAllocateStatus('completed');
      setActiveTab('zones');
    } catch (err) {
      setAllocateError({ code: err.code, message: err.message });
      setAllocateStatus('error');
    }
  }

  function handleSelect(zone) {
    setSelectedZone(zone);
    if (map) {
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
        animation: `slideInRight var(--dur-slow) var(--ease-out) both`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'zones', label: 'Prioritized Zones' },
            { key: 'history', label: 'History' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: activeTab === tab.key ? '#fff' : 'var(--text-l)',
                background: activeTab === tab.key ? 'var(--accent)' : 'transparent',
                border: 'none',
                borderRadius: 7,
                padding: '5px 10px',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
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

      {activeTab === 'zones' && (
        <>
          {ranked && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              inputMode="numeric"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleOptimize();
              }}
              placeholder="Budget (USD), e.g. 2000000"
              style={{
                flex: 1,
                minWidth: 0,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--glass-border)',
                background: 'var(--track-bg)',
                color: 'var(--text-h)',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <button
              onClick={handleOptimize}
              disabled={allocateStatus === 'processing' || !budgetInput.trim()}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent-bg)',
                color: 'var(--text-h)',
                fontSize: 13,
                fontWeight: 600,
                cursor: allocateStatus === 'processing' ? 'wait' : 'pointer',
                opacity: allocateStatus === 'processing' || !budgetInput.trim() ? 0.5 : 1,
              }}
            >
              {allocateStatus === 'processing' ? 'Optimizing…' : 'Optimize'}
            </button>
          </div>

          {allocateStatus === 'error' && allocateError && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                borderRadius: 8,
                background: 'var(--danger-bg)',
                color: 'var(--danger)',
                fontSize: 12,
              }}
            >
              {allocateError.code === 'cache_miss'
                ? 'No cached fixture for this area. Switch to live mode or use the Phoenix demo area.'
                : allocateError.message}
            </div>
          )}

          {allocation && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 10px',
                borderRadius: 8,
                background: 'var(--track-bg)',
                fontSize: 12,
                color: 'var(--text-h)',
                lineHeight: 1.5,
              }}
            >
              <span title={COST_TOOLTIP} style={{ borderBottom: '1px dotted var(--text-l)', cursor: 'help' }}>
                ~{formatUsd(allocation.totalSpent)}
              </span>{' '}
              of {formatUsd(allocation.budgetUsd)} allocated · {allocation.impact.zonesFunded} zone
              {allocation.impact.zonesFunded === 1 ? '' : 's'} funded ·{' '}
              {allocation.impact.dangerHoursAddressed.toLocaleString()} danger-hours addressed
              {allocation.unfunded.length > 0 && (
                <div style={{ color: 'var(--text-l)', marginTop: 2 }}>
                  {allocation.unfunded.length} zone{allocation.unfunded.length === 1 ? '' : 's'} next in line when
                  more budget is available.
                </div>
              )}
            </div>
          )}

          <CostAssumptionsEditor />
        </div>
      )}

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
          const funded = fundedIds.has(zone.id);
          const dimmed = allocation != null && !funded;
          const fundedCost = fundedCostById.get(zone.id);
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
                opacity: dimmed ? 0.55 : 1,
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-h)' }}>Zone {zone.id}</span>
                  {funded && (
                    <span
                      title={fundedCost != null ? `${COST_TOOLTIP}` : undefined}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        padding: '2px 6px',
                        borderRadius: 6,
                        background: 'rgba(34, 197, 94, 0.18)',
                        color: '#22c55e',
                        flexShrink: 0,
                      }}
                    >
                      FUNDED{fundedCost != null ? ` ~${formatUsd(fundedCost)}` : ''}
                    </span>
                  )}
                </div>
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
        </>
      )}

      {activeTab === 'history' && <HistoryPanel />}
    </div>
  );
}
