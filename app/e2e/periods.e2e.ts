import { boardCells, createPeriod, expect, openPeriods, periodTrigger, startSample, test } from './fixtures'

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

test('a new period is added after the last one and the board switches to it', async ({ page }) => {
  await startSample(page)
  const sampleLabel = (await periodTrigger(page).innerText()).split('·')[0]!.trim()
  const sampleEnd = /→ (\d{4}-\d{2}-\d{2})/.exec(await periodTrigger(page).innerText())![1]!

  await createPeriod(page, 'Next fortnight')
  await expect(periodTrigger(page)).toHaveAccessibleName(`Next fortnight · ${addDays(sampleEnd, 1)} → ${addDays(sampleEnd, 14)}`)
  await expect(page.getByRole('button', { name: /^Coverage for / })).toHaveCount(14)
  await expect(page.getByText('This period has no schedule yet')).toBeVisible()

  const list = (await openPeriods(page)).getByRole('list')
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(list.getByRole('button', { name: new RegExp(`^${sampleLabel} `) })).toBeVisible()
  await expect(list.getByRole('button', { name: /^Next fortnight / })).toBeVisible()
})

test("editing a period's label and dates updates the header and columns; a rename keeps every cell", async ({ page }) => {
  await startSample(page)
  const cells = await boardCells(page)

  let banner = await openPeriods(page)
  await banner.getByRole('button', { name: 'Edit' }).click()
  let editor = banner.getByRole('listitem')
  const start = await editor.locator('input[type=date]').first().inputValue()
  await editor.getByRole('textbox').first().fill('Q1 2024 (Draft)')
  await editor.getByRole('button', { name: 'Save' }).click()
  await expect(periodTrigger(page)).toHaveAccessibleName(new RegExp(`^Q1 2024 \\(Draft\\) · ${start} → `))
  expect(await boardCells(page)).toEqual(cells)

  banner = await openPeriods(page)
  await banner.getByRole('button', { name: 'Edit' }).click()
  editor = banner.getByRole('listitem')
  const end = addDays(start, 20)
  await editor.locator('input[type=date]').last().fill(end)
  await editor.getByRole('button', { name: 'Save' }).click()
  await expect(periodTrigger(page)).toHaveAccessibleName(`Q1 2024 (Draft) · ${start} → ${end}`)
  await expect(page.getByRole('button', { name: /^Coverage for / })).toHaveCount(21)
  // The first fortnight keeps its schedule; the added week starts empty.
  const extended = await boardCells(page)
  for (const cell of cells) expect(extended).toContain(cell)
})

test('deleting the selected period falls back to the one that starts latest', async ({ page }) => {
  await startSample(page)
  const sampleLabel = (await periodTrigger(page).innerText()).split('·')[0]!.trim()
  await createPeriod(page, 'Period B')
  await createPeriod(page, 'Period C')

  let banner = await openPeriods(page)
  await banner.getByRole('button', { name: new RegExp(`^${sampleLabel} `) }).click()
  await expect(periodTrigger(page)).toContainText(sampleLabel)

  banner = await openPeriods(page)
  await banner.getByRole('listitem').filter({ hasText: sampleLabel }).getByRole('button', { name: 'Delete period' }).click()
  await expect(banner.getByText(`Delete "${sampleLabel}"?`)).toBeVisible()
  await banner.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(periodTrigger(page)).toContainText('Period C')
  await expect(banner.getByRole('listitem')).toHaveCount(2)
  await expect(banner.getByRole('button', { name: new RegExp(`^${sampleLabel} `) })).toHaveCount(0)
})
