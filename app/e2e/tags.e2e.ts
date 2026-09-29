import { expect, nav, startSample, test } from './fixtures'

test.beforeEach(async ({ page }) => {
  await startSample(page)
  await nav(page, 'Teams').click()
  await page.getByRole('link', { name: 'Tags' }).click()
  await page.getByRole('button', { name: /^Student \d+$/ }).click()
  await expect(page.getByRole('textbox', { name: 'Tag name' })).toHaveValue('Student')
})

test('a tag moves into a group and back to ungrouped', async ({ page }) => {
  const sidebar = page.getByRole('complementary')
  const group = page.getByRole('button', { name: 'Group', exact: true })
  await expect(group).toHaveText('Ungrouped')
  await expect(sidebar.getByRole('button', { name: /^Languages 1$/ })).toBeVisible()

  await group.click()
  await page.getByRole('option', { name: 'Languages' }).click()
  await expect(group).toHaveText('Languages')
  await expect(sidebar.getByRole('button', { name: /^Languages 2$/ })).toBeVisible()
  await expect(sidebar.getByRole('heading', { name: 'Ungrouped' })).toHaveCount(0)

  await group.click()
  await page.getByRole('option', { name: 'Ungrouped' }).click()
  await expect(group).toHaveText('Ungrouped')
  await expect(sidebar.getByRole('button', { name: /^Languages 1$/ })).toBeVisible()
  await expect(sidebar.getByRole('heading', { name: 'Ungrouped' })).toBeVisible()
})

test('removing one preference line keeps the others', async ({ page }) => {
  const lines = page.getByRole('main').getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Remove preference' }) })
  await expect(lines).toHaveCount(2)
  await expect(lines.nth(0).getByRole('button', { name: 'Shift' })).toHaveText('Opening')
  await expect(lines.nth(1).getByRole('button', { name: 'Shift' })).toHaveText('Mid')
  await expect(lines.nth(1).getByRole('checkbox', { name: 'Strict' })).toBeChecked()

  await lines.nth(0).getByRole('button', { name: 'Remove preference' }).click()
  await expect(lines).toHaveCount(1)
  await expect(lines.first().getByRole('button', { name: 'Shift' })).toHaveText('Mid')
  await expect(lines.first().getByRole('checkbox', { name: 'Strict' })).toBeChecked()

  // Still there after leaving the tag and coming back.
  await page.getByRole('button', { name: /^Spanish \d+$/ }).click()
  await page.getByRole('button', { name: /^Student \d+$/ }).click()
  await expect(lines).toHaveCount(1)
  await expect(lines.first().getByRole('button', { name: 'Shift' })).toHaveText('Mid')
})
