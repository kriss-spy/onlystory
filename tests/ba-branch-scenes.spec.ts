import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { emptyData } from '../src/model';

test('branch exit cues play only after its dialogue and survive seeking to the join', async ({
  page,
}) => {
  test.setTimeout(60000);
  const program = JSON.parse(
    await readFile('public/private/ba-jp/11000/scenes.json', 'utf8'),
  );
  const chapter = JSON.parse(
    await readFile('public/private/ba-jp/11000/chapter.json', 'utf8'),
  );
  const backgrounds = Object.keys(program.assets.backgrounds).map(Number);
  for (const [id, background] of [
    ['11000:191', backgrounds[1]],
    ['11000:192', backgrounds[2]],
  ] as const) {
    const step = program.steps.find((s: any) => s.id === id);
    step.afterRows = [
      {
        ...step.rows[0],
        row: 1000,
        TextJp: '',
        ScriptKr: '#wait;1',
        BGName: background,
      },
    ];
  }
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
  const ready = () =>
    expect(page.getByTestId('ba-scene')).toHaveAttribute('aria-busy', 'false', {
      timeout: 30000,
    });
  const background = () =>
    page
      .locator('.ba-canvas')
      .evaluate((e: any) => e.playbackDiagnostics.state.background);
  const answers: Record<string, string> = {};
  for (const row of [91, 105, 158, 164, 169]) answers[`11000:${row}`] = 's0';
  const url = (row: number) =>
    `/read/ba/ba-jp-11000?line=11000%3A${row}&choices=${encodeURIComponent(JSON.stringify(answers))}`;
  await page.goto(url(190));
  await ready();
  const before = await background();
  await page
    .getByRole('button', {
      name: chapter.nodes.find((n: any) => n.id === '11000:190').choices[0]
        .label.ja,
      exact: true,
    })
    .click();
  await ready();
  expect(await background()).toBe(before);
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await ready();
  expect(await background()).toBe(backgrounds[1]);
  answers['11000:190'] = 's2';
  await page.goto(url(194));
  await ready();
  expect(await background()).toBe(backgrounds[2]);
});
