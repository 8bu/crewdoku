import { cellsOf, createPeriod, expect, nav, selectCell, shiftsOf, startSample, test } from './fixtures'

test('keyboard selection moves with arrows, grows with Shift+arrow, and stops at the board edge', async ({ page }) => {
  await startSample(page)
  await createPeriod(page, 'Keyboard')

  // Top-left corner: Up and Left have nowhere to go.
  await selectCell((await cellsOf(page, 'Ava Bennett')).first())
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('c')
  expect((await shiftsOf(page, 'Ava Bennett')).slice(0, 3)).toEqual(['CLOSE', 'CLOSE', 'OFF'])
  expect((await shiftsOf(page, 'Liam Carter')).slice(0, 3)).toEqual(['CLOSE', 'CLOSE', 'OFF'])
  await expect(page.locator('.cd-cell[data-shift="CLOSE"]')).toHaveCount(4)

  // A plain arrow collapses the range and steps from its moving corner.
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('m')
  expect((await shiftsOf(page, 'Liam Carter')).slice(0, 3)).toEqual(['CLOSE', 'CLOSE', 'MID'])
  await expect(page.locator('.cd-cell[data-shift="MID"]')).toHaveCount(1)

  // Bottom-right corner: Right and Down have nowhere to go.
  await selectCell((await cellsOf(page, 'Kwame Mensah')).last())
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('m')
  await expect((await cellsOf(page, 'Kwame Mensah')).last()).toHaveAttribute('data-shift', 'MID')
  await expect(page.locator('.cd-cell[data-shift="MID"]')).toHaveCount(2)
})

test('hand-setting a shift the roster marks ineligible flags the cell; undo and redo walk it back and forth', async ({ page }) => {
  await startSample(page)

  await nav(page, 'Roster').click()
  const liamMid = page.getByRole('row', { name: /^Liam Carter / }).getByRole('button', { name: 'MID', exact: true })
  await expect(liamMid).toHaveAttribute('aria-pressed', 'true')
  await liamMid.click()
  await expect(liamMid).toHaveAttribute('aria-pressed', 'false')

  await nav(page, 'Board').click()
  const cell = (await cellsOf(page, 'Liam Carter')).first()
  const original = await cell.getAttribute('data-shift')
  expect(original).not.toBe('MID')
  await selectCell(cell)
  await page.keyboard.press('m')
  await expect(cell).toHaveAttribute('data-shift', 'MID')
  await expect(cell).toHaveAttribute('data-violation', 'true')

  const problems = page.getByRole('main').getByRole('button', { name: /^\d+ problems?$/ })
  await problems.click()
  await expect(
    page.getByRole('region', { name: 'Rule breaks' }).getByRole('button', { name: /^Liam Carter is not eligible for Mid on / }),
  ).toBeVisible()
  await problems.click()

  await selectCell(cell)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(cell).toHaveAttribute('data-shift', original!)
  await expect(cell).not.toHaveAttribute('data-violation')
  await page.keyboard.press('ControlOrMeta+y')
  await expect(cell).toHaveAttribute('data-shift', 'MID')
  await expect(cell).toHaveAttribute('data-violation', 'true')
})
