import { readFileSync } from 'node:fs'
import { expect, nav, openPeriods, shiftsOf, startSample, test } from './fixtures'
import type { Page } from '@playwright/test'

async function download(page: Page, format: 'CSV' | 'XLSX') {
  await page.getByRole('button', { name: format, exact: true }).click()
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: `Download ${format}` }).click()])
  return file
}

async function openTeamGridExport(page: Page, periodLabel: string) {
  await nav(page, 'Export').click()
  await page.getByRole('button', { name: new RegExp(`^${periodLabel.replace(/[()]/g, '\\$&')} applied schedule`) }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: /^Team grid/ }).click()
  await page.getByRole('button', { name: 'Next' }).click()
}

test('the team-grid CSV download holds the board: names, teams, dates, and shift codes', async ({ page }) => {
  await startSample(page)
  const avaShifts = await shiftsOf(page, 'Ava Bennett')
  await openTeamGridExport(page, 'Sample fortnight')
  const csv = await download(page, 'CSV')
  expect(csv.suggestedFilename()).toBe('crewdoku-sample-fortnight-team-grid.csv')

  const lines = readFileSync(await csv.path(), 'utf8').trim().split('\n')
  const header = lines[0]!.split(',')
  expect(header.slice(0, 2)).toEqual(['name', 'team'])
  expect(header.length).toBe(2 + avaShifts.length)
  expect(header[2]).toMatch(/^\d{4}-\d{2}-\d{2}$/)

  const ava = lines.find((line) => line.startsWith('Ava Bennett,'))!.split(',')
  expect(ava[1]).toBe('Front of house')
  // A day off exports as an empty cell.
  expect(ava.slice(2)).toEqual(avaShifts.map((code) => (code === 'OFF' ? '' : code)))
  for (const name of ['Hana Sato', 'Alice Fontaine', 'Kwame Mensah']) expect(lines.some((line) => line.startsWith(`${name},`))).toBe(true)
  const codes = new Set(lines.slice(1).flatMap((line) => line.split(',').slice(2)))
  for (const code of ['OPEN', 'MID', 'CLOSE', 'BAKE']) expect(codes).toContain(code)
})

test('export file names slug the period label', async ({ page }) => {
  await startSample(page)
  const banner = await openPeriods(page)
  await banner.getByRole('button', { name: 'Edit' }).click()
  await banner.getByRole('listitem').getByRole('textbox').first().fill('Q1 2024 (Draft)')
  await banner.getByRole('listitem').getByRole('button', { name: 'Save' }).click()
  await page.keyboard.press('Escape')

  await openTeamGridExport(page, 'Q1 2024 (Draft)')
  expect((await download(page, 'CSV')).suggestedFilename()).toBe('crewdoku-q1-2024-draft-team-grid.csv')
  expect((await download(page, 'XLSX')).suggestedFilename()).toBe('crewdoku-q1-2024-draft-team-grid.xlsx')
})
