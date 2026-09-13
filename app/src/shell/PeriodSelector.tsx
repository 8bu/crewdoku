import { ChevronDown } from '../ui/icons'
import { useT } from '../i18n/useT'
import { useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { selectedPeriodAtom } from '../state/shell'
import { PeriodManagerPopover } from './PeriodManagerPopover'

/**
 * Header trigger for the period manager (ticket 17's picker, grown up):
 * a manager's period-level verbs are switch, rename, delete, carry-over
 * and schedule-import — none of them privileged over the others — so this
 * component is just the trigger button, and the whole surface lives in
 * `PeriodManagerPopover`.
 */
export function PeriodSelector() {
  const t = useT()
  const selected = useAtomValue(selectedPeriodAtom)
  const [openRect, setOpenRect] = useState<{ left: number; bottom: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="flex items-center">
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-ghost btn-xs gap-1.5 rounded-md"
        onClick={() => {
          const rect = triggerRef.current?.getBoundingClientRect()
          if (rect) setOpenRect(rect)
        }}
      >
        {selected ? (
          <>
            <span className="font-semibold text-base-content">{selected.label}</span>
            <span className="tabular-nums text-base-content/60">
              · {selected.start} → {selected.end}
            </span>
          </>
        ) : (
          <span className="text-base-content/60">{t('chrome.periodSelector.none')}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-base-content/40" />
      </button>
      {openRect && <PeriodManagerPopover rect={openRect} onClose={() => setOpenRect(null)} />}
    </div>
  )
}
