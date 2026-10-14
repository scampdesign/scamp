import { test, expect } from '../fixtures/app';

/**
 * The signed-out start screen. An account is optional, so the only thing
 * this must guarantee is that the control is present, quiet, and does not
 * interfere with using Scamp without one.
 *
 * The sign-in gesture itself opens a real browser, so it is not driven
 * here — that flow is covered end to end against the real backend in
 * test/integration/desktopAuthLive.integration.test.ts.
 * see docs/archive/2026-08-28-electron-sign-in-plan.md
 */
/** The fixture boots into a project, so step back to the start screen. */
const toStartScreen = async (window: Parameters<typeof expect>[0] extends never ? never : any): Promise<void> => {
  await window.getByRole('button', { name: '← Projects' }).click();
  await expect(window.getByTestId('account-panel')).toBeVisible();
};

test.describe('start screen: account', () => {
  test('offers sign-in without demanding it', async ({ window }) => {
    await toStartScreen(window);
    const signIn = window.getByTestId('sign-in-button');
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveText('Sign in');
    // Signed out is the resting state: no error, nothing to dismiss.
    await expect(window.getByTestId('sign-out-button')).toHaveCount(0);
  });

  test('sits alongside the normal start screen, blocking nothing', async ({
    window,
  }) => {
    // The point of the feature being optional. Deliberately does not
    // assert the New Project button is ENABLED — that depends on whether a
    // default projects folder is configured, which has nothing to do with
    // being signed in, and asserting it here would tie an auth test to
    // unrelated settings state.
    await toStartScreen(window);
    await expect(window.getByRole('button', { name: 'New Project' })).toHaveCount(1);
    await expect(window.getByRole('heading', { name: 'Scamp', exact: true })).toBeVisible();
  });
});
