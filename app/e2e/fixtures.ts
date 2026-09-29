import { expect, test as base, type Locator, type Page } from '@playwright/test'

/**
 * Shared test fixture. Every test gets a fresh browser context, so IndexedDB
 * and localStorage start empty. By default the product tour and the wizard's
 * coach are marked as already seen, so their overlays never cover the control
 * a test is about to click; the first-run spec turns that off to see them.
 */
export const test = base.extend<{ seenIntro: boolean }>({
  seenIntro: [true, { option: true }],
  context: async ({ context, seenIntro }, use) => {
    if (seenIntro) {
      await context.addInitScript(() => {
        localStorage.setItem('crewdoku-tour-seen', '1')
        localStorage.setItem('crewdoku-wizard-coach-seen', '1')
      })
    }
    await use(context)
  },
})

export { expect }

export function nav(page: Page, name: string): Locator {
  return page.getByRole('navigation', { name: 'Surfaces' }).getByRole('link', { name, exact: true })
}

export function personButton(page: Page, name: string): Locator {
  return page.getByRole('button', { name: `Open ${name}'s details`, exact: true })
}

/** First-run "See a sample schedule": a seeded, auto-solved workspace. */
export async function startSample(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'See a sample schedule' }).click()
  await expect(page.getByRole('button', { name: 'Regenerate schedule' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'No problems' })).toBeVisible()
}

/** Creates an org and a workspace from the first-run screen, landing on the setup wizard. */
export async function createOrg(page: Page, org: string, workspace: string): Promise<void> {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Organization' }).fill(org)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('textbox', { name: 'Workspace' }).fill(workspace)
  await page.getByRole('button', { name: 'Create workspace' }).click()
  await expect(page.getByRole('heading', { name: 'How does your company work?' })).toBeVisible()
}

/** The wizard's last step: generate, then dismiss the product tour it always starts. */
export async function generateFromWizard(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Generate my first schedule' }).click()
  const tour = page.getByRole('dialog', { name: 'Welcome to Crewdoku' })
  await expect(tour).toBeVisible({ timeout: 30_000 })
  await tour.getByRole('button', { name: 'Close' }).click()
  await expect(tour).toBeHidden()
  await expect(page.getByRole('button', { name: 'Regenerate schedule' })).toBeVisible()
}

/** Board cells for one person, left to right. The board is a CSS grid, so cells are found by the person id the name button carries. */
export async function cellsOf(page: Page, name: string): Promise<Locator> {
  const id = await personButton(page, name).getAttribute('data-person-id')
  expect(id, `person id for ${name}`).toBeTruthy()
  return page.locator(`.cd-cell[data-person-id="${id}"]`)
}

export async function shiftsOf(page: Page, name: string): Promise<string[]> {
  return (await cellsOf(page, name)).evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.shift ?? ''))
}

/** Every board cell as `personId|date|code`, for before/after comparisons. */
export function boardCells(page: Page): Promise<string[]> {
  return page
    .locator('.cd-cell[data-person-id]')
    .evaluateAll((els) =>
      els.map((el) => {
        const d = (el as HTMLElement).dataset
        return `${d.personId}|${d.dateIso}|${d.shift}`
      }),
    )
}

export function periodTrigger(page: Page): Locator {
  return page.getByRole('banner').getByRole('button').first()
}

export async function openPeriods(page: Page): Promise<Locator> {
  const trigger = periodTrigger(page)
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  const banner = page.getByRole('banner')
  await expect(banner.getByRole('button', { name: 'New period' })).toBeVisible()
  return banner
}

/** Adds an empty period after the last one; the board switches to it. */
export async function createPeriod(page: Page, label: string): Promise<void> {
  const banner = await openPeriods(page)
  await banner.getByRole('button', { name: 'New period' }).click()
  await banner.getByRole('textbox', { name: 'Sep rotation' }).fill(label)
  await banner.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(periodTrigger(page)).toContainText(label)
  await page.keyboard.press('Escape')
}

/** Runs the real HiGHS solver from the board and applies its proposal. */
export async function generateAndApply(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^(Generate|Regenerate) schedule$/ }).click()
  const proposal = page.getByRole('dialog', { name: 'Proposal changes' })
  await expect(proposal).toContainText('Proposal ready', { timeout: 30_000 })
  await proposal.getByRole('button', { name: 'Apply' }).click()
  await expect(proposal).toBeHidden()
}

/** Moves the board's keyboard selection onto a cell and focuses the cell editor. */
export async function selectCell(cell: Locator): Promise<void> {
  await cell.click()
  await expect(cell.page().getByRole('textbox', { name: 'Board cell editor' })).toBeFocused()
}

/** Everything the app holds in IndexedDB, as one string. */
function dumpIndexedDb(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const request = <T>(req: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    const out: unknown[] = []
    for (const { name } of await indexedDB.databases()) {
      if (!name) continue
      const db = await request(indexedDB.open(name))
      for (const store of Array.from(db.objectStoreNames)) {
        out.push(await request(db.transaction(store).objectStore(store).getAll()))
      }
      db.close()
    }
    return JSON.stringify(out)
  })
}

/**
 * Waits until the app's debounced autosave has written: IndexedDB contains
 * `marker` (when given) and stops changing across a few polls. Reloading
 * earlier could drop the last edit, as it would for a real user.
 */
export async function waitForAutosave(page: Page, marker?: string): Promise<void> {
  let previous = ''
  let stableFor = 0
  await expect
    .poll(
      async () => {
        const dump = await dumpIndexedDb(page)
        stableFor = dump === previous ? stableFor + 1 : 0
        previous = dump
        return (marker === undefined || dump.includes(marker)) && stableFor >= 2
      },
      { intervals: [300], timeout: 15_000, message: 'autosave to IndexedDB' },
    )
    .toBe(true)
}
