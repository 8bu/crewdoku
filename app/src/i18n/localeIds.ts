/**
 * The supported locale ids — the app's one list of the languages it speaks.
 *
 * Deliberately dependency-free (not even a type import), because two very
 * different callers read it: `state/locale.ts` at runtime behind the locale
 * picker, and `app/scripts/check-whats-new.ts`, which Node runs with native type
 * stripping and no install — it must be able to import the list without pulling
 * jotai, React or anything else in with it. Every other list of locales
 * (message catalogs, the release-notes folders, the switcher) hangs off this
 * one, so adding a language is a single edit here plus whatever the compiler
 * then demands.
 */
export const LOCALE_IDS = ['en', 'vi', 'es', 'fr', 'ja', 'de', 'pt'] as const

export type LocaleId = (typeof LOCALE_IDS)[number]
