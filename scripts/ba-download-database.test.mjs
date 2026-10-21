import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHmac, pbkdf2Sync } from 'node:crypto';
import { decryptDatabase, decodeRow } from '../src/downloads/ba/database.mjs';
import globalSchema from './ba-gl-schema-1.93.json' with { type: 'json' };

test('preserves global scenario group identities above 32 bits', () => {
  const bytes = new Uint8Array(32),
    view = new DataView(bytes.buffer);
  view.setUint32(0, 16, true);
  view.setUint16(4, 6, true);
  view.setUint16(6, 16, true);
  view.setUint16(8, 8, true);
  view.setInt32(16, 12, true);
  // Verified original group 83300100100 stores 04a8126513000000 in this slot.
  view.setBigInt64(24, 83300100100n, true);
  assert.equal(
    decodeRow(bytes, 'ScenarioScriptExcel', globalSchema).GroupId,
    83300100100,
  );
});

function encryptedFixture() {
  const key = Buffer.alloc(32, 7),
    salt = Buffer.alloc(16, 11),
    iv = Buffer.alloc(16, 13);
  const macKey = pbkdf2Sync(
    key,
    salt.map((b) => b ^ 0x3a),
    2,
    32,
    'sha512',
  );
  const plain = Buffer.alloc(8192);
  plain.write('SQLite format 3\0');
  for (let i = 16; i < plain.length; i++)
    if (i % 4096 < 4016) plain[i] = i % 251;
  const encrypted = Buffer.alloc(8192);
  for (let pageNo = 1; pageNo <= 2; pageNo++) {
    const base = (pageNo - 1) * 4096,
      offset = pageNo === 1 ? 16 : 0;
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    cipher.setAutoPadding(false);
    encrypted.set(
      Buffer.concat([
        cipher.update(plain.subarray(base + offset, base + 4016)),
        cipher.final(),
      ]),
      base + offset,
    );
    encrypted.set(iv, base + 4016);
    const number = Buffer.alloc(4);
    number.writeUInt32LE(pageNo);
    const mac = createHmac('sha512', macKey)
      .update(encrypted.subarray(base + offset, base + 4032))
      .update(number)
      .digest();
    encrypted.set(mac, base + 4032);
  }
  encrypted.set(salt);
  return { encrypted, plain, key: key.toString('hex') };
}

test('decrypts authenticated SQLCipher pages including first-page header and reserved bytes', async () => {
  const { encrypted, plain, key } = encryptedFixture();
  assert.deepEqual(
    await decryptDatabase(encrypted, key),
    new Uint8Array(plain),
  );
});

test('rejects corrupted original database pages before consuming plaintext', async () => {
  const { encrypted, key } = encryptedFixture();
  encrypted[5000] ^= 1;
  await assert.rejects(
    decryptDatabase(encrypted, key),
    /authentication failed at page 2/,
  );
});

test('decodes omitted FlatBuffer fields with original schema defaults', () => {
  const bytes = new Uint8Array(12),
    view = new DataView(bytes.buffer);
  view.setUint32(0, 8, true);
  view.setUint16(4, 4, true);
  view.setUint16(6, 4, true);
  view.setInt32(8, 4, true);
  assert.deepEqual(decodeRow(bytes, 'ScenarioScriptExcel'), {
    GroupId: 0,
    SelectionGroup: 0,
    BGMId: 0,
    Sound: null,
    Transition: 0,
    BGName: 0,
    BGEffect: 0,
    PopupFileName: null,
    ScriptKr: null,
    TextJp: null,
    VoiceId: 0,
  });
});
