import type { FFmpeg } from '@ffmpeg/ffmpeg';

export interface MediaConversion {
  output: string;
  kind: 'video' | 'concat-audio';
  inputs: { bytes: Uint8Array<ArrayBuffer>; name: string }[];
}

// BA imports share one queue, so one converter can be reused without overlapping jobs.
let browserConverter: FFmpeg | undefined;
export async function convertBaMedia(
  job: MediaConversion,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (window.onlystoryDesktop?.convertMedia) {
    const result = await window.onlystoryDesktop.convertMedia(
      job.output,
      job.inputs.map((input) => input.bytes),
    );
    signal.throwIfAborted();
    return result;
  }
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const converter = (browserConverter ??= new FFmpeg());
  const abort = () => {
    converter.terminate();
    if (browserConverter === converter) browserConverter = undefined;
  };
  signal.addEventListener('abort', abort, { once: true });
  const names: string[] = [];
  const output = job.kind === 'video' ? 'result.mp4' : 'result.ogg';
  try {
    signal.throwIfAborted();
    if (!converter.loaded)
      await converter.load({
        classWorkerURL: '/vendor/ffmpeg/worker.js',
        coreURL: '/vendor/ffmpeg/ffmpeg-core.js',
        wasmURL: '/vendor/ffmpeg/ffmpeg-core.wasm',
      });
    for (const [index, input] of job.inputs.entries()) {
      const extension = /\.[a-z0-9]+$/i.exec(input.name)?.[0] ?? '.bin';
      const name = `input-${index}${extension}`;
      names.push(name);
      await converter.writeFile(name, input.bytes);
    }
    let args: string[];
    if (job.kind === 'video') {
      args = [
        '-i',
        names[0],
        ...(names.length > 1
          ? ['-i', names[1], '-map', '0:v:0', '-map', '1:a:0']
          : ['-map', '0:v:0', '-map', '0:a?']),
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
        output,
      ];
    } else {
      await converter.writeFile(
        'concat.txt',
        names.map((name) => `file '${name}'`).join('\n'),
      );
      names.push('concat.txt');
      args = [
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        'concat.txt',
        '-c:a',
        'libvorbis',
        '-q:a',
        '5',
        output,
      ];
    }
    if ((await converter.exec(args)) !== 0)
      throw Error('Story media conversion failed. Retry the import.');
    const result = await converter.readFile(output);
    if (typeof result === 'string' || !result.length)
      throw Error('Story media conversion produced no data.');
    signal.throwIfAborted();
    return new Uint8Array(result);
  } finally {
    signal.removeEventListener('abort', abort);
    if (converter.loaded)
      await Promise.allSettled(
        [...names, output].map((name) => converter.deleteFile(name)),
      );
  }
}
