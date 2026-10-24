import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compileStory } from './ba-story.mjs';
import { compileBaScenes } from './ba-scenes.mjs';
import { resolveBaExpression } from '../src/playback/ba/expressions.ts';
import expressionGaps from '../src/playback/ba/expression-gaps.json' with { type: 'json' };
import { applyBaSourceCorrections } from '../src/playback/ba/source-corrections.ts';
import { canonicalBaScriptLine } from '../src/playback/ba/script.ts';
import {
  TextureAtlas,
  AtlasAttachmentLoader,
  SkeletonBinary,
} from '@esotericsoftware/spine-webgl';

const root = new URL('../', import.meta.url);
const read = async (name) =>
  JSON.parse(await fs.readFile(new URL(name, root), 'utf8'));
const definitions = await read('scripts/ba-library.json');
const events = definitions.filter((d) => d.category === 'Event');
test(
  'the selected JP event batch publishes every chapter with complete verified media',
  {
    skip:
      !events.length ||
      !existsSync(
        new URL(`public/private/ba-jp/${events[0].group}/source.json`, root),
      ),
  },
  async () => {
    assert.ok(
      new Set(events.map((e) => e.collectionId)).size >= 5,
      'At least five complete event collections',
    );
    const catalog = await read('src/generated/ba-stories.json');
    const checkedFiles = new Map();
    const skeletons = new Map();
    for (const definition of events) {
      const episode = catalog.find((e) => e.id === `ba-jp-${definition.group}`);
      assert.ok(episode, `Missing selected chapter ${definition.group}`);
      assert.equal(episode.collectionId, definition.collectionId);
      assert.equal(episode.renderer.id, 'ba-scene');
      const prefix = `public/private/ba-jp/${definition.group}/`;
      const [source, names, assets, chapter, stored] = await Promise.all(
        [
          'source.json',
          'characters.json',
          'assets.json',
          'chapter.json',
          'scenes.json',
        ].map((n) => read(prefix + n)),
      );
      const compiled = compileStory(source, names);
      const program = compileBaScenes(source, compiled, assets);
      assert.deepEqual(
        stored.steps,
        program.steps,
        `Scene alignment ${definition.group}`,
      );
      assert.equal(chapter.coverage.sourceRows, source.content.length);
      assert.equal(chapter.nodes.length, episode.content.count);
      const byId = new Map(chapter.nodes.map((n) => [n.id, n]));
      const seen = new Set();
      const visit = (id) => {
        if (seen.has(id)) return;
        const node = byId.get(id);
        assert.ok(node, `Broken target ${id}`);
        seen.add(id);
        for (const next of node.kind === 'choice'
          ? node.choices.map((c) => c.next)
          : node.next
            ? [node.next]
            : [])
          visit(next);
      };
      visit(chapter.entryNodeId);
      assert.equal(
        seen.size,
        chapter.nodes.length,
        `Unreachable event passages ${definition.group}`,
      );
      for (const file of assets.files) {
        assert.ok(
          episode.assets.includes(file.url),
          `Missing download ${file.url}`,
        );
        if (checkedFiles.has(file.url)) {
          assert.deepEqual(
            checkedFiles.get(file.url),
            { bytes: file.bytes, sha256: file.sha256 },
            `Conflicting shared file ${file.url}`,
          );
          continue;
        }
        const bytes = await fs.readFile(new URL('public' + file.url, root));
        assert.equal(bytes.length, file.bytes, file.url);
        assert.equal(
          createHash('sha256').update(bytes).digest('hex'),
          file.sha256,
          file.url,
        );
        checkedFiles.set(file.url, { bytes: file.bytes, sha256: file.sha256 });
      }
      for (const [name, asset] of Object.entries(assets.characters)) {
        if (asset.invisible) {
          assert.equal(asset.skeleton, '');
          assert.deepEqual(asset.pages, []);
          continue;
        }
        if (!skeletons.has(asset.skeleton)) {
          const atlas = new TextureAtlas(
            await fs.readFile(new URL('public' + asset.atlas, root), 'utf8'),
          );
          skeletons.set(
            asset.skeleton,
            new SkeletonBinary(
              new AtlasAttachmentLoader(atlas),
            ).readSkeletonData(
              await fs.readFile(new URL('public' + asset.skeleton, root)),
            ),
          );
        }
        const data = skeletons.get(asset.skeleton);
        assert.ok(data.animations.length, name);
        assert.deepEqual(
          asset.expressionNames,
          data.animations.map((animation) => animation.name),
          `Expression metadata ${name}`,
        );
        const declaredGaps = new Set(
          expressionGaps
            .filter((gap) => gap.group === definition.group)
            .map((gap) => `${gap.row}:${gap.model}:${gap.face}`),
        );
        const corrected = applyBaSourceCorrections(source);
        for (
          let rowIndex = 0;
          rowIndex < corrected.content.length;
          rowIndex++
        ) {
          const row = corrected.content[rowIndex];
          for (const line of row.ScriptKr.split('\n')) {
            const [slot, actor, face] = canonicalBaScriptLine(line).split(';');
            if (/^[1-5]$/.test(slot) && actor === name) {
              const resolution = resolveBaExpression(
                face,
                asset.expressionNames,
              );
              if (resolution.mode === 'hold') {
                assert.ok(
                  declaredGaps.has(`${rowIndex}:${asset.model}:${face}`),
                  `Undeclared held expression ${definition.group}:${rowIndex} ${asset.model} ${face}`,
                );
                assert.ok(
                  program.warnings.some(
                    (warning) =>
                      warning.expression === face &&
                      warning.behavior === 'keep-previous-expression',
                  ),
                );
              } else if (resolution.mode === 'unchanged') {
                // Placement-only actor line: no expression requested.
              } else if (resolution.animation)
                assert.ok(
                  data.findAnimation(resolution.animation),
                  `${definition.group} ${name} ${face}`,
                );
              else {
                assert.equal(resolution.mode, 'neutral');
                assert.ok(['00', '01'].includes(face));
                assert.ok(
                  data.findAnimation('Idle_01'),
                  `Neutral NPC keeps Idle_01: ${name}`,
                );
              }
            }
          }
        }
      }
    }
  },
);
