import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fileHash = (filename) => {
  const digest = createHash('sha256'),
    buffer = Buffer.allocUnsafe(1024 * 1024);
  const handle = fs.openSync(filename, 'r');
  try {
    for (;;) {
      const count = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (!count) return digest.digest('hex');
      digest.update(buffer.subarray(0, count));
    }
  } finally {
    fs.closeSync(handle);
  }
};
const json = (filename) => JSON.parse(fs.readFileSync(filename, 'utf8'));
const atomic = (filename, value) => {
  const data = JSON.stringify(value, null, 2) + '\n';
  if (fs.existsSync(filename) && fs.readFileSync(filename, 'utf8') === data)
    return;
  fs.writeFileSync(filename + '.tmp', data);
  fs.renameSync(filename + '.tmp', filename);
};
const attrs = (text) =>
  Object.fromEntries(
    [...text.matchAll(/([\w]+)="([^"]*)"/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );

export function shareMovieStreams(manifestPath) {
  const manifest = json(manifestPath);
  const indexPath = path.join(root, 'public/private/shared/index.json');
  const index = json(indexPath);
  const files = new Map(manifest.files.map((file) => [file.url, file]));
  const results = [];
  for (const [label, movie] of Object.entries(manifest.videos)) {
    for (const [variant, asset] of [
      ['male', movie],
      ['female', movie.female],
    ]) {
      if (!asset?.voices?.['zh-CN'] || !asset?.voices?.ja) continue;
      const inputs = ['zh-CN', 'ja'].map((locale) =>
        path.join(root, 'public', asset.voices[locale].url),
      );
      const sourceHashes = inputs.map(fileHash);
      const workspace = path.join(
        root,
        '.cache/movie-streams',
        hash(Buffer.from(sourceHashes.join(':'))),
      );
      fs.mkdirSync(workspace, { recursive: true });
      const mpd = path.join(workspace, 'movie.mpd');
      if (
        !fs.existsSync(mpd) ||
        !fs.existsSync(path.join(workspace, 'init-stream0.m4s'))
      ) {
        const picture = (input) =>
          execFileSync(
            'ffmpeg',
            [
              '-v',
              'error',
              '-i',
              input,
              '-map',
              '0:v:0',
              '-c',
              'copy',
              '-bsf:v',
              'h264_mp4toannexb',
              '-f',
              'hash',
              '-hash',
              'sha256',
              '-',
            ],
            { encoding: 'utf8' },
          ).trim();
        if (picture(inputs[0]) !== picture(inputs[1]))
          throw Error(`Different movie pictures at ${label}:${variant}`);
        execFileSync(
          'ffmpeg',
          [
            '-y',
            '-hide_banner',
            '-loglevel',
            'error',
            '-i',
            inputs[0],
            '-i',
            inputs[1],
            '-map',
            '0:v:0',
            '-map',
            '0:a:0',
            '-map',
            '1:a:0',
            '-c',
            'copy',
            '-f',
            'dash',
            '-seg_duration',
            '4',
            '-use_timeline',
            '1',
            '-use_template',
            '1',
            'movie.mpd',
          ],
          { cwd: workspace },
        );
      }
      const put = (name) => {
        if (!/^[\w.-]+$/.test(name))
          throw Error('Unsafe generated segment name');
        const bytes = fs.readFileSync(path.join(workspace, name));
        const sha256 = hash(bytes);
        const url = `/private/shared/${sha256}.m4s`;
        const target = path.join(root, 'public', url);
        if (!fs.existsSync(target)) fs.writeFileSync(target, bytes);
        else if (hash(fs.readFileSync(target)) !== sha256)
          throw Error('Corrupt shared segment');
        const record = { url, bytes: bytes.length, sha256 };
        index.objects[url] = record;
        files.set(url, record);
        return { url, bytes: bytes.length };
      };
      const tracks = [
        ...fs
          .readFileSync(mpd, 'utf8')
          .matchAll(/<Representation\s+([^>]+)>([\s\S]*?)<\/Representation>/g),
      ].map((match) => {
        const representation = attrs(match[1]);
        const template = attrs(
          match[2].match(/<SegmentTemplate\s+([^>]+)>/)[1],
        );
        const timeline = [...match[2].matchAll(/<S\s+([^>]+)\/>/g)];
        const timescale = Number(template.timescale);
        const expand = (name, number) =>
          name
            .replace('$RepresentationID$', representation.id)
            .replace('$Number%05d$', String(number).padStart(5, '0'));
        let time = 0,
          number = Number(template.startNumber);
        const segments = [];
        for (const cue of timeline) {
          const item = attrs(cue[1]);
          if (item.t !== undefined) time = Number(item.t);
          for (let i = 0; i <= Number(item.r ?? 0); i++) {
            segments.push({
              ...put(expand(template.media, number++)),
              start: time / timescale,
              duration: Number(item.d) / timescale,
            });
            time += Number(item.d);
          }
        }
        return {
          mime: `${representation.mimeType}; codecs="${representation.codecs}"`,
          init: put(expand(template.initialization)),
          segments,
        };
      });
      if (tracks.length !== 3 || !tracks[0].mime.startsWith('video/'))
        throw Error('Unexpected remux tracks');
      asset.streams = {
        duration: Math.max(
          asset.duration,
          ...tracks.flatMap((track) =>
            track.segments.map((segment) => segment.start + segment.duration),
          ),
        ),
        video: tracks[0],
        audio: { 'zh-CN': tracks[1], ja: tracks[2] },
      };
      asset.streamProcessing = {
        sourceHashes,
        method:
          'FFmpeg DASH stream copy. One shared H.264 picture stream; unchanged AAC packets per language.',
        compatibility:
          'Combined MP4s retained for supported old URLs and non-MSE clients; excluded from default MSE downloads.',
      };
      const unique = new Map(
        tracks
          .flatMap((track) => [track.init, ...track.segments])
          .map((file) => [file.url, file.bytes]),
      );
      results.push({
        label,
        variant,
        combinedBytes: inputs.reduce(
          (sum, file) => sum + fs.statSync(file).size,
          0,
        ),
        streamBytes: [...unique.values()].reduce(
          (sum, bytes) => sum + bytes,
          0,
        ),
        tracks: tracks.length,
        segments: tracks.reduce((sum, track) => sum + track.segments.length, 0),
      });
    }
  }
  manifest.files = [...files.values()];
  atomic(indexPath, index);
  atomic(manifestPath, manifest);
  return results;
}

export function publishMovieStreams() {
  const generated = path.join(root, 'src/generated');
  const manifests = new Map();
  for (const name of fs
    .readdirSync(generated)
    .filter((name) => /^gfl2.*-scenes\.json$/.test(name))) {
    const filename = path.join(generated, name);
    const manifest = json(filename);
    if (!manifest?.sections) continue;
    for (const section of Object.values(manifest.sections)) {
      const pathname = new URL(section.url, 'http://local').pathname;
      const filename = path.join(root, 'public', pathname);
      const program = json(filename);
      if (!Object.keys(program.videos ?? {}).length) continue;
      const library = pathname.split('/')[2];
      const videos = json(
        path.join(root, 'public/private', library, 'videos/manifest.json'),
      );
      for (const label of Object.keys(program.videos)) {
        const replacement = videos.videos[label];
        if (!replacement)
          throw Error(`Missing movie manifest ${library}:${label}`);
        program.videos[label] = replacement;
      }
      const files = new Map(program.files.map((file) => [file.url, file]));
      for (const asset of Object.values(program.videos))
        for (const variant of [asset, asset.female])
          if (variant?.streams)
            for (const track of [
              variant.streams.video,
              ...Object.values(variant.streams.audio),
            ])
              for (const file of [track.init, ...track.segments])
                files.set(file.url, { url: file.url, bytes: file.bytes });
      program.files = [...files.values()];
      atomic(filename, program);
      section.url = `${pathname}?v=${hash(Buffer.from(JSON.stringify(program))).slice(0, 16)}`;
      section.bytes = program.files.reduce((sum, file) => sum + file.bytes, 0);
    }
    atomic(filename, manifest);
    manifests.set(name, manifest);
  }
  const packagesFile = path.join(generated, 'gfl2-packages.json');
  const packages = json(packagesFile);
  for (const item of packages) {
    const scenes = manifests.get(`${item.event.id}-scenes.json`);
    if (scenes) item.scenes = scenes;
  }
  atomic(packagesFile, packages);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const results = [];
  for (const directory of fs.readdirSync(path.join(root, 'public/private'))) {
    if (!directory.startsWith('gfl2-')) continue;
    const manifest = path.join(
      root,
      'public/private',
      directory,
      'videos/manifest.json',
    );
    if (fs.existsSync(manifest))
      results.push(
        ...shareMovieStreams(manifest).map((result) => ({
          library: directory,
          ...result,
        })),
      );
  }
  atomic(path.join(root, 'docs/movie-stream-sharing.json'), {
    generatedOn: '2026-10-19',
    results,
  });
  publishMovieStreams();
  console.log(
    JSON.stringify({
      movies: results.length,
      combinedBytes: results.reduce(
        (sum, result) => sum + result.combinedBytes,
        0,
      ),
      streamBytes: results.reduce((sum, result) => sum + result.streamBytes, 0),
    }),
  );
}
