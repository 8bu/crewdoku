import { useMemo } from 'react'
import { useAtomValue } from 'jotai'
import type { ShiftDef, Tag, TagRule, TagWhen } from '@crewdoku/domain'
import { localeAtom } from '../../state/locale'
import { useT } from '../../i18n/useT'
import { useIsNarrow } from '../../ui/useIsNarrow'
import { Select, type SelectOption } from '../../ui/Select'
import { SheetSelect } from '../../ui/SheetSelect'
import { Input } from '../../ui/Input'
import { Plus, X } from '../../ui/icons'

/** The same weekday labels the person panel's recurring-off chips use. */
const WEEKDAY_KEYS = [
  'board.person.weekday.sun',
  'board.person.weekday.mon',
  'board.person.weekday.tue',
  'board.person.weekday.wed',
  'board.person.weekday.thu',
  'board.person.weekday.fri',
  'board.person.weekday.sat',
] as const

const WHEN_TYPES: TagWhen['type'][] = ['always', 'date', 'weekly', 'monthlyDay', 'monthlyNth', 'yearly']

const WHEN_LABEL_KEYS: Record<TagWhen['type'], string> = {
  always: 'tags.rules.when.always',
  date: 'tags.rules.when.date',
  weekly: 'tags.rules.when.weekly',
  monthlyDay: 'tags.rules.when.monthlyDay',
  monthlyNth: 'tags.rules.when.monthlyNth',
  yearly: 'tags.rules.when.yearly',
}

/**
 * A weekday chip. Under `md` it is one cell of a 7-column grid: the chips
 * divide the line's width evenly and a row of seven never wraps (`px-3` per
 * chip was 24px of padding each, which pushed `Sat` onto a line of its own on
 * a 390px phone). At `md` it is the padded inline chip it always was.
 */
const chipBase =
  'flex min-h-11 min-w-0 items-center justify-center rounded-md border border-base-300 bg-base-100 text-2xs font-semibold text-base-content cursor-pointer transition-colors duration-150 data-[active]:border-base-content data-[active]:bg-base-content data-[active]:text-base-100 md:min-h-0 md:px-[9px] md:py-1'

const hint = 'text-2xs text-base-content/50'

/**
 * What a newly picked repeat starts from. A repeat never starts out meaning
 * "always": `weekly` starts with no day picked (the line matches nothing until
 * the user says which days, and the editor asks for them), a date rule points
 * at the period it was written in, and the rest start on the first/nth
 * occurrence rather than on some arbitrary day of the month.
 */
function defaultWhen(type: TagWhen['type'], periodStart: string): TagWhen {
  switch (type) {
    case 'date':
      return { type: 'date', iso: periodStart }
    case 'weekly':
      return { type: 'weekly', weekdays: [] }
    case 'monthlyDay':
      return { type: 'monthlyDay', day: 1 }
    case 'monthlyNth':
      return { type: 'monthlyNth', nth: 1, weekday: 1 }
    case 'yearly':
      return { type: 'yearly', month: 1, day: 1 }
    default:
      return { type: 'always' }
  }
}

/**
 * A sentence-sized select: a ghost `Select` on desktop, where a rule line is
 * read as one sentence, and a `SheetSelect` under `md`, where a 28px dropdown
 * trigger is not a real target on a phone. Exported because the Tags view's
 * own pickers (a tag's group, the bulk team) are the same control at the same
 * size — one definition keeps a rule sentence and a detail row looking alike.
 */
export function AdaptiveSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  ariaLabel: string
  className?: string
}) {
  const isNarrow = useIsNarrow()
  if (isNarrow) {
    return (
      <span className={className}>
        <SheetSelect value={value} onChange={onChange} options={options} title={ariaLabel} ariaLabel={ariaLabel} />
      </span>
    )
  }
  return <Select value={value} onChange={onChange} options={options} ariaLabel={ariaLabel} variant="ghost" size="xs" className={className} />
}

/**
 * The rule lines of one tag, each read as a sentence built from its own
 * controls: `[Avoid|Wants] [Night|Any shift] [every week on] [Fri][Sat]`, plus
 * a Strict switch on avoids. Every control writes through `patchRule`, so a
 * half-edited line is still a valid `TagRule` at every keystroke — there is no
 * draft state to lose when the panel closes.
 *
 * Month names come from `Intl` in the active locale: 12 months × 7 locales is
 * exactly the kind of list a hand-written catalog gets wrong, and the platform
 * already knows every one of them.
 */
export function TagRuleEditor({
  tag,
  shifts,
  periodStart,
  onAddRule,
  onPatchRule,
  onRemoveRule,
}: {
  tag: Tag
  shifts: ShiftDef[]
  periodStart: string
  onAddRule: () => void
  onPatchRule: (ruleId: string, patch: Partial<Omit<TagRule, 'id'>>) => void
  onRemoveRule: (ruleId: string) => void
}) {
  const t = useT()
  const locale = useAtomValue(localeAtom)

  const kindOptions: SelectOption[] = [
    { value: 'avoid', label: t('tags.rules.kind.avoid') },
    { value: 'want', label: t('tags.rules.kind.want') },
  ]
  const shiftOptions: SelectOption[] = [
    { value: '', label: t('tags.rules.anyShift') },
    ...shifts.map((shift) => ({ value: shift.code, label: shift.label })),
  ]
  const whenOptions: SelectOption[] = WHEN_TYPES.map((type) => ({ value: type, label: t(WHEN_LABEL_KEYS[type]) }))
  const nthOptions: SelectOption[] = [
    { value: '1', label: t('tags.rules.nth.1') },
    { value: '2', label: t('tags.rules.nth.2') },
    { value: '3', label: t('tags.rules.nth.3') },
    { value: '4', label: t('tags.rules.nth.4') },
    { value: '-1', label: t('tags.rules.nth.last') },
  ]
  const weekdayOptions: SelectOption[] = WEEKDAY_KEYS.map((key, weekday) => ({ value: String(weekday), label: t(key) }))
  const monthOptions: SelectOption[] = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' })
    return Array.from({ length: 12 }, (_, i) => ({
      value: String(i + 1),
      label: format.format(new Date(Date.UTC(2024, i, 1))),
    }))
  }, [locale])

  /** `TagWhen` params, in the order the sentence reads them. */
  function whenControls(rule: TagRule) {
    const when = rule.when
    switch (when.type) {
      case 'date':
        return (
          <Input
            type="date"
            value={when.iso}
            aria-label={t('tags.rules.dateAria')}
            onChange={(e) => onPatchRule(rule.id, { when: { type: 'date', iso: e.target.value } })}
            className="w-40"
          />
        )
      case 'weekly':
        return (
          <div className="flex w-full flex-col gap-1 md:w-auto">
            <div className="grid grid-cols-7 gap-1 md:flex md:w-auto md:flex-wrap md:gap-1.5">
              {WEEKDAY_KEYS.map((key, weekday) => {
                const active = when.weekdays.includes(weekday)
                return (
                  <button
                    key={key}
                    type="button"
                    className={chipBase}
                    data-active={active || undefined}
                    onClick={() =>
                      onPatchRule(rule.id, {
                        when: {
                          type: 'weekly',
                          weekdays: active ? when.weekdays.filter((d) => d !== weekday) : [...when.weekdays, weekday].sort(),
                        },
                      })
                    }
                  >
                    {t(key)}
                  </button>
                )
              })}
            </div>
            {/* No days picked yet means the line matches no date at all, so ask
                for them rather than leaving a sentence that reads as if it
                already does something. */}
            {when.weekdays.length === 0 && <span className={hint}>{t('tags.rules.pickDays')}</span>}
          </div>
        )
      case 'monthlyDay':
        return (
          <Input
            type="number"
            min={1}
            max={31}
            value={when.day}
            aria-label={t('tags.rules.dayAria')}
            onChange={(e) => {
              const day = Math.round(Number(e.target.value))
              if (!Number.isFinite(day)) return
              onPatchRule(rule.id, { when: { type: 'monthlyDay', day: Math.min(31, Math.max(1, day)) } })
            }}
            className="w-20"
          />
        )
      case 'monthlyNth':
        return (
          <>
            <AdaptiveSelect
              value={String(when.nth)}
              onChange={(value) => onPatchRule(rule.id, { when: { ...when, nth: Number(value) } })}
              options={nthOptions}
              ariaLabel={t('tags.rules.nthAria')}
              className="w-28"
            />
            <AdaptiveSelect
              value={String(when.weekday)}
              onChange={(value) => onPatchRule(rule.id, { when: { ...when, weekday: Number(value) } })}
              options={weekdayOptions}
              ariaLabel={t('tags.rules.weekdayAria')}
              className="w-24"
            />
          </>
        )
      case 'yearly':
        return (
          <>
            <AdaptiveSelect
              value={String(when.month)}
              onChange={(value) => onPatchRule(rule.id, { when: { ...when, month: Number(value) } })}
              options={monthOptions}
              ariaLabel={t('tags.rules.monthAria')}
              className="w-32"
            />
            <Input
              type="number"
              min={1}
              max={31}
              value={when.day}
              aria-label={t('tags.rules.dayAria')}
              onChange={(e) => {
                const day = Math.round(Number(e.target.value))
                if (!Number.isFinite(day)) return
                onPatchRule(rule.id, { when: { ...when, day: Math.min(31, Math.max(1, day)) } })
              }}
              className="w-20"
            />
          </>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {tag.rules.length === 0 ? (
        <p className={`m-0 ${hint}`}>{t('tags.rules.empty')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-0 p-0 md:gap-2">
          {tag.rules.map((rule) => (
            <li
              key={rule.id}
              className="-mx-4 flex flex-col gap-2 border-b border-base-300 px-4 py-3 md:mx-0 md:rounded-md md:border md:border-base-300 md:bg-base-100 md:px-2.5 md:py-2"
            >
              {/* The remove control keeps the sentence's first line: inside the
                  wrapping half it would be left alone on a line of its own. */}
              <div className="flex items-start gap-1.5">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  <AdaptiveSelect
                    value={rule.kind}
                    onChange={(value) => onPatchRule(rule.id, { kind: value === 'want' ? 'want' : 'avoid' })}
                    options={kindOptions}
                    ariaLabel={t('tags.rules.kindAria')}
                    className="w-24"
                  />
                  <AdaptiveSelect
                    value={rule.shift ?? ''}
                    onChange={(value) => onPatchRule(rule.id, { shift: value === '' ? null : value })}
                    options={shiftOptions}
                    ariaLabel={t('tags.rules.shiftAria')}
                    className="w-32"
                  />
                  <AdaptiveSelect
                    value={rule.when.type}
                    onChange={(value) => onPatchRule(rule.id, { when: defaultWhen(value as TagWhen['type'], periodStart) })}
                    options={whenOptions}
                    ariaLabel={t('tags.rules.whenAria')}
                    className="w-44"
                  />
                  {whenControls(rule)}
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveRule(rule.id)}
                  aria-label={t('tags.rules.remove')}
                  className="btn btn-ghost btn-xs min-h-11 min-w-11 shrink-0 text-base-content/50 hover:text-error md:min-h-0 md:min-w-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Avoids only: a want never needs to say how firmly it is held.
                  The label is the whole row under `md`, and the hint follows the
                  switch: off, the rule is a preference the schedule may break. */}
              {rule.kind === 'avoid' && (
                <div className="flex flex-col gap-1">
                  <label className="flex min-h-11 w-full cursor-pointer items-center gap-2 text-sm font-semibold text-base-content md:min-h-0 md:text-2xs">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={rule.strict === true}
                      onChange={(e) => onPatchRule(rule.id, { strict: e.target.checked })}
                    />
                    {t('tags.rules.strict')}
                  </label>
                  <p className={`m-0 ${hint}`}>
                    {rule.strict === true ? t('tags.rules.strictHintOn') : t('tags.rules.strictHintOff')}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onAddRule}
        className="btn btn-outline btn-sm min-h-11 gap-1.5 self-start md:min-h-0"
      >
        <Plus className="h-4 w-4" />
        {t('tags.rules.add')}
      </button>
    </div>
  )
}
