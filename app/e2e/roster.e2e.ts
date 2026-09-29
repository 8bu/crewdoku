import { expect, nav, personButton, startSample, test } from './fixtures'

test('a person added on the Roster shows up on the board under their team', async ({ page }) => {
  await startSample(page)
  await expect(page.getByRole('main').getByRole('button', { name: /^Kitchen \d+$/ })).toHaveText(/7$/)

  await nav(page, 'Roster').click()
  await expect(page.getByText('18 people')).toBeVisible()
  await page.getByRole('button', { name: 'Add person' }).click()
  // The new, empty row joins the Unassigned group at the bottom and takes focus.
  const nameField = page.getByRole('textbox', { name: 'Name' }).last()
  await expect(nameField).toBeFocused()
  await expect(nameField).toHaveValue('')
  await nameField.fill('Zara Quinn')
  const row = page.getByRole('row', { name: /^Zara Quinn / })
  await row.getByRole('button', { name: 'Unassigned' }).click()
  await page.getByRole('option', { name: 'Kitchen' }).click()
  await expect(row.getByRole('button', { name: 'Kitchen' })).toBeVisible()
  await expect(page.getByText('19 people')).toBeVisible()

  await nav(page, 'Board').click()
  await expect(personButton(page, 'Zara Quinn')).toBeVisible()
  await expect(page.getByRole('main').getByRole('button', { name: /^Kitchen \d+$/ })).toHaveText(/8$/)
})

test('a shift chip in the roster toggles eligibility off and back on', async ({ page }) => {
  await startSample(page)
  await nav(page, 'Roster').click()
  const chip = page.getByRole('row', { name: /^Hana Sato / }).getByRole('button', { name: 'CLOSE', exact: true })
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'false')
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
})

test("removing a person drops their team's member count", async ({ page }) => {
  await startSample(page)
  await nav(page, 'Teams').click()
  const sidebar = page.getByRole('complementary')
  await expect(sidebar.getByRole('button', { name: 'Front of house 7' })).toBeVisible()

  await nav(page, 'Roster').click()
  await page.getByRole('button', { name: 'Remove Ava Bennett' }).click()
  await expect(page.getByRole('row', { name: /^Ava Bennett / })).toHaveCount(0)
  await expect(page.getByText('17 people')).toBeVisible()

  await nav(page, 'Teams').click()
  await expect(sidebar.getByRole('button', { name: 'Front of house 6' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'People (6)' })).toBeVisible()
})
