const unescapeXml = (text) =>
  text
    .replace(/&#(x[a-fA-F0-9]+|[0-9]+);/g, (_, value) =>
      String.fromCodePoint(
        value[0] === 'x' ? parseInt(value.slice(1), 16) : Number(value),
      ),
    )
    .replace(
      /&(amp|quot|apos|lt|gt);/g,
      (_, entity) =>
        ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' })[entity],
    );
const field = (xml, tag) =>
  unescapeXml(
    xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? '',
  );

export function parseVoiceListing(xml) {
  if (!xml.includes('<ListBucketResult') || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error('Invalid original voice listing');
  const entries = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(
    (match) => {
      const key = field(match[1], 'Key');
      const bytes = Number(field(match[1], 'Size'));
      const md5 = field(match[1], 'ETag').replaceAll('"', '').toLowerCase();
      if (!key || !Number.isSafeInteger(bytes) || bytes < 0)
        throw new Error('Invalid voice listing entry');
      return { key, bytes, md5 };
    },
  );
  const continuation = field(xml, 'NextContinuationToken');
  if (field(xml, 'IsTruncated') === 'true' && !continuation)
    throw new Error('Truncated original voice listing');
  return { entries, continuation };
}

/** Resolve exact original filenames in bulk, without downloading every clip. */
export function createVoiceResolver() {
  const directories = new Map();
  return async (candidates, acquire) => {
    for (const url of [...new Set(candidates)]) {
      const parsed = new URL(url);
      if (
        parsed.origin !== 'https://storage.sekai.best' ||
        !parsed.pathname.startsWith('/sekai-jp-assets/sound/') ||
        !parsed.pathname.endsWith('.mp3')
      )
        throw new Error('Invalid original voice candidate');
      const key = decodeURIComponent(
        parsed.pathname.slice('/sekai-jp-assets/'.length),
      );
      const directory = key.slice(0, key.lastIndexOf('/') + 1);
      let pending = directories.get(directory);
      if (!pending) {
        pending = (async () => {
          const result = new Map();
          let continuation = '';
          do {
            const listingUrl = `https://storage.sekai.best/sekai-jp-assets/?list-type=2&prefix=${encodeURIComponent(directory)}${continuation ? `&continuation-token=${encodeURIComponent(continuation)}` : ''}`;
            const source = await acquire(listingUrl);
            const page = parseVoiceListing(source.data.toString('utf8'));
            for (const entry of page.entries) {
              if (!entry.key.startsWith(directory) || entry.key.includes('..'))
                throw new Error('Unexpected original voice listing path');
              if (entry.key.endsWith('.mp3') && entry.bytes > 0) {
                if (!/^[a-f0-9]{32}$/.test(entry.md5))
                  throw new Error(
                    'Original voice lacks a verifiable single-file MD5',
                  );
                result.set(entry.key, { ...entry, source });
              }
            }
            continuation = page.continuation;
          } while (continuation);
          return result;
        })();
        directories.set(directory, pending);
        void pending.catch(() => directories.delete(directory));
      }
      const entry = (await pending).get(key);
      if (entry) return { ...entry, sourceUrl: url };
    }
    throw new Error(
      `Original voice filename is absent from verified directory listings: ${candidates[0]}`,
    );
  };
}
