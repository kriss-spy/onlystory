import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const packages = JSON.parse(
  readFileSync('src/generated/gfl2-packages.json', 'utf8'),
);
const readUrl = (url: string) =>
  JSON.parse(
    readFileSync(`public${new URL(url, 'http://localhost').pathname}`, 'utf8'),
  );

test('King Game continues into the card-game CG story and all three CG variants render', async ({
  page,
}) => {
  const { event, scenes } = packages.find(
    ({ event }: { event: { id: string } }) => event.id === 'gfl2-glass-island',
  );
  const king = event.sections.find(
    (s: { id: string }) => s.id === 'gfl2-glass-island-31004',
  );
  const cards = event.sections.find(
    (s: { id: string }) => s.id === 'gfl2-glass-island-31082',
  );
  await page.goto(
    `/read/gfl2/${king.id}?line=${encodeURIComponent(king.lastNode)}`,
  );
  await page.getByRole('link', { name: /Next section/ }).click();
  await expect(page.locator('.reader-header strong')).toHaveText(
    'SS-1-2 鬼牌易手',
  );
  const program = readUrl(scenes.sections[cards.id].url);
  for (const label of [
    'SuomiCG_01_Game',
    'SuomiCG_01_Game_Huge',
    'SuomiCG_01_Game_Surprise',
  ]) {
    const step = program.steps.find(
      (s: { commands: { Command: string; Arg1: string }[] }) =>
        s.commands.some((c) => c.Command === 'Bg' && c.Arg1 === label),
    );
    expect(step).toBeDefined();
    await page.goto(
      `/read/gfl2/${cards.id}?line=${encodeURIComponent(step.id)}`,
    );
    const host = page.getByTestId('native-layers');
    await expect(host.locator('canvas')).toBeVisible();
    await expect
      .poll(() =>
        host.evaluate(
          (el) =>
            (el as HTMLElement & { playbackDiagnostics?: { loaded: string[] } })
              .playbackDiagnostics?.loaded,
        ),
      )
      .toContain(label);
    if (label === 'SuomiCG_01_Game')
      await page.screenshot({
        path: 'private-review/events/glass-island-card-game-cg.png',
      });
  }
});

test('release order follows original CN debuts and every event has a loaded cover', async ({
  page,
}) => {
  await page.goto('/games/gfl2?sort=release');
  const expected = [
    ...packages.map((p: any) => p.event),
    {
      ...JSON.parse(readFileSync('src/generated/gfl2-event.json', 'utf8')),
      date: '2026-09-01',
    },
    {
      ...JSON.parse(readFileSync('src/generated/gfl2-ilion.json', 'utf8')),
      date: '2026-06-30',
    },
  ]
    .sort((a, b) =>
      (a.releaseDate ?? a.date).localeCompare(b.releaseDate ?? b.date),
    )
    .map((e) => e.title);
  await expect(page.locator('.event-row h2')).toHaveText(expected);
  await expect(page.locator('.event-cover')).toHaveCount(36);
  await expect
    .poll(() =>
      page
        .locator('.event-cover')
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  await page.screenshot({
    path: 'private-review/events/release-order-covers.png',
  });
});

for (const slug of ['gfl2-cafe-revised', 'gfl2-quartet', 'gfl2-glass-island']) {
  test(`${slug} displays its original story CG`, async ({ page }) => {
    const { event, scenes } = packages.find(
      ({ event }: { event: { id: string } }) => event.id === slug,
    );
    let found: { id: string; step: string; label: string } | undefined;
    for (const section of event.sections) {
      const scene = readUrl(scenes.sections[section.id].url);
      const step = scene.steps.find(
        (s: { commands: { Command: string; Arg1: string }[] }) =>
          s.commands.some(
            (c) =>
              ['Bg', 'Sprite'].includes(c.Command) && c.Arg1.includes('CG'),
          ),
      );
      if (step) {
        found = {
          id: section.id,
          step: step.id,
          label: step.commands.find((c: { Arg1: string }) =>
            c.Arg1.includes('CG'),
          ).Arg1,
        };
        break;
      }
    }
    expect(found).toBeDefined();
    await page.goto(
      `/read/gfl2/${found!.id}?line=${encodeURIComponent(found!.step)}`,
    );
    const host = page.getByTestId('native-layers');
    await expect(host.locator('canvas')).toBeVisible();
    await expect
      .poll(() =>
        host.evaluate(
          (el) =>
            (el as HTMLElement & { playbackDiagnostics?: { loaded: string[] } })
              .playbackDiagnostics?.loaded,
        ),
      )
      .toContain(found!.label);
    await page.screenshot({ path: `private-review/events/${slug}-cg.png` });
  });
}
