import { useAtom, useAtomValue } from 'jotai'
import { useT } from '../i18n/useT'
import { whatsNewOpenAtom, whatsNewSeenAtom } from '../state/whatsNew'
import { RELEASE_NOTES } from './releaseNotes'
import { hasUnseenReleases } from './whatsNew'

/**
 * The running version, as a label that opens the What's new panel. The rail's
 * footer and the More sheet each render one; both read the same atoms, so the
 * dot clears on every label at once when either opens the panel.
 *
 * The dot is the whole notice: it is the one thing that says a release landed
 * since this device last looked, and its accessible name is what a screen
 * reader reads beside the version ("v0.2.0, New version available"). `onOpen`
 * lets a caller get out of the way first — the More sheet closes itself so the
 * panel isn't opened behind a sheet.
 */
export function WhatsNewButton({ className = '', onOpen }: { className?: string; onOpen?: () => void }) {
  const t = useT()
  const [open, setOpen] = useAtom(whatsNewOpenAtom)
  const seen = useAtomValue(whatsNewSeenAtom)
  const unseen = hasUnseenReleases(seen, __APP_VERSION__, RELEASE_NOTES)

  return (
    <button
      type="button"
      title={t('whatsNew.title')}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => {
        onOpen?.()
        setOpen(true)
      }}
      className={`flex min-w-0 cursor-pointer items-center gap-1 rounded-md px-1 text-2xs text-base-content/40 transition-colors duration-150 hover:text-base-content/70 ${className}`}
    >
      <span className="truncate">{`v${__APP_VERSION__}`}</span>
      {unseen && (
        <span
          role="img"
          aria-label={t('whatsNew.dot')}
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
        />
      )}
    </button>
  )
}
