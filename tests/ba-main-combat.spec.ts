import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { emptyData } from '../src/model';

const read = (group: number, name: string) =>
  JSON.parse(
    readFileSync(`public/private/ba-jp/${group}/${name}.json`, 'utf8'),
  );
for (const [group, name] of [
  [13130, 'Shot_Center'],
  [212120, 'nkultra'],
  [212180, 'nkultrabreak'],
] as const) {
  test(`native ${name} effect plays once during an authored row and is suppressed by seeking`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const source = read(group, 'source');
    const row = source.content.find((row: any) =>
      row.ScriptKr.includes(`;${name}`),
    );
    expect(row).toBeTruthy();
    const originalAssets = read(group, 'assets');
    const program = read(11000, 'scenes');
    Object.assign(program.assets.characters, originalAssets.characters);
    Object.assign(program.assets.effects, originalAssets.effects);
    const step = program.steps.find((step: any) => step.id === '11000:90');
    // Replay the exact authored command in an already reachable prologue step.
    step.rows.at(-1).ScriptKr = `#all;hide\n${row.ScriptKr}`;
    await page.route('**/private/ba-jp/11000/scenes.json*', (route) =>
      route.fulfill({ json: program }),
    );
    const data = emptyData();
    data.preferences.textLocale = 'ja';
    data.preferences.textSpeed = 0;
    await page.addInitScript(
      (value) => localStorage.setItem('onlystory.v1', JSON.stringify(value)),
      data,
    );
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/read/ba/ba-jp-11000?line=11000%3A88');
    await expect(page.getByTestId('ba-scene')).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 45000 },
    );
    await page.evaluate(() => {
      (window as any).observedCombat = [];
      new MutationObserver(() => {
        for (const element of document.querySelectorAll<HTMLElement>(
          '.ba-combat-effect',
        )) {
          (window as any).observedCombat.push({
            name: element.dataset.effect,
            pieces: element.children.length,
            masks: [...element.children].map(
              (child) => getComputedStyle(child).maskImage,
            ),
          });
        }
      }).observe(document.querySelector('.ba-combat')!, {
        childList: true,
        subtree: true,
      });
    });
    await page
      .getByRole('button', { name: 'Next passage', exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          (expected) =>
            (window as any).observedCombat.some(
              (entry: any) =>
                entry.name === expected &&
                entry.pieces > 0 &&
                entry.masks.every((mask: string) => mask !== 'none'),
            ),
          name,
        ),
      )
      .toBe(true);
    await expect(page.getByTestId('ba-scene')).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 15000 },
    );
    expect(
      await page
        .locator('.ba-combat-effect')
        .evaluateAll((elements) =>
          elements.every((element) =>
            [...element.children].every(
              (child) => Number(getComputedStyle(child).opacity) === 0,
            ),
          ),
        ),
    ).toBe(true);
    await page.goto('/read/ba/ba-jp-11000?line=11000%3A90');
    await expect(page.getByTestId('ba-scene')).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 45000 },
    );
    await expect(page.locator('.ba-combat-effect')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
