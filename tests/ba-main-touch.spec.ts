import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  emptyData,
  startSave,
  advance,
  type Episode,
  type Save,
} from '../src/model';

for (const [group, row, x] of [
  [11008, 89, -361],
  [201070, 140, 361],
])
  test(`main-story touch gate ${group}:${row} requires the authored fingertip click`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    const chapter = JSON.parse(
      readFileSync(`public/private/ba-jp/${group}/chapter.json`, 'utf8'),
    );
    const targetId = `${group}:${row}`;
    const episode = chapter as Episode;
    const byId = new Map<string, any>(
      chapter.nodes.map((node: any) => [node.id, node]),
    );
    const visited = new Set<string>();
    const find = (save: Save): Save | undefined => {
      const node = byId.get(save.frames.at(-1)!.node);
      if (visited.has(node.id)) return;
      visited.add(node.id);
      if (node.id === targetId) return save;
      if (node.kind === 'end') return;
      for (const choice of node.kind === 'choice'
        ? node.choices.map((entry: any) => entry.id)
        : [undefined]) {
        const result = find(advance(episode, save, choice));
        if (result) return result;
      }
    };
    const save = find(startSave(episode));
    expect(save).toBeTruthy();
    const data = emptyData();
    data.preferences.textSpeed = 0;
    await page.addInitScript(
      (value) => localStorage.setItem('onlystory.v1', JSON.stringify(value)),
      data,
    );
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      `/read/ba/ba-jp-${group}?line=${encodeURIComponent(targetId)}&choices=${encodeURIComponent(JSON.stringify(save!.frames.at(-1)!.answers))}`,
    );
    const touch = page.getByRole('button', {
      name: 'Touch fingertips',
      exact: true,
    });
    await expect(touch).toBeVisible({ timeout: 45000 });
    const box = (await touch.boundingBox())!;
    const stage = (await page.getByTestId('ba-scene').boundingBox())!;
    const image = await page
      .locator('.ba-background')
      .evaluate(async (element) => {
        const image = new Image();
        image.src = getComputedStyle(element).backgroundImage.slice(5, -2);
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
      });
    const designHeight = (3000 * image.height) / image.width;
    const scale = Math.max(stage.width / 3000, stage.height / designHeight);
    expect(box.x + box.width / 2).toBeCloseTo(
      stage.x + stage.width / 2 + x * scale,
      0,
    );
    expect(box.y + box.height / 2).toBeCloseTo(
      stage.y + stage.height / 2 - 203 * scale,
      0,
    );
    expect(box.width).toBeCloseTo(300 * scale, 0);
    expect(box.height).toBeCloseTo(300 * scale, 0);
    await page.screenshot({ path: info.outputPath(`touch-${group}.png`) });
    await page
      .getByRole('button', { name: 'Finish scene', exact: true })
      .click();
    await expect(touch).toBeVisible();
    expect(new URL(page.url()).searchParams.get('line')).toBe(targetId);
    await touch.click();
    await expect(touch).toHaveCount(0);
    await expect
      .poll(() => new URL(page.url()).searchParams.get('line'))
      .not.toBe(targetId);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
