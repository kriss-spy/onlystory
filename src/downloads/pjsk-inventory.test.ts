import { it, expect } from 'vitest';
import { savePjskInventory, installationFiles } from './pjsk-inventory';
import { pjskDownloads } from './pjsk-catalog';
import reviewedRecipe from './pjsk-mmj-01-01.json';

it('excludes import-only discovery metadata from catalog and old installation inventories', async () => {
  const discovery = reviewedRecipe.media.files.find((file) =>
    file.sourceUrl?.endsWith('/live2d/model_list.json'),
  )!;
  for (const { episode } of pjskDownloads)
    expect(episode.assets).not.toContain(discovery.url);
  const { cache, records } = storage();
  const actual = '/private/pjsk/assets/actual.json';
  const pointers = await savePjskInventory(cache, 'story', [
    discovery.url,
    actual,
  ]);
  expect((await (await cache.match(pointers[0]))!.json()).files).toEqual([
    actual,
  ]);
  records.set(
    pointers[0],
    new Response(
      JSON.stringify({
        version: 1,
        id: 'story',
        files: [discovery.url, actual],
      }),
    ),
  );
  expect(await installationFiles(cache, 'story', pointers)).toEqual([
    ...pointers,
    actual,
  ]);
  expect(
    await installationFiles(cache, 'legacy', [discovery.url, actual]),
  ).toEqual([actual]);
});

function storage() {
  const records = new Map<string, Response>();
  return {
    records,
    cache: {
      put: async (url: string, response: Response) => {
        records.set(url, response);
      },
      match: async (url: string) => records.get(url)?.clone(),
    } as unknown as Cache,
  };
}
it('keeps the whole catalog installation index below localStorage limits and preserves its full inventories', async () => {
  const { cache } = storage();
  const installations: Record<
    string,
    { files: string[]; voices: string[]; variants: string[] }
  > = {};
  for (const { episode } of pjskDownloads) {
    const files = [
      ...episode.assets,
      (episode.renderer!.payload as { url: string }).url,
    ];
    const pointers = await savePjskInventory(cache, episode.id, files);
    installations[episode.id] = {
      files: pointers,
      voices: ['zh-CN', 'ja'],
      variants: ['male:ja', 'female:ja', 'male:zh-CN', 'female:zh-CN'],
    };
    const restored = await installationFiles(cache, episode.id, pointers);
    for (const file of files) expect(restored).toContain(file);
  }
  expect(
    new TextEncoder().encode(JSON.stringify(installations)).length,
  ).toBeLessThan(1024 * 1024);
});
it('rejects a malformed manifest and retains the missing manifest path for reconciliation', async () => {
  const { cache, records } = storage();
  const pointers = await savePjskInventory(cache, 'pjsk-cn-unit-30001', [
    '/private/pjsk/assets/text.json',
  ]);
  records.set(
    pointers[0],
    new Response(
      JSON.stringify({
        version: 1,
        id: 'another-story',
        files: ['/private/text.json'],
      }),
    ),
  );
  await expect(
    installationFiles(cache, 'pjsk-cn-unit-30001', pointers),
  ).rejects.toThrow('Invalid chapter');
  records.clear();
  expect(
    await installationFiles(cache, 'pjsk-cn-unit-30001', pointers),
  ).toEqual(pointers);
  expect(
    await installationFiles(cache, 'older', ['/private/original.json']),
  ).toEqual(['/private/original.json']);
});
