// Limited to the three reviewed Vorbis setups used by the pinned BA story build.
// FSB layout checked against HearthSim/python-fsb5; Ogg/Vorbis framing follows Xiph specs.
const bytes = (text) => new TextEncoder().encode(text);
const join = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
function oggPage(packet, sequence, granule, flags) {
  const laces = [];
  for (let n = packet.length; n >= 255; n -= 255) laces.push(255);
  laces.push(packet.length % 255);
  if (laces.length > 255) throw Error('Oversize Ogg packet');
  const out = new Uint8Array(27 + laces.length + packet.length),
    v = new DataView(out.buffer);
  out.set(bytes('OggS'));
  out[5] = flags;
  v.setBigUint64(6, BigInt(granule), true);
  v.setUint32(14, 1, true);
  v.setUint32(18, sequence, true);
  out[26] = laces.length;
  out.set(laces, 27);
  out.set(packet, 27 + laces.length);
  let crc = 0;
  for (const b of out) {
    crc ^= b << 24;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
  }
  v.setUint32(22, crc >>> 0, true);
  return out;
}
export function fsbVorbisToOgg(bank, setups) {
  const v = new DataView(bank.buffer, bank.byteOffset, bank.byteLength);
  if (
    new TextDecoder().decode(bank.subarray(0, 4)) !== 'FSB5' ||
    v.getUint32(4, true) !== 1 ||
    v.getUint32(8, true) !== 1 ||
    v.getUint32(24, true) !== 15
  )
    throw Error('Expected one FSB5 v1 Vorbis sample');
  const h = v.getBigUint64(60, true),
    frames = Number(h >> 34n),
    channels = [1, 2, 6, 8][Number((h >> 5n) & 3n)];
  let frequency = [
      4000, 8000, 11000, 12000, 16000, 22050, 24000, 32000, 44100, 48000, 96000,
    ][Number((h >> 1n) & 15n)],
    at = 68,
    more = Number(h & 1n),
    setupId;
  while (more) {
    const word = v.getUint32(at, true),
      size = (word >>> 1) & 0xffffff,
      type = word >>> 25;
    more = word & 1;
    at += 4;
    if (type === 11) setupId = v.getUint32(at, true);
    if (type === 2) frequency = v.getUint32(at, true);
    if (type === 1 && bank[at] !== channels)
      throw Error('Channel override unsupported');
    at += size;
  }
  const setup = setups[setupId];
  if (!setup) throw Error('Unknown pinned Vorbis setup ' + setupId);
  // Each reviewed setup has exactly two modes: 256-sample short, 2048-sample long.
  const header = new Uint8Array(30),
    hv = new DataView(header.buffer);
  header.set(bytes('\x01vorbis'));
  header[11] = channels;
  hv.setUint32(12, frequency, true);
  header[28] = 0xb8;
  header[29] = 1;
  const comment = join([
    bytes('\x03vorbis'),
    new Uint8Array(8),
    new Uint8Array([1]),
  ]);
  const pages = [
    oggPage(header, 0, 0, 2),
    oggPage(comment, 1, 0, 0),
    oggPage(setup, 2, 0, 0),
  ];
  const start = 60 + v.getUint32(12, true) + v.getUint32(16, true),
    end = start + v.getUint32(20, true),
    packets = [];
  at = start;
  while (at + 2 <= end) {
    const size = v.getUint16(at, true);
    at += 2;
    if (!size) break;
    if (at + size > end) throw Error('Truncated Vorbis packet');
    packets.push(bank.subarray(at, at + size));
    at += size;
  }
  let granule = 0,
    previous = 0;
  for (let i = 0; i < packets.length; i++) {
    const p = packets[i];
    if (p[0] & 1) throw Error('Expected audio packet');
    const block = p[0] & 2 ? 2048 : 256;
    if (previous) granule += (previous + block) / 4;
    previous = block;
    const last = i === packets.length - 1;
    pages.push(oggPage(p, i + 3, last ? frames : granule, last ? 4 : 0));
  }
  return {
    bytes: join(pages),
    frames,
    channels,
    frequency,
    setupId,
    packets: packets.length,
  };
}
