import { expect, test } from 'e2e';

// The first thing a broken build gets wrong: the app must start and render the
// cookbook home with the first-launch seed (db/seed.ts).
test('opens on the cookbook home', { tags: ['smoke'] }, async ({ app, screen }) => {
  await app.open();
  await expect(screen.getByRole('heading', 'KeepTaste')).toBeVisible({ timeout: 30_000 });
  await expect(screen.getByRole('button', 'All recipes')).toBeVisible();
  await expect(screen.getByRole('button', 'Breakfasts')).toBeVisible();
  await expect(screen.getByRole('button', 'Add recipe')).toBeVisible();
});
