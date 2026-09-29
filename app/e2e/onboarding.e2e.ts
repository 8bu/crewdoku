import {
  boardCells,
  createOrg,
  expect,
  generateFromWizard,
  nav,
  personButton,
  startSample,
  test,
  waitForAutosave,
} from './fixtures'

test.describe('first visit', () => {
  test.use({ seenIntro: false })

  test('lands on onboarding; the sample opens an auto-solved board that survives a reload', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Create your organization' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Surfaces' })).toHaveCount(0)

    await page.getByRole('button', { name: 'See a sample schedule' }).click()
    await expect(page).toHaveURL(/\/board$/)

    const tour = page.getByRole('dialog', { name: 'Welcome to Crewdoku' })
    await expect(tour).toBeVisible()
    await tour.getByRole('button', { name: 'Close' }).click()
    await expect(tour).toBeHidden()

    await expect(page.getByRole('button', { name: 'Workspace' })).toHaveText('Harbour Bakehouse')
    for (const team of ['Front of house', 'Kitchen', 'Bakery']) {
      await expect(page.getByRole('main').getByRole('button', { name: new RegExp(`^${team} \\d+$`) })).toBeVisible()
    }
    for (const person of ['Ava Bennett', 'Hana Sato', 'Alice Fontaine']) {
      await expect(personButton(page, person)).toBeVisible()
    }
    // Auto-solved: every shift in the catalogue is on the board, and nothing is broken.
    for (const code of ['OPEN', 'MID', 'CLOSE', 'BAKE']) {
      await expect(page.locator(`.cd-cell[data-shift="${code}"]`).first()).toBeVisible()
    }
    await expect(page.getByRole('button', { name: 'No problems' })).toBeVisible()

    const solved = await boardCells(page)
    await waitForAutosave(page, 'Harbour Bakehouse')
    await page.reload()
    await expect(personButton(page, 'Ava Bennett')).toBeVisible()
    await expect.poll(() => boardCells(page)).toEqual(solved)
    await expect(page.getByRole('button', { name: 'No problems' })).toBeVisible()
  })
})

test('the setup wizard turns a pasted team into a generated schedule', async ({ page }) => {
  await createOrg(page, 'Corner Shop Ltd', 'High Street')
  await page.getByRole('button', { name: /^Retail store/ }).click()

  await page
    .getByRole('textbox', { name: /Anna Bauer/ })
    .fill(['Anna Bauer, Front desk', 'Ben Keller, Front desk', 'Eve Lin, Front desk', 'Chloe Martin, Stock', 'Dan Ortiz, Stock', 'Finn Hale, Stock'].join('\n'))
  await expect(page.getByText('6 people · 2 teams')).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: 'Ready to generate' })).toBeVisible()
  await generateFromWizard(page)
  await expect(page.getByRole('button', { name: 'Workspace' })).toHaveText('High Street')
  for (const person of ['Anna Bauer', 'Finn Hale']) await expect(personButton(page, person)).toBeVisible()
  await expect(page.locator('.cd-cell[data-shift="OPEN"]').first()).toBeVisible()
  await expect(page.locator('.cd-cell[data-shift="CLOSE"]').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'No problems' })).toBeVisible()
})

test('the Office week template needs nobody on weekends', async ({ page }) => {
  await createOrg(page, 'Desk Co', 'HQ')
  await page.getByRole('button', { name: /^Office week/ }).click()
  await page.getByRole('textbox', { name: /Anna Bauer/ }).fill('Ann One\nBob Two\nCid Three')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Go to the board without generating' }).click()

  await nav(page, 'Coverage').click()
  const cells = page.getByRole('button', { name: /^DAY on \d{4}-\d{2}-\d{2}:/ })
  await expect(cells.first()).toBeVisible()
  const labels = await cells.evaluateAll((els) => els.map((el) => [el.getAttribute('aria-label') ?? '', el.textContent ?? '']))
  expect(labels.length).toBeGreaterThanOrEqual(7)
  for (const [label, text] of labels) {
    const iso = /on (\d{4}-\d{2}-\d{2})/.exec(label!)![1]!
    const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay()
    // The cell reads "<on duty> <min>–<max>": weekends target 0–0 and are fine empty.
    if (weekday === 0 || weekday === 6) {
      expect(text, iso).toMatch(/0–0$/)
      expect(label, iso).toMatch(/OK$/)
    } else {
      expect(text, iso).not.toMatch(/0–0$/)
      expect(label, iso).toMatch(/Short$/)
    }
  }
})

test('leaving an organization and coming back lands on its workspace; an empty one asks for a workspace', async ({ page }) => {
  await startSample(page)

  await page.getByRole('button', { name: 'Switch organization' }).click()
  await expect(page.getByRole('heading', { name: 'Choose an organization' })).toBeVisible()
  await page.getByRole('button', { name: 'Add organization' }).click()
  await page.getByRole('textbox', { name: 'Organization' }).fill('Empty Org')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Create a workspace' })).toBeVisible()
  await expect(page.getByText('Name a workspace in Empty Org.')).toBeVisible()

  await page.getByRole('button', { name: 'Back to organizations' }).click()
  await page.getByRole('button', { name: /Harbour & Co\./ }).click()
  await expect(page.getByRole('button', { name: 'Workspace' })).toHaveText('Harbour Bakehouse')
  await expect(personButton(page, 'Ava Bennett')).toBeVisible()

  await page.getByRole('button', { name: 'Switch organization' }).click()
  await page.getByRole('button', { name: /Empty Org/ }).click()
  await expect(page.getByRole('heading', { name: 'Create a workspace' })).toBeVisible()
})
