/**
 * The release gate: a version that ships without its "What's new" notes is a
 * version users are told nothing about, so this fails the build instead.
 *
 * It reads the workspace root's `package.json` (`state/whatsNew.ts` and the
 * dialog agree on the root as the one place a version lives), or the version
 * given as the first argument, and checks that
 * `app/src/whatsNew/releases/<version>/` holds a non-empty markdown file for
 * every locale the app speaks.
 *
 * Run from the repo root, with no install and no build — Node's native type
 * stripping runs this file and the locale list it imports as they are:
 *
 *   node app/scripts/check-whats-new.ts            # the version in package.json
 *   node app/scripts/check-whats-new.ts 0.3.0      # a version proposed by a PR
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { LOCALE_IDS } from '../src/i18n/localeIds.ts'

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function readRootVersion(): string {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version?: string
  }
  if (!manifest.version) fail('package.json at the repo root has no "version".')
  return manifest.version
}

const version = process.argv[2] ?? readRootVersion()
const folder = `app/src/whatsNew/releases/${version}/`
const notes = new URL(`../src/whatsNew/releases/${version}/`, import.meta.url)

if (!existsSync(notes) || !statSync(notes).isDirectory()) {
  fail(
    `No release notes for v${version}: expected ${folder} with a markdown file per locale ` +
      `(${LOCALE_IDS.map((locale) => `${locale}.md`).join(', ')}).`,
  )
}

const problems = LOCALE_IDS.flatMap((locale) => {
  const file = new URL(`${locale}.md`, notes)
  if (!existsSync(file)) return [`${locale}.md is missing`]
  return readFileSync(file, 'utf8').trim() === '' ? [`${locale}.md is empty`] : []
})

if (problems.length > 0) {
  fail(`The v${version} highlights are incomplete in ${folder} — ${problems.join(', ')}.`)
}

console.log(`OK: v${version} has highlights in all ${LOCALE_IDS.length} locales (${folder}).`)
