import { expect, nav, startSample, test } from './fixtures'

test('switching the UI language translates the app and survives a reload', async ({ page }) => {
  await startSample(page)
  await nav(page, 'Settings').click()
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'UI language: English' }).click()
  await page.getByRole('option', { name: 'Español' }).click()

  await expect(page.getByRole('heading', { name: 'Ajustes', level: 1 })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Pantallas' }).getByRole('link', { name: 'Tablero' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Idioma de la interfaz: Español' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ajustes', level: 1 })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Pantallas' }).getByRole('link', { name: 'Personal' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toHaveCount(0)
})
