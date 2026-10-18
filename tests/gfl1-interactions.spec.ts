import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { emptyData } from '../src/model';
import type { Episode, StoryNode } from '../src/model';
import { libraryRoot } from '../scripts/local-environment.mjs';

const catalog: Episode[] = JSON.parse(
  readFileSync('src/generated/gfl1-catalog.json', 'utf8'),
);

test('all three shooting gates load both native models and play the timed shot sounds', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    Object.assign(window, { shotCues: [] as string[] });
    HTMLMediaElement.prototype.play = function () {
      (window as unknown as { shotCues: string[] }).shotCues.push(
        this.dataset.cue ?? '',
      );
      return play.call(this);
    };
  });
  const episode = catalog.find((entry) => entry.id === 'gfl1--77-A-44')!;
  const program = JSON.parse(
    readFileSync(resolve(libraryRoot, '.' + episode.content!.url), 'utf8'),
  );
  const gates = program.nodes.filter(
    (node: StoryNode) => program.frames[node.id]?.interaction?.kind === 'shoot',
  );
  expect(gates).toHaveLength(3);
  const answers: Record<string, string> = {};
  for (const [index, gate] of gates.entries()) {
    const params = new URLSearchParams({
      line: gate.id,
      choices: JSON.stringify(answers),
    });
    await page.goto(`/read/gfl1/${episode.id}?${params}`);
    await expect(page.getByTestId('gfl1-shoot-models')).toHaveAttribute(
      'data-loaded',
      'true',
    );
    await expect(
      page.getByTestId('gfl1-shoot-models').locator('canvas'),
    ).toBeVisible();
    if (!index)
      await page.screenshot({
        path: '.cache/gfl1/qa-shooting-original-models.png',
      });
    await page.getByRole('button', { name: 'Fire', exact: true }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('line'))
      .toBe(gate.choices[0].next);
    const cues = await page.evaluate(
      () => (window as unknown as { shotCues: string[] }).shotCues,
    );
    const expected = program.frames[gate.id].interaction.audio.map(
      (cue: { cue: string }) => cue.cue,
    );
    expect(cues.filter((cue) => expected.includes(cue)).sort()).toEqual(
      expected.sort(),
    );
    answers[gate.id] = 'fire';
  }
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    {
      ...emptyData(),
      preferences: { ...emptyData().preferences, textSpeed: 0 },
    },
  );
});

test('the password lock rejects a wrong code, requires the source keycode and restores after reload', async ({
  page,
}) => {
  await page.goto('/read/gfl1/gfl1--58-2-R4?line=-58-2-R4%3A33');
  await expect(page.getByRole('form', { name: 'Keycode lock' })).toBeVisible();
  await page.getByLabel('Enter the keycode').fill('0000');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Incorrect keycode. Try again.',
  );
  await expect(page).toHaveURL(/line=-58-2-R4%3A33/);
  await expect(
    page.getByRole('button', { name: 'Next passage', exact: true }),
  ).toBeDisabled();
  await expect(page).toHaveURL(/line=-58-2-R4%3A33/);
  await page.getByLabel('Enter the keycode').fill('9367');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL(/line=-58-2-R4%3A34/);
  await page.reload();
  await expect(page).toHaveURL(/line=-58-2-R4%3A34/);
  await expect(page.getByRole('form', { name: 'Keycode lock' })).toHaveCount(0);
});

test('downloaded shooting models and sounds work when original media requests are blocked', async ({
  page,
}) => {
  const episode = catalog.find((entry) => entry.id === 'gfl1--77-A-44')!;
  const program = JSON.parse(
    readFileSync(resolve(libraryRoot, '.' + episode.content!.url), 'utf8'),
  );
  const frame = program.frames['-77-A-44:41'];
  const urls = [
    ...new Set<string>([
      episode.content!.url,
      frame.background.url,
      '/vendor/live2dcubismcore.min.js',
      ...frame.interaction.models.assets,
      ...frame.interaction.audio.map((cue: { url: string }) => cue.url),
    ]),
  ];
  await page.goto('/games/gfl1');
  await page.evaluate(async (urls) => {
    const cache = await caches.open('onlystory.media.v1');
    await Promise.all(
      urls.map(async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Download failed: ${url}`);
        await cache.put(url, response);
      }),
    );
  }, urls);
  await page.route('**/private/gfl1/**', (route) => route.abort());
  await page.goto('/read/gfl1/gfl1--77-A-44?line=-77-A-44%3A41');
  await expect(page.getByTestId('gfl1-shoot-models')).toHaveAttribute(
    'data-loaded',
    'true',
  );
  await page.getByRole('button', { name: 'Fire', exact: true }).click();
  await expect(page).toHaveURL(/line=-77-A-44%3A42/);
});

test('hiding controls during a shot cannot trap its completion', async ({
  page,
}) => {
  await page.goto('/read/gfl1/gfl1--77-A-44?line=-77-A-44%3A41');
  await expect(page.getByTestId('gfl1-shoot-models')).toHaveAttribute(
    'data-loaded',
    'true',
  );
  await page.getByRole('button', { name: 'Fire', exact: true }).click();
  await page
    .getByRole('button', { name: 'Hide controls', exact: true })
    .click();
  await expect(page).toHaveURL(/line=-77-A-44%3A42/);
});

test('an incorrect quiz answer retries and the correct answer unlocks its report through a copied link', async ({
  page,
}) => {
  await page.goto('/read/gfl1/gfl1--68-S-1?line=-68-S-1%3A4');
  await page.getByRole('button', { name: 'A. Promoted', exact: true }).click();
  for (
    let i = 0;
    i < 10 &&
    !(await page
      .getByRole('button', { name: 'C. Transferred', exact: true })
      .count());
    i++
  )
    await page
      .getByRole('button', { name: 'Next passage', exact: true })
      .click();
  await expect(
    page.getByRole('button', { name: 'C. Transferred', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'B. Demoted', exact: true }).click();
  for (
    let i = 0;
    i < 10 &&
    !(await page
      .getByRole('button', { name: 'C. Transferred', exact: true })
      .count());
    i++
  )
    await page
      .getByRole('button', { name: 'Next passage', exact: true })
      .click();
  await page
    .getByRole('button', { name: 'C. Transferred', exact: true })
    .click();
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await expect(page.locator('.dialogue-window')).toContainText(
    'AR-18, sorry for not picking up.',
  );
  const copied = page.url();
  await page.goto('about:blank');
  await page.goto(copied);
  await expect(page.locator('.dialogue-window')).toContainText(
    'AR-18, sorry for not picking up.',
  );
});

test('hotspot investigations remove inspected locations and return to the remaining locations', async ({
  page,
}) => {
  await page.goto('/read/gfl1/gfl1--58-S1-1?line=-58-S1-1%3A15');
  const menu = page.getByRole('region', { name: 'Story reader' });
  await expect(
    menu.getByRole('button', { name: /^Inspect location/ }),
  ).toHaveCount(4);
  await menu
    .getByRole('button', { name: 'Inspect location 2', exact: true })
    .click();
  for (
    let i = 0;
    i < 45 &&
    !(await menu.getByRole('button', { name: /^Inspect location/ }).count());
    i++
  )
    await page
      .getByRole('button', { name: 'Next passage', exact: true })
      .click();
  await expect(
    menu.getByRole('button', { name: /^Inspect location/ }),
  ).toHaveCount(3);
  await expect(
    menu.getByRole('button', { name: 'Inspect location 2', exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    menu.getByRole('button', { name: /^Inspect location/ }),
  ).toHaveCount(3);
});

test('the two formerly ambiguous joins retain each selected branch through reload', async ({
  page,
}) => {
  test.setTimeout(90000);
  for (const id of ['gfl1--54-D-1', 'gfl1--54-D-2']) {
    const episode = catalog.find((entry) => entry.id === id)!;
    const program = JSON.parse(
      readFileSync(resolve(libraryRoot, '.' + episode.content!.url), 'utf8'),
    );
    const nodes = new Map<string, StoryNode>(
      program.nodes.map((node: StoryNode) => [node.id, node]),
    );
    const targetRow = id.endsWith('-1') ? 220 : 66;
    const targets = program.nodes.filter(
      (node: StoryNode) => node.source?.row === targetRow,
    );
    expect(targets.length).toBeGreaterThan(1);
    for (const target of targets) {
      const visited = new Set<string>();
      const find = (
        id: string,
        answers: Record<string, string>,
      ): Record<string, string> | undefined => {
        if (id === target.id) return answers;
        if (visited.has(id)) return;
        visited.add(id);
        const node = nodes.get(id)!;
        if (node.choices) {
          for (const choice of node.choices) {
            const result = find(choice.next, { ...answers, [id]: choice.id });
            if (result) return result;
          }
        } else if (node.next) return find(node.next, answers);
      };
      const answers = find(episode.entryNodeId!, {});
      expect(answers).toBeTruthy();
      const params = new URLSearchParams({
        line: target.id,
        choices: JSON.stringify(answers),
      });
      await page.goto(`/read/gfl1/${id}?${params}`);
      await expect(page.getByTestId('gfl1-stage')).toBeVisible();
      await expect(page.locator('.unsupported-notice')).toHaveCount(0);
      const background = await page
        .locator('.gfl1-stage .scene-background')
        .getAttribute('src');
      expect(background).toBe(program.frames[target.id].background.url);
      await page.reload();
      await expect(
        page.locator('.gfl1-stage .scene-background'),
      ).toHaveAttribute('src', background!);
    }
  }
});
