import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import initSqlJs from 'sql.js';
import { decryptDatabase, decodeRow } from '../src/downloads/ba/database.mjs';
import { compileStory } from './ba-story.mjs';
import { compileBaScenes } from './ba-scenes.mjs';
import emotionSounds from '../src/playback/ba/emotion-sounds.json' with { type: 'json' };
import { canonicalBaScriptLine } from '../src/playback/ba/script.ts';
import { syncBaRecipeAssets } from './publish-ba-emotion-sounds.mjs';

const root = process.cwd(),
  recipeDir = path.join(root, 'src/downloads/ba/recipes');
const database = path.join(
  root,
  '.cache/ba-jp-assets/jp/android/raw/tables/ExcelDB.db',
);
const catalogPath = path.join(root, 'src/downloads/ba/catalog.json');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('incremental prologue audio publication reuses original input identity', () => {
  const original = { id: 147, url: 'official.zip', sha256: 'source' };
  const file = { url: '/emotion.wav', bytes: 12, sha256: 'waveform' };
  const selector = { ...file, kind: 'vorbis', input: 147, name: 'Question' };
  const recipe = { inputs: [{ ...original, id: 4 }], outputs: [] };
  const assets = { files: [file] };
  syncBaRecipeAssets(
    recipe,
    assets,
    { id: 'prologue' },
    new Map([[file.url, selector]]),
    [original],
  );
  assert.equal(recipe.inputs.length, 1);
  assert.equal(recipe.outputs[0].input, 4);
  assert.equal(selector.input, 147);
  assert.throws(
    () =>
      syncBaRecipeAssets(
        { inputs: [], outputs: [] },
        assets,
        {},
        new Map([[file.url, { ...selector, sha256: 'wrong' }]]),
        [original],
      ),
    /Missing verified/,
  );
});
test(
  'all BA download recipes compile original text into complete reader chapters and scenes',
  {
    skip:
      !fs.existsSync(database) || !fs.existsSync(catalogPath)
        ? 'Prepare pinned BA original database and download recipes first'
        : false,
  },
  async () => {
    const catalog = read(catalogPath),
      definitions = read('scripts/ba-library.json');
    assert.equal(catalog.length, definitions.length);
    const recipes = catalog.map((entry) => {
      const bytes = fs.readFileSync(path.join(recipeDir, entry.recipe));
      assert.equal(bytes.length, entry.bytes);
      assert.equal(sha(bytes), entry.sha256);
      return JSON.parse(gunzipSync(bytes));
    });
    const first = recipes.find((r) => r.source),
      original = fs.readFileSync(database);
    assert.equal(
      sha(original),
      first.inputs.find((i) => i.id === first.source.input).sha256,
    );
    const plain = await decryptDatabase(original, first.source.key);
    const SQL = await initSqlJs(),
      db = new SQL.Database(plain);
    try {
      const names = {
        DataList: db
          .exec(
            'SELECT Bytes FROM ScenarioCharacterNameDBSchema ORDER BY rowid',
          )[0]
          .values.map(([b]) => decodeRow(b, 'ScenarioCharacterNameExcel')),
      };
      const statement = db.prepare(
        'SELECT Bytes FROM ScenarioScriptDBSchema WHERE GroupId=? ORDER BY rowid',
      );
      try {
        for (const recipe of recipes) {
          let source,
            characters = names;
          if (recipe.source) {
            statement.bind([recipe.group]);
            const content = [];
            while (statement.step()) {
              const row = decodeRow(statement.get()[0], 'ScenarioScriptExcel');
              if (row.VoiceId)
                row.VoiceJp = recipe.source.voiceNames?.[row.VoiceId] ?? '';
              content.push(row);
            }
            statement.reset();
            source = { GroupId: recipe.group, content };
          } else {
            // The prologue retains its pinned public BA Archive script snapshot.
            source = read(`public/private/ba-jp/${recipe.group}/source.json`);
            characters = read(
              `public/private/ba-jp/${recipe.group}/characters.json`,
            );
          }
          const chapter = compileStory(source, characters),
            scenes = compileBaScenes(source, chapter, recipe.assets);
          assert.equal(chapter.id, recipe.episode.id);
          assert.equal(
            chapter.nodes.length,
            recipe.episode.content.count,
            `${recipe.group} passage count`,
          );
          assert.equal(
            scenes.steps.length,
            chapter.nodes.length,
            `${recipe.group} scene step alignment`,
          );
          assert.deepEqual(
            scenes.steps
              .flatMap((step) => [...step.rows, ...(step.afterRows ?? [])])
              .map((row) => row.row)
              .sort((a, b) => a - b),
            Array.from({ length: source.content.length }, (_, i) => i),
            `${recipe.group} scene alignment`,
          );
          const outputs = new Set(recipe.outputs.map((o) => o.url));
          for (const row of source.content)
            for (const raw of row.ScriptKr.split('\n')) {
              const [slot, action, token] =
                canonicalBaScriptLine(raw).split(';');
              if (
                !/^#[1-5]$/.test(slot) ||
                action !== 'em' ||
                !emotionSounds[token]
              )
                continue;
              const clip = emotionSounds[token];
              const url = recipe.assets.sounds[clip];
              assert.ok(
                url,
                `${recipe.group} missing implicit emotion audio ${token}: ${clip}`,
              );
              assert.ok(
                outputs.has(url),
                `${recipe.group} missing offline emotion output ${clip}`,
              );
            }
          for (const file of recipe.assets.files)
            assert.ok(
              outputs.has(file.url),
              `${recipe.group} missing conversion output ${file.url}`,
            );
        }
      } finally {
        statement.free();
      }
    } finally {
      db.close();
    }
  },
);
