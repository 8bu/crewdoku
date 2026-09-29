import { expect, nav, startSample, test } from './fixtures'

test('a new shift typed as "swing" with no label is listed as SWING and offered on the roster', async ({ page }) => {
  await startSample(page)
  await nav(page, 'Settings').click()

  await page.getByRole('textbox', { name: 'e.g. SWING', exact: true }).fill('swing')
  await page.getByRole('button', { name: 'Add shift' }).click()

  const row = page.getByRole('row', { name: /^Change SWING's colour/ })
  await expect(row).toBeVisible()
  const [code, label] = [row.getByRole('textbox').nth(0), row.getByRole('textbox').nth(1)]
  await expect(code).toHaveValue('SWING')
  await expect(label).toHaveValue('SWING')
  await expect(page.getByRole('button', { name: 'Delete SWING' })).toBeVisible()

  await nav(page, 'Roster').click()
  await expect(page.getByRole('row', { name: /^Ava Bennett / }).getByRole('button', { name: 'SWING', exact: true })).toBeVisible()
})

test('renaming a shift code rewrites every board cell that uses it', async ({ page }) => {
  await startSample(page)
  const midCells = await page.locator('.cd-cell[data-shift="MID"]').count()
  expect(midCells).toBeGreaterThan(0)

  await nav(page, 'Settings').click()
  const code = page.getByRole('row', { name: /^Change MID's colour/ }).getByRole('textbox').first()
  await code.fill('LUNCH')
  await code.press('Tab')
  await expect(page.getByRole('row', { name: /^Change LUNCH's colour/ })).toBeVisible()

  await nav(page, 'Board').click()
  await expect(page.locator('.cd-cell[data-shift="LUNCH"]')).toHaveCount(midCells)
  await expect(page.locator('.cd-cell[data-shift="MID"]')).toHaveCount(0)
  await expect(page.getByText('Rules changed since the last Generate')).toBeVisible()
})
