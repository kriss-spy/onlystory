// The pinned JP schema is already used by the maintainer's Python exporter.
// Importing it here decodes original database rows on the user's machine.
import schema from '../../../scripts/ba-jp-schema-1.73.json' with { type: 'json' };
import initSqlJs from 'sql.js';
import {
  cachedDatabaseChapter,
  cacheDatabasePart,
  baDatabaseSchema,
} from './source-cache.mjs';

const header = new TextEncoder().encode('SQLite format 3\0');
export async function decryptDatabase(bytes, keyHex, progress = () => {}) {
  if (header.every((b, i) => bytes[i] === b)) return bytes;
  if (!/^[a-f0-9]{64}$/i.test(keyHex) || !bytes.length || bytes.length % 4096)
    throw Error('Invalid pinned BA database or decryption key');
  const rawKey = Uint8Array.from(keyHex.match(/../g), (s) => parseInt(s, 16));
  const aes = await crypto.subtle.importKey('raw', rawKey, 'AES-CBC', false, [
    'encrypt',
    'decrypt',
  ]);
  const password = await crypto.subtle.importKey(
    'raw',
    rawKey,
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const macBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-512',
      iterations: 2,
      salt: bytes.slice(0, 16).map((v) => v ^ 0x3a),
    },
    password,
    256,
  );
  const mac = await crypto.subtle.importKey(
    'raw',
    macBits,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['verify'],
  );
  const result = new Uint8Array(bytes.length);
  result.set(header);
  const pages = bytes.length / 4096;
  // Each page authenticates its ciphertext, IV, and one-based page number.
  // WebCrypto requires PKCS#7; append a correctly encrypted padding block to
  // the raw SQLCipher CBC stream before decrypting it.
  for (let pageNo = 1; pageNo <= pages; pageNo++) {
    const at = (pageNo - 1) * 4096,
      offset = pageNo === 1 ? 16 : 0;
    const page = bytes.subarray(at, at + 4096),
      ciphertext = page.subarray(offset, 4016),
      iv = page.subarray(4016, 4032);
    const authenticated = new Uint8Array(ciphertext.length + 20);
    authenticated.set(ciphertext);
    authenticated.set(iv, ciphertext.length);
    new DataView(authenticated.buffer).setUint32(
      authenticated.length - 4,
      pageNo,
      true,
    );
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        mac,
        page.subarray(4032, 4096),
        authenticated,
      ))
    )
      throw Error(`BA database authentication failed at page ${pageNo}`);
    const padding = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv: ciphertext.subarray(-16) },
        aes,
        new Uint8Array(),
      ),
    );
    const padded = new Uint8Array(ciphertext.length + 16);
    padded.set(ciphertext);
    padded.set(padding, ciphertext.length);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      aes,
      padded,
    );
    result.set(new Uint8Array(plain), at + offset);
    if (pageNo % 256 === 0 || pageNo === pages) progress(pageNo, pages);
  }
  return result;
}

export function decodeRow(bytes, typeName, selectedSchema = schema) {
  const type = selectedSchema.types[typeName];
  if (!type) throw Error(`Unknown pinned BA table ${typeName}`);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    root = v.getUint32(0, true),
    vt = root - v.getInt32(root, true),
    vtSize = v.getUint16(vt, true);
  const numeric = {
    'System.Int64': [8, (p) => Number(v.getBigInt64(p, true))],
    'System.UInt64': [8, (p) => Number(v.getBigUint64(p, true))],
    'System.Int32': [4, (p) => v.getInt32(p, true)],
    'System.UInt32': [4, (p) => v.getUint32(p, true)],
    'System.Single': [4, (p) => v.getFloat32(p, true)],
    'System.Double': [8, (p) => v.getFloat64(p, true)],
    'System.Int16': [2, (p) => v.getInt16(p, true)],
    'System.UInt16': [2, (p) => v.getUint16(p, true)],
    'System.Byte': [1, (p) => v.getUint8(p)],
    'System.SByte': [1, (p) => v.getInt8(p)],
    'System.Boolean': [1, (p) => Boolean(v.getUint8(p))],
  };
  const result = {};
  for (const { name, field, annotation } of type.fields) {
    const entry = 4 + field.index * 2,
      relative = entry < vtSize ? v.getUint16(vt + entry, true) : 0;
    const enumType = selectedSchema.enums[annotation],
      csType = enumType?.metadata.underlying_type ?? field.cs_type;
    function read(p) {
      if (csType === 'System.String' || csType === 'string') {
        const start = p + v.getUint32(p, true),
          length = v.getUint32(start, true);
        return new TextDecoder('utf-8', { fatal: true }).decode(
          bytes.subarray(start + 4, start + 4 + length),
        );
      }
      if (!numeric[csType])
        throw Error(`Unsupported pinned BA scalar ${csType}`);
      const value = numeric[csType][1](p);
      return enumType
        ? (Object.entries(enumType.members).find(([, n]) => n === value)?.[0] ??
            value)
        : value;
    }
    if (!relative) {
      result[name] = field.is_vector
        ? []
        : enumType
          ? (Object.entries(enumType.members).find(([, n]) => n === 0)?.[0] ??
            0)
          : /String|string/.test(csType)
            ? null
            : csType === 'System.Boolean'
              ? false
              : 0;
    } else if (field.is_vector) {
      const pos = root + relative,
        start = pos + v.getUint32(pos, true),
        count = v.getUint32(start, true),
        stride = numeric[csType]?.[0] ?? 4;
      result[name] = Array.from({ length: count }, (_, i) =>
        read(start + 4 + i * stride),
      );
    } else result[name] = read(root + relative);
  }
  return result;
}

export async function exportDatabaseChapter(bytes, config, group, progress) {
  const cached = await cachedDatabaseChapter(group, config);
  if (cached) return voiceNames(cached, config);
  const plain = await decryptDatabase(bytes, config.key, progress);
  const selectedSchema = baDatabaseSchema(config);
  const SQL = await initSqlJs({
    locateFile: () =>
      new URL('/vendor/sqlite/sql-wasm.wasm', self.location.href).href,
  });
  const db = new SQL.Database(plain);
  try {
    const statement = db.prepare(
      'SELECT GroupId, Bytes FROM ScenarioScriptDBSchema ORDER BY GroupId, rowid',
    );
    let content = [],
      currentGroup = null,
      selected = null;
    const publish = async () => {
      if (currentGroup == null) return;
      const source = { GroupId: currentGroup, content };
      await cacheDatabasePart(currentGroup, source, config);
      if (currentGroup === group) selected = source;
    };
    try {
      while (statement.step()) {
        const [rowGroup, blob] = statement.get();
        if (rowGroup !== currentGroup) {
          await publish();
          content = [];
          currentGroup = rowGroup;
        }
        const row = decodeRow(blob, 'ScenarioScriptExcel', selectedSchema);
        if (row.TeenMode) continue;
        if (row.GroupId !== rowGroup)
          throw Error('Original BA database group mismatch');
        content.push(row);
      }
      await publish();
    } finally {
      statement.free();
    }
    if (!selected?.content.length)
      throw Error(`Missing original BA scenario ${group}`);
    const names = db.exec(
      'SELECT Bytes FROM ScenarioCharacterNameDBSchema ORDER BY rowid',
    )[0];
    const result = {
      source: selected,
      names: {
        DataList: names.values.map(([blob]) =>
          decodeRow(blob, 'ScenarioCharacterNameExcel', selectedSchema),
        ),
      },
    };
    await cacheDatabasePart('characters', result.names, config);
    return voiceNames(result, config);
  } finally {
    db.close();
  }
}
function voiceNames(result, config) {
  for (const row of result.source.content)
    if (row.VoiceId) row.VoiceJp = config.voiceNames?.[row.VoiceId] ?? '';
  return result;
}
