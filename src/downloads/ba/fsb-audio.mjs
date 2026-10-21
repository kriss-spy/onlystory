import { fsbVorbisToOgg } from './fsb-vorbis.mjs';

// Standard IMA ADPCM step sizes and index deltas. FSB5's mono/stereo format
// uses Xbox blocks: 36 bytes per channel, 64 samples, final nibble omitted.
const steps = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
  50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
  253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
  1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327,
  3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
  11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794,
  32767,
];
const deltaIndex = [-1, -1, -1, -1, 2, 4, 6, 8];
export function fsbAudio(bank, setups) {
  const v = new DataView(bank.buffer, bank.byteOffset, bank.byteLength);
  if (
    bank.length < 68 ||
    new TextDecoder().decode(bank.subarray(0, 4)) !== 'FSB5' ||
    v.getUint32(4, true) !== 1 ||
    v.getUint32(8, true) !== 1
  )
    throw Error('Expected one FSB5 v1 audio sample');
  const mode = v.getUint32(24, true);
  if (mode === 15)
    return { ...fsbVorbisToOgg(bank, setups), mime: 'audio/ogg' };
  if (mode !== 7) throw Error(`Unsupported FSB5 codec ${mode}`);
  const h = v.getBigUint64(60, true),
    frames = Number(h >> 34n),
    channels = [1, 2, 6, 8][Number((h >> 5n) & 3n)];
  if (channels > 2)
    throw Error('Only original mono/stereo Xbox IMA samples are supported');
  let frequency = [
      4000, 8000, 11000, 12000, 16000, 22050, 24000, 32000, 44100, 48000, 96000,
    ][Number((h >> 1n) & 15n)],
    at = 68,
    more = Number(h & 1n);
  while (more) {
    const word = v.getUint32(at, true),
      size = (word >>> 1) & 0xffffff,
      type = word >>> 25;
    more = word & 1;
    at += 4;
    if (type === 2) frequency = v.getUint32(at, true);
    if (type === 1 && bank[at] !== channels)
      throw Error('Unexpected IMA channel override');
    at += size;
  }
  const start = 60 + v.getUint32(12, true) + v.getUint32(16, true),
    blocks = Math.ceil(frames / 64);
  if (start + blocks * 36 * channels > bank.length)
    throw Error('Truncated original IMA audio');
  const bytes = new Uint8Array(44 + frames * channels * 2),
    wav = new DataView(bytes.buffer),
    text = (s, o) => bytes.set(new TextEncoder().encode(s), o);
  text('RIFF', 0);
  wav.setUint32(4, bytes.length - 8, true);
  text('WAVEfmt ', 8);
  wav.setUint32(16, 16, true);
  wav.setUint16(20, 1, true);
  wav.setUint16(22, channels, true);
  wav.setUint32(24, frequency, true);
  wav.setUint32(28, frequency * channels * 2, true);
  wav.setUint16(32, channels * 2, true);
  wav.setUint16(34, 16, true);
  text('data', 36);
  wav.setUint32(40, frames * channels * 2, true);
  for (let block = 0; block < blocks; block++)
    for (let channel = 0; channel < channels; channel++) {
      const base = start + block * 36 * channels,
        head = base + channel * 4;
      let sample = v.getInt16(head, true),
        index = Math.max(0, Math.min(88, bank[head + 2]));
      for (let i = 0; i < 64 && block * 64 + i < frames; i++) {
        if (i) {
          const n = i - 1,
            pos =
              base +
              4 * channels +
              Math.floor(n / 8) * 4 * channels +
              channel * 4 +
              Math.floor((n % 8) / 2),
            code = (bank[pos] >> ((n & 1) * 4)) & 15,
            step = steps[index];
          let change =
            (step >> 3) +
            (code & 1 ? step >> 2 : 0) +
            (code & 2 ? step >> 1 : 0) +
            (code & 4 ? step : 0);
          if (code & 8) change = -change;
          sample = Math.max(-32768, Math.min(32767, sample + change));
          index = Math.max(0, Math.min(88, index + deltaIndex[code & 7]));
        }
        wav.setInt16(
          44 + ((block * 64 + i) * channels + channel) * 2,
          sample,
          true,
        );
      }
    }
  return { bytes, frames, channels, frequency, mime: 'audio/wav' };
}
