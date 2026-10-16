import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildTimeline } from '../src/playback/gfl2/event-state';
import type { EventProgram } from '../src/playback/gfl2/event-types';

const read = (url: string) =>
  JSON.parse(
    readFileSync(
      `public${decodeURIComponent(new URL(url, 'http://localhost').pathname)}`,
      'utf8',
    ),
  );
const event = JSON.parse(readFileSync('src/generated/gfl2-ilion.json', 'utf8'));
const scenes = JSON.parse(
  readFileSync('src/generated/gfl2-ilion-scenes.json', 'utf8'),
);
const sections = event.sections as {
  id: string;
  chapter: { id: string; title: string };
  placement?: unknown;
}[];

for (const chapter of ['4047', '4048', '4049']) {
  const section = sections.find(
    (section) => section.chapter.id === chapter && !section.placement,
  )!;
  const program = read(scenes.sections[section.id].url) as EventProgram;
  const timeline = buildTimeline(program);
  const index = timeline.findIndex(
    (state) =>
      state.layers.some(
        (layer) =>
          layer.kind === 'character' &&
          layer.darkness < 0.5 &&
          program.characters[layer.asset ?? '']?.kind === 'live2d',
      ) &&
      state.layers.some(
        (layer) =>
          layer.kind === 'background' &&
          program.backgrounds[layer.asset ?? '']?.url,
      ),
  );
  test(`${section.chapter.title} displays its original background and character models`, async ({
    page,
  }) => {
    expect(index).toBeGreaterThanOrEqual(0);
    await page.goto(
      `/read/gfl2/${section.id}?line=${encodeURIComponent(program.steps[index].id)}`,
    );
    const host = page.getByTestId('native-layers');
    await expect(host.locator('canvas')).toBeVisible();
    const expected = timeline[index].layers
      .filter(
        (layer) =>
          layer.kind === 'character' &&
          program.characters[layer.asset ?? '']?.kind === 'live2d',
      )
      .map((layer) => layer.id);
    const diagnostics = () =>
      host.evaluate(
        (element) =>
          (
            element as HTMLElement & {
              playbackDiagnostics?: {
                models: { id: string; width: number; height: number }[];
                failures: string[];
              };
            }
          ).playbackDiagnostics,
      );
    await expect
      .poll(async () => (await diagnostics())?.models.map((model) => model.id))
      .toEqual(expect.arrayContaining(expected));
    const loaded = await diagnostics();
    expect(loaded?.failures).toEqual([]);
    expect(
      loaded?.models.every((model) => model.width > 0 && model.height > 0),
    ).toBe(true);
    await page.screenshot({
      path: `private-review/events/ilion-scene-${chapter}.png`,
    });
  });
}

test('original Chinese movie subtitles load with their recovered cue times', async ({
  page,
}) => {
  await page.goto('/read/gfl2/gfl2-ilion-34401?line=MA22001%3A1');
  const movie = page.getByLabel('Story movie', { exact: true });
  await expect(movie.locator('track[kind="subtitles"]')).toHaveAttribute(
    'srclang',
    'zh-CN',
  );
  await expect
    .poll(() =>
      movie.evaluate(
        (video: HTMLVideoElement) => video.textTracks[0]?.cues?.length ?? 0,
      ),
    )
    .toBe(4);
  const cues = await movie.evaluate((video: HTMLVideoElement) =>
    Array.from(video.textTracks[0].cues ?? []).map((cue) => ({
      start: cue.startTime,
      end: cue.endTime,
      text: (cue as VTTCue).text,
    })),
  );
  expect(cues.every((cue) => cue.end > cue.start && cue.text.length > 0)).toBe(
    true,
  );
  expect(cues.some((cue) => /[\u4e00-\u9fff]/.test(cue.text))).toBe(true);
});
