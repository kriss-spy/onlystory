import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import corpus from '../docs/pjsk-validation-corpus.json' with { type: 'json' };
import { pjskLibraryRoot } from '../scripts/local-environment.mjs';
import type { Episode } from '../src/model';
import type { Program } from '../src/playback/pjsk/types';
import { emptyData } from '../src/model';
import { readPjskEpisode, assertPjskFile } from './pjsk-installed';

const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8'));
const installed = (id: string) => {
  const path = resolve('src/generated', `${id}.json`);
  expect(existsSync(path), `Required corpus episode missing: ${id}`).toBe(true);
  return readPjskEpisode(path);
};
const programFor = (episode: Episode) =>
  read<Program>(
    resolve(
      pjskLibraryRoot,
      '.' + (episode.renderer!.payload as { url: string }).url,
    ),
  );

test('all 75 required episodes have complete commands, valid assets and event metadata', async () => {
  test.setTimeout(180000);
  const checked = new Set<string>();
  for (const event of corpus.events) {
    expect(event.episodes.length).toBe(event.expectedEpisodeCount);
    let eventTitle = '';
    for (const entry of event.episodes) {
      const episode = installed(entry.id);
      expect(episode.collectionId).toBe(`pjsk-cn-event-${event.eventId}`);
      expect(episode.category).toBe('Event');
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
  test(`event ${event.eventId}: all ${event.expectedEpisodeCount} episodes render, seek and reach endings`, async ({
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
    await page.goto(`/games/pjsk/events/pjsk-cn-event-${event.eventId}`);
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
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

test('New Year choices are selectable and both ending movies decode and can continue', async ({
  page,
}) => {
  test.setTimeout(240000);
  const anthology = corpus.events.find((event) => event.eventId === '9')!
    .episodes[0];
  const choiceProgram = programFor(installed(anthology.id));
  const choices = choiceProgram.steps.flatMap((step, index) =>
    step.kind === 'choice' ? [index] : [],
  );
  expect(choices.length).toBe(3);
  await page.goto(
    `/read/pjsk/${anthology.id}?line=${encodeURIComponent(choiceProgram.steps[choices[0]].id)}`,
  );
  for (const index of choices) {
    await page
      .getByRole('slider', { name: 'Story position', exact: true })
      .fill(String(index));
    await expect(page.getByTestId('scene-stage')).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 90000 },
    );
    const buttons = page.locator('.story-choices button');
    await expect(buttons).toHaveCount(
      choiceProgram.steps[index].choices!.length,
    );
    await buttons.first().click();
    await expect
      .poll(() =>
        page
          .getByTestId('pjsk-layers')
          .evaluate(
            (el) =>
              (el as HTMLElement & { playbackDiagnostics: { index: number } })
                .playbackDiagnostics.index,
          ),
      )
      .toBe(index + 1);
  }
  for (const eventId of ['100', '150']) {
    const entry = corpus.events
      .find((event) => event.eventId === eventId)!
      .episodes.at(-1)!;
    const program = programFor(installed(entry.id));
    const movieIndex = program.steps.findIndex((step) => step.kind === 'video');
    expect(movieIndex).toBeGreaterThan(0);
    await page.goto(
      `/read/pjsk/${entry.id}?line=${encodeURIComponent(program.steps[movieIndex - 1].id)}`,
    );
    await expect(page.getByTestId('scene-stage')).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 90000 },
    );
    const canvas = await page.locator('canvas').elementHandle();
    const video = page.getByLabel('Story movie', { exact: true });
    await page
      .getByRole('button', { name: 'Next passage', exact: true })
      .click();
    await expect(page.getByTestId('scene-stage')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await expect(video).toHaveCount(0);
    await expect(video).toBeVisible({ timeout: 90000 });
    expect(
      await page.getByTestId('pjsk-layers').evaluate(
        (el) =>
          (
            el as HTMLElement & {
              playbackDiagnostics: { music: string | null };
            }
          ).playbackDiagnostics.music,
      ),
    ).toBeNull();
    await expect
      .poll(() => video.evaluate((el) => (el as HTMLVideoElement).readyState), {
        timeout: 30000,
      })
      .toBeGreaterThanOrEqual(2);
    expect(
      await video.evaluate((el) => (el as HTMLVideoElement).duration),
    ).toBeGreaterThan(0);
    await video.evaluate(async (el) => {
      const player = el as HTMLVideoElement;
      player.muted = true;
      await player.play();
    });
    await expect
      .poll(() => video.evaluate((el) => (el as HTMLVideoElement).currentTime))
      .toBeGreaterThan(0.1);
    await page
      .getByRole('button', { name: 'Skip this movie', exact: true })
      .click();
    await expect
      .poll(
        () =>
          page
            .getByTestId('pjsk-layers')
            .evaluate(
              (el) =>
                (el as HTMLElement & { playbackDiagnostics: { index: number } })
                  .playbackDiagnostics.index,
            ),
        { timeout: 90000 },
      )
      .toBe(movieIndex + 1);
    expect(
      await page
        .locator('canvas')
        .evaluate((el, previous) => el === previous, canvas),
    ).toBe(true);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
});

test('PJSK movie remains skippable in text layout', async ({ page }) => {
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    {
      ...emptyData(),
      preferences: { ...emptyData().preferences, layout: 'text' },
    },
  );
  const entry = corpus.events
    .find((event) => event.eventId === '100')!
    .episodes.at(-1)!;
  const program = programFor(installed(entry.id));
  const movie = program.steps.find((step) => step.kind === 'video')!;
  await page.goto(
    `/read/pjsk/${entry.id}?line=${encodeURIComponent(movie.id)}`,
  );
  await expect(page.getByLabel('Story movie', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Skip this movie', exact: true })
    .click();
  await expect(page.locator('.episode-end')).toContainText('本话结束');
});
