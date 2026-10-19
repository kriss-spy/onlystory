import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

test('Shiroko close-up loads the full-resolution original Windows texture', async ({
  page,
}) => {
  const path = 'public/private/ba-jp/11020/assets.json';
  test.skip(
    !fs.existsSync(path),
    'Requires the acquired BA main-story library',
  );
  const assets = JSON.parse(fs.readFileSync(path, 'utf8'));
  const character = Object.values(assets.characters).find(
    (value: any) => value.model === 'shiroko_spr',
  ) as any;
  expect(character.textureSource.platform).toBe('Windows');
  const url = character.pages[0] as string;
  expect(url).toContain('/characters-hd/');
  const png = fs.readFileSync('public' + url);
  const old = fs.readFileSync(
    'public/private/ba-jp/shared/media/characters/shiroko_spr/shiroko_spr.png',
  );
  expect(png.readUInt32BE(16)).toBeGreaterThan(old.readUInt32BE(16));
  const scene = JSON.parse(
    fs.readFileSync('public/private/ba-jp/11020/scenes.json', 'utf8'),
  );
  const revision = createHash('sha256')
    .update(JSON.stringify(scene))
    .digest('hex')
    .slice(0, 16);
  const episodes = JSON.parse(
    fs.readFileSync('src/generated/ba-stories.json', 'utf8'),
  );
  const episode = episodes.find((value: any) => value.id === 'ba-jp-11020');
  expect(episode.content.sceneUrl).toBe(
    `/private/ba-jp/11020/scenes.json?v=${revision}`,
  );
  expect(episode.assets).toContain(url);
  expect(episode.assets).not.toContain(
    url.replace('/characters-hd/', '/characters/'),
  );
  const loaded: string[] = [];
  page.on('response', (response) => {
    if (response.ok()) loaded.push(new URL(response.url()).pathname);
  });
  await page.goto(
    '/read/ba/ba-jp-11020?line=11020%3A42&choices=%7B%2211020%3A20%22%3A%22s1%22%7D',
  );
  await expect(page.locator('.dialogue-window p')).toContainText(
    'ライディング用なんだけど',
    { timeout: 20000 },
  );
  await expect.poll(() => loaded.includes(url), { timeout: 20000 }).toBe(true);
  await expect(page.getByTestId('ba-scene')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 30000 },
  );
  await expect(page.locator('.ba-canvas')).toHaveAttribute(
    'data-characters',
    /shiroko_spr:/,
  );
  await expect(
    page.getByRole('button', { name: 'Retry scene', exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: 'test-results/shiroko-full-resolution.png' });
});
