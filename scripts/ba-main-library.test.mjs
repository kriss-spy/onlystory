import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  TextureAtlas,
  AtlasAttachmentLoader,
  SkeletonBinary,
} from '@esotericsoftware/spine-webgl';
import { compileStory } from './ba-story.mjs';
import { compileBaScenes } from './ba-scenes.mjs';
import {
  baSourceCorrections,
  applyBaSourceCorrections,
} from '../src/playback/ba/source-corrections.ts';
import { canonicalBaScriptLine } from '../src/playback/ba/script.ts';
import { resolveBaExpression } from '../src/playback/ba/expressions.ts';

const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const definitions = (await read('scripts/ba-library.json')).filter(
  (definition) => definition.category === 'Main story',
);
test(
  'every selected JP main-story chapter has a complete graph, source accounting and verified assets',
  { skip: definitions.length < 2 },
  async () => {
    assert.ok(
      definitions.length >= 600,
      'The selected pinned JP main-story inventory is complete',
    );
    const catalog = await read('src/generated/ba-stories.json');
    const files = new Map(),
      skeletons = new Map();
    const skeleton = async (asset) => {
      if (!skeletons.has(asset.skeleton)) {
        const atlas = new TextureAtlas(
          await fs.readFile('public' + asset.atlas, 'utf8'),
        );
        skeletons.set(
          asset.skeleton,
          new SkeletonBinary(new AtlasAttachmentLoader(atlas)).readSkeletonData(
            await fs.readFile('public' + asset.skeleton),
          ),
        );
      }
      return skeletons.get(asset.skeleton);
    };
    const statistics = {
      chapters: definitions.length,
      rows: 0,
      passages: 0,
      invisibleActors: 0,
      spineBackgrounds: 0,
      sourceCorrections: 0,
      expressionWarnings: 0,
    };
    for (const definition of definitions) {
      const prefix = `public/private/ba-jp/${definition.group}/`;
      const episode = catalog.find(
        (entry) => entry.id === `ba-jp-${definition.group}`,
      );
      assert.ok(episode, `Missing main-story chapter ${definition.group}`);
      assert.equal(episode.renderer.id, 'ba-scene');
      assert.equal(episode.collectionId, definition.collectionId);
      const [raw, names, assets, chapter, stored] = await Promise.all(
        ['source', 'characters', 'assets', 'chapter', 'scenes'].map((name) =>
          read(prefix + name + '.json'),
        ),
      );
      const rawBefore = JSON.stringify(raw);
      const compiled = compileStory(raw, names);
      const program = compileBaScenes(raw, compiled, assets);
      assert.equal(
        JSON.stringify(raw),
        rawBefore,
        'Source bytes must not be changed by compatibility corrections',
      );
      assert.deepEqual(
        stored.steps,
        program.steps,
        `Scene/source row alignment ${definition.group}`,
      );
      assert.deepEqual(
        stored.sourceCorrections ?? [],
        baSourceCorrections(definition.group),
      );
      assert.deepEqual(stored.warnings ?? [], program.warnings ?? []);
      assert.equal(chapter.coverage.sourceRows, raw.content.length);
      assert.equal(chapter.nodes.length, episode.content.count);
      const byId = new Map(chapter.nodes.map((node) => [node.id, node]));
      const visited = new Set();
      const visit = (id, active = new Set()) => {
        assert.ok(!active.has(id), `Story cycle ${id}`);
        if (visited.has(id)) return;
        const node = byId.get(id);
        assert.ok(node, `Missing passage target ${id}`);
        visited.add(id);
        for (const next of node.kind === 'choice'
          ? node.choices.map((choice) => choice.next)
          : node.next
            ? [node.next]
            : [])
          visit(next, new Set([...active, id]));
      };
      visit(chapter.entryNodeId);
      assert.equal(
        visited.size,
        chapter.nodes.length,
        `Unreachable main-story passages ${definition.group}`,
      );
      for (const file of assets.files) {
        assert.ok(
          episode.assets.includes(file.url),
          `Missing offline asset ${file.url}`,
        );
        if (files.has(file.url)) {
          assert.deepEqual(files.get(file.url), {
            bytes: file.bytes,
            sha256: file.sha256,
          });
          continue;
        }
        const bytes = await fs.readFile('public' + file.url);
        assert.equal(bytes.length, file.bytes, file.url);
        assert.equal(
          createHash('sha256').update(bytes).digest('hex'),
          file.sha256,
          file.url,
        );
        files.set(file.url, { bytes: file.bytes, sha256: file.sha256 });
      }
      for (const [name, asset] of Object.entries(assets.characters)) {
        if (asset.invisible) {
          assert.equal(asset.skeleton, '');
          assert.deepEqual(asset.pages, []);
          statistics.invisibleActors++;
          continue;
        }
        const data = await skeleton(asset);
        assert.deepEqual(
          asset.expressionNames,
          data.animations.map((animation) => animation.name),
          `Expression inventory ${definition.group} ${name}`,
        );
        if (asset.skin)
          assert.ok(
            data.findSkin(asset.skin),
            `Authored skin ${name}: ${asset.skin}`,
          );
        for (const [index, row] of applyBaSourceCorrections(
          raw,
        ).content.entries())
          for (const line of row.ScriptKr.split('\n')) {
            const [slot, actor, face] = canonicalBaScriptLine(line).split(';');
            if (!/^[1-5]$/.test(slot) || actor !== name) continue;
            const resolution = resolveBaExpression(face, asset.expressionNames);
            if (resolution.mode === 'hold')
              assert.ok(
                program.warnings?.some(
                  (warning) =>
                    warning.row === index &&
                    warning.character === name &&
                    warning.expression === face,
                ),
                `Unrecorded expression fallback ${definition.group}:${index} ${name} ${face}`,
              );
            else if (resolution.animation)
              assert.ok(
                data.findAnimation(resolution.animation),
                `${name}: ${face}`,
              );
          }
      }
      for (const asset of Object.values(assets.backgrounds))
        if (asset.renderer === 'spine') {
          const data = await skeleton(asset);
          assert.ok(
            data.findAnimation(asset.animation ?? 'Idle_01'),
            `Animated background ${asset.name}`,
          );
          for (const url of [asset.atlas, asset.skeleton, ...asset.pages])
            assert.ok(
              assets.files.some((file) => file.url === url),
              `Missing animated background file ${url}`,
            );
          statistics.spineBackgrounds++;
        }
      statistics.rows += raw.content.length;
      statistics.passages += chapter.nodes.length;
      statistics.sourceCorrections += (stored.sourceCorrections ?? []).length;
      statistics.expressionWarnings += (stored.warnings ?? []).length;
    }
    statistics.sharedFiles = files.size;
    statistics.skeletons = skeletons.size;
    await fs.mkdir('.cache', { recursive: true });
    await fs.writeFile(
      '.cache/ba-main-library-verification.json',
      JSON.stringify(statistics, null, 2),
    );
  },
);
