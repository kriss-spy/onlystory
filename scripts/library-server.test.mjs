import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { libraryMiddleware } from './library-server.mjs';
import { compressedRecipeMiddleware } from './compressed-recipes.mjs';
import { gzipSync } from 'node:zlib';

test('development recipe responses preserve compressed integrity bytes without HTTP auto-decompression', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'onlystory-recipes-'));
  const directory = resolve(root, 'src/downloads/pjsk-recipes');
  mkdirSync(directory, { recursive: true });
  const compressed = gzipSync('{"recipe":"pinned"}');
  writeFileSync(resolve(directory, 'story.json.gz'), compressed);
  const middleware = compressedRecipeMiddleware(root);
  const server = createServer((request, response) =>
    middleware(request, response, () => response.writeHead(418).end()),
  );
  try {
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const url = `http://127.0.0.1:${server.address().port}/src/downloads/pjsk-recipes/story.json.gz`;
    const response = await fetch(url);
    assert.equal(response.headers.get('content-encoding'), null);
    assert.equal(response.headers.get('content-type'), 'application/gzip');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), compressed);
    assert.equal((await fetch(url + '?url')).status, 418);
    assert.equal((await fetch(url + '?import')).status, 418);
  } finally {
    await new Promise((done) => server.close(done));
    rmSync(root, { recursive: true, force: true });
  }
});

test('serves aliases, media ranges, HEAD and missing-media errors', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'onlystory-server-'));
  const server = createServer(libraryMiddleware(root, root));
  try {
    mkdirSync(resolve(root, 'private/shared'), { recursive: true });
    writeFileSync(resolve(root, 'private/shared/movie.mp4'), '0123456789');
    writeFileSync(
      resolve(root, 'private/shared/index.json'),
      JSON.stringify({
        aliases: { '/private/old.mp4': '/private/shared/movie.mp4' },
      }),
    );
    writeFileSync(resolve(root, 'index.html'), '<main>app</main>');
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}`;
    let response = await fetch(url + '/private/old.mp4', {
      headers: { Range: 'bytes=2-5' },
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(await response.text(), '2345');
    response = await fetch(url + '/private/old.mp4', {
      headers: { Range: 'bytes=-3' },
    });
    assert.equal(await response.text(), '789');
    assert.equal(
      (
        await fetch(url + '/private/old.mp4', {
          headers: { Range: 'bytes=99-' },
        })
      ).status,
      416,
    );
    response = await fetch(url + '/private/old.mp4', { method: 'HEAD' });
    assert.equal(response.headers.get('content-length'), '10');
    assert.equal(await response.text(), '');
    assert.equal((await fetch(url + '/private/missing.mp4')).status, 404);
    response = await fetch(url + '/onlystory-local-library.json');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { version: 1, localLibrary: true });
    assert.match(await (await fetch(url + '/read/game/story')).text(), /app/);
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(root, { recursive: true, force: true });
  }
});

test('serves a separate PJSK library alongside the main media library', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'onlystory-supplement-'));
  const extra = resolve(root, 'separate');
  mkdirSync(resolve(extra, 'private/pjsk/assets'), { recursive: true });
  mkdirSync(resolve(root, 'private/gfl2'), { recursive: true });
  writeFileSync(resolve(extra, 'private/pjsk/assets/voice.mp3'), 'voice-bytes');
  writeFileSync(resolve(root, 'private/gfl2/bgm.ogg'), 'music-bytes');
  writeFileSync(resolve(root, 'index.html'), '<main>reader</main>');
  const server = createServer(libraryMiddleware(root, root, [extra]));
  try {
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const url = `http://127.0.0.1:${server.address().port}`;
    const voice = await fetch(url + '/private/pjsk/assets/voice.mp3');
    assert.equal(voice.headers.get('content-type'), 'audio/mpeg');
    assert.equal(await voice.text(), 'voice-bytes');
    assert.equal(
      await (await fetch(url + '/private/gfl2/bgm.ogg')).text(),
      'music-bytes',
    );
    assert.equal((await fetch(url + '/private/pjsk/missing.mp3')).status, 404);
    const range = await fetch(url + '/private/pjsk/assets/voice.mp3', {
      headers: { Range: 'bytes=0-4' },
    });
    assert.equal(range.status, 206);
    assert.equal(await range.text(), 'voice');
  } finally {
    await new Promise((done) => server.close(done));
    rmSync(root, { recursive: true, force: true });
  }
});
