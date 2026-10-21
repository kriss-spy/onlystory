import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fsbAudio } from '../src/downloads/ba/fsb-audio.mjs';

function imaFixture() {
  const bytes = new Uint8Array(68 + 72),
    v = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('FSB5'));
  v.setUint32(4, 1, true);
  v.setUint32(8, 1, true);
  v.setUint32(12, 8, true);
  v.setUint32(20, 72, true);
  v.setUint32(24, 7, true);
  v.setBigUint64(60, (3n << 34n) | (1n << 5n) | (8n << 1n), true);
  v.setInt16(68, 1000, true);
  v.setInt16(72, -1000, true);
  bytes[76] = 0x77;
  bytes[80] = 0xff;
  return bytes;
}
test('decodes stereo Xbox IMA block layout and trims padded samples to authored length', () => {
  const result = fsbAudio(imaFixture(), {}),
    pcm = new DataView(result.bytes.buffer, 44);
  assert.deepEqual(
    {
      frames: result.frames,
      channels: result.channels,
      frequency: result.frequency,
      mime: result.mime,
    },
    { frames: 3, channels: 2, frequency: 44100, mime: 'audio/wav' },
  );
  assert.equal(result.bytes.length, 44 + 3 * 2 * 2);
  assert.deepEqual(
    Array.from({ length: 6 }, (_, i) => pcm.getInt16(i * 2, true)),
    [1000, -1000, 1011, -1011, 1041, -1041],
  );
});
test('rejects truncated IMA original data', () => {
  assert.throws(() => fsbAudio(imaFixture().subarray(0, 100), {}), /Truncated/);
});
