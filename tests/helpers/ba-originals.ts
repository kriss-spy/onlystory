import { test, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import recipe from '../../src/downloads/ba/recipe.json' with { type: 'json' };

export function baOriginalFolder(
  info: TestInfo,
  inputs: { id: number; filename: string }[],
) {
  const retained = '.cache/ba-browser-import/input-paths.json';
  test.skip(
    !fs.existsSync(retained),
    'Requires retained verified BA originals.',
  );
  const originals: string[] = JSON.parse(fs.readFileSync(retained, 'utf8'));
  const shared = '.cache/ba-all-downloads/input-paths.json';
  const sharedPaths: string[] = fs.existsSync(shared)
    ? JSON.parse(fs.readFileSync(shared, 'utf8'))
    : [];
  for (const input of inputs) originals[input.id] ??= sharedPaths[input.id];
  test.skip(
    !inputs.every((input) => fs.existsSync(originals[input.id] ?? '')),
    'Retained BA originals are unavailable.',
  );
  const folder = info.outputPath('originals');
  fs.mkdirSync(folder, { recursive: true });
  for (const input of inputs)
    fs.linkSync(
      path.resolve(originals[input.id]),
      path.join(folder, input.filename),
    );
  return folder;
}

export function prologueOriginalFolder(info: TestInfo) {
  return baOriginalFolder(info, recipe.inputs);
}

export async function selectPrologueOriginals(page: Page, info: TestInfo) {
  const folder = prologueOriginalFolder(info);
  await page
    .getByRole('button', { name: 'Select stories to download', exact: true })
    .click();
  await page
    .getByRole('checkbox', { name: 'Select プロローグ · 11000', exact: true })
    .check();
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('button', { name: 'Download selected stories (1)', exact: true })
    .click();
  await (await chooser).setFiles(folder);
}
