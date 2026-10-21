import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { staticHost } from '../helpers/static-host';

test('a fresh static install gates GFL stories before requesting unavailable chapter files', async ({
  page,
}) => {
  const host = await staticHost();
  try {
    await page.goto(host.origin + '/library');
    await expect(
      page.locator('.game-card').filter({ hasText: "Girls' Frontline 2" }),
    ).toContainText('DOWNLOADER PENDING');
    await expect(page.locator('.first-story')).not.toContainText(
      "Girls' Frontline",
    );
    const gfl1 = JSON.parse(
      fs.readFileSync('src/generated/gfl1-catalog.json', 'utf8'),
    )[0];
    const gfl2 = JSON.parse(
      fs.readFileSync('src/generated/gfl2-event.json', 'utf8'),
    ).sections[0];
    await page.goto(host.origin + '/manage?game=gfl1');
    const pending = page.locator('.download-item').filter({
      has: page.getByRole('link', { name: gfl1.title, exact: true }),
    });
    await expect(pending).toContainText('Downloader not available yet');
    await expect(pending.getByRole('button')).toBeDisabled();
    await expect(pending.getByRole('checkbox')).toBeDisabled();
    await expect(
      page.getByRole('checkbox', { name: 'Select all visible episodes' }),
    ).toBeDisabled();
    expect(
      host.privateRequests.filter((url) => /^\/private\/gfl[12][/-]/.test(url)),
    ).toEqual([]);
    for (const [game, episode] of [
      ['gfl1', gfl1],
      ['gfl2', gfl2],
    ] as const) {
      const before = host.privateRequests.length;
      await page.goto(host.origin + `/read/${game}/${episode.id}`);
      await expect(
        page.getByRole('heading', { name: 'Downloader pending', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Retry chapter' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Download story', exact: true }),
      ).toHaveCount(0);
      expect(
        host.privateRequests
          .slice(before)
          .filter((url) =>
            /(?:chapter|story|text|scenes?)\.(?:json|txt)/.test(url),
          ),
      ).toEqual([]);
    }
  } finally {
    await host.close();
  }
});
