import { expect, test } from '@playwright/test';
import { nip19 } from 'nostr-tools';
import { injectTestLogin } from '../fixtures/login';
import { NetworkMonitor } from '../fixtures/network';

const DEFAULT_TIMEOUT = 20_000;

function attachMonitor(page: import('@playwright/test').Page): NetworkMonitor {
  const monitor = new NetworkMonitor({ tolerateRelayErrors: true });
  monitor.attach(page);
  return monitor;
}

test.describe('smoke', () => {
  test('logged-out landing page renders', async ({ page }) => {
    const monitor = attachMonitor(page);
    await page.goto('/', { waitUntil: 'load' });

    // LandingPage has both an h1 hero and an h2 feature card named '₿AO Fund' — target the h1 (strict mode).
    await expect(page.getByRole('heading', { name: '₿AO Fund', level: 1 })).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await expect(page.getByRole('button', { name: 'Join ₿AO Fund' })).toBeVisible();

    monitor.assertNoFailures();
  });

  test('logged-in root redirects to chat', async ({ page }) => {
    const monitor = attachMonitor(page);
    await injectTestLogin(page);
    await page.goto('/', { waitUntil: 'load' });

    await page.waitForURL('**/chat', { timeout: DEFAULT_TIMEOUT });
    expect(page.url()).toContain('/chat');

    monitor.assertNoFailures();
  });

  test('profile routing renders the users own profile', async ({ page }) => {
    const monitor = attachMonitor(page);
    const login = await injectTestLogin(page);
    const npub = nip19.npubEncode(login.pubkey);

    await page.goto(`/${npub}`, { waitUntil: 'load' });
    await expect(page.getByText('This is you.')).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    monitor.assertNoFailures();
  });

  test('mobile drawer opens and shows navigation items', async ({ page }) => {
    const monitor = attachMonitor(page);
    await injectTestLogin(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/chat', { waitUntil: 'load' });

    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Navigation menu' });
    await expect(drawer).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    // Spot-check the standalone sidebar items (scoped to the drawer to avoid
    // duplicates from the desktop sidebar and mobile bottom nav).
    await expect(drawer.getByRole('link', { name: '₿AO CHAT' })).toBeVisible();
    await expect(drawer.getByRole('link', { name: '₿AO FUND' })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'PETS' })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'WALLET' })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'SETTINGS' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();

    monitor.assertNoFailures();
  });
});
