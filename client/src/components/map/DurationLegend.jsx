/**
 * DurationLegend component
 *
 * Map overlay legend for the heat-duration layer. Explains the color scale
 * used by DurationLayer so users can interpret streak length at a glance.
 * Only renders while the duration layer is visible.
 */

const items = [
  { min: 0, max: 4, color: '#ffffb2', label: '< 4 hrs' },
  { min: 4, max: 8, color: '#fecc5c', label: '4 – 8 hrs' },
  { min: 8, max: 12, color: '#fd8d3c', label: '8 – 12 hrs' },
  { min: 12, max: 16, color: '#f03b20', label: '12 – 16 hrs' },
  { min: 16, max: Infinity, color: '#bd0026', label: '16+ hrs' },
];

export default function DurationLegend() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        right: 24,
        zIndex: 10,
        padding: '12px 14px',
        borderRadius: 12,
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid var(--glass-border)',
        boxShadow: 'var(--glass-shadow)',
        color: 'var(--text-h)',
        minWidth: 140,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-l)',
          marginBottom: 10,
        }}
      >
        Heat duration
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                background: item.color,
                border: '1px solid rgba(255, 255, 255, 0.2)',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-m)' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
