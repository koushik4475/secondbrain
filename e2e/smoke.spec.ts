import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('captures a note, tags it, and keeps it after reload', async ({ page }) => {
  await expect(page.getByText('Your second brain, at your fingertips.')).toBeVisible()
  await page.screenshot({ path: 'docs/screenshots/workspace.png', fullPage: true })
  await page.getByRole('button', { name: /Create a note/i }).click()
  await page.getByLabel('Note title').fill('E2E offline capture')
  await page.locator('.cm-content').fill('A durable thought for the smoke test.')
  await page.getByLabel('Add tag').fill('automation')
  await page.getByLabel('Add tag').press('Enter')
  await expect(page.getByRole('status')).toContainText('Saved')
  await page.reload()
  await page.getByLabel('Search notes').fill('E2E offline capture')
  await expect(page.getByRole('button', { name: /E2E offline capture/i })).toBeVisible()
  await page.getByLabel('Filter by tag').selectOption('automation')
  await expect(page.getByRole('button', { name: /E2E offline capture/i })).toBeVisible()
})

test('command palette creates a code note with a safe read-only preview', async ({ page }) => {
  await page.getByRole('button', { name: 'Open command palette' }).click()
  await page.getByLabel('Search commands').fill('Create a code snippet')
  await page.getByRole('button', { name: /Create a code snippet/ }).click()
  await expect(page.getByLabel('Note type')).toHaveValue('code')
  await page.locator('.cm-content').fill('const answer: number = 42')
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByText('Code is highlighted but never executed')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy code' })).toBeVisible()
})

test('bookmark URL is restricted to HTTP and HTTPS and preview blocks raw HTML', async ({ page }) => {
  await page.getByRole('button', { name: /Create a note/i }).click()
  await page.getByLabel('Note title').fill('Safe bookmark and Markdown')
  await page.getByLabel('Note type').selectOption('bookmark')
  await page.getByLabel('Bookmark URL').fill('javascript:alert(1)')
  await page.getByLabel('Bookmark URL').blur()
  await expect(page.getByLabel('Bookmark URL')).toHaveValue('')
  await expect(page.getByRole('alert')).toContainText('Only valid HTTP or HTTPS')
  await page.getByLabel('Note type').selectOption('note')
  await page.locator('.cm-content').fill('<script>window.pwned = true</script>\n\n![remote](https://example.com/image.png)')
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.locator('.markdown-preview script')).toHaveCount(0)
  await expect(page.locator('.markdown-preview img')).toHaveCount(0)
})

test('imports Markdown as a new note', async ({ page }) => {
  await page.getByRole('button', { name: /Settings & help/i }).click()
  await page.locator('input[aria-label="Import Markdown file"]').setInputFiles({
    name: 'field-notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(['# Imported field notes', '', 'A note from a portable Markdown file.'].join('\n'))
  })
  await expect(page.getByLabel('Note title')).toHaveValue('Imported field notes')
  await expect(page.locator('.cm-content')).toContainText('A note from a portable Markdown file.')
})

test('serves the installed application shell offline after first load', async ({ page, context }) => {
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) await navigator.serviceWorker.ready
  })
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), { timeout: 15000 })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('Your second brain, at your fingertips.')).toBeVisible()
  await context.setOffline(false)
})
