import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createVoiceResolver,
  parseVoiceListing,
} from './pjsk-voice-listing.mjs';

const item = (key) =>
  `<Contents><Key>${key}</Key><ETag>&#34;0123456789abcdef0123456789abcdef&#34;</ETag><Size>42</Size></Contents>`;
const page = (body) => `<ListBucketResult>${body}</ListBucketResult>`;
test('original voice listings decode numeric XML entities and reject truncated evidence', () => {
  assert.deepEqual(parseVoiceListing(page(item('voice/a[.mp3'))).entries[0], {
    key: 'voice/a[.mp3',
    md5: '0123456789abcdef0123456789abcdef',
    bytes: 42,
  });
  assert.throws(
    () => parseVoiceListing(page('<IsTruncated>true</IsTruncated>')),
    /Truncated/,
  );
  assert.throws(() => parseVoiceListing('<html>error</html>'), /Invalid/);
});
test('voice lookup follows pagination, preserves exact names and shares folder requests', async () => {
  const resolveVoice = createVoiceResolver();
  const base = 'https://storage.sekai.best/sekai-jp-assets/';
  const directory = 'sound/scenario/voice/event_15_07/';
  let calls = 0;
  const acquire = async (url) => {
    calls++;
    const second = new URL(url).searchParams.has('continuation-token');
    return {
      url: '/private/pjsk/assets/listing',
      sha256: 'f'.repeat(64),
      data: Buffer.from(
        page(
          second
            ? item(directory + 'voice[.mp3')
            : '<IsTruncated>true</IsTruncated><NextContinuationToken>next&amp;page</NextContinuationToken>',
        ),
      ),
    };
  };
  const candidates = [base + directory + 'voice%5B.mp3'];
  const [a, b] = await Promise.all([
    resolveVoice(candidates, acquire),
    resolveVoice(candidates, acquire),
  ]);
  assert.equal(calls, 2);
  assert.equal(a.sourceUrl, candidates[0]);
  assert.equal(a.key, directory + 'voice[.mp3');
  assert.equal(b.md5, a.md5);
  await assert.rejects(
    resolveVoice([base + directory + 'trimmed.mp3'], acquire),
    /absent/,
  );
  await assert.rejects(
    resolveVoice(['https://example.org/voice.mp3'], acquire),
    /Invalid/,
  );
});
