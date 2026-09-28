import { useEffect, useMemo, useRef } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { marked } from 'marked'
import { useT } from '../i18n/useT'
import { localeAtom } from '../state/locale'
import { whatsNewOpenAtom, whatsNewSeenAtom } from '../state/whatsNew'
import { X } from '../ui/icons'
import { RELEASE_NOTES } from './releaseNotes'
import { visibleReleases, writeSeenVersion } from './whatsNew'

/**
 * The What's new panel: every released version it may show, newest first, each
 * with the highlights from `releases/<version>/<locale>.md` in the reader's own
 * language. Mounted once by `Shell` and driven by `whatsNewOpenAtom`, so the two
 * version labels raise one dialog rather than one each.
 *
 * A released version at or below the running one is listed; anything authored
 * ahead of the build stays hidden (`visibleReleases`), which is what lets a
 * Release PR carry its notes before the tag exists. The markdown is
 * repo-authored and bundled at build time, so it is rendered as HTML as-is.
 *
 * Chrome follows the app's other dialogs: a dimmed backdrop that closes on
 * click, Escape, and the close button focused on open. Opening it is what marks
 * the running version as seen — reading the notes is the point of the dot.
 */
export function WhatsNewDialog() {
  const t = useT()
  const locale = useAtomValue(localeAtom)
  const [open, setOpen] = useAtom(whatsNewOpenAtom)
  const [, setSeenVersion] = useAtom(whatsNewSeenAtom)
  const panelRef = useRef<HTMLDivElement>(null)
  const sections = useMemo(
    () =>
      visibleReleases(RELEASE_NOTES, __APP_VERSION__).flatMap((release) => {
        // A locale the maintainer has not written yet falls back to English; a
        // file that is empty in both would only render a bare version heading,
        // so it is dropped instead (`check-whats-new.ts` refuses such a release).
        const markdown = (release.markdown[locale] ?? release.markdown.en ?? '').trim()
        if (markdown === '') return []
        return [{ version: release.version, html: marked.parse(markdown) as string }]
      }),
    [locale],
  )

  useEffect(() => {
    if (!open) return
    writeSeenVersion(__APP_VERSION__)
    setSeenVersion(__APP_VERSION__)
  }, [open, setSeenVersion])

  useEffect(() => {
    if (!open) return
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open, setOpen])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[1px] md:items-center md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      onMouseDown={(e) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
      }}
    >
      <div
        ref={panelRef}
        className="flex max-h-[90dvh] w-full flex-col gap-4 overflow-y-auto overscroll-contain rounded-t-2xl border border-x-0 border-b-0 border-base-300 bg-base-100 px-4 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] shadow-lg md:max-h-none md:max-w-[480px] md:overflow-visible md:rounded-lg md:border-x md:border-b md:p-5"
      >
        <div className="flex items-start justify-between gap-3 border-b border-base-300/80 pb-3">
          <h2 id="whats-new-title" className="m-0 text-base font-semibold tracking-tight text-base-content">
            {t('whatsNew.title')}
          </h2>
          <button
            type="button"
            autoFocus
            onClick={() => setOpen(false)}
            aria-label={t('chrome.close')}
            className="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-base-content"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {sections.length === 0 ? (
          /* An unreleased build (`0.0.0`) has no notes folder to show; the check
             script is what keeps a real release from reaching this state. */
          <p className="m-0 text-sm text-base-content/60">{t('whatsNew.empty')}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {sections.map((section) => (
              <section key={section.version}>
                <h3 className="m-0 text-sm font-semibold tracking-tight text-base-content">
                  {`v${section.version}`}
                </h3>
                <div
                  className="cd-whatsnew-md mt-1.5"
                  // Repo-authored markdown, bundled at build time — not user input.
                  dangerouslySetInnerHTML={{ __html: section.html }}
                />
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
