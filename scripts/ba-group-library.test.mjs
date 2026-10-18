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
  applyBaSourceCorrections,
  baSourceCorrections,
} from '../src/playback/ba/source-corrections.ts';
import { canonicalBaScriptLine } from '../src/playback/ba/script.ts';
import { resolveBaExpression } from '../src/playback/ba/expressions.ts';

const root = new URL('../', import.meta.url);
const read = async (file) =>
  JSON.parse(await fs.readFile(new URL(file, root), 'utf8'));
const definitions = (await read('scripts/ba-library.json')).filter(
  (definition) => definition.category === 'Group story',
);

test(
  'every selected JP Club group story has a complete graph, source accounting and verified assets',
  { skip: !definitions.length },
  async () => {
    const coverage = await read('.cache/ba-group-source/coverage.json');
    assert.equal(coverage.eligibleModes, 68);
    assert.equal(coverage.exportedGroups, 68);
    assert.equal(coverage.collections, 27);
    assert.equal(coverage.rows, 9310);
    assert.equal(coverage.japaneseRows, 5957);
    assert.equal(coverage.selectionGroups, 44);
    assert.equal(coverage.missingLabels.length, 0);
    assert.equal(coverage.emptyGroups.length, 0);
    assert.equal(coverage.unresolvedVoices.length, 0);
    assert.equal(coverage.volumeClubConflicts.length, 0);

    const catalog = await read('src/generated/ba-stories.json');
    const episodes = catalog.filter(
      (episode) => episode.game === 'ba' && episode.category === 'Group story',
    );
    assert.equal(episodes.length, 68);
    assert.equal(
      new Set(episodes.map((episode) => episode.collectionId)).size,
      27,
    );

    const files = new Map();
    const skeletons = new Map();
    const skeleton = async (asset) => {
      if (!skeletons.has(asset.skeleton)) {
        const atlas = new TextureAtlas(
          await fs.readFile(new URL('public' + asset.atlas, root), 'utf8'),
        );
        skeletons.set(
          asset.skeleton,
          new SkeletonBinary(new AtlasAttachmentLoader(atlas)).readSkeletonData(
            await fs.readFile(new URL('public' + asset.skeleton, root)),
          ),
        );
      }
      return skeletons.get(asset.skeleton);
    };

    const statistics = {
      chapters: definitions.length,
      collections: new Set(
        definitions.map((definition) => definition.collectionId),
      ).size,
      rows: 0,
      passages: 0,
      choices: 0,
      sourceGaps: 0,
      expressionWarnings: 0,
    };
    for (const definition of definitions) {
      const prefix = `public/private/ba-jp/${definition.group}/`;
      const episode = catalog.find(
        (entry) => entry.id === `ba-jp-${definition.group}`,
      );
      assert.ok(episode, `Missing group story ${definition.group}`);
      assert.equal(episode.category, 'Group story');
      assert.equal(episode.collectionId, definition.collectionId);
      assert.equal(episode.renderer.id, 'ba-scene');
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
      assert.equal(Object.keys(assets.videos ?? {}).length, 0);
      assert.equal(Object.keys(assets.cutscenes ?? {}).length, 0);

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
        `Unreachable group-story passages ${definition.group}`,
      );

      for (const file of assets.files) {
        assert.ok(
          episode.assets.includes(file.url),
          `Missing download ${file.url}`,
        );
        if (files.has(file.url)) {
          assert.deepEqual(
            files.get(file.url),
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
        files.set(file.url, { bytes: file.bytes, sha256: file.sha256 });
      }

      for (const [name, asset] of Object.entries(assets.characters)) {
        if (asset.invisible) {
          assert.equal(asset.skeleton, '');
          assert.deepEqual(asset.pages, []);
          continue;
        }
        const data = await skeleton(asset);
        assert.deepEqual(
          asset.expressionNames,
          data.animations.map((animation) => animation.name),
          `Expression inventory ${definition.group} ${name}`,
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

      statistics.rows += raw.content.length;
      statistics.passages += chapter.nodes.length;
      statistics.choices += chapter.coverage.choices;
      statistics.sourceGaps += (assets.sourceGaps ?? []).length;
      statistics.expressionWarnings += (stored.warnings ?? []).filter(
        (warning) => warning.expression,
      ).length;
    }
    statistics.sharedFiles = files.size;
    statistics.skeletons = skeletons.size;

    const collectionCatalog = await read('src/ba-catalog.json');
    const coverArt = await read('src/cover-art.json');
    const collections = new Set(
      definitions.map((definition) => definition.collectionId),
    );
    assert.equal(collections.size, 27);
    assert.equal(
      Object.keys(collectionCatalog.collections).filter((id) =>
        id.startsWith('ba-jp-group-'),
      ).length,
      27,
    );
    const knownSchools = new Set(
      collectionCatalog.schools.map((school) => school.id),
    );
    const covers = new Set();
    for (const collectionId of collections) {
      const metadata = collectionCatalog.collections[collectionId];
      assert.ok(metadata, `Missing catalog metadata ${collectionId}`);
      assert.equal(metadata.schools.length, 1);
      assert.ok(
        knownSchools.has(metadata.schools[0]),
        `Unknown school ${metadata.schools[0]}`,
      );
      assert.ok(
        metadata.groupStory?.emblemId,
        `Missing emblem ${collectionId}`,
      );
      const cover = coverArt.events[`ba:${collectionId}`];
      assert.ok(cover, `Missing cover ${collectionId}`);
      assert.equal(cover.kind, 'official-game-art');
      assert.ok(!covers.has(cover.url), `Duplicate group cover ${cover.url}`);
      covers.add(cover.url);
      const bytes = await fs.readFile(new URL('public' + cover.url, root));
      assert.equal(bytes.length, cover.bytes, cover.url);
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        cover.sha256,
        cover.url,
      );
    }
    await fs.mkdir('.cache', { recursive: true });
    await fs.writeFile(
      '.cache/ba-group-library-verification.json',
      JSON.stringify(statistics, null, 2),
    );
  },
);
