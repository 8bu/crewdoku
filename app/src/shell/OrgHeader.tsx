import { useT } from '../i18n/useT'
import { useActiveOrg } from '../state/orgStore'
import { leaveOrg } from '../state/workspaceStore'

/** Up to two initials for the org avatar. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]
  if (!first) return '?'
  if (parts.length === 1) return first.slice(0, 2).toUpperCase()
  const last = parts[parts.length - 1] ?? first
  return (first.charAt(0) + last.charAt(0)).toUpperCase()
}

/**
 * The org identity at the top of the nav rail (where the wordmark used to sit).
 * It shows the entered organization and, on click, returns to the full-page org
 * picker to switch — the Netflix-style "who's watching" affordance. The product
 * wordmark now lives in the rail footer.
 *
 * On mobile it is a row inside `BottomNav`'s More sheet instead: same verb,
 * same initials, but dressed as a bordered row beside the workspace switcher
 * (`variant="sheet"`) rather than as rail chrome with a full-bleed divider.
 */
export function OrgHeader({ variant = 'rail' }: { variant?: 'rail' | 'sheet' }) {
  const t = useT()
  const org = useActiveOrg()
  if (!org) return null
  return (
    <button
      type="button"
      onClick={() => void leaveOrg()}
      aria-label={t('workspace.switcher.switchOrg')}
      title={t('workspace.switcher.switchOrg')}
      className={
        variant === 'rail'
          ? 'flex h-12 w-full shrink-0 items-center gap-2 border-b border-base-300 px-3 text-left transition-colors duration-150 hover:bg-base-300/50'
          : 'flex h-11 w-full shrink-0 items-center gap-2 rounded-md border border-base-300 bg-base-100 px-3 text-left transition-colors duration-150 hover:bg-base-200'
      }
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-2xs font-semibold text-primary">
        {initials(org.name)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-base-content">{org.name}</span>
    </button>
  )
}
