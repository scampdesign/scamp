import { test, expect } from '../fixtures/app';
import type { Page } from '@playwright/test';

/**
 * Connecting the Scamp Agent's provider key. The key check is stubbed
 * through the e2e seams, so this never calls Anthropic.
 * see docs/archive/2026-10-06-builtin-agent-plan.md
 */

const openAppSettings = async (window: Page): Promise<void> => {
  await window.getByRole('button', { name: '← Projects' }).click();
  await window.getByRole('button', { name: /Settings/ }).click();
  await expect(window.getByRole('heading', { name: 'Settings' })).toBeVisible();
};

test.describe('signed out', () => {
  test('shows no AI provider section at all', async ({ window }) => {
    await openAppSettings(window);
    // The beta is for signed-in users, with no teaser for anyone else.
    await expect(window.getByRole('heading', { name: 'Privacy' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'AI provider' })).toHaveCount(0);
  });
});

test.describe('signed in, with a key the provider accepts', () => {
  test.use({ appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_VERIFY: 'accept' } });

  test('connects, then disconnects', async ({ window }) => {
    await openAppSettings(window);
    const status = window.getByTestId('ai-provider-status');
    await expect(status).toHaveText('Not connected');

    const field = window.getByLabel('Claude API key');
    await field.fill('sk-ant-e2e-key');
    await window.getByRole('button', { name: 'Connect' }).click();
    // `Connected for this session` where the OS has no keyring to encrypt
    // with — which is a CI Linux box, and the right answer there.
    await expect(status).toHaveText(/^Connected/);
    // The field is gone once connected: there is nothing to read back.
    await expect(field).toHaveCount(0);

    await window.getByRole('button', { name: 'Disconnect' }).click();
    await expect(status).toHaveText('Not connected');
  });
});

test.describe('signed in, with a key the provider rejects', () => {
  test.use({ appEnv: { SCAMP_E2E_SIGNED_IN: '1', SCAMP_E2E_AGENT_VERIFY: 'reject' } });

  test('says why, and stays not connected', async ({ window }) => {
    await openAppSettings(window);
    await window.getByLabel('Claude API key').fill('sk-ant-wrong');
    await window.getByRole('button', { name: 'Connect' }).click();
    await expect(window.getByRole('alert')).toContainText('didn’t accept that key');
    await expect(window.getByTestId('ai-provider-status')).toHaveText('Not connected');
  });
});
