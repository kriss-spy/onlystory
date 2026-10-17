import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { createPjskDeferred, validateDeferredAudio } from './pjsk-deferred.mjs';
import { libraryMiddleware } from './library-server.mjs';

const hash = (kind, value) => createHash(kind).update(value).digest('hex');
async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'pjsk-deferred-'));
  await mkdir(resolve(root, 'private/pjsk'), { recursive: true });
  const bytes = Buffer.from('0123456789');
  const sourceUrl =
    'https://storage.sekai.best/sekai-jp-assets/sound/scenario/voice/test/voice.mp3';
  const key = hash('sha256', sourceUrl);
  const record = {
    url: `/private/pjsk/remote/${key}.mp3`,
    sourceUrl,
    bytes: bytes.length,
    md5: hash('md5', bytes),
  };
  const manifestPath = resolve(root, 'private/pjsk/deferred.json');
  await writeFile(manifestPath, JSON.stringify({ [key]: record }));
  return { root, bytes, key, record, manifestPath };
}

test('only manifest-authorized exact source hashes can fetch trusted original audio', async () => {
  const f = await fixture();
  try {
    let calls = 0;
    const cache = createPjskDeferred({
      libraryDir: f.root,
      fetcher: async () => {
        calls++;
        return new Response(f.bytes);
      },
    });
    assert.equal(
      await cache.ensure('/private/pjsk/remote/' + 'a'.repeat(64) + '.mp3'),
      null,
    );
    assert.equal(
      await cache.ensure('/private/pjsk/remote/../../secret.mp3'),
      null,
    );
    assert.equal(calls, 0);
    for (const sourceUrl of [
      'http://storage.sekai.best/sekai-jp-assets/sound/a.mp3',
      'https://example.com/a.mp3',
      'https://storage.sekai.best/sekai-jp-assets/scenario/a.mp3',
      f.record.sourceUrl + '?url=other',
    ])
      assert.throws(
        () => validateDeferredAudio({ ...f.record, sourceUrl }, f.record.url),
        /source|hash/i,
      );
    assert.throws(
      () =>
        validateDeferredAudio(
          { ...f.record, cacheSource: '/private/pjsk/assets/../../secret.mp3' },
          f.record.url,
        ),
      /cache source/,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('concurrent requests share one verified download and persist provenance across a process restart', async () => {
  const f = await fixture();
  try {
    let calls = 0;
    const fetcher = async (url, options) => {
      calls++;
      assert.equal(url, f.record.sourceUrl);
      assert.equal(options.redirect, 'error');
      await new Promise((done) => setTimeout(done, 30));
      return new Response(f.bytes, {
        headers: { 'Content-Type': 'audio/mpeg' },
      });
    };
    const a = createPjskDeferred({ libraryDir: f.root, fetcher });
    const b = createPjskDeferred({ libraryDir: f.root, fetcher });
    const results = await Promise.all([
      a.ensure(f.record.url),
      a.ensure(f.record.url),
      b.ensure(f.record.url),
    ]);
    assert.equal(new Set(results).size, 1);
    assert.equal(calls, 1);
    const provenance = JSON.parse(await readFile(results[0] + '.json'));
    assert.equal(provenance.sha256, hash('sha256', f.bytes));
    assert.equal(provenance.sourceUrl, f.record.sourceUrl);
    assert.equal(provenance.md5, f.record.md5);
    // Simulate a process interruption between publishing audio and its sidecar.
    await rm(results[0] + '.json');
    const code = `const {createPjskDeferred}=await import(${JSON.stringify(new URL('./pjsk-deferred.mjs', import.meta.url).href)});const c=createPjskDeferred({libraryDir:process.argv[1],fetcher:async()=>{throw new Error('network forbidden')}});console.log(await c.ensure(process.argv[2]));`;
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', code, f.root, f.record.url],
      { encoding: 'utf8' },
    );
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /remote/);
    assert.equal(
      JSON.parse(await readFile(results[0] + '.json')).sha256,
      hash('sha256', f.bytes),
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('a body with the right size and wrong MD5 is rejected without publishing cache files', async () => {
  const f = await fixture();
  try {
    const cache = createPjskDeferred({
      libraryDir: f.root,
      fetcher: async () => new Response('abcdefghij'),
    });
    await assert.rejects(cache.ensure(f.record.url), /checksum mismatch/);
    await assert.rejects(stat(resolve(f.root, '.' + f.record.url)), {
      code: 'ENOENT',
    });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('verified local content-addressed cache sources avoid all network requests', async () => {
  const f = await fixture();
  try {
    const cacheSource = `/private/pjsk/assets/${hash('sha256', f.bytes)}.mp3`;
    await mkdir(resolve(f.root, 'private/pjsk/assets'));
    await writeFile(resolve(f.root, '.' + cacheSource), f.bytes);
    await writeFile(
      f.manifestPath,
      JSON.stringify({ [f.key]: { ...f.record, cacheSource } }),
    );
    const cache = createPjskDeferred({
      libraryDir: f.root,
      fetcher: async () => {
        throw new Error('network forbidden');
      },
    });
    assert.deepEqual(await readFile(await cache.ensure(f.record.url)), f.bytes);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('distinct on-demand clips share the global four-download and eight-request-per-second limits', async () => {
  const f = await fixture();
  try {
    const records = Array.from({ length: 8 }, (_, index) => {
      const sourceUrl = f.record.sourceUrl.replace(
        'voice.mp3',
        `voice_${index}.mp3`,
      );
      return {
        ...f.record,
        sourceUrl,
        url: `/private/pjsk/remote/${hash('sha256', sourceUrl)}.mp3`,
      };
    });
    await writeFile(
      f.manifestPath,
      JSON.stringify(
        Object.fromEntries(
          records.map((record) => [hash('sha256', record.sourceUrl), record]),
        ),
      ),
    );
    let active = 0,
      maximum = 0;
    const starts = [];
    const cache = createPjskDeferred({
      libraryDir: f.root,
      fetcher: async () => {
        starts.push(Date.now());
        active++;
        maximum = Math.max(maximum, active);
        await new Promise((done) => setTimeout(done, 600));
        active--;
        return new Response(f.bytes);
      },
    });
    await Promise.all(records.map((record) => cache.ensure(record.url)));
    assert.ok(
      maximum >= 2 && maximum <= 4,
      `observed ${maximum} concurrent downloads`,
    );
    assert.ok(
      starts.at(-1) - starts[0] >= 800,
      'eight requests must be spread across at least seven 125ms slots',
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('the shared development/production middleware serves HEAD, ranges and clear error responses', async () => {
  const f = await fixture();
  const extra = resolve(f.root, 'other-library');
  await mkdir(resolve(extra, 'private/pjsk/remote'), { recursive: true });
  // A same-named file in another root cannot bypass manifest/MD5 verification.
  await writeFile(resolve(extra, '.' + f.record.url), 'XXXXXXXXXX');
  let calls = 0;
  const server = createServer(
    libraryMiddleware(f.root, f.root, [extra], {
      deferredFetcher: async () => {
        calls++;
        return new Response(f.bytes);
      },
    }),
  );
  try {
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const base = `http://127.0.0.1:${server.address().port}`;
    let response = await fetch(base + f.record.url, {
      headers: { Range: 'bytes=2-5' },
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(await response.text(), '2345');
    response = await fetch(base + f.record.url, { method: 'HEAD' });
    assert.equal(response.headers.get('content-length'), '10');
    assert.equal(await response.text(), '');
    assert.equal(
      (await fetch(base + f.record.url, { headers: { Range: 'bytes=99-' } }))
        .status,
      416,
    );
    assert.equal(
      (await fetch(base + '/private/pjsk/remote/' + 'b'.repeat(64) + '.mp3'))
        .status,
      404,
    );
    assert.equal(calls, 1);
    await writeFile(f.manifestPath, '{broken');
    response = await fetch(base + f.record.url);
    assert.equal(response.status, 503);
    assert.equal(await response.text(), 'Audio is unavailable');
    await writeFile(f.manifestPath, '{}');
    assert.equal(
      (await fetch(base + f.record.url)).status,
      404,
      'removing authorization also hides a previously cached file',
    );
  } finally {
    await new Promise((done) => server.close(done));
    await rm(f.root, { recursive: true, force: true });
  }
});

test('abandoned HTTP voice requests leave the queue so the current passage can download immediately', async () => {
  const f = await fixture();
  let calls = 0;
  let received = 0;
  const records = Array.from({ length: 25 }, (_, index) => {
    const sourceUrl = f.record.sourceUrl.replace(
      'voice.mp3',
      `queued_${index}.mp3`,
    );
    return {
      ...f.record,
      sourceUrl,
      url: `/private/pjsk/remote/${hash('sha256', sourceUrl)}.mp3`,
    };
  });
  await writeFile(
    f.manifestPath,
    JSON.stringify(
      Object.fromEntries(
        records.map((record) => [hash('sha256', record.sourceUrl), record]),
      ),
    ),
  );
  const handler = libraryMiddleware(f.root, f.root, [], {
    deferredFetcher: async (_url, { signal }) => {
      calls++;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', abort);
          resolve();
        }, 150);
        const abort = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        signal.addEventListener('abort', abort, { once: true });
      });
      return new Response(f.bytes);
    },
  });
  const server = createServer((req, res) => {
    received++;
    handler(req, res);
  });
  try {
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const record of records.slice(0, 24)) {
      const controller = new AbortController();
      void fetch(base + record.url, { signal: controller.signal }).catch(
        () => {},
      );
      setTimeout(() => controller.abort(), 50);
      await new Promise((done) => setTimeout(done, 10));
    }
    const currentStartedAt = performance.now();
    const response = await fetch(base + records.at(-1).url);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.bytes);
    assert.ok(
      performance.now() - currentStartedAt < 1500,
      'canceled clients must not reserve future rate-limit slots ahead of the current passage',
    );
    assert.ok(
      received >= 20,
      'the aborted requests must actually reach the HTTP middleware',
    );
    assert.ok(
      calls <= 5,
      `abandoned queued clients caused ${calls} upstream downloads`,
    );
  } finally {
    await new Promise((done) => server.close(done));
    await rm(f.root, { recursive: true, force: true });
  }
});

test('canceling one HTTP subscriber preserves the shared download for a live subscriber', async () => {
  const f = await fixture();
  let started, finish, upstreamSignal;
  const startedPromise = new Promise((done) => {
    started = done;
  });
  const finishPromise = new Promise((done) => {
    finish = done;
  });
  let calls = 0;
  const server = createServer(
    libraryMiddleware(f.root, f.root, [], {
      deferredFetcher: async (_url, { signal }) => {
        calls++;
        upstreamSignal = signal;
        started();
        await finishPromise;
        signal.throwIfAborted();
        return new Response(f.bytes);
      },
    }),
  );
  try {
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const url = `http://127.0.0.1:${server.address().port}` + f.record.url;
    const controller = new AbortController();
    const abandoned = fetch(url, { signal: controller.signal }).catch(
      () => null,
    );
    await startedPromise;
    const live = fetch(url);
    await new Promise((done) => setTimeout(done, 40));
    controller.abort();
    await abandoned;
    await new Promise((done) => setTimeout(done, 40));
    assert.equal(upstreamSignal.aborted, false);
    finish();
    const response = await live;
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.bytes);
    assert.equal(calls, 1);
    assert.equal(
      upstreamSignal.aborted,
      false,
      'normal response completion must not cancel the completed shared acquisition',
    );
  } finally {
    finish();
    await new Promise((done) => server.close(done));
    await rm(f.root, { recursive: true, force: true });
  }
});
