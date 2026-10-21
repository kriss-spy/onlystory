const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');

// Only packaged conversion recipes are callable from the renderer. Extracted
// ZIP members are hash-pinned independently from their original archive bytes.
class MediaConverter {
  constructor(directory, descriptors, executable) {
    this.directory = directory;
    this.executable = executable;
    this.pending = new Map();
    this.controller = new AbortController();
    this.descriptors = new Map();
    for (const descriptor of descriptors) {
      if (
        typeof descriptor.id !== 'string' ||
        this.descriptors.has(descriptor.id) ||
        !['video', 'concat-audio'].includes(descriptor.kind) ||
        !Array.isArray(descriptor.inputs) ||
        descriptor.inputs.length < 1 ||
        descriptor.inputs.length > 16 ||
        descriptor.inputs.some(
          (input) =>
            !Number.isSafeInteger(input.bytes) ||
            input.bytes <= 0 ||
            !/^[a-f0-9]{64}$/.test(input.sha256),
        ) ||
        (descriptor.kind === 'video' && descriptor.inputs.length > 2)
      )
        throw Error('Invalid native media recipe.');
      this.descriptors.set(descriptor.id, descriptor);
    }
  }
  cancel() {
    this.controller.abort();
    this.pending.clear();
    this.controller = new AbortController();
  }
  read(id, inputs) {
    const descriptor = this.descriptors.get(id);
    if (!descriptor) return Promise.reject(Error('Unknown media conversion.'));
    if (
      !Array.isArray(inputs) ||
      inputs.length !== descriptor.inputs.length ||
      inputs.some(
        (bytes, index) =>
          !(bytes instanceof Uint8Array) ||
          bytes.byteLength !== descriptor.inputs[index].bytes ||
          createHash('sha256').update(bytes).digest('hex') !==
            descriptor.inputs[index].sha256,
      )
    )
      return Promise.reject(Error('Media conversion input checksum mismatch.'));
    if (this.pending.has(id)) return this.pending.get(id);
    const job = this.convert(
      descriptor,
      inputs,
      this.controller.signal,
    ).finally(() => {
      if (this.pending.get(id) === job) this.pending.delete(id);
    });
    this.pending.set(id, job);
    return job;
  }
  async convert(descriptor, inputs, signal) {
    signal.throwIfAborted();
    await fs.mkdir(this.directory, { recursive: true });
    const key = createHash('sha256')
      .update(
        JSON.stringify({
          version: 1,
          kind: descriptor.kind,
          inputs: descriptor.inputs.map((input) => input.sha256),
        }),
      )
      .digest('hex');
    const file = path.join(this.directory, key);
    const hashFile = file + '.sha256';
    try {
      const [bytes, hash] = await Promise.all([
        fs.readFile(file),
        fs.readFile(hashFile, 'utf8'),
      ]);
      if (createHash('sha256').update(bytes).digest('hex') === hash) {
        signal.throwIfAborted();
        return new Uint8Array(bytes);
      }
    } catch (error) {
      if (error.name === 'AbortError') throw error;
    }
    const work = await fs.mkdtemp(path.join(this.directory, 'convert-'));
    try {
      for (let index = 0; index < descriptor.inputs.length; index++) {
        signal.throwIfAborted();
        await fs.writeFile(path.join(work, `input-${index}`), inputs[index]);
      }
      const args = ['-v', 'error', '-nostdin', '-y'];
      const output = descriptor.kind === 'video' ? 'output.mp4' : 'output.ogg';
      if (descriptor.kind === 'video') {
        args.push('-i', 'input-0');
        if (descriptor.inputs.length === 2)
          args.push('-i', 'input-1', '-map', '0:v:0', '-map', '1:a:0');
        else args.push('-map', '0:v:0', '-map', '0:a?');
        args.push(
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '18',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-movflags',
          '+faststart',
        );
      } else {
        await fs.writeFile(
          path.join(work, 'inputs.txt'),
          descriptor.inputs
            .map((_id, index) => `file 'input-${index}'`)
            .join('\n'),
        );
        args.push(
          '-f',
          'concat',
          '-safe',
          '1',
          '-i',
          'inputs.txt',
          '-c:a',
          'libvorbis',
          '-q:a',
          '5',
        );
      }
      args.push(output);
      await new Promise((resolve, reject) => {
        let stderr = '';
        let failed;
        const child = spawn(this.executable, args, {
          cwd: work,
          windowsHide: true,
          stdio: ['ignore', 'ignore', 'pipe'],
          signal,
        });
        const timer = setTimeout(() => child.kill(), 1800000);
        timer.unref();
        child.stderr.on('data', (chunk) => {
          stderr = (stderr + chunk.toString()).slice(-4096);
        });
        child.once('error', (error) => {
          failed = error;
          clearTimeout(timer);
        });
        child.once('close', (code) => {
          clearTimeout(timer);
          code === 0 && !failed
            ? resolve()
            : reject(
                failed ||
                  Error(`Media conversion failed: ${stderr || `exit ${code}`}`),
              );
        });
      });
      signal.throwIfAborted();
      const bytes = await fs.readFile(path.join(work, output));
      if (!bytes.length)
        throw Error('Media conversion produced an empty file.');
      const hash = createHash('sha256').update(bytes).digest('hex');
      await fs.rename(path.join(work, output), file);
      await fs.writeFile(hashFile, hash);
      return new Uint8Array(bytes);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }
}
module.exports = { MediaConverter };
