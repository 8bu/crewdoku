/* Compact charts for the Generate panel */

export function PenaltyBars({ rows }) {
  const max = Math.max(...rows.map(r => Math.max(r.value, r.prev || 0)), 1)
  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.label}>
          <div className="flex justify-between text-2xs mb-0.5">
            <span className="text-dim truncate mr-2">{r.label}</span>
            <span className="font-mono shrink-0">
              {r.prev !== undefined && <span className="text-faint line-through mr-1.5">{r.prev}</span>}
              <span style={{ color: r.prev !== undefined && r.value < r.prev ? 'var(--st-ok)' : 'var(--text)' }}>{r.value}</span>
            </span>
          </div>
          <div className="h-1.5 bg-[var(--surface-2)] rounded-[1px] relative overflow-hidden">
            {r.prev !== undefined && (
              <div className="absolute inset-y-0 left-0 rounded-[1px]"
                style={{ width: (r.prev / max * 100) + '%', background: 'var(--grid-line)' }} />
            )}
            <div className="absolute inset-y-0 left-0 rounded-[1px] transition-all duration-500"
              style={{ width: (r.value / max * 100) + '%', background: 'var(--st-prop)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function CompactHist({ buckets }) {
  if (!buckets || !buckets.length) return null
  const maxH = Math.max(...buckets.map(b => b.count), 1)
  return (
    <div>
      <div className="flex items-end gap-px h-10">
        {buckets.map((b, i) => (
          <div key={i} className="flex-1 rounded-[1px] transition-all duration-500"
            style={{
              height: Math.max((b.count / maxH) * 38, b.count ? 2 : 0) + 'px',
              background: b.hrs > 48 ? 'var(--st-crit)' : b.hrs > 40 ? 'var(--st-warn)' : 'var(--st-prop)',
              opacity: b.count === 0 ? 0.15 : 1,
            }} />
        ))}
      </div>
      <div className="flex justify-between text-2xs text-faint font-mono mt-1">
        <span>0h</span><span>24h</span><span>48h</span><span>72h+</span>
      </div>
    </div>
  )
}
