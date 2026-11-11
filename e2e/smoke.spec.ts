import { test, expect } from '@playwright/test'
test('workspace opens and allows a note capture', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Your second brain, at your fingertips.')).toBeVisible()
  await page.getByRole('button', { name: /Create a note/i }).click()
  await expect(page.getByPlaceholder('Untitled note')).toBeVisible()
})
