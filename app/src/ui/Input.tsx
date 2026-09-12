import type { ComponentPropsWithRef } from 'react'

/**
 * The one text/date/number input for the whole app. `.cd-field` (styles.css)
 * owns the look — hairline box, hover edge, primary focus ring — so a Period
 * date, a shift time, a coverage cell, and a search box all read as the same
 * control instead of the old split between daisyUI `.input` and inline
 * `.cd-field`. `density="compact"` is the only variant: tighter padding for
 * dense table cells (the coverage min/max grid). Callers pass width and any
 * font/alignment (`font-mono`, `tabular-nums`, `text-center`) via `className`.
 */
export function Input({
  className = '',
  density = 'default',
  ...props
}: ComponentPropsWithRef<'input'> & { density?: 'default' | 'compact' }) {
  const sizeCls = density === 'compact' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm'
  return <input className={`cd-field ${sizeCls} ${className}`} {...props} />
}
