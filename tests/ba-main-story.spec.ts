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
).filter((d: any) => d.category === 'Main story');
const read = (group: number, name: string) =>
  JSON.parse(
    readFileSync(`public/private/ba-jp/${group}/${name}.json`, 'utf8'),
  );
function passage(group: number, accepts: (node: any, row: any) => boolean) {
  const chapter = read(group, 'chapter') as Episode;
  const source = read(group, 'source');
  const nodes = new Map(chapter.nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  function find(save: Save): { node: any; save: Save } | undefined {
    const node = nodes.get(save.frames.at(-1)!.node)!;
    if (visited.has(node.id)) return;
    visited.add(node.id);
    if (accepts(node, source.content[node.source?.row!])) return { node, save };
    if (node.kind === 'end') return;
    for (const choice of node.kind === 'choice'
      ? node.choices.map((c) => c.id)
      : [undefined]) {
      const result = find(advance(chapter, save, choice));
      if (result) return result;
    }
  }
  const result = find(startSave(chapter));
  if (!result) throw new Error(`No target passage in ${group}`);
  return result;
}
const link = (group: number, target: ReturnType<typeof passage>) =>
  `/read/ba/ba-jp-${group}?line=${encodeURIComponent(target.node.id)}&choices=${encodeURIComponent(JSON.stringify(target.save.frames.at(-1)!.answers))}`;
const ready = (page: Page) =>
  expect(page.getByTestId('ba-scene')).toHaveAttribute('aria-busy', 'false', {
    timeout: 45000,
  });
test.setTimeout(120000);
test.beforeEach(async ({ page }) => {
  const data = emptyData();
  data.preferences.textSpeed = 0;
  await page.addInitScript(
    (value) => localStorage.setItem('onlystory.v1', JSON.stringify(value)),
    data,
  );
});

for (const collection of [
  ...new Set(definitions.map((d: any) => d.collectionId)),
]) {
  const candidates = definitions.filter(
    (d: any) => d.collectionId === collection,
  );
  const representative = candidates.find((d: any) =>
    read(d.group, 'source').content.some(
      (r: any) => /^[1-5];/m.test(r.ScriptKr) && r.TextJp?.trim(),
    ),
  );
  test(`${collection} renders native main-story art and Japanese dialogue`, async ({
    page,
  }, info) => {
    expect(representative).toBeTruthy();
    const group = representative.group;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const target = passage(
      group,
      (node, row) =>
        node.kind === 'text' &&
        /^[1-5];/m.test(row?.ScriptKr ?? '') &&
        Boolean(row?.TextJp?.trim()),
    );
    await page.goto(link(group, target));
    await ready(page);
    await expect(page.locator('.ba-canvas')).toHaveAttribute(
      'data-characters',
      /.+/,
    );
    await expect(page.locator('.dialogue-window p')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('native-scene.png') });
    expect(errors).toEqual([]);
  });
}

const authoredCues = definitions.flatMap((d: any) =>
  read(d.group, 'source').content.flatMap((row: any, index: number) => {
    const timeline = /(?:^|\n)#timelineNS;([^;\n]+)/i.exec(row.ScriptKr)?.[1];
    const movie = /(?:^|\n)#videons2;([^;\n]+)/i.exec(row.ScriptKr)?.[1];
    return timeline || movie
      ? [{ group: d.group, row: index, timeline, movie }]
      : [];
  }),
);
for (const [group, row] of [
  [32130, 6],
  [52010, 138],
  [11080, 229],
]) {
  test(`${group}:${row} displays the exact unavailable source resource notice`, async ({
    page,
  }) => {
    const program = read(group, 'scenes');
    const gap = program.assets.sourceGaps.find((gap: any) => gap.row === row);
    expect(gap).toBeTruthy();
    const step = program.steps.find((step: any) =>
      step.rows.some((entry: any) => entry.row === row),
    );
    expect(step).toBeTruthy();
    const target = passage(group, (node) => node.id === step.id);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(link(group, target));
    await ready(page);
    await expect(page.locator('.ba-source-notices')).toContainText(gap.reason);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
for (const cue of authoredCues) {
  test(`${cue.group}:${cue.row} ${cue.timeline ? 'explicit 3D barrier' : 'authored movie'} remains a real playback cue`, async ({
    page,
  }) => {
    const target = passage(cue.group, (node) => node.source?.row === cue.row);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(link(cue.group, target));
    if (cue.timeline) {
      const button = page.getByRole('button', {
        name: 'Continue story',
        exact: true,
      });
      await expect(button).toBeVisible({ timeout: 45000 });
      await expect(
        page.getByText('3D cutscene unavailable', { exact: true }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Finish scene', exact: true })
        .click();
      await expect(button).toBeVisible();
      expect(new URL(page.url()).searchParams.get('line')).toBe(target.node.id);
      await page.keyboard.press('ArrowRight');
      await expect(button).toBeVisible();
      expect(new URL(page.url()).searchParams.get('line')).toBe(target.node.id);
      await button.click();
      await expect(button).toHaveCount(0);
      await expect
        .poll(() => new URL(page.url()).searchParams.get('line'))
        .not.toBe(target.node.id);
      // A direct seek reconstructs the unavailable cue and asks again.
      await page.goto(link(cue.group, target));
      await expect(button).toBeVisible({ timeout: 45000 });
    } else {
      const movie = page.locator('video');
      await expect(movie).toBeVisible({ timeout: 45000 });
      await movie.click();
      await movie.evaluate((element: HTMLVideoElement) => element.play());
      await expect
        .poll(() =>
          movie.evaluate(
            (element: HTMLVideoElement) =>
              element.currentTime > 0 &&
              element.videoWidth > 0 &&
              Number.isFinite(element.duration),
          ),
        )
        .toBe(true);
    }
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
