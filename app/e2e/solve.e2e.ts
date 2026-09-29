import {
  boardCells,
  cellsOf,
  createOrg,
  createPeriod,
  expect,
  generateAndApply,
  generateFromWizard,
  nav,
  personButton,
  selectCell,
  shiftsOf,
  startSample,
  test,
} from './fixtures'

test('Generate solves an empty period in the browser, Apply fills the board, and one undo takes it back', async ({ page }) => {
  await startSample(page)
  await createPeriod(page, 'Solver run')

  const main = page.getByRole('main')
  await expect(main.getByText('This period has no schedule yet')).toBeVisible()
  await expect(main.getByRole('button', { name: /^\d+ problems?$/ })).toBeVisible()
  await expect(main.getByRole('button', { name: /^Coverage for .*: short$/ }).first()).toBeVisible()
  const empty = await boardCells(page)
  expect(empty.every((cell) => cell.endsWith('|OFF'))).toBe(true)

  await page.getByRole('button', { name: 'Generate schedule' }).click()
  const proposal = page.getByRole('dialog', { name: 'Proposal changes' })
  await expect(proposal).toContainText(/Proposal ready\s*\d+ changes across \d+ people/, { timeout: 30_000 })
  // The proposal previews on the board before anything is committed.
  await expect(page.locator('.cd-cell[data-proposal-changed]').first()).toBeVisible()
  await proposal.getByRole('button', { name: 'Apply' }).click()
  await expect(proposal).toBeHidden()

  const solved = await boardCells(page)
  expect(solved.filter((cell) => !cell.endsWith('|OFF')).length).toBeGreaterThan(solved.length / 3)
  for (const code of ['OPEN', 'MID', 'CLOSE', 'BAKE']) {
    await expect(page.locator(`.cd-cell[data-shift="${code}"]`).first()).toBeVisible()
  }
  await expect(main.getByRole('button', { name: 'No problems' })).toBeVisible()
  await expect(main.getByRole('button', { name: /^Coverage for .*: short$/ })).toHaveCount(0)
  await expect(main.getByText('This period has no schedule yet')).toBeHidden()

  // Apply is one step on the edit history.
  await selectCell((await cellsOf(page, 'Ava Bennett')).first())
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => boardCells(page)).toEqual(empty)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(() => boardCells(page)).toEqual(solved)

  await nav(page, 'Coverage').click()
  await expect(page.getByRole('heading', { name: 'Coverage', level: 1 })).toBeVisible()
  await expect(page.getByRole('main').getByText('No gaps')).toBeVisible()
  await expect(page.getByRole('button', { name: /^OPEN on \d{4}-\d{2}-\d{2}: \d+ on duty, OK$/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /on duty, Short$/ })).toHaveCount(0)
})

test('the solver honours a tag coverage minimum set on the Tags page', async ({ page }) => {
  await startSample(page)
  await nav(page, 'Teams').click()
  await page.getByRole('link', { name: 'Tags' }).click()
  await page.getByRole('button', { name: /^Spanish \d+$/ }).first().click()
  await expect(page.getByRole('textbox', { name: 'Tag name' })).toHaveValue('Spanish')

  // The People list comes first on the tag page, so its "Remove <name>" buttons lead.
  const peopleHeading = await page.getByRole('heading', { name: /^People \(\d+\)$/ }).innerText()
  const holderCount = Number(/\((\d+)\)/.exec(peopleHeading)![1])
  expect(holderCount).toBeGreaterThan(1)
  const names = (
    await page
      .getByRole('main')
      .getByRole('button', { name: /^Remove / })
      .evaluateAll((els) => els.map((el) => (el.getAttribute('aria-label') ?? '').replace(/^Remove /, '')))
  ).slice(0, holderCount)

  // Coverage lists shifts in catalogue order, so the first Minimum is OPEN's.
  const openMin = page.getByRole('main').getByRole('textbox', { name: 'Minimum' }).first()
  await openMin.fill('1')
  await openMin.press('Tab')
  await expect(openMin).toHaveValue('1')

  await nav(page, 'Board').click()
  await createPeriod(page, 'Spanish mornings')
  const problems = page.getByRole('main').getByRole('button', { name: /^\d+ problems?$/ })
  await problems.click()
  await expect(
    page.getByRole('region', { name: 'Rule breaks' }).getByRole('button', { name: /^Spanish: Open on .* needs at least 1 person/ }).first(),
  ).toBeVisible()
  await problems.click()
  await expect(page.getByRole('region', { name: 'Rule breaks' })).toBeHidden()
  await generateAndApply(page)
  await expect(page.getByRole('main').getByRole('button', { name: 'No problems' })).toBeVisible()

  const perPerson = await Promise.all(names.map((name) => shiftsOf(page, name)))
  const days = perPerson[0]!.length
  for (let day = 0; day < days; day++) {
    expect(
      perPerson.some((shifts) => shifts[day] === 'OPEN'),
      `a Spanish speaker opens on day ${day + 1}`,
    ).toBe(true)
  }
})

test('minimum rest carries across periods: nobody who closes period 1 on NIGHT starts period 2 on EARLY', async ({ page }) => {
  const crew = ['Ada Ames', 'Ben Bell', 'Cai Cole', 'Dee Dunn', 'Eli Eyre', 'Fay Fox', 'Gus Gray', 'Hal Hunt']
  await createOrg(page, 'Ward Trust', 'Ward 7')
  await page.getByRole('button', { name: /^24\/7 ward/ }).click()
  await page.getByRole('textbox', { name: /Anna Bauer/ }).fill(crew.map((name) => `${name}, Ward`).join('\n'))
  await page.getByRole('button', { name: 'Continue' }).click()
  await generateFromWizard(page)

  // Put the first six on NIGHT for the last day: select the column range, type N.
  const nightCrew = crew.slice(0, 6)
  await selectCell((await cellsOf(page, nightCrew[0]!)).last())
  for (let i = 1; i < nightCrew.length; i++) await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('n')
  for (const name of nightCrew) await expect((await cellsOf(page, name)).last()).toHaveAttribute('data-shift', 'NIGHT')

  await createPeriod(page, 'Period 2')
  await generateAndApply(page)
  for (const name of nightCrew) {
    await expect(personButton(page, name)).toBeVisible()
    await expect((await cellsOf(page, name)).first(), `${name}'s first day`).not.toHaveAttribute('data-shift', 'EARLY')
  }
  // Somebody still opens: the two who rested cover the first EARLY.
  const firstDay = await Promise.all(crew.map(async (name) => (await cellsOf(page, name)).first().getAttribute('data-shift')))
  expect(firstDay).toContain('EARLY')
})
