import { Plus, Trash2 } from '../../ui/icons'
import type { CoverageBand, CoverageTable as CoverageTableData, ShiftDef } from '@crewdoku/domain'
import { useT } from '../../i18n/useT'
import { CoverageTable } from '../settings/CoverageTable'

/** The four `CoverageTable` edits; the controller binds them to one tag's table. */
export type CoverageEdits = {
  onSetBandDays: (weekdays: number[], code: string, band: CoverageBand) => void
  onAddOverride: (iso: string) => void
  onSetOverrideBand: (iso: string, code: string, band: CoverageBand) => void
  onRemoveOverride: (iso: string) => void
}

/** The shared Settings card: full-bleed on a phone, a box from `md` up. */
const card = '-mx-4 flex flex-col gap-3 border-b border-base-300 px-4 pb-5 md:mx-0 md:rounded-lg md:border md:border-base-300 md:bg-base-100 md:p-5'
const title = 'm-0 text-sm font-semibold tracking-tight text-base-content'
const muted = 'm-0 text-xs text-base-content/60'

/**
 * A tag's own coverage: a minimum (or maximum) number of people holding the
 * tag on a given shift and day — H7 to the solver.
 *
 * Empty and filled are the same box with the same title and one muted line
 * that says which of the two you are looking at, so the pane does not change
 * shape when a table appears. No table means one thing — "any shift, no
 * floor" — and saying that in words beats an all-zero table that reads as a
 * real constraint.
 *
 * `CoverageTable` is asked for its bare table (`showHeading={false}`): the
 * card's own title is the one heading, exactly as in the People and
 * Preferences boxes beside it.
 */
export function TagCoverageCard({
  tagId,
  shifts,
  table,
  onAdd,
  onRemove,
  edits,
}: {
  tagId: string
  shifts: ShiftDef[]
  table: CoverageTableData | undefined
  onAdd: () => void
  onRemove: () => void
  edits: CoverageEdits
}) {
  const t = useT()

  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={title}>{t('tags.coverage.title')}</h2>
        {/* Nothing to remove until there is a table, so the action appears
            with one rather than sitting there disabled. */}
        {table !== undefined && (
          <button
            type="button"
            onClick={onRemove}
            className="btn btn-ghost btn-sm min-h-11 gap-1.5 text-error hover:bg-error/10 md:min-h-0"
          >
            <Trash2 className="h-4 w-4" />
            {t('tags.coverage.remove')}
          </button>
        )}
      </div>
      <p className={muted}>{table === undefined ? t('tags.coverage.emptyBody') : t('tags.coverage.desc')}</p>

      {table === undefined ? (
        <button type="button" onClick={onAdd} className="btn btn-outline btn-sm min-h-11 gap-1.5 self-start md:min-h-0">
          <Plus className="h-4 w-4" />
          {t('tags.coverage.add')}
        </button>
      ) : (
        <CoverageTable key={tagId} shifts={shifts} table={table} showHeading={false} {...edits} />
      )}
    </div>
  )
}
