import { TONES } from './ui'

export default function PageHeader({ title, subtitle, actions, tone }) {
  return (
    <div className="flex items-center gap-3 px-3 h-10 border-b border-bd bg-raised shrink-0"
      style={tone ? { borderBottomColor: TONES[tone].borderColor, background: TONES[tone].background } : {}}>
      <div className="min-w-0">
        <h1 className="text-xs font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="text-2xs text-dim leading-tight truncate">{subtitle}</p>}
      </div>
      <div className="flex-1"></div>
      {actions && <div className="flex items-center gap-1.5">{actions}</div>}
    </div>
  )
}
