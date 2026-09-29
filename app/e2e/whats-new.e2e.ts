import { readFileSync } from 'node:fs'
import { expect, startSample, test } from './fixtures'

// The root manifest is where the product version lives; the build stamps it in.
const manifest: unknown = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
if (typeof manifest !== 'object' || manifest === null || !('version' in manifest) || typeof manifest.version !== 'string') {
  throw new Error('root package.json has no version')
}
const version = manifest.version
// First bullet of the running version's English notes, markdown emphasis stripped.
const firstNote = readFileSync(new URL(`../src/whatsNew/releases/${version}/en.md`, import.meta.url), 'utf8')
  .split('\n')[0]!
  .replace(/^- /, '')
  .replace(/\*\*/g, '')

test("What's new shows the running version's notes and clears the unseen dot", async ({ page }) => {
  await startSample(page)
  const label = page.getByRole('navigation', { name: 'Surfaces' }).getByRole('button', { name: new RegExp(`^v${version.replace(/\./g, '\\.')}`) })
  // A fresh visitor starts at the running version: no dot.
  await expect(label).toHaveAccessibleName(`v${version}`)

  // A device that last saw an older version gets the dot.
  await page.evaluate(() => localStorage.setItem('crewdoku-whats-new-seen', '0.0.1'))
  await page.reload()
  await expect(label).toHaveAccessibleName(`v${version} New version available`)

  await label.click()
  const dialog = page.getByRole('dialog', { name: "What's new" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: `v${version}` })).toBeVisible()
  await expect(dialog).toContainText(firstNote)
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
  await expect(label).toHaveAccessibleName(`v${version}`)

  await page.reload()
  await expect(label).toHaveAccessibleName(`v${version}`)
})
