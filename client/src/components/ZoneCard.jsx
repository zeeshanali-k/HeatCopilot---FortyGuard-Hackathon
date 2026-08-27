/**
 * ZoneCard component
 *
 * Drill-down card for a prioritized zone. Shows the Priority Score badge, four
 * weighted breakdown bars, the recommended intervention, asset chips, key stats,
 * and a Generate Action Plan section with loading skeleton, retry, and narrative.
 */

import { useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useStore } from '../state';
import { scoreColor } from '../colors';
import { generateActionPlan } from '../api';

const markdownComponents = {
  p: ({ children }) => <p style={{ margin: '0 0 10px 0', lineHeight: 1.6 }}>{children}</p>,
  ul: ({ children }) => <ul style={{ margin: '0 0 10px 0', paddingLeft: 18, lineHeight: 1.6 }}>{children}</ul>,
  li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
  strong: ({ children }) => <strong style={{ color: 'var(--text-h)', fontWeight: 700 }}>{children}</strong>,
};

const BREAKDOWN_ORDER = [
  { key: 'heat', label: 'Heat intensity' },
  { key: 'duration', label: 'Heat duration' },
  { key: 'exposure', label: 'Public exposure' },
  { key: 'greenery', label: 'Greenery deficit' },
];

const INTERVENTION_ICONS = {
  tree_planting: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22V8M12 8L5 15M12 8l7 7M5 10l7-7 7 7" />
    </svg>
  ),
  shade_structures: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20h16M6 20V10l6-4 6 4v10" />
    </svg>
  ),
  cool_pavement: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 20h20M4 20V8l8-4 8 4v12" />
    </svg>
  ),
  school_cooling: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 21V10l8-5 8 5v11M9 21v-6h6v6" />
    </svg>
  ),
  green_space: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <path d="M2 12h20" />
    </svg>
  ),
  combined: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v12M6 12h12" />
    </svg>
  ),
};

function BreakdownBar({ label, value, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          color: 'var(--text-l)',
          marginBottom: 4,
        }}
      >
        <span>{label}</span>
        <span style={{ color: 'var(--text-h)', fontWeight: 600 }}>{Math.round(value)}</span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: 'var(--track-bg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            height: '100%',
            borderRadius: 3,
            background: color,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

function AssetChip({ label, count }) {
  if (!count) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderRadius: 12,
        background: 'var(--accent-bg)',
        color: 'var(--text-l)',
        fontSize: 12,
      }}
    >
      {label}: <strong style={{ color: 'var(--text-h)' }}>{count}</strong>
    </span>
  );
}

function SkeletonLine({ width = '100%' }) {
  return (
    <div
      style={{
        width,
        height: 10,
        borderRadius: 5,
        background: 'var(--track-bg)',
        marginBottom: 8,
      }}
    />
  );
}

function buildActionPlanContext(zone, zones, allocation, areaLabel, analysisDate) {
  const rank = zones.findIndex((z) => z.id === zone.id) + 1;
  const zoneCount = zones.length;

  const topZones = zones
    .slice(0, 3)
    .map((z) => ({ id: z.id, score: z.score, interventionLabel: z.interventionLabel }));

  let budget = null;
  if (allocation) {
    const funded = allocation.funded.find((z) => z.id === zone.id);
    const unfunded = allocation.unfunded.find((z) => z.id === zone.id);
    if (funded) {
      budget = {
        budgetUsd: allocation.budgetUsd,
        funded: true,
        estimatedCostUsd: funded.cost,
        runningTotalUsd: funded.runningTotal,
      };
    } else if (unfunded) {
      budget = {
        budgetUsd: allocation.budgetUsd,
        funded: false,
        estimatedCostUsd: unfunded.cost,
        runningTotalUsd: allocation.totalSpent + unfunded.cost,
      };
    }
  }

  const context = {
    areaLabel,
    date: analysisDate,
    rank,
    zoneCount,
    topZones,
  };

  if (budget) {
    context.budget = budget;
  }

  return context;
}

function NarrativeBlocks({ narrative }) {
  const blocks = useMemo(() => {
    return narrative.split(/\n\n+/).filter(Boolean);
  }, [narrative]);

  return (
    <div style={{ fontSize: 13, color: 'var(--text-m)' }}>
      {blocks.map((block, idx) => (
        <div
          key={`${idx}-${block.slice(0, 40)}`}
          className="narrative-block"
          style={{ animationDelay: `${idx * 100}ms` }}
        >
          <ReactMarkdown components={markdownComponents}>{block}</ReactMarkdown>
        </div>
      ))}
    </div>
  );
}

export default function ZoneCard() {
  const zone = useStore((s) => s.selectedZone);
  const zones = useStore((s) => s.prioritizeZones);
  const allocation = useStore((s) => s.allocation);
  const areaLabel = useStore((s) => s.areaLabel);
  const analysisDate = useStore((s) => s.analysisDate);
  const setSelectedZone = useStore((s) => s.setSelectedZone);

  const actionPlanStatus = useStore((s) => s.actionPlanStatus);
  const actionPlanError = useStore((s) => s.actionPlanError);
  const actionPlanNarrative = useStore((s) => s.actionPlanNarrative);
  const actionPlanEvidencePdfUrl = useStore((s) => s.actionPlanEvidencePdfUrl);
  const resetActionPlan = useStore((s) => s.resetActionPlan);
  const setActionPlanStatus = useStore((s) => s.setActionPlanStatus);
  const setActionPlanError = useStore((s) => s.setActionPlanError);
  const setActionPlanNarrative = useStore((s) => s.setActionPlanNarrative);
  const setActionPlanEvidencePdfUrl = useStore((s) => s.setActionPlanEvidencePdfUrl);

  useEffect(() => {
    resetActionPlan();
  }, [zone?.id, resetActionPlan]);

  if (!zone) return null;

  const scoreColorValue = scoreColor(zone.score);

  async function handleGenerate() {
    setActionPlanStatus('loading');
    setActionPlanError(null);
    try {
      const context = buildActionPlanContext(zone, zones, allocation, areaLabel, analysisDate);
      const data = await generateActionPlan(zone.id, zone, context);
      setActionPlanNarrative(data.narrative || '');
      setActionPlanEvidencePdfUrl(data.evidencePdfUrl || null);
      setActionPlanStatus('done');
    } catch (err) {
      setActionPlanError(err);
      setActionPlanStatus('error');
    }
  }

  return (
    <div
      style={{
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: 'var(--glass-shadow)',
        color: 'var(--text-h)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-l)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 600,
            }}
          >
            Zone {zone.id}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-l)', marginTop: 2 }}>
            {zone.center.lat.toFixed(4)}, {zone.center.lon.toFixed(4)}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 56,
            height: 56,
            borderRadius: '50%',
            border: `3px solid ${scoreColorValue}`,
            color: scoreColorValue,
            fontSize: 20,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {zone.score}
        </div>
      </div>

      {BREAKDOWN_ORDER.map((item) => (
        <BreakdownBar key={item.key} label={item.label} value={zone.breakdown[item.key]} color={scoreColorValue} />
      ))}

      <div
        style={{
          marginTop: 14,
          padding: 12,
          borderRadius: 10,
          background: 'var(--accent-bg)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-h)',
            marginBottom: 6,
          }}
        >
          {INTERVENTION_ICONS[zone.intervention]}
          {zone.interventionLabel}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-m)', lineHeight: 1.5 }}>{zone.reason}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <AssetChip label="Bus stops" count={zone.assets.busStops} />
        <AssetChip label="Schools" count={zone.assets.schools} />
        <AssetChip label="Parks" count={zone.assets.parks} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          marginTop: 14,
          fontSize: 12,
          color: 'var(--text-l)',
        }}
      >
        <div>
          Mean temp: <strong style={{ color: 'var(--text-h)' }}>{zone.stats.tempMean}°C</strong>
        </div>
        <div>
          Max temp: <strong style={{ color: 'var(--text-h)' }}>{zone.stats.tempMax}°C</strong>
        </div>
        <div>
          Longest streak: <strong style={{ color: 'var(--text-h)' }}>{zone.stats.longestStreakHrs} hrs</strong>
        </div>
        <div>
          Wet-bulb max: <strong style={{ color: 'var(--text-h)' }}>{zone.stats.wetBulbMax}°C</strong>
        </div>
      </div>

      <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-l)',
            marginBottom: 10,
          }}
        >
          Action Plan
        </div>

        {actionPlanStatus === 'idle' && (
          <button
            onClick={handleGenerate}
            style={{
              width: '100%',
              height: 36,
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'filter 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
          >
            Generate Action Plan
          </button>
        )}

        {actionPlanStatus === 'loading' && (
          <div>
            <SkeletonLine width="95%" />
            <SkeletonLine width="88%" />
            <SkeletonLine width="92%" />
            <SkeletonLine width="60%" />
            <div style={{ fontSize: 12, color: 'var(--text-l)', marginTop: 4 }}>Generating briefing…</div>
          </div>
        )}

        {actionPlanStatus === 'error' && actionPlanError && (
          <div>
            <div
              style={{
                padding: 10,
                borderRadius: 8,
                background: 'var(--danger-bg)',
                color: 'var(--danger)',
                fontSize: 13,
                marginBottom: 10,
              }}
            >
              {actionPlanError.message}
            </div>
            <button
              onClick={handleGenerate}
              style={{
                width: '100%',
                height: 36,
                borderRadius: 8,
                border: '1px solid var(--glass-border)',
                background: 'var(--glass-bg)',
                color: 'var(--text-h)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--glass-bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--glass-bg)')}
            >
              Retry
            </button>
          </div>
        )}

        {actionPlanStatus === 'done' && (
          <div>
            <NarrativeBlocks narrative={actionPlanNarrative} />
            {actionPlanEvidencePdfUrl && (
              <a
                href={actionPlanEvidencePdfUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-block',
                  marginTop: 10,
                  fontSize: 13,
                  color: 'var(--accent)',
                  textDecoration: 'none',
                }}
              >
                Download evidence report (PDF)
              </a>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => setSelectedZone(null)}
        style={{
          marginTop: 14,
          width: '100%',
          height: 36,
          borderRadius: 8,
          border: '1px solid var(--glass-border)',
          background: 'var(--glass-bg)',
          color: 'var(--text-l)',
          fontSize: 13,
          cursor: 'pointer',
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--glass-bg-hover)';
          e.currentTarget.style.color = 'var(--text-h)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--glass-bg)';
          e.currentTarget.style.color = 'var(--text-l)';
        }}
      >
        Close
      </button>
    </div>
  );
}
