const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const digest = (body) => createHash('sha256').update(body).digest('hex');

class SourceDownloader {
  constructor(directory, inputs) {
    this.directory = directory;
    // Chapter recipes use a subset of one shared source manifest. IDs must not
    // depend on a source's position inside the selected chapter's input list.
    this.inputs = new Map();
    for (const input of inputs) {
      if (
        !Number.isSafeInteger(input.id) ||
        input.id < 0 ||
        this.inputs.has(input.id)
      )
        throw Error('Invalid or duplicate original file ID.');
      this.inputs.set(input.id, input);
    }
    this.pending = new Map();
    this.controller = new AbortController();
  }
  cancel() {
    this.controller.abort();
    this.pending.clear();
    this.controller = new AbortController();
  }
  read(id) {
    if (!Number.isSafeInteger(id) || !this.inputs.has(id))
      return Promise.reject(Error('Unknown original file.'));
    if (this.pending.has(id)) return this.pending.get(id);
    const signal = this.controller.signal;
    const job = this.load(this.inputs.get(id), signal).finally(() => {
      if (this.pending.get(id) === job) this.pending.delete(id);
    });
    this.pending.set(id, job);
    return job;
  }
  async load(input, signal) {
    signal.throwIfAborted();
    if (
      !/^[a-f0-9]{64}$/.test(input.sha256) ||
      !input.url.startsWith('https://') ||
      !Number.isSafeInteger(input.bytes) ||
      input.bytes <= 0
    )
      throw Error('Invalid pinned source.');
    await fs.mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, input.sha256);
    try {
      const body = await fs.readFile(file);
      if (body.length === input.bytes && digest(body) === input.sha256) {
        signal.throwIfAborted();
        return new Uint8Array(body);
      }
    } catch (error) {
      if (error.name === 'AbortError') throw error;
    }
    let last;
    for (let attempt = 0; attempt < 2; attempt++) {
      signal.throwIfAborted();
      const partial = file + '.' + randomUUID() + '.part';
      try {
        const response = await fetch(input.url, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]),
        });
        if (!response.ok)
          throw Error(`Source returned HTTP ${response.status}`);
        if (!response.body) throw Error('Source returned an empty body');
        // Large shared Unity packs go straight to disk. Bound untrusted source
        // responses by the pinned length and publish only after hashing them.
        const handle = await fs.open(partial, 'wx');
        const hash = createHash('sha256');
        let bytes = 0;
        try {
          for await (const chunk of response.body) {
            signal.throwIfAborted();
            bytes += chunk.byteLength;
            if (bytes > input.bytes) throw Error('Original checksum mismatch');
            hash.update(chunk);
            await handle.writeFile(chunk);
          }
        } finally {
          await handle.close();
        }
        signal.throwIfAborted();
        if (bytes !== input.bytes || hash.digest('hex') !== input.sha256)
          throw Error('Original checksum mismatch');
        signal.throwIfAborted();
        await fs.rename(partial, file);
        return new Uint8Array(await fs.readFile(file));
      } catch (error) {
        last = error;
        await fs.rm(partial, { force: true });
        signal.throwIfAborted();
      }
    }
    throw Error(
      `${input.filename}: ${last?.message || 'Download failed'}. Retry to reuse verified files.`,
    );
  }
}
module.exports = { SourceDownloader };
