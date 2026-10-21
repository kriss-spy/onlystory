import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordOutput,
  reusableOutput,
  requiredBaInputs,
  sha256,
} from '../src/downloads/ba/output-cache.mjs';
import {
  cacheDatabasePart,
  cachedDatabaseChapter,
} from '../src/downloads/ba/source-cache.mjs';

function cachesFixture() {
  const stores = new Map();
  globalThis.caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(key, value) {
          store.set(key, value.clone());
        },
        async match(key) {
          return store.get(key)?.clone();
        },
      };
    },
  };
  return stores;
}

test('reuses only matching source/selector receipts and verified media bytes', async () => {
  cachesFixture();
  const recipe = {
    inputs: [{ id: 1, sha256: 'source-a' }],
    outputs: [
      { input: 1, url: '/asset.png', kind: 'texture', rgbaSha256: 'pixels-a' },
    ],
  };
  const bytes = new Uint8Array([1, 2, 3]),
    output = recipe.outputs[0];
  await (
    await caches.open('onlystory.media.v1')
  ).put(output.url, new Response(bytes));
  await recordOutput(recipe, output, {
    bytes: bytes.length,
    sha256: await sha256(bytes),
  });
  assert.ok(await reusableOutput(recipe, output));
  assert.deepEqual(await requiredBaInputs(recipe), []);
  assert.equal(
    await reusableOutput(
      { ...recipe, inputs: [{ id: 1, sha256: 'source-b' }] },
      output,
    ),
    null,
  );
  assert.equal(
    await reusableOutput(recipe, { ...output, rgbaSha256: 'pixels-b' }),
    null,
  );
  await (
    await caches.open('onlystory.media.v1')
  ).put(output.url, new Response(new Uint8Array([9, 9, 9])));
  assert.equal(await reusableOutput(recipe, output), null);
  assert.deepEqual(await requiredBaInputs(recipe), recipe.inputs);
});

test('uses decoded database sources only with intact shared character table and per-group digest', async () => {
  const stores = cachesFixture(),
    source = { GroupId: 123, content: [] },
    names = { DataList: [] };
  await cacheDatabasePart(123, source);
  assert.equal(await cachedDatabaseChapter(123), null);
  await cacheDatabasePart('characters', names);
  assert.deepEqual(await cachedDatabaseChapter(123), { source, names });
  const store = stores.get('onlystory.ba-source.v1'),
    key = [...store.keys()].find((k) => k.endsWith('/123'));
  store.set(
    key,
    new Response('{"GroupId":999}', { headers: store.get(key).headers }),
  );
  assert.equal(await cachedDatabaseChapter(123), null);
});

test('keeps JP and global rows separate and requires a verified English source when its recipe advertises it', async () => {
  cachesFixture();
  const recipe = {
    group: 77,
    source: { input: 1 },
    localization: { input: 2, schema: 'gl-1.93' },
    inputs: [{ id: 1 }, { id: 2 }],
    outputs: [],
  };
  await cacheDatabasePart(77, { GroupId: 77, content: ['JP'] });
  await cacheDatabasePart('characters', { DataList: ['JP names'] });
  assert.equal(await cachedDatabaseChapter(77, recipe.localization), null);
  assert.deepEqual(await requiredBaInputs(recipe), [{ id: 2 }]);
  await cacheDatabasePart(
    77,
    { GroupId: 77, content: ['EN'] },
    recipe.localization,
  );
  await cacheDatabasePart(
    'characters',
    { DataList: ['EN names'] },
    recipe.localization,
  );
  assert.deepEqual((await cachedDatabaseChapter(77)).source.content, ['JP']);
  assert.deepEqual(
    (await cachedDatabaseChapter(77, recipe.localization)).source.content,
    ['EN'],
  );
  assert.deepEqual(await requiredBaInputs(recipe), []);
});
