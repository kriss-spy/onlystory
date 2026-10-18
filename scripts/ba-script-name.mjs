// Scenario script identifiers use xxHash32 over their UTF-8 bytes, seed 0.
export function scriptNameHash(text) {
  const bytes = new TextEncoder().encode(text);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const p1 = 0x9e3779b1,
    p2 = 0x85ebca77,
    p3 = 0xc2b2ae3d,
    p4 = 0x27d4eb2f,
    p5 = 0x165667b1;
  const rotate = (value, bits) => (value << bits) | (value >>> (32 - bits));
  const round = (value, input) =>
    Math.imul(rotate(value + Math.imul(input, p2), 13), p1);
  let offset = 0,
    hash;
  if (bytes.length >= 16) {
    let a = (p1 + p2) | 0,
      b = p2,
      c = 0,
      d = -p1;
    while (offset <= bytes.length - 16) {
      a = round(a, view.getUint32(offset, true));
      b = round(b, view.getUint32(offset + 4, true));
      c = round(c, view.getUint32(offset + 8, true));
      d = round(d, view.getUint32(offset + 12, true));
      offset += 16;
    }
    hash = rotate(a, 1) + rotate(b, 7) + rotate(c, 12) + rotate(d, 18);
  } else hash = p5;
  hash = (hash + bytes.length) | 0;
  while (offset <= bytes.length - 4) {
    hash = Math.imul(
      rotate(hash + Math.imul(view.getUint32(offset, true), p3), 17),
      p4,
    );
    offset += 4;
  }
  while (offset < bytes.length) {
    hash = Math.imul(rotate(hash + Math.imul(bytes[offset++], p5), 11), p1);
  }
  hash ^= hash >>> 15;
  hash = Math.imul(hash, p2);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, p3);
  return (hash ^ (hash >>> 16)) >>> 0;
}
