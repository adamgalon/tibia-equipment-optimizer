import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('lang', 'en'); });
  await page.reload();
});

test('catalog, build totals, hunt advisor and share link work together', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /\d{3,} items/ })).toBeVisible();

  // Equip a helmet: its armor shows up in the totals.
  await page.getByRole('group', { name: 'Helmet' }).getByRole('combobox').first().selectOption({ label: 'Spiritthorn Helmet (400)' });
  await expect(page.locator('.build .totals').getByRole('row', { name: /^Armor/ })).toContainText('12');

  // Add a creature by name: damage, attack elements and loot per kill appear.
  await page.getByLabel('Add creature').fill('Demon');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const hunt = page.locator('.hunt');
  await expect(hunt.getByRole('row', { name: /^fire/ })).toContainText('250');
  await expect(hunt.getByRole('row', { name: /^Demon/ })).toContainText('6,000');
  // Spiritthorn Helmet's 12 armor takes about 8.5 off Demon's 500 physical hit; its 6% physical protection comes first.
  await expect(hunt.getByRole('row', { name: /^physical/ })).toContainText('462');
  await hunt.getByLabel('Kills per hour').fill('200');
  await expect(hunt.getByRole('row', { name: /^Experience per hour/ })).toContainText('1,200,000');
  await hunt.getByLabel(/Stamina bonus/).check();
  await expect(hunt.getByRole('row', { name: /^Experience per hour/ })).toContainText('1,800,000');
  await expect(hunt.getByRole('row', { name: /^Profit per hour/ })).toBeVisible();

  // The optimizer needs one vocation; then it changes the build and keeps the old one under Saved builds.
  await hunt.getByRole('button', { name: 'Optimize my build for this hunt' }).click();
  await expect(hunt.getByText(/Pick your vocation/)).toBeVisible();
  await page.locator('.filters select').first().selectOption('knight');
  await hunt.getByRole('button', { name: 'Optimize my build for this hunt' }).click();
  await expect(hunt.getByText(/^Changed /)).toBeVisible();
  await expect(page.locator('.saved')).toContainText('Before optimizing');

  // A share link carries the build.
  await page.getByRole('button', { name: 'Copy link to this build' }).click();
  await expect(page.getByLabel('Link to this build')).toHaveValue(/#build=[\w-]+$/);
});

test('sections hide and stay hidden, and weapons show their proficiency perks', async ({ page }) => {
  const build = page.locator('.build');
  await build.getByRole('button', { name: 'Hide' }).click();
  await expect(page.locator('#build-body')).toBeHidden();
  await page.reload();
  await expect(page.locator('#build-body')).toBeHidden();
  await build.getByRole('button', { name: 'Show' }).click();
  await expect(page.locator('#build-body')).toBeVisible();

  await page.getByLabel('Search item').fill('Soulcutter');
  const row = page.locator('.items tbody tr').filter({ hasText: 'Soulcutter' }).first();
  await row.getByText('Proficiency perks').click();
  await expect(row.locator('.perks')).toContainText('+1 Sword Fighting');
  await row.getByRole('button', { name: /Add Soulcutter/ }).click();
  await expect(page.locator('.compare-table').getByRole('row', { name: /^Proficiency 1/ })).toContainText('+1 Sword Fighting');
});

test('the page never scrolls sideways', async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
