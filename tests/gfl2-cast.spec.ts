import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildTimeline } from '../src/playback/gfl2/event-state';
import type {
  EventProgram,
  SceneState,
} from '../src/playback/gfl2/event-types';
import { emptyData } from '../src/model';

interface CastEntry {
  kind: string;
  url: string;
  female?: { url: string };
  firstUse?: { script: string; row: number };
}
interface CastManifest {
  characters: Record<string, CastEntry>;
}
interface Diagnostics {
  loaded: string[];
  pending: string[];
  failures: string[];
  models: {
    id: string;
    url: string;
    patterns: string[];
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
}
interface SceneEntry {
  program: EventProgram;
  timeline: SceneState[];
}
const castPath = 'public/private/gfl2-event/characters/manifest.json';
const scenesPath = 'src/generated/gfl2-scenes.json';
const available = existsSync(castPath) && existsSync(scenesPath);
const cast: CastManifest = available
  ? JSON.parse(readFileSync(castPath, 'utf8'))
  : { characters: {} };
const sceneManifest = available
  ? JSON.parse(readFileSync(scenesPath, 'utf8'))
  : { sections: {} };
const scenes: SceneEntry[] = Object.values<{ url: string }>(
  sceneManifest.sections,
).map(({ url }) => {
  const program = JSON.parse(
    readFileSync(`public${new URL(url, 'http://localhost').pathname}`, 'utf8'),
  ) as EventProgram;
  return { program, timeline: buildTimeline(program) };
});
const visualCast = Object.entries(cast.characters).filter(
  ([, entry]) => entry.kind === 'live2d',
);
const diagnostics = (page: Page) =>
  page
    .getByTestId('native-layers')
    .evaluate(
      (element) =>
        (element as HTMLElement & { playbackDiagnostics: Diagnostics })
          .playbackDiagnostics,
    );

function locationFor(label: string) {
  const entry = cast.characters[label];
  for (const scene of scenes) {
    const index = scene.timeline.findIndex((state, index) => {
      const step = scene.program.steps[index];
      return (
        (!entry.firstUse ||
          (step.script === entry.firstUse.script &&
            Number(step.id.split(':')[1]) >= entry.firstUse.row)) &&
        state.layers.some(
          (layer) =>
            layer.kind === 'character' &&
            (layer.asset ?? layer.id) === label &&
            layer.alpha > 0,
        )
      );
    });
    if (index >= 0) return { ...scene, index };
  }
  throw new Error(`No visible original story passage for ${label}`);
}

async function openCharacter(page: Page, label: string, female = false) {
  const location = locationFor(label);
  await page.goto(
    `/read/gfl2/${location.program.id}?line=${encodeURIComponent(location.program.steps[location.index].id)}`,
  );
  await expect
    .poll(
      async () => {
        const state = await diagnostics(page);
        return (
          state && (state.loaded.includes(label) || state.failures.length > 0)
        );
      },
      {
        message: `Original Cubism model ${label} must load on its real story route`,
        timeout: 15000,
      },
    )
    .toBe(true);
  const state = await diagnostics(page);
  expect(state.failures, `${label} scene failures`).toEqual([]);
  const model = state.models.find((item) => item.id === label);
  expect(model, `${label} model diagnostics`).toBeDefined();
  expect(model!.url).toBe(
    female ? cast.characters[label].female!.url : cast.characters[label].url,
  );
  for (const dimension of [model!.width, model!.height]) {
    expect(Number.isFinite(dimension), `${label} finite dimensions`).toBe(true);
    expect(dimension, `${label} visible model dimensions`).toBeGreaterThan(0);
  }
  expect(Number.isFinite(model!.x) && Number.isFinite(model!.y)).toBe(true);
  expect(
    (await page.locator('.scene-notices p').allTextContents()).join('\n'),
  ).not.toMatch(
    /Cannot read|TypeError|Error.*expression|model.*(?:unavailable|failed)/i,
  );
  return { label, route: page.url(), ...model };
}

test.beforeEach(async ({ context }) => {
  test.skip(!available, 'Recover and import original GFL2 scene assets first.');
  const data = emptyData();
  data.preferences.textSpeed = 0;
  data.preferences.musicVolume = 0;
  data.preferences.soundVolume = 0;
  await context.addInitScript((data) => {
    if (!localStorage.getItem('onlystory.v1'))
      localStorage.setItem('onlystory.v1', JSON.stringify(data));
  }, data);
});

for (const half of [0, 1]) {
  test(`all original visual cast loads on real story routes, group ${half + 1}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    const failures: string[] = [];
    const results = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const labels = visualCast.slice(half * 26, (half + 1) * 26);
    expect(visualCast).toHaveLength(52);
    for (const [label] of labels) {
      try {
        results.push(await openCharacter(page, label));
      } catch (error) {
        failures.push(`${label}: ${String(error)}`);
      }
    }
    mkdirSync('private-review/cast', { recursive: true });
    writeFileSync(
      `private-review/cast/visual-cast-${half + 1}.json`,
      `${JSON.stringify({ results, failures, errors }, null, 2)}\n`,
    );
    expect(failures).toEqual([]);
    expect(errors).toEqual([]);
    expect(results).toHaveLength(26);
  });
}

test('female commander models and later multi-character scenes render across themes and mobile', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/library');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('onlystory.v1')!);
    data.preferences.textVariant = 'female';
    localStorage.setItem('onlystory.v1', JSON.stringify(data));
  });
  const results = [];
  for (const [label, entry] of visualCast) {
    if (entry.female) results.push(await openCharacter(page, label, true));
  }
  expect(results).toHaveLength(2);
  const later = scenes
    .slice(Math.floor(scenes.length / 2))
    .flatMap((scene) =>
      scene.timeline.map((state, index) => ({ ...scene, state, index })),
    )
    .find(
      ({ state }) =>
        state.layers.filter(
          (layer) => layer.kind === 'character' && layer.alpha > 0,
        ).length >= 2,
    );
  expect(later, 'An original later multi-character scene exists').toBeDefined();
  const route = `/read/gfl2/${later!.program.id}?line=${encodeURIComponent(later!.program.steps[later!.index].id)}`;
  const labels = later!.state.layers
    .filter((layer) => layer.kind === 'character' && layer.alpha > 0)
    .map((layer) => layer.id);
  mkdirSync('private-review/cast', { recursive: true });
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => {
      const data = JSON.parse(localStorage.getItem('onlystory.v1')!);
      data.preferences.theme = theme;
      localStorage.setItem('onlystory.v1', JSON.stringify(data));
    }, theme);
    for (const [name, size] of [
      ['desktop', { width: 1365, height: 900 }],
      ['mobile', { width: 487, height: 661 }],
    ] as const) {
      await page.setViewportSize(size);
      await page.goto(route);
      await expect
        .poll(async () => {
          const state = await diagnostics(page);
          return labels.every((label) => state?.loaded.includes(label));
        })
        .toBe(true);
      expect((await diagnostics(page)).failures).toEqual([]);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.screenshot({
        path: `private-review/cast/later-cast-${theme}-${name}.png`,
        fullPage: true,
      });
    }
  }
  writeFileSync(
    'private-review/cast/female-and-later-scenes.json',
    `${JSON.stringify({ results, laterRoute: route, labels, errors }, null, 2)}\n`,
  );
  expect(errors).toEqual([]);
});
