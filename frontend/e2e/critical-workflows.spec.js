import { expect, test } from '@playwright/test';

test('admin can log in, manage a busy period, and switch calendar views', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Nazwa użytkownika').fill('admin');
  await page.getByPlaceholder('Hasło').fill('admin123');
  await page.getByRole('button', { name: 'Zaloguj' }).click();
  await expect(page.getByText('Planowanie wydarzeń')).toBeVisible();
  const busyForm = page.locator('.slot-form');
  await busyForm.getByLabel('Od').fill('2026-06-10');
  await busyForm.getByLabel('Do').fill('2026-06-12');
  await page.getByRole('button', { name: 'Dodaj', exact: true }).click();
  await expect(page.getByText('10.06.2026 - 12.06.2026')).toBeVisible();
  await page.getByRole('button', { name: 'Rok' }).click();
  await expect(page.getByRole('button', { name: 'styczeń' })).toBeVisible();
});
