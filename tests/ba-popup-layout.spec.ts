import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  emptyData,
  startSave,
  advance,
  type Episode,
  type Save,
} from '../src/model';

function popupRoute(group: number, popup: string) {
  const read = (name: string) =>
    JSON.parse(
      readFileSync(`public/private/ba-jp/${group}/${name}.json`, 'utf8'),
    );
  const chapter = read('chapter') as Episode;
  const source = read('source');
  const seen = new Set<string>();
  function visit(save: Save): Save | undefined {
    const node = chapter.nodes.find((n) => n.id === save.frames.at(-1)!.node)!;
    if (seen.has(node.id)) return;
    seen.add(node.id);
    if (
      node.kind === 'text' &&
      source.content[node.source?.row ?? -1]?.PopupFileName === popup
    )
      return save;
    if (node.kind === 'end') return;
    for (const choice of node.kind === 'choice'
      ? node.choices.map((c) => c.id)
      : [undefined]) {
      const found = visit(advance(chapter, save, choice));
      if (found) return found;
    }
  }
  const save = visit(startSave(chapter));
  if (!save) throw new Error(`Missing popup ${popup}`);
  const frame = save.frames.at(-1)!;
  return `/read/ba/ba-jp-${group}?line=${encodeURIComponent(frame.node)}&choices=${encodeURIComponent(JSON.stringify(frame.answers))}`;
}

for (const [group, popup] of [
  [10004010, 'popup42'],
  [10000005, 'popup22'],
  [10002140, 'popup30'],
] as const) {
  test(`${popup} stays fully visible above dialogue at desktop and phone sizes`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    const data = emptyData();
    data.preferences.textLocale = 'ja';
    data.preferences.textSpeed = 0;
    await page.addInitScript(
      (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
      data,
    );
    await page.goto(popupRoute(group, popup));
    await expect(page.getByTestId('ba-scene')).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 45000 },
    );
    for (const viewport of [
      { width: 2233, height: 1646 },
      { width: 1365, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const image = page.locator('.ba-popup img');
      await expect(image).toBeVisible();
      await expect
        .poll(async () =>
          image.evaluate((img) => {
            const art = img.getBoundingClientRect();
            const slot = img.parentElement!.getBoundingClientRect();
            const dialogue = document
              .querySelector('.dialogue-window')!
              .getBoundingClientRect();
            return (
              art.width > 0 &&
              art.height > 0 &&
              art.top >= slot.top - 1 &&
              art.left >= slot.left - 1 &&
              art.right <= slot.right + 1 &&
              art.bottom <= slot.bottom + 1 &&
              art.bottom <= dialogue.top
            );
          }),
        )
        .toBe(true);
      await page.screenshot({ path: info.outputPath(`${viewport.width}.png`) });
    }
  });
}
