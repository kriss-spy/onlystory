import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import corpus from '../docs/pjsk-main-corpus.json' with { type: 'json' };
import { pjskLibraryRoot } from '../scripts/local-environment.mjs';
import type { Episode } from '../src/model';
import type { Program } from '../src/playback/pjsk/types';
import { emptyData } from '../src/model';
import { readPublishedPjskEpisode, assertPjskFile } from './pjsk-installed';

const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8'));
const installed = (id: string) => {
  const path = resolve('src/generated', `${id}.json`);
  expect(existsSync(path), `Required corpus episode missing: ${id}`).toBe(true);
  return readPublishedPjskEpisode(path);
};
const programFor = (episode: Episode) =>
  read<Program>(
    resolve(
      pjskLibraryRoot,
      '.' + (episode.renderer!.payload as { url: string }).url,
    ),
  );

test('all 125 main-story episodes have complete commands, valid assets and event metadata', async () => {
  test.setTimeout(180000);
  const checked = new Set<string>();
  for (const event of corpus.events) {
    expect(event.episodes.length).toBe(event.expectedEpisodeCount);
    let eventTitle = '';
    for (const entry of event.episodes) {
      const episode = installed(entry.id);
      expect(episode.collectionId).toBe(`pjsk-cn-${event.eventId}-main`);
      expect(episode.category).toBe('Main story');
      expect(episode.order).toBe(entry.episodeNo);
      if (eventTitle) expect(episode.story).toBe(eventTitle);
      eventTitle = episode.story;
      const program = programFor(episode);
      const programUrl = (episode.renderer!.payload as { url: string }).url;
      const programBytes = readFileSync(
        resolve(pjskLibraryRoot, '.' + programUrl),
      );
      expect(programUrl).toContain(
        createHash('sha256').update(programBytes).digest('hex'),
      );
      expect(program.scenarioId).toBe(entry.scenarioId);
      expect(program.steps.at(-1)?.kind).toBe('end');
      expect(
        program.steps.flatMap((step) =>
          step.commands.map((command) => command.index),
        ),
      ).toEqual(
        Array.from({ length: program.sourceCommands }, (_, index) => index),
      );
      expect(episode.nodes.length).toBe(program.steps.length);
      for (const file of program.media.files) {
        assertPjskFile(file, checked);
      }
    }
  }
});

for (const event of corpus.events) {
  test(`main group ${event.eventId}: all ${event.expectedEpisodeCount} episodes render, seek and reach endings`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(300000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(
      (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
      {
        ...emptyData(),
        preferences: {
          ...emptyData().preferences,
          textSpeed: 0,
          voice: 'ja',
          voiceVolume: 0,
          musicVolume: 0,
          soundVolume: 0,
        },
      },
    );
    await page.goto(`/games/pjsk/events/pjsk-cn-${event.eventId}-main`);
    for (const entry of event.episodes)
      await expect(
        page.locator(`a[href^="/read/pjsk/${entry.id}?"]`).first(),
      ).toBeVisible();
    for (const entry of event.episodes) {
      const episode = installed(entry.id);
      const program = programFor(episode);
      const middle = Math.floor(program.steps.length / 2);
      const answers = Object.fromEntries(
        episode.nodes
          .filter((node) => node.kind === 'choice')
          .map((node) => [node.id, node.choices![0].id]),
      );
      const link = (index: number) =>
        `/read/pjsk/${entry.id}?${new URLSearchParams({ line: program.steps[index].id, ...(Object.keys(answers).length ? { choices: JSON.stringify(answers) } : {}) })}`;
      await page.goto(link(middle));
      const layers = page.getByTestId('pjsk-layers');
      const current = () =>
        layers.evaluate(
          (el) =>
            (
              el as HTMLElement & {
                playbackDiagnostics: {
                  index: number;
                  state: unknown;
                  models: { visible: boolean; width: number; height: number }[];
                };
              }
            ).playbackDiagnostics,
        );
      await expect
        .poll(async () => (await current())?.index, { timeout: 90000 })
        .toBe(middle);
      expect((await current()).state).toEqual(program.steps[middle].after);
      await expect(page.locator('canvas')).toBeVisible();
      if (entry.id === event.episodes[0].id)
        await page.screenshot({
          path: testInfo.outputPath(`event-${event.eventId}.png`),
        });
      const slider = page.getByRole('slider', {
        name: 'Story position',
        exact: true,
      });
      for (const index of [0, program.steps.length - 1]) {
        if (Object.keys(answers).length && index > 0)
          await page.goto(link(index));
        else await slider.fill(String(index));
        await expect
          .poll(async () => (await current())?.index, { timeout: 90000 })
          .toBe(index);
        expect((await current()).state).toEqual(program.steps[index].after);
      }
      await expect(page.locator('.episode-end')).toContainText('本话结束');
      const next = event.episodes[event.episodes.indexOf(entry) + 1];
      const continuation = page.getByRole('link', { name: /^Next section/ });
      if (next)
        await expect(continuation).toHaveAttribute(
          'href',
          new RegExp(`/read/pjsk/${next.id}\\?`),
        );
      else await expect(continuation).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

test('all five opening movies and native song interludes decode and continue', async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    {
      ...emptyData(),
      preferences: {
        ...emptyData().preferences,
        textSpeed: 0,
        voiceVolume: 0,
        musicVolume: 0,
        soundVolume: 0,
      },
    },
  );
  let movies = 0,
    performances = 0;
  for (const entry of corpus.events.flatMap((group) => group.episodes)) {
    const episode = installed(entry.id),
      program = programFor(episode);
    for (const [index, step] of program.steps.entries()) {
      if (step.kind !== 'video') continue;
      await page.goto(
        `/read/pjsk/${entry.id}?line=${encodeURIComponent(step.id)}`,
      );
      await expect(page.getByTestId('scene-stage')).toHaveAttribute(
        'aria-busy',
        'false',
        { timeout: 90000 },
      );
      const video = page.locator('video');
      await expect(video).toBeVisible();
      await expect
        .poll(() => video.evaluate((el) => el.readyState), { timeout: 30000 })
        .toBeGreaterThan(0);
      await video.evaluate(async (el) => {
        el.muted = true;
        await el.play();
      });
      await expect
        .poll(() => video.evaluate((el) => el.currentTime))
        .toBeGreaterThan(0);
      if (step.performance) {
        performances++;
        await expect(page.getByRole('note')).toContainText(
          'native 3D performance is not reproduced',
        );
        await page
          .getByRole('button', { name: 'Continue story', exact: true })
          .click();
      } else {
        movies++;
        await page
          .getByRole('button', { name: 'Skip this movie', exact: true })
          .click();
      }
      await expect(page).toHaveURL(
        new RegExp(encodeURIComponent(program.steps[index + 1].id)),
      );
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
  }
  expect(movies).toBe(5);
  expect(performances).toBe(5);
});

test('both VBS legend-light episodes render their original particle atlas', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  for (const scenarioId of ['street_01_05', 'street_01_13']) {
    const entry = corpus.groups
      .flatMap((group) => group.episodes)
      .find((entry) => entry.scenarioId === scenarioId)!;
    const program = programFor(installed(entry.id));
    const step = program.steps.find((step) =>
      step.after.scenarioEffects?.includes('light_up_legend_02'),
    )!;
    expect(program.media.effects?.light_up_legend_02).toBeTruthy();
    await page.goto(
      `/read/pjsk/${entry.id}?line=${encodeURIComponent(step.id)}`,
    );
    await expect(page.getByTestId('scene-stage')).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 90000 },
    );
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`${scenarioId}-lights.png`),
    });
  }
});
