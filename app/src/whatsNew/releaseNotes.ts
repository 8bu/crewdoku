import { isLocaleId } from '../i18n/geo'
import type { LocaleId } from '../i18n/localeIds'
import { compareVersions } from './whatsNew'

/**
 * The "What's new" notes, one folder per released version and one markdown file
 * per locale inside it (`releases/0.2.0/en.md`), read at build time by Vite's
 * eager glob so the panel needs no fetch and works offline like everything else.
 * The verifier who lands a release writes these; `app/scripts/check-whats-new.ts`
 * is what refuses a version that ships without them.
 *
 * Each file is a plain markdown bullet list of one to five user-facing
 * highlights — no version heading (the panel renders `v<version>` itself). The
 * content is repo-authored and bundled, so rendering it as HTML is safe.
 */
export type ReleaseNotes = {
  /** The version, spelled as the folder is ("0.2.0"). */
  version: string
  /** Raw markdown per locale. A missing file is caught by the check script, not here. */
  markdown: Partial<Record<LocaleId, string>>
}

const NOTES_FILES = import.meta.glob<string>('./releases/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const NOTE_PATH = /^\.\/releases\/([^/]+)\/([^/]+)\.md$/

/**
 * Groups the bundled files into one entry per version folder, newest first.
 * A path that is not `<version>/<locale>.md` is ignored: the glob only reaches
 * files the check script has already validated, and a stray file must not
 * invent a version.
 */
function collect(): readonly ReleaseNotes[] {
  const byVersion = new Map<string, Partial<Record<LocaleId, string>>>()
  for (const [path, markdown] of Object.entries(NOTES_FILES)) {
    const match = NOTE_PATH.exec(path)
    const version = match?.[1]
    const locale = match?.[2]
    if (version === undefined || locale === undefined || !isLocaleId(locale)) continue
    byVersion.set(version, { ...byVersion.get(version), [locale]: markdown })
  }
  return [...byVersion].map(([version, markdown]) => ({ version, markdown }))
    .sort((a, b) => compareVersions(b.version, a.version))
}

export const RELEASE_NOTES: readonly ReleaseNotes[] = collect()
