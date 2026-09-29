import { readFileSync } from 'node:fs'
import {
  cellsOf,
  createOrg,
  expect,
  nav,
  openPeriods,
  periodTrigger,
  personButton,
  selectCell,
  startSample,
  test,
  waitForAutosave,
} from './fixtures'
import type { Page } from '@playwright/test'

/** Sample workspace plus three kinds of edit: a board cell, a period rename, and a new person (saved last). */
async function editSample(page: Page): Promise<void> {
  await startSample(page)
  const cell = (await cellsOf(page, 'Ava Bennett')).first()
  await selectCell(cell)
  await page.keyboard.press('c')
  await expect(cell).toHaveAttribute('data-shift', 'CLOSE')

  const banner = await openPeriods(page)
  await banner.getByRole('button', { name: 'Edit' }).click()
  await banner.getByRole('listitem').getByRole('textbox').first().fill('Harbour Q4')
  await banner.getByRole('listitem').getByRole('button', { name: 'Save' }).click()
  await expect(periodTrigger(page)).toHaveAccessibleName(/^Harbour Q4 · /)
  await page.keyboard.press('Escape')

  await nav(page, 'Roster').click()
  await page.getByRole('button', { name: 'Add person' }).click()
  const nameField = page.getByRole('textbox', { name: 'Name' }).last()
  await expect(nameField).toBeFocused()
  await nameField.fill('Zara Quinn')
  await nameField.press('Tab')
  await nav(page, 'Board').click()
}

async function expectEditedSample(page: Page): Promise<void> {
  await expect(periodTrigger(page)).toHaveAccessibleName(/^Harbour Q4 · /)
  await expect(personButton(page, 'Zara Quinn')).toBeVisible()
  await expect((await cellsOf(page, 'Ava Bennett')).first()).toHaveAttribute('data-shift', 'CLOSE')
  await nav(page, 'Roster').click()
  await expect(page.getByText('19 people')).toBeVisible()
  await nav(page, 'Board').click()
}

test('the workspace and every edit survive a reload', async ({ page }) => {
  await editSample(page)
  await waitForAutosave(page, 'Zara Quinn')
  await page.reload()
  await expectEditedSample(page)
})

test('a saved workspace file loads into a fresh browser with the same data', async ({ page, browser }) => {
  await editSample(page)
  await nav(page, 'Export').click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save workspace' }).click()])
  expect(download.suggestedFilename()).toMatch(/^crewdoku-workspace-\d{4}-\d{2}-\d{2}\.json$/)
  const file = readFileSync(await download.path(), 'utf8')
  expect(JSON.parse(file)).toHaveProperty('schemaVersion')
  expect(file).toContain('Zara Quinn')

  // A separate context: its own, empty IndexedDB.
  const other = await browser.newContext()
  await other.addInitScript(() => localStorage.setItem('crewdoku-tour-seen', '1'))
  const fresh = await other.newPage()
  await createOrg(fresh, 'Other Org', 'Blank')
  await fresh.getByRole('button', { name: 'Skip setup' }).click()
  await nav(fresh, 'Export').click()

  fresh.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('It replaces everything')
    void dialog.accept()
  })
  await fresh.getByLabel('Load workspace').setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/json', buffer: Buffer.from(file) })
  await expect(fresh.getByText('Workspace loaded.')).toBeVisible()

  await nav(fresh, 'Board').click()
  await expectEditedSample(fresh)
  await other.close()
})
