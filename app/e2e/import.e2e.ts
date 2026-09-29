import { fileURLToPath } from 'node:url'
import { expect, nav, personButton, startSample, test } from './fixtures'

// The people CSV the repo ships as an import example.
const ROSTER_CSV = fileURLToPath(new URL('../samples/roster-sample.csv', import.meta.url))

test('batch-importing the sample roster CSV adds its people and teams', async ({ page }) => {
  await startSample(page)
  await nav(page, 'Roster').click()
  await expect(page.getByText('18 people')).toBeVisible()

  await page.getByRole('button', { name: 'Import', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Batch import' })
  await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeDisabled()
  await dialog.getByLabel('Choose spreadsheet').setInputFiles(ROSTER_CSV)
  await expect(dialog.getByText('14 people · 2 new teams')).toBeVisible()
  await expect(dialog.getByText('Created team "Night crew" for an imported person.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(dialog).toBeHidden()

  await expect(page.getByText('32 people')).toBeVisible()
  await expect(page.getByRole('row', { name: /^Alice Nguyen Frontline / })).toBeVisible()
  await expect(page.getByRole('row', { name: /^Kevin Ly Unassigned / })).toBeVisible()

  await nav(page, 'Board').click()
  for (const team of ['Frontline', 'Night crew']) {
    await expect(page.getByRole('main').getByRole('button', { name: new RegExp(`^${team} \\d+$`) })).toBeVisible()
  }
  for (const person of ['Alice Nguyen', 'Grace Bui', 'Nina Vu']) await expect(personButton(page, person)).toBeVisible()
})
