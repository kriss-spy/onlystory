// Bounded reader for the local table layout already used by table_probe.py.
// Field meanings below are checked by content-ID joins, not executable game code.
export function varint(bytes, offset = 0) {
  let value = 0n;
  for (let count = 0; count < 10 && offset < bytes.length; count++) {
    const byte = bytes[offset++];
    value |= BigInt(byte & 127) << BigInt(count * 7);
    if (byte < 128)
      return [
        value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value,
        offset,
      ];
  }
  throw new Error('Truncated or oversized protobuf varint.');
}
export function* fields(bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    let tag;
    [tag, offset] = varint(bytes, offset);
    if (typeof tag !== 'number' || tag < 8)
      throw new Error('Invalid protobuf field tag.');
    const wire = tag % 8;
    const field = Math.floor(tag / 8);
    let value;
    if (wire === 0) [value, offset] = varint(bytes, offset);
    else {
      let length;
      if (wire === 2) [length, offset] = varint(bytes, offset);
      else if (wire === 1 || wire === 5) length = wire === 1 ? 8 : 4;
      else throw new Error(`Unsupported protobuf wire type ${wire}.`);
      if (
        typeof length !== 'number' ||
        length < 0 ||
        offset + length > bytes.length
      )
        throw new Error('Truncated protobuf field.');
      value = bytes.subarray(offset, offset + length);
      offset += length;
    }
    yield [field, wire, value];
  }
}
export const record = (bytes) =>
  Object.fromEntries(
    [...fields(bytes)].map(([field, , value]) => [field, value]),
  );
export function* tableRows(bytes) {
  if (bytes.length < 4) throw new Error('Truncated table header.');
  const size = bytes.readUInt32LE();
  if (4 + size > bytes.length)
    throw new Error('Table index extends past the file.');
  for (const [, wire, value] of fields(bytes.subarray(4 + size)))
    if (wire === 2) yield record(value);
}
export function localizedContent(languageBytes, contentBytes) {
  const localized = new Map();
  for (const row of tableRows(languageBytes))
    if (typeof row[1] === 'number' && Buffer.isBuffer(row[2]))
      localized.set(
        row[1],
        new TextDecoder('utf-8', { fatal: true }).decode(row[2]),
      );
  const content = new Map();
  for (const row of tableRows(contentBytes)) {
    const textId = Buffer.isBuffer(row[2]) ? record(row[2])[1] : undefined;
    const femaleTextId = Buffer.isBuffer(row[3])
      ? record(row[3])[1]
      : undefined;
    content.set(row[1], {
      textId,
      femaleTextId,
      text: localized.get(textId),
      textFemale: localized.get(femaleTextId),
    });
  }
  return content;
}
