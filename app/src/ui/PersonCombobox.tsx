import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Person, Team } from '@crewdoku/domain'
import { useT } from '../i18n/useT'
import { Input } from './Input'
import { Search, X } from './icons'
import { searchPeople } from './personSearch'

/**
 * Rows rendered at most. The roster runs to 1000+, so the panel is a search
 * surface rather than a list: past this many matches the footer tells the user
 * to keep typing, and there is deliberately no virtualization to page through.
 */
const MAX_RESULTS = 50

/** The panel: `Select`'s popover surface (same border, radius, shadow, offsets). */
const panelCls =
  'absolute left-0 top-full z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-lg'

/** One row: `Select`'s option shape, plus the room the dim team label needs. */
const optionCls =
  'flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-base-content max-md:min-h-11'

/** A row under the cursor or the arrow keys — the surface's single highlight. */
const optionActiveCls = 'bg-base-200'

/** The person already chosen, so a reopen shows where it is. */
const optionSelectedCls = 'font-medium text-primary'

/** Right edge of the field: the chosen person's team, dim, then the clear button. */
const suffixCls = 'pointer-events-none absolute inset-y-0 right-1 flex items-center gap-1 pl-1'

/**
 * The person picker for rosters a `Select` can't carry. Type-to-search with
 * `searchPeople`, so "nguyen" finds "Nguyễn Văn An" from the keyboard alone.
 *
 * ARIA combobox pattern: the input owns the focus and the keyboard (the rows
 * are never focused), `aria-activedescendant` names the highlighted row, and
 * the rows only take mouse events.
 *
 * Escape contract with a surrounding dialog: while the panel is open, Escape
 * closes the panel and marks the event handled (`preventDefault`), which the
 * leave dialog's window-level keydown listener reads before closing itself.
 * `stopPropagation` is set too, so the event doesn't reach that listener at
 * all. With the panel closed, Escape is left alone and closes the dialog.
 */
export function PersonCombobox({
  people,
  teams,
  value,
  onChange,
  ariaLabel,
  autoFocus = false,
  className = '',
}: {
  people: readonly Person[]
  teams: readonly Team[]
  /** Selected person id; `''` for none. */
  value: string
  onChange: (personId: string) => void
  ariaLabel: string
  autoFocus?: boolean
  className?: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [rawActive, setRawActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const skipAutoOpenRef = useRef(false)
  const listboxId = `${useId()}-listbox`

  const selected = people.find((p) => p.id === value)
  const namePlaceholder = t('rtc.roster.namePlaceholder')
  const selectedName = selected === undefined ? '' : selected.name.trim() === '' ? namePlaceholder : selected.name

  // The field shows the search query only while the panel is open; closed it
  // reads as the chosen person, and as the empty field with its placeholder
  // when nobody is chosen. Closing resets the query, which is what makes
  // Escape/Tab restore the selected person's name.
  // Closed, nothing lists the rows, so the roster itself stands in for the
  // (unfiltered) list the panel would show — no copy for a hidden panel.
  const listed = open ? searchPeople(people, query) : people
  const rows = listed.slice(0, MAX_RESULTS)
  const active = rows.length === 0 ? -1 : Math.min(rawActive, rows.length - 1)
  const activeRow = active === -1 ? undefined : rows[active]

  useEffect(() => {
    if (!autoFocus) return
    const field = inputRef.current
    // StrictMode runs this twice; a no-op focus() fires no event, which would
    // leave the guard armed for the user's first real focus.
    if (field === null || document.activeElement === field) return
    // Focusing on mount must not count as the user opening the picker.
    skipAutoOpenRef.current = true
    field.focus()
  }, [autoFocus])

  useEffect(() => {
    if (!open) return
    function closeOnOutsidePointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])

  useEffect(() => {
    if (active === -1) return
    optionRefs.current[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function select(person: Person) {
    onChange(person.id)
    closePanel()
  }

  function closePanel() {
    setOpen(false)
    setQuery('')
  }

  /** Opening always lands the highlight on the top hit, never on a stale row index. */
  function openPanel() {
    setOpen(true)
    setRawActive(0)
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (!open) return
      // Prevented so a surrounding dialog's own Escape handler stands down.
      e.preventDefault()
      e.stopPropagation()
      closePanel()
      return
    }

    if (e.key === 'Tab') {
      closePanel()
      return
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        if (e.key === 'ArrowDown' || rows.length === 0) openPanel()
        else {
          setOpen(true)
          setRawActive(rows.length - 1)
        }
        return
      }
      if (rows.length === 0) return
      // Wrapping, so the ends never dead-end the arrow keys.
      const step = e.key === 'ArrowDown' ? 1 : rows.length - 1
      setRawActive((active + step) % rows.length)
      return
    }

    if (!open) return

    if (e.key === 'Home') {
      e.preventDefault()
      setRawActive(0)
      return
    }

    if (e.key === 'End') {
      e.preventDefault()
      setRawActive(rows.length - 1)
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (activeRow !== undefined) select(activeRow)
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-base-content/40" aria-hidden="true" />
        <Input
          ref={inputRef}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          // Only while the listbox is mounted: a reference to an absent element
          // is worse than no reference at all.
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={open && activeRow !== undefined ? `${listboxId}-${activeRow.id}` : undefined}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          autoComplete="off"
          spellCheck={false}
          value={open ? query : selectedName}
          placeholder={t('rtc.common.personSearch')}
          onChange={(e) => {
            setQuery(e.target.value)
            openPanel()
          }}
          onFocus={() => {
            if (skipAutoOpenRef.current) {
              skipAutoOpenRef.current = false
              return
            }
            openPanel()
          }}
          onClick={openPanel}
          onKeyDown={onKeyDown}
          className={`w-full pl-7 ${selected !== undefined && !open ? 'pr-24' : 'pr-2'}`}
        />
        {selected !== undefined && !open && (
          <span className={suffixCls}>
            <span className="max-w-[4.5rem] truncate text-xs text-base-content/50">
              {teams.find((team) => team.id === selected.teamId)?.name ?? t('rtc.common.unassigned')}
            </span>
            <button
              type="button"
              aria-label={t('rtc.common.personSearch')}
              title={t('rtc.common.personSearch')}
              tabIndex={-1}
              // Keeps the caret in the field so typing resumes straight after clearing.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange('')
                setQuery('')
                inputRef.current?.focus()
              }}
              className="pointer-events-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-base-content/40 hover:bg-base-200 hover:text-base-content"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        )}
      </div>

      {open && (
        <div className={panelCls}>
          <div role="listbox" id={listboxId} aria-label={ariaLabel}>
            {rows.map((person, index) => (
              <button
                key={person.id}
                ref={(el) => {
                  optionRefs.current[index] = el
                }}
                id={`${listboxId}-${person.id}`}
                type="button"
                role="option"
                aria-selected={person.id === value}
                // Never a focus target: the input keeps the keyboard.
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setRawActive(index)}
                onClick={() => select(person)}
                className={`${optionCls} ${index === active ? optionActiveCls : ''} ${
                  person.id === value ? optionSelectedCls : ''
                }`}
              >
                <span className="min-w-0 flex-1 truncate">
                  {person.name.trim() === '' ? namePlaceholder : person.name}
                </span>
                <span className="shrink-0 text-xs text-base-content/50">
                  {teams.find((team) => team.id === person.teamId)?.name ?? t('rtc.common.unassigned')}
                </span>
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <p className="m-0 px-2 py-1.5 text-sm text-base-content/60">{t('rtc.common.noPersonMatch', { query })}</p>
          ) : listed.length > rows.length ? (
            <p className="m-0 border-t border-base-300 px-2 py-1.5 text-xs text-base-content/60">
              {t('rtc.common.narrowSearch', { shown: rows.length, total: listed.length })}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
