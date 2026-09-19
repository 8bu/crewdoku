import { ChevronDown } from '../ui/icons'
import { useT } from '../i18n/useT'
import { useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { selectedPeriodAtom } from '../state/shell'
import { BottomSheet } from '../ui/BottomSheet'
import { useIsNarrow } from '../ui/useIsNarrow'
import { PeriodManagerBody, PeriodManagerPopover } from './PeriodManagerPopover'

/**
 * Header trigger for the period manager (ticket 17's picker, grown up):
 * a manager's period-level verbs are switch, rename, delete, carry-over
 * and schedule-import — none of them privileged over the others — so this
 * component is just the trigger button, and the whole surface lives in
 * `PeriodManagerPopover`.
 *
 * On mobile the same surface opens as a bottom sheet: the manager is 340px of
 * list plus a create form, which is the whole width of a phone, and its rows
 * need to be tappable rather than hover-revealed. The trigger itself grows to
 * 44px tall there while the strip stays 48px, and its label truncates so a
 * long period name can't widen the header past the viewport.
 */
export function PeriodSelector() {
  const t = useT()
  const isNarrow = useIsNarrow()
  const selected = useAtomValue(selectedPeriodAtom)
  const [openRect, setOpenRect] = useState<{ left: number; bottom: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="flex min-w-0 items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={openRect !== null}
        data-tour="period"
        className="btn btn-ghost btn-xs min-h-11 min-w-0 max-w-full gap-1.5 rounded-md md:min-h-0"
        onClick={() => {
          const rect = triggerRef.current?.getBoundingClientRect()
          if (rect) setOpenRect(rect)
        }}
      >
        {selected ? (
          <>
            <span className="min-w-0 truncate font-semibold text-base-content">{selected.label}</span>
            <span className="shrink-0 tabular-nums text-base-content/60">
              · {selected.start} → {selected.end}
            </span>
          </>
        ) : (
          <span className="truncate text-base-content/60">{t('chrome.periodSelector.none')}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-base-content/40" />
      </button>
      {openRect &&
        (isNarrow ? (
          <BottomSheet open onClose={() => setOpenRect(null)} title={t('period.title')}>
            <PeriodManagerBody onClose={() => setOpenRect(null)} />
          </BottomSheet>
        ) : (
          <PeriodManagerPopover rect={openRect} onClose={() => setOpenRect(null)} />
        ))}
    </div>
  )
}
