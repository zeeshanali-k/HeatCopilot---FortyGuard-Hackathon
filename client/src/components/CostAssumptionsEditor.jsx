/**
 * CostAssumptionsEditor component
 *
 * Disclosure section inside the budget optimizer that lets planners override
 * the default unit-cost assumptions. Overrides persist to localStorage and are
 * sent with every /api/allocate call.
 */

import { useState } from 'react';
import { useStore } from '../state';
import { COST_KEYS, COST_LABELS, mergeCosts } from '../costs';

function formatUsd(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

function sanitizeNumber(value) {
  if (value === '' || value == null) return '';
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  if (num < 0) return '0';
  return String(num);
}

export default function CostAssumptionsEditor() {
  const costOverrides = useStore((s) => s.costOverrides);
  const effectiveCosts = useStore((s) => s.effectiveCosts);
  const setCostOverrides = useStore((s) => s.setCostOverrides);
  const resetCostOverrides = useStore((s) => s.resetCostOverrides);

  const [open, setOpen] = useState(false);

  const baseCosts = effectiveCosts || mergeCosts(costOverrides);
  const hasOverrides = Object.keys(costOverrides).length > 0;

  function updateOverride(key, field, rawValue) {
    const value = rawValue === '' ? '' : Number(rawValue);
    if (value !== '' && (Number.isNaN(value) || value < 0)) return;

    const next = { ...costOverrides };
    if (!next[key]) next[key] = {};

    if (rawValue === '') {
      delete next[key][field];
      if (Object.keys(next[key]).length === 0) delete next[key];
    } else {
      next[key][field] = value;
    }

    setCostOverrides(next);
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-l)',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
        aria-expanded={open}
      >
        <span
          style={{
            display: 'inline-block',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}
        >
          ▶
        </span>
        Adjust cost estimates
        {hasOverrides && <span style={{ color: 'var(--accent)' }}>· customized</span>}
      </button>

      {open && (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: 10,
            background: 'var(--track-bg)',
            fontSize: 12,
          }}
        >
          <div
            style={{
              display: 'grid',
              gap: 10,
            }}
          >
            {COST_KEYS.map((key) => {
              const entry = baseCosts[key];
              const override = costOverrides[key] || {};
              const unitsValue = override.unitsPerZone ?? entry.unitsPerZone;
              const costValue = override.costPerUnitUsd ?? entry.costPerUnitUsd;
              const total = unitsValue * costValue;

              return (
                <div key={key}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 6,
                      color: 'var(--text-h)',
                      fontWeight: 600,
                    }}
                    title={entry.note}
                  >
                    {COST_LABELS[key]}
                    <span
                      style={{
                        color: 'var(--text-l)',
                        fontWeight: 400,
                        cursor: 'help',
                        borderBottom: '1px dotted var(--text-l)',
                      }}
                      title={entry.note}
                    >
                      ?
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-l)' }}>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={override.unitsPerZone ?? ''}
                        placeholder={String(entry.unitsPerZone)}
                        onChange={(e) => updateOverride(key, 'unitsPerZone', sanitizeNumber(e.target.value))}
                        style={{
                          width: 60,
                          padding: '5px 7px',
                          borderRadius: 6,
                          border: '1px solid var(--glass-border)',
                          background: 'var(--glass-bg)',
                          color: 'var(--text-h)',
                          fontSize: 12,
                          outline: 'none',
                        }}
                      />
                      <span>{entry.unitLabel}s</span>
                    </label>
                    <span style={{ color: 'var(--text-l)' }}>×</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-l)' }}>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={override.costPerUnitUsd ?? ''}
                        placeholder={String(entry.costPerUnitUsd)}
                        onChange={(e) => updateOverride(key, 'costPerUnitUsd', sanitizeNumber(e.target.value))}
                        style={{
                          width: 80,
                          padding: '5px 7px',
                          borderRadius: 6,
                          border: '1px solid var(--glass-border)',
                          background: 'var(--glass-bg)',
                          color: 'var(--text-h)',
                          fontSize: 12,
                          outline: 'none',
                        }}
                      />
                      <span>/ {entry.unitLabel}</span>
                    </label>
                    <span
                      style={{
                        marginLeft: 'auto',
                        color: 'var(--text-m)',
                        fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                      title={`~${formatUsd(total)} per zone`}
                    >
                      ~{formatUsd(total)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <span style={{ color: 'var(--text-l)', fontSize: 11 }}>
              Estimates only — not a quote.
            </span>
            <button
              type="button"
              onClick={resetCostOverrides}
              disabled={!hasOverrides}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid var(--glass-border)',
                background: 'var(--glass-bg)',
                color: 'var(--text-h)',
                fontSize: 12,
                cursor: hasOverrides ? 'pointer' : 'default',
                opacity: hasOverrides ? 1 : 0.5,
              }}
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
