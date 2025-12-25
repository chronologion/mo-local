import { test, expect, type Locator } from '@playwright/test';
import { randomUUID } from 'crypto';

const selectOption = async (params: {
  trigger: Locator;
  optionName: string | RegExp;
}): Promise<void> => {
  const { trigger, optionName } = params;
  await trigger.click();
  await trigger.page().getByRole('option', { name: optionName }).click();
};

test.describe('goal achievement', () => {
  test('auto-achieves when all linked projects are completed (no reload)', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        // Surface browser console errors in the Playwright output.
        console.error(`[browser:${msg.type()}] ${msg.text()}`);
      }
    });
    page.on('pageerror', (error) => {
      console.error(`[pageerror] ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
    });

    const password = `T3st-${randomUUID()}`;
    const goalSummary = `Goal ${Date.now()}`;

    await page.goto('/');

    await page.getByText('Set up your local identity').waitFor();
    await page.getByPlaceholder('Create a passphrase').fill(password);
    await page.getByPlaceholder('Repeat passphrase').fill(password);
    await page.getByRole('button', { name: 'Finish onboarding' }).click();

    const loadingIdentity = page.getByText('Loading identity…');
    await loadingIdentity
      .waitFor({ state: 'hidden', timeout: 25_000 })
      .catch(() => undefined);

    const unlockButton = page.getByRole('button', { name: 'Unlock' });
    if (await unlockButton.isVisible()) {
      await page.getByRole('textbox').fill(password);
      await unlockButton.click();
    }

    await page.getByRole('tab', { name: 'Goals' }).waitFor();

    await page.getByRole('button', { name: 'New goal' }).click();
    await page.getByPlaceholder('Define a concrete goal').fill(goalSummary);
    await page.getByRole('button', { name: 'Create goal' }).click();

    await page.getByRole('tab', { name: 'Projects' }).click();

    const createProject = async (name: string) => {
      await page.getByRole('button', { name: 'New project' }).click();
      await page.getByPlaceholder('Project name').fill(name);
      // Linked Goal (optional) select
      const dialog = page.getByRole('dialog', { name: 'Create project' });
      await dialog.waitFor();
      const goalSelect = dialog
        .getByText('Linked Goal (optional)')
        .locator('..')
        .getByRole('combobox');
      await selectOption({ trigger: goalSelect, optionName: goalSummary });
      await page.getByRole('button', { name: 'Create Project' }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    };

    await createProject('Project One');
    await createProject('Project Two');

    const setProjectStatus = async (
      projectName: string,
      status: 'Planned' | 'In progress' | 'Completed' | 'Canceled'
    ) => {
      const card = page.locator('div.rounded-xl', {
        has: page.getByText(projectName, { exact: true }),
      });
      const trigger = card.getByRole('combobox');
      await trigger.click();
      const listbox = page.getByRole('listbox');
      await expect(listbox).toBeVisible();
      await listbox.getByRole('option', { name: status }).click();
      await expect(trigger).toContainText(status, { timeout: 10_000 });
    };

    await setProjectStatus('Project One', 'Completed');
    await setProjectStatus('Project Two', 'Completed');

    await page.getByRole('tab', { name: 'Goals' }).click();
    const goalCard = page.locator('div.rounded-xl', {
      has: page.getByText(goalSummary, { exact: true }),
    });
    await expect(goalCard.getByText('Achieved')).toBeVisible({
      timeout: 25_000,
    });
  });
});
