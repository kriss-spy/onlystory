import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import artwork from './cover-art.json';
import schools from './ba-catalog.json';
import assets from './catalog-assets.json';
import { gameArtwork, eventArtwork, groupArtwork } from './covers';
import { baSchools } from './ba-schools';

function urls(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === 'url' && typeof child === 'string' && child.startsWith('/private/')
      ? [child]
      : urls(child),
  );
}

it('ships every referenced catalog cover, logo and school emblem with verified release bytes', () => {
  const manifest = assets as Record<
    string,
    { url: string; sha256: string; bytes: number }
  >;
  const references = new Set(urls([artwork, schools.schools]));
  expect(Object.keys(manifest).sort()).toEqual([...references].sort());
  for (const original of references) {
    const entry = manifest[original];
    expect(entry.url).toMatch(/^\/catalog-art\/[a-f0-9]+\.webp$/);
    const bytes = readFileSync(
      new URL('../public' + entry.url, import.meta.url),
    );
    expect(bytes.length, original).toBe(entry.bytes);
    expect(createHash('sha256').update(bytes).digest('hex'), original).toBe(
      entry.sha256,
    );
  }
  for (const game of Object.keys(artwork.games))
    expect(gameArtwork(game)?.url).toMatch(/^\/catalog-art\//);
  for (const key of Object.keys(artwork.events)) {
    const [game, id] = key.split(':');
    const cover = eventArtwork({ game, id });
    expect(cover?.url).toMatch(/^\/catalog-art\//);
    if (cover?.logo) expect(cover.logo.url).toMatch(/^\/catalog-art\//);
  }
  for (const key of Object.keys(artwork.groups)) {
    const [game, group] = key.split(':');
    expect(groupArtwork(game, group)?.url).toMatch(/^\/catalog-art\//);
  }
  for (const school of baSchools)
    if (school.mark) expect(school.mark.url).toMatch(/^\/catalog-art\//);
});
