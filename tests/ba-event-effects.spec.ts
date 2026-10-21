import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  emptyData,
  startSave,
  advance,
  type Episode,
  type Save,
} from '../src/model';

const definitions = JSON.parse(
  readFileSync('scripts/ba-library.json', 'utf8'),
).filter((d: any) => d.category === 'Event');
const read = (group: number, name: string) =>
  JSON.parse(
    readFileSync(`public/private/ba-jp/${group}/${name}.json`, 'utf8'),
  );
const ready = (page: Page) =>
  expect(page.getByTestId('ba-scene')).toHaveAttribute('aria-busy', 'false', {
    timeout: 45000,
  });
function route(group: number, accepts: (node: any, save: Save) => boolean) {
  const chapter = read(group, 'chapter');
  const episode = chapter as Episode;
  const byId = new Map<string, any>(
    chapter.nodes.map((node: any) => [node.id, node]),
  );
  const visited = new Set<string>();
  const visit = (save: Save): { node: any; save: Save } | undefined => {
    const node = byId.get(save.frames.at(-1)!.node);
    if (visited.has(node.id)) return;
    visited.add(node.id);
    if (accepts(node, save)) return { node, save };
    if (node.kind === 'end') return;
    for (const choice of node.kind === 'choice'
      ? node.choices.map((c: any) => c.id)
      : [undefined]) {
      const found = visit(advance(episode, save, choice));
      if (found) return found;
    }
  };
  return visit(startSave(episode));
}
const link = (group: number, save: Save) =>
  `/read/ba/ba-jp-${group}?line=${encodeURIComponent(save.frames.at(-1)!.node)}&choices=${encodeURIComponent(JSON.stringify(save.frames.at(-1)!.answers))}`;

test.beforeEach(async ({ page }) => {
  const data = emptyData();
  data.preferences.textLocale = 'ja';
  data.preferences.textSpeed = 0;
  await page.addInitScript(
    (value) => localStorage.setItem('onlystory.v1', JSON.stringify(value)),
    data,
  );
});

for (const [id, name, selector, count, background] of [
  [3550865647, 'BG_FocusLine', '.ba-focus-lines', 1, false],
  [1679852157, 'BG_Love_L', '.ba-heart', 18, true],
  [3023046476, 'BG_Love_L_BGOff', '.ba-heart', 18, false],
  [575794762, 'BG_SandStorm_L', '.ba-sand', 16, false],
  [1061522909, 'BG_Shining_L', '.ba-sparkle', 18, true],
  [1870781268, 'BG_Shining_L_BGOff', '.ba-sparkle', 18, false],
  [2551519896, 'BG_Fireworks_L_BGOff_01', '.ba-firework', 36, false],
  [2499688462, 'BG_Fireworks_L_BGOff_02', '.ba-firework', 36, false],
] as const) {
  test(`original event source renders ${name}`, async ({ page }, info) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let representative:
      | { group: number; target: NonNullable<ReturnType<typeof route>> }
      | undefined;
    for (const definition of definitions) {
      const source = read(definition.group, 'source');
      const target = route(
        definition.group,
        (node) =>
          !node.scene.autoAdvance &&
          source.content[node.source?.row]?.BGEffect === id,
      );
      if (target) {
        representative = { group: definition.group, target };
        break;
      }
    }
    expect(
      representative,
      `${name} needs a real readable source row`,
    ).toBeTruthy();
    await page.goto(link(representative!.group, representative!.target.save));
    await ready(page);
    const atmosphere = page.locator('.ba-particles');
    await expect(atmosphere).toHaveAttribute('data-atmosphere', name);
    await expect(atmosphere.locator(selector)).toHaveCount(count);
    expect(
      await atmosphere.evaluate((element) => element.style.background !== ''),
    ).toBe(background);
    const art = atmosphere.locator('img');
    if (await art.count()) {
      await expect
        .poll(() =>
          art.evaluateAll((elements) =>
            elements.every(
              (e) =>
                (e as HTMLImageElement).complete &&
                (e as HTMLImageElement).naturalWidth > 0,
            ),
          ),
        )
        .toBe(true);
    }
    expect(
      await atmosphere
        .locator(selector)
        .first()
        .evaluate((element) =>
          element
            .getAnimations()
            .some((animation) => animation.playState === 'running'),
        ),
    ).toBe(true);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${name}.png`) });
  });
}

for (const direction of ['LtoR', 'RtoL'] as const)
  test(`a real ${direction} horizontal wipe animates while advancing and finishes uncovered`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const animate = Element.prototype.animate;
      (window as any).baWipeFrames = [];
      Element.prototype.animate = function (frames, options) {
        if (this.classList.contains('ba-transition'))
          (window as any).baWipeFrames.push(frames);
        return animate.call(this, frames, options);
      };
    });
    let representative:
      { group: number; previous: Save; target: any } | undefined;
    for (const definition of definitions) {
      const chapter = read(definition.group, 'chapter');
      const program = read(definition.group, 'scenes');
      const target = route(definition.group, (node, save) => {
        const previous = chapter.nodes.find(
          (n: any) => n.id === save.frames.at(-2)?.node,
        );
        return (
          previous?.kind === 'text' &&
          !previous.scene.autoAdvance &&
          node.kind === 'text' &&
          !node.scene.autoAdvance &&
          program.steps
            .find((s: any) => s.id === node.id)
            ?.rows.some((r: any) =>
              new RegExp(`HorSwipe_${direction}_`).test(
                program.assets.transitions[r.Transition]
                  ?.TransitionInResource ?? '',
              ),
            )
        );
      });
      if (target) {
        representative = {
          group: definition.group,
          previous: { ...target.save, frames: target.save.frames.slice(0, -1) },
          target: target.node,
        };
        break;
      }
    }
    expect(
      representative,
      'A readable wipe cue with an ordinary preceding passage exists',
    ).toBeTruthy();
    await page.goto(link(representative!.group, representative!.previous));
    await ready(page);
    await page.evaluate(() => {
      (window as any).baWipeFrames = [];
    });
    await page
      .getByRole('button', { name: 'Next passage', exact: true })
      .click();
    await ready(page);
    const frames = await page.evaluate(() => (window as any).baWipeFrames);
    expect(
      frames.some((sequence: any[]) =>
        sequence.some(
          (frame) =>
            frame.clipPath ===
            (direction === 'LtoR' ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)'),
        ),
      ),
    ).toBe(true);
    expect(
      await page.locator('.ba-transition').evaluate((element) => {
        const style = getComputedStyle(element);
        return style.opacity === '0' || /100%/.test(style.clipPath);
      }),
    ).toBe(true);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
