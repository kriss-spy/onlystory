import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import catalog from './ba/catalog.json';
import sources from './ba/sources.json';
import library from '../../scripts/ba-library.json';

describe('Blue Archive standalone acquisition coverage', () => {
  it('covers exactly the imported library using verified original sources', () => {
    expect(catalog.map((c) => c.group).sort((a, b) => a - b)).toEqual(
      library.map((c) => c.group).sort((a, b) => a - b),
    );
    const registry = new Map(sources.map((s) => [s.id, s]));
    for (const item of catalog) {
      const packed = fs.readFileSync(
        path.join(import.meta.dirname, 'ba/recipes', item.recipe),
      );
      expect(createHash('sha256').update(packed).digest('hex')).toBe(
        item.sha256,
      );
      const recipe = JSON.parse(gunzipSync(packed).toString());
      expect(recipe.episode.id).toBe(item.id);
      expect(recipe.outputs.map((o: { url: string }) => o.url).sort()).toEqual(
        recipe.assets.files.map((f: { url: string }) => f.url).sort(),
      );
      const ids = new Set(recipe.inputs.map((i: { id: number }) => i.id));
      for (const input of recipe.inputs) {
        expect(input).toEqual(registry.get(input.id));
        expect(input.url).toMatch(/^https:\/\//);
        expect(input.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(input.bytes).toBeGreaterThan(0);
      }
      for (const output of recipe.outputs) {
        if (output.input !== undefined)
          expect(ids.has(output.input)).toBe(true);
        if (output.soundInput !== undefined)
          expect(ids.has(output.soundInput)).toBe(true);
        if (output.kind === 'texture')
          expect(output.rgbaSha256).toMatch(/^[a-f0-9]{64}$/);
      }
      if (recipe.version === 2) {
        expect(ids.has(recipe.source.input)).toBe(true);
        expect(recipe.source.content).toBeUndefined();
        expect(recipe.source.key).toMatch(/^[a-f0-9]{64}$/i);
      }
    }
  }, 120_000);
});
