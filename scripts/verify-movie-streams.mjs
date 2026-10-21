import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJSON = (filename) => JSON.parse(fs.readFileSync(filename, 'utf8'));
const publicFile = (url) => {
  if (!/^\/private\/shared\/[a-f0-9]{64}\.[a-z0-9]+$/.test(url))
    throw Error('Unsafe movie identity');
  return path.join(root, 'public', url);
};
async function command(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '',
      error = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      error += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(output.trim())
        : reject(Error(`${executable} exited ${code}: ${error}`)),
    );
  });
}
export async function concatenateMovieTrack(track, filename) {
  async function* chunks() {
    for (const file of [track.init, ...track.segments]) {
      if (fs.statSync(publicFile(file.url)).size !== file.bytes)
        throw Error('Movie segment length mismatch');
      for await (const chunk of fs.createReadStream(publicFile(file.url)))
        yield chunk;
    }
  }
  await pipeline(Readable.from(chunks()), fs.createWriteStream(filename));
}
async function packetHash(filename, kind) {
  return command('ffmpeg', [
    '-v',
    'error',
    '-i',
    filename,
    '-map',
    `0:${kind}:0`,
    '-c',
    'copy',
    ...(kind === 'v' ? ['-bsf:v', 'h264_mp4toannexb'] : []),
    '-f',
    'hash',
    '-hash',
    'sha256',
    '-',
  ]);
}
async function probe(filename) {
  return JSON.parse(
    await command('ffprobe', [
      '-v',
      'error',
      '-count_packets',
      '-show_entries',
      'stream=codec_name,nb_read_packets,start_time,duration,time_base,width,height,sample_rate,channels:format=duration',
      '-of',
      'json',
      filename,
    ]),
  );
}

export async function verifyMovieStreams({ libraries } = {}) {
  const workspace = path.join(root, '.cache/movie-stream-verification');
  fs.mkdirSync(workspace, { recursive: true });
  const verified = new Map(),
    records = [];
  for (const directory of fs
    .readdirSync(path.join(root, 'public/private'), { withFileTypes: true })
    .filter((directory) => directory.isDirectory())) {
    if (libraries && !libraries.includes(directory.name)) continue;
    const filename = path.join(
      root,
      'public/private',
      directory.name,
      'videos/manifest.json',
    );
    if (!fs.existsSync(filename)) continue;
    for (const [label, movie] of Object.entries(
      readJSON(filename).videos ?? {},
    ))
      for (const [variant, asset] of [
        ['male', movie],
        ['female', movie.female],
      ]) {
        if (!asset?.streams) continue;
        const pair = ['zh-CN', 'ja'].map((voice) => asset.voices[voice].url);
        const identity = createHash('sha256')
          .update(JSON.stringify({ pair, streams: asset.streams }))
          .digest('hex');
        if (verified.has(identity)) {
          records.push({
            library: directory.name,
            label,
            variant,
            verification: identity,
            duplicateOf: verified.get(identity).reference,
          });
          continue;
        }
        const pictureFile = path.join(workspace, `${identity}-picture.mp4`);
        const audioFile = path.join(workspace, `${identity}-audio.mp4`);
        const reference = `${directory.name}:${label}:${variant}`;
        const record = {
          library: directory.name,
          label,
          variant,
          verification: identity,
          reference,
          streams: [],
        };
        try {
          await concatenateMovieTrack(asset.streams.video, pictureFile);
          const sharedHash = await packetHash(pictureFile, 'v');
          const sharedProbe = await probe(pictureFile);
          for (const [position, voice] of ['zh-CN', 'ja'].entries()) {
            const original = publicFile(pair[position]);
            const originalHash = await packetHash(original, 'v');
            if (originalHash !== sharedHash)
              throw Error(`Picture packets differ: ${reference}:${voice}`);
            await concatenateMovieTrack(asset.streams.audio[voice], audioFile);
            const sourceAudioHash = await packetHash(original, 'a');
            const sharedAudioHash = await packetHash(audioFile, 'a');
            if (sourceAudioHash !== sharedAudioHash)
              throw Error(`AAC packets differ: ${reference}:${voice}`);
            const sourceProbe = await probe(original),
              audioProbe = await probe(audioFile);
            const sourceVideo = sourceProbe.streams.find(
              (stream) => stream.codec_name === 'h264',
            );
            const sourceAudio = sourceProbe.streams.find(
              (stream) => stream.codec_name === 'aac',
            );
            if (
              sourceVideo.nb_read_packets !==
                sharedProbe.streams[0].nb_read_packets ||
              sourceAudio.nb_read_packets !==
                audioProbe.streams[0].nb_read_packets
            )
              throw Error(`Packet count differs: ${reference}:${voice}`);
            record.streams.push({
              voice,
              pictureSHA256: sharedHash.replace('SHA256=', ''),
              aacPacketSHA256: sharedAudioHash.replace('SHA256=', ''),
              original: sourceProbe,
              sharedPicture: sharedProbe,
              sharedAudio: audioProbe,
              exactPackets: true,
            });
          }
          record.passed = true;
          verified.set(identity, record);
          records.push(record);
          console.log(`Verified ${reference}`);
        } finally {
          for (const file of [pictureFile, audioFile])
            if (fs.existsSync(file)) fs.unlinkSync(file);
        }
      }
  }
  const report = {
    version: 1,
    checkedAt: new Date().toISOString(),
    passed: true,
    method:
      'Concatenate initialization and ordered fragment files through disk streams. Compare complete SHA-256 of FFmpeg stream-copy H.264 normalized with h264_mp4toannexb and unchanged AAC packet payloads. Compare full packet counts. No decoding/re-encoding or whole-movie JavaScript buffer.',
    scope: {
      descriptors: records.length,
      uniquePictureAndAudioPairs: verified.size,
      languagesPerPair: 2,
    },
    ffmpeg: (await command('ffmpeg', ['-version'])).split('\n')[0],
    records,
  };
  fs.writeFileSync(
    path.join(root, 'docs/movie-stream-verification.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  return report;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const position = process.argv.indexOf('--libraries');
  await verifyMovieStreams({
    libraries:
      position >= 0 ? process.argv[position + 1].split(',') : undefined,
  });
}
