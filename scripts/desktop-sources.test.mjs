import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { SourceDownloader } from '../desktop/source-downloader.cjs';
import { MediaConverter } from '../desktop/media-converter.cjs';
import ffmpeg from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';

test('desktop source downloads verify bytes, share requests, reuse disk, reject corruption and cancel', async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'onlystory-source-test-'),
  );
  const originalFetch = globalThis.fetch;
  const body = new TextEncoder().encode('verified original source');
  const input = {
    id: 0,
    filename: 'original.bin',
    url: 'https://source.example/original',
    bytes: body.length,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
  const file = path.join(directory, input.sha256);
  try {
    let requests = 0;
    globalThis.fetch = async () => {
      requests++;
      return new Response(body);
    };
    const first = new SourceDownloader(directory, [input]);
    const [a, b] = await Promise.all([first.read(0), first.read(0)]);
    assert.deepEqual(a, body);
    assert.deepEqual(b, body);
    assert.equal(requests, 1);
    globalThis.fetch = async () => {
      throw Error('Offline');
    };
    assert.deepEqual(
      await new SourceDownloader(directory, [input]).read(0),
      body,
    );
    await fs.writeFile(file, new Uint8Array(body.length));
    globalThis.fetch = async () => new Response(new Uint8Array(body.length));
    await assert.rejects(
      new SourceDownloader(directory, [input]).read(0),
      /checksum mismatch/,
    );
    assert.ok(
      (await fs.readdir(directory)).every((name) => !name.endsWith('.part')),
    );
    let started;
    const ready = new Promise((resolve) => {
      started = resolve;
    });
    globalThis.fetch = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        started();
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('Canceled', 'AbortError')),
          { once: true },
        );
      });
    const canceled = new SourceDownloader(directory, [input]);
    const pending = canceled.read(0);
    await ready;
    canceled.cancel();
    await assert.rejects(pending, /abort/i);
    await assert.rejects(canceled.read(-1), /Unknown original/);
  } finally {
    globalThis.fetch = originalFetch;
    if (
      !path
        .resolve(directory)
        .startsWith(
          path.resolve(os.tmpdir()) + path.sep + 'onlystory-source-test-',
        )
    )
      throw Error('Unexpected test directory');
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('native media conversion verifies recipe inputs, produces playable containers and reuses verified output', async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'onlystory-convert-test-'),
  );
  try {
    const video = path.join(directory, 'source.webm');
    const audio = path.join(directory, 'source.ogg');
    execFileSync(
      ffmpeg,
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=32x32:r=10',
        '-t',
        '0.2',
        '-c:v',
        'libvpx-vp9',
        video,
      ],
      { windowsHide: true },
    );
    execFileSync(
      ffmpeg,
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=0.2',
        '-c:a',
        'libvorbis',
        audio,
      ],
      { windowsHide: true },
    );
    const inputs = await Promise.all([fs.readFile(video), fs.readFile(audio)]);
    const pinned = (bytes) => ({
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    const descriptors = [
      { id: '/video.mp4', kind: 'video', inputs: inputs.map(pinned) },
      {
        id: '/voice.ogg',
        kind: 'concat-audio',
        inputs: [pinned(inputs[1]), pinned(inputs[1])],
      },
    ];
    const converter = new MediaConverter(
      path.join(directory, 'converted'),
      descriptors,
      ffmpeg,
    );
    await assert.rejects(converter.read('/unknown', inputs), /Unknown media/);
    await assert.rejects(
      converter.read('/video.mp4', [
        inputs[0],
        new Uint8Array(inputs[1].length),
      ]),
      /checksum mismatch/,
    );
    const [a, b] = await Promise.all([
      converter.read('/video.mp4', inputs),
      converter.read('/video.mp4', inputs),
    ]);
    assert.deepEqual(a, b);
    assert.equal(Buffer.from(a).subarray(4, 8).toString(), 'ftyp');
    const concatenated = await converter.read('/voice.ogg', [
      inputs[1],
      inputs[1],
    ]);
    assert.equal(Buffer.from(concatenated).subarray(0, 4).toString(), 'OggS');
    for (const [name, body] of [
      ['converted.mp4', a],
      ['joined.ogg', concatenated],
    ]) {
      const output = path.join(directory, name);
      await fs.writeFile(output, body);
      execFileSync(ffmpeg, ['-v', 'error', '-i', output, '-f', 'null', '-'], {
        windowsHide: true,
      });
    }
    converter.executable = path.join(directory, 'does-not-exist');
    assert.deepEqual(await converter.read('/video.mp4', inputs), a);
    const outputs = await fs.readdir(path.join(directory, 'converted'));
    assert.ok(outputs.every((name) => !name.startsWith('convert-')));
    const outputFile = outputs.find((name) => !name.includes('.'));
    await fs.writeFile(
      path.join(directory, 'converted', outputFile),
      'corrupt',
    );
    const descriptor =
      outputFile ===
      createHash('sha256')
        .update(
          JSON.stringify({
            version: 1,
            kind: 'video',
            inputs: inputs.map((body) => pinned(body).sha256),
          }),
        )
        .digest('hex')
        ? descriptors[0]
        : descriptors[1];
    await assert.rejects(
      converter.read(
        descriptor.id,
        descriptor.kind === 'video' ? inputs : [inputs[1], inputs[1]],
      ),
      /ENOENT/,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('desktop source IDs remain stable across chapter subsets and oversized bodies are discarded', async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'onlystory-source-test-'),
  );
  const originalFetch = globalThis.fetch;
  const body = new TextEncoder().encode('shared chapter asset');
  const input = {
    id: 2718,
    filename: 'shared.bundle',
    url: 'https://source.example/shared',
    bytes: body.length,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
  try {
    const downloader = new SourceDownloader(directory, [input]);
    globalThis.fetch = async () => new Response(body);
    assert.deepEqual(await downloader.read(2718), body);
    await assert.rejects(downloader.read(0), /Unknown original/);
    await assert.rejects(downloader.read('2718'), /Unknown original/);
    assert.throws(
      () => new SourceDownloader(directory, [input, input]),
      /duplicate/,
    );
    await fs.unlink(path.join(directory, input.sha256));
    let canceled = 0;
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(input.bytes + 1));
          },
          cancel() {
            canceled++;
          },
        }),
      );
    await assert.rejects(
      new SourceDownloader(directory, [input]).read(2718),
      /checksum mismatch/,
    );
    assert.equal(canceled, 2);
    assert.deepEqual(await fs.readdir(directory), []);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
