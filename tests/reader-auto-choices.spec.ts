import { expect, test } from '@playwright/test';
import { emptyData } from '../src/model';

test.beforeEach(async ({ page }) => {
  const data = emptyData();
  Object.assign(data.preferences, {
    textSpeed: 0,
    voiceVolume: 0,
    musicVolume: 0,
    soundVolume: 0,
    autoDelay: 2,
    layout: 'text',
  });
  await page.addInitScript(
    (value) => localStorage.setItem('onlystory.v1', JSON.stringify(value)),
    data,
  );
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
});

test('auto carries into choices, waits the configured delay, then saves the first displayed answer', async ({
  page,
}) => {
  await page.goto('/read/ba/ba-1?line=signal');
  await page.getByRole('button', { name: 'Auto reading', exact: true }).click();
  await page.clock.runFor(2000);
  await expect(page).toHaveURL(/line=decision/);
  const first = page.locator('.story-choices > button').first();
  await expect(first).toHaveAccessibleName('Stay and listen');
  await expect(first.locator('.auto-choice-spinner')).toBeVisible();
  await expect(first).toHaveAccessibleDescription(
    'Choosing the first response in 2 seconds.',
  );
  await expect(
    page.getByRole('button', { name: 'Pause auto reading', exact: true }),
  ).toBeEnabled();
  await page.clock.runFor(1999);
  await expect(page).toHaveURL(/line=decision/);
  await page.clock.runFor(1);
  await expect(page).toHaveURL(/line=listen/);
  expect(new URL(page.url()).searchParams.get('choices')).toBe(
    '{"decision":"listen"}',
  );
  await expect(
    page.getByRole('button', { name: 'Pause auto reading', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

for (const method of ['mouse', 'number key'] as const) {
  test(`manual ${method} can choose another response without a stale auto timer`, async ({
    page,
  }) => {
    await page.goto('/read/ba/ba-1?line=decision');
    await page
      .getByRole('button', { name: 'Auto reading', exact: true })
      .click();
    await expect(page.locator('.auto-choice-spinner')).toBeVisible();
    await page.clock.runFor(1500);
    if (method === 'mouse')
      await page
        .getByRole('button', { name: 'Follow the signal', exact: true })
        .click();
    else await page.keyboard.press('2');
    await expect(page).toHaveURL(/line=follow/);
    expect(new URL(page.url()).searchParams.get('choices')).toBe(
      '{"decision":"follow"}',
    );
    await page.clock.runFor(500);
    await expect(page).toHaveURL(/line=follow/);
    await page
      .getByRole('button', { name: 'Pause auto reading', exact: true })
      .click();
    await page.clock.runFor(5000);
    await expect(page).toHaveURL(/line=follow/);
  });
}

for (const action of ['pause', 'history', 'settings', 'rewind'] as const) {
  test(`${action} cancels the pending choice timer`, async ({ page }) => {
    await page.goto('/read/ba/ba-1?line=decision');
    await page
      .getByRole('button', { name: 'Auto reading', exact: true })
      .click();
    await expect(page.locator('.auto-choice-spinner')).toBeVisible();
    await page.clock.runFor(1000);
    if (action === 'pause')
      await page
        .getByRole('button', { name: 'Pause auto reading', exact: true })
        .click();
    else if (action === 'history')
      await page.getByRole('button', { name: 'History', exact: true }).click();
    else if (action === 'settings')
      await page
        .getByRole('button', { name: 'Reader settings', exact: true })
        .click();
    else await page.keyboard.press('ArrowLeft');
    await page.clock.runFor(5000);
    await expect(page).toHaveURL(
      action === 'rewind' ? /line=signal/ : /line=decision/,
    );
    await expect(page.locator('.auto-choice-spinner')).toHaveCount(0);
    if (action === 'settings') {
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(page.locator('.auto-choice-spinner')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Auto reading', exact: true }),
      ).toHaveAttribute('aria-pressed', 'false');
      await page
        .getByRole('button', { name: 'Auto reading', exact: true })
        .click();
      await expect(page.locator('.auto-choice-spinner')).toBeVisible();
      await page.clock.runFor(1999);
      await expect(page).toHaveURL(/line=decision/);
      await page.clock.runFor(1);
      await expect(page).toHaveURL(/line=listen/);
    }
  });
}

test('external passage navigation cancels auto instead of answering the new choice', async ({
  page,
}) => {
  await page.goto('/read/ba/ba-1?line=signal');
  await page.getByRole('button', { name: 'Auto reading', exact: true }).click();
  await page.clock.runFor(1000);
  await page.evaluate(() => {
    history.pushState(null, '', '/read/ba/ba-1?line=decision');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('.story-choices')).toBeVisible();
  await page.clock.runFor(5000);
  await expect(page).toHaveURL(/line=decision/);
  await expect(page.locator('.auto-choice-spinner')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Auto reading', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
});

test('manual reading and fast-forward leave choices unanswered', async ({
  page,
}) => {
  await page.goto('/read/ba/ba-1?line=decision');
  await expect(page.locator('.story-choices')).toBeVisible();
  await page.clock.runFor(5000);
  await expect(page).toHaveURL(/line=decision/);
  await expect(page.locator('.auto-choice-spinner')).toHaveCount(0);
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('button', { name: 'Fast-forward', exact: true }).click();
  await page.clock.runFor(5000);
  await expect(page).toHaveURL(/line=decision/);
  expect(new URL(page.url()).searchParams.has('choices')).toBe(false);
  await expect(page.locator('.auto-choice-spinner')).toHaveCount(0);
});

test('the native single response uses the same delay and reduced-motion indicator', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/read/ba/ba-jp-11000?line=11000%3A91');
  await expect(page.locator('.story-choices > button')).toHaveCount(1);
  await page.getByRole('button', { name: 'Auto reading', exact: true }).click();
  const spinner = page.locator('.auto-choice-spinner');
  await expect(spinner).toBeVisible();
  await expect(spinner).toHaveCSS('animation-name', 'none');
  await page.clock.runFor(1999);
  await expect(page).toHaveURL(/line=11000%3A91/);
  await page.clock.runFor(1);
  await expect(page).toHaveURL(/line=11000%3A92/);
  expect(new URL(page.url()).searchParams.get('choices')).toBe(
    '{"11000:91":"s0"}',
  );
});

test('auto stops before a native GFL1 keycode gate and an unsupported passage', async ({
  page,
}) => {
  await page.goto('/read/gfl1/gfl1--58-2-R4?line=-58-2-R4%3A32');
  await page.getByRole('button', { name: 'Auto reading', exact: true }).click();
  await page.clock.runFor(2000);
  await expect(page.getByRole('form', { name: 'Keycode lock' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Auto reading', exact: true }),
  ).toBeDisabled();
  await page.clock.runFor(5000);
  await expect(page).toHaveURL(/line=-58-2-R4%3A33/);
  await expect(page.locator('.auto-choice-spinner')).toHaveCount(0);
  await page.goto(
    '/read/gfl1/gfl1-3?line=gap&choices=%7B%22decision%22%3A%22listen%22%7D',
  );
  await expect(
    page.getByRole('button', { name: 'Auto reading', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('a');
  await page.clock.runFor(5000);
  await expect(page).toHaveURL(/line=gap/);
  await expect(page.locator('.auto-choice-spinner')).toHaveCount(0);
});
