import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { libraryMiddleware } from './library-server.mjs';

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
    assert.match(await (await fetch(url + '/read/game/story')).text(), /app/);
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(root, { recursive: true, force: true });
  }
});
