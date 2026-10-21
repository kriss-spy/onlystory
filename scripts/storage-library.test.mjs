import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { digest, shareAssets, publicFile } from './storage-library.mjs';
import { readdirSync, statSync } from 'node:fs';

test('shared movie descriptors reference complete immutable fragment inventories and retain combined compatibility paths', () => {
  const root = process.cwd();
  const index = JSON.parse(
    readFileSync(resolve('public/private/shared/index.json'), 'utf8'),
  );
  let descriptors = 0;
  for (const directory of readdirSync(resolve('public/private'), {
    withFileTypes: true,
  }).filter((entry) => entry.isDirectory())) {
    const filename = resolve(
      'public/private',
      directory.name,
      'videos/manifest.json',
    );
    if (!existsSync(filename)) continue;
    const manifest = JSON.parse(readFileSync(filename, 'utf8'));
    const inventory = new Map(
      manifest.files.map((file) => [file.url, file.bytes]),
    );
    for (const movie of Object.values(manifest.videos ?? {}))
      for (const asset of [movie, movie.female]) {
        if (!asset?.streams) continue;
        descriptors++;
        assert.ok(asset.streams.duration > 0);
        assert.ok(existsSync(publicFile(root, asset.voices['zh-CN'].url)));
        assert.ok(existsSync(publicFile(root, asset.voices.ja.url)));
        for (const track of [
          asset.streams.video,
          ...Object.values(asset.streams.audio),
        ]) {
          assert.match(track.mime, /^(?:video|audio)\/mp4; codecs="[^"]+"$/);
          assert.ok(track.segments.length);
          let time = 0;
          for (const segment of track.segments) {
            assert.ok(segment.duration > 0);
            assert.ok(
              Math.abs(segment.start - time) < 0.0001,
              'fragment timeline has a gap or overlap',
            );
            time = segment.start + segment.duration;
          }
          assert.ok(
            time <= asset.streams.duration + 0.0001,
            `fragment timeline ${time} exceeds movie duration ${asset.streams.duration}`,
          );
          for (const file of [track.init, ...track.segments]) {
            assert.match(file.url, /^\/private\/shared\/[a-f0-9]{64}\.m4s$/);
            assert.equal(inventory.get(file.url), file.bytes);
            assert.equal(index.objects[file.url]?.bytes, file.bytes);
            assert.equal(
              index.objects[file.url]?.sha256,
              file.url.split('/').at(-1).split('.')[0],
            );
            assert.equal(statSync(publicFile(root, file.url)).size, file.bytes);
          }
        }
      }
  }
  assert.ok(descriptors > 0, 'no shared movie descriptors were published');
});

test('shares identical payloads and models, preserves variants, and imports idempotently', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'onlystory-share-'));
  try {
    const manifests = [];
    for (const event of ['a', 'b']) {
      const prefix = `/private/${event}/`;
      const files = [];
      const write = (name, value) => {
        const bytes = Buffer.from(value),
          url = prefix + name;
        const path = publicFile(root, url);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, bytes);
        files.push({
          url,
          bytes: bytes.length,
          sha256: digest(bytes),
          source: { segmentSha256: 'provenance' },
        });
      };
      write('actor.moc3', 'MOC3payload');
      write('texture name.png', 'identical texture');
      write(
        'model.model3.json',
        JSON.stringify({
          FileReferences: { Moc: 'actor.moc3', Textures: ['texture name.png'] },
        }),
      );
      const path = publicFile(root, prefix + 'manifest.json');
      writeFileSync(
        path,
        JSON.stringify({
          files,
          characters: {
            actor: {
              url: prefix + 'model.model3.json',
              files: files.map((f) => f.url),
              variants: {
                Idle: {
                  url: prefix + 'model.model3.json',
                  sourceX: event === 'a' ? 1 : 2,
                },
              },
            },
          },
          modelCount: 1,
        }),
      );
      manifests.push(path);
    }
    const result = shareAssets(root, manifests);
    assert.equal(result.objects, 3);
    const [a, b] = manifests.map((path) => JSON.parse(readFileSync(path)));
    assert.equal(a.characters.actor.url, b.characters.actor.url);
    assert.equal(a.characters.actor.variants.Idle.sourceX, 1);
    assert.equal(b.characters.actor.variants.Idle.sourceX, 2);
    const model = JSON.parse(
      readFileSync(publicFile(root, a.characters.actor.url)),
    );
    assert.match(model.FileReferences.Moc, /^\/private\/shared\//);
    assert.ok(existsSync(publicFile(root, model.FileReferences.Textures[0])));
    assert.ok(!existsSync(publicFile(root, '/private/a/texture name.png')));
    const snapshot = manifests.map((path) => readFileSync(path, 'utf8'));
    const index = readFileSync(
      resolve(root, 'public/private/shared/index.json'),
      'utf8',
    );
    shareAssets(root, manifests);
    assert.deepEqual(
      manifests.map((path) => readFileSync(path, 'utf8')),
      snapshot,
    );
    assert.equal(
      readFileSync(resolve(root, 'public/private/shared/index.json'), 'utf8'),
      index,
    );
    writeFileSync(
      publicFile(root, model.FileReferences.Textures[0]),
      'corrupt',
    );
    assert.throws(() => shareAssets(root, manifests), /integrity/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects corrupt inputs without changing their manifest or deleting data', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'onlystory-integrity-'));
  try {
    const file = publicFile(root, '/private/test/file.bin');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, 'bad');
    const manifest = resolve(dirname(file), 'manifest.json');
    const text = JSON.stringify({
      files: [
        { url: '/private/test/file.bin', bytes: 3, sha256: digest('good') },
      ],
    });
    writeFileSync(manifest, text);
    assert.throws(() => shareAssets(root, [manifest]), /integrity/);
    assert.equal(readFileSync(manifest, 'utf8'), text);
    assert.equal(readFileSync(file, 'utf8'), 'bad');
    assert.throws(() => publicFile(root, '/../outside'), /escaped/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
