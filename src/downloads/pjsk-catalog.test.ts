import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { compileChapter, rewriteModel, isPjskSourceFile } from './pjsk';
import { pjskDownloads } from './pjsk-catalog';
import type { PjskRecipe } from './pjsk-recipe';
import { pjskLibraryRoot } from '../../scripts/local-environment.mjs';

const hash = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
it('ships a pinned recipe for every imported main and event chapter', () => {
  const generated = fs
    .readdirSync('src/generated')
    .filter((f) => /^pjsk-.*\.json$/.test(f));
  const ids = new Set(pjskDownloads.map((c) => c.episode.id));
  expect(ids.size).toBe(pjskDownloads.length);
  for (const name of generated) expect(ids.has(name.slice(0, -5))).toBe(true);
  for (const entry of pjskDownloads) {
    const bytes = fs.readFileSync(
      path.join('src/downloads/pjsk-recipes', entry.recipe),
    );
    expect(bytes.length).toBe(entry.bytes);
    expect(hash(bytes)).toBe(entry.sha256);
    const recipe = JSON.parse(gunzipSync(bytes).toString()) as PjskRecipe;
    for (const file of [
      recipe.scenario,
      ...recipe.media.files.filter((f) => f.sourceUrl),
      ...(recipe.extraFiles ?? []),
    ]) {
      if (!isPjskSourceFile(file))
        throw Error(`Invalid source in ${entry.episode.id}: ${file.url}`);
    }
  }
});

it.skipIf(process.env.PJSK_VERIFY_CATALOG !== '1')(
  'reconstructs every chapter and model using the production browser compiler',
  () => {
    const packageNames = fs.readdirSync('.cache/pjsk/packages');
    const models = new Set<string>();
    for (const entry of pjskDownloads) {
      const recipe = JSON.parse(
        gunzipSync(
          fs.readFileSync(
            path.join('src/downloads/pjsk-recipes', entry.recipe),
          ),
        ).toString(),
      ) as PjskRecipe;
      const pkg = JSON.parse(
        fs.readFileSync(
          '.cache/pjsk/packages/' +
            packageNames.find((f) => f.startsWith(entry.episode.id + '-')),
          'utf8',
        ),
      );
      const { program, text } = compileChapter(pkg.scenario.source, recipe);
      expect(recipe.program.url).toContain(hash(JSON.stringify(program)));
      expect(recipe.text.url).toContain(hash(JSON.stringify(text)));
      expect(program.steps.length).toBe(entry.episode.content!.count);
      for (const model of recipe.models) {
        if (models.has(model.target)) continue;
        const original = JSON.parse(
          fs.readFileSync(path.join(pjskLibraryRoot, model.original), 'utf8'),
        );
        expect(model.target).toContain(
          hash(JSON.stringify(rewriteModel(original, model, recipe))),
        );
        models.add(model.target);
      }
    }
    fs.mkdirSync('.cache/pjsk-download-verification', { recursive: true });
    fs.writeFileSync(
      '.cache/pjsk-download-verification/corpus.json',
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          chapters: pjskDownloads.length,
          uniqueModelSettings: models.size,
          browserCompilerOutputsVerified: true,
        },
        null,
        2,
      ) + '\n',
    );
  },
  600000,
);
