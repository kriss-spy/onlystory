import schema from '../../../scripts/ba-jp-schema-1.73.json' with { type: 'json' };
import globalSchema from '../../../scripts/ba-gl-schema-1.93.json' with { type: 'json' };

const cacheName = 'onlystory.ba-source.v1';
export const baDatabaseSchema = (config) => {
  if (!config?.schema || config.schema === 'jp-1.73') return schema;
  if (config.schema === 'gl-1.93') return globalSchema;
  throw Error('Unknown pinned BA database schema');
};
const prefix = (config) => {
  const selected = baDatabaseSchema(config);
  return `/__onlystory/ba-source-v1/${selected.databaseSha256}/${selected.schemaSnapshot}/`;
};
export async function cachedDatabaseChapter(group, config) {
  const cache = await caches.open(cacheName);
  const [source, names] = await Promise.all([
    cache.match(prefix(config) + group),
    cache.match(prefix(config) + 'characters'),
  ]);
  if (!source || !names) return null;
  const sourceBytes = await source.arrayBuffer(),
    namesBytes = await names.arrayBuffer();
  const digest = async (b) =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
  if (
    (await digest(sourceBytes)) !== source.headers.get('X-Onlystory-SHA256') ||
    (await digest(namesBytes)) !== names.headers.get('X-Onlystory-SHA256')
  )
    return null;
  const text = new TextDecoder();
  return {
    source: JSON.parse(text.decode(sourceBytes)),
    names: JSON.parse(text.decode(namesBytes)),
  };
}
export async function cacheDatabasePart(id, value, config) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
  await (
    await caches.open(cacheName)
  ).put(
    prefix(config) + id,
    new Response(bytes, {
      headers: {
        'Content-Type': 'application/json',
        'X-Onlystory-SHA256': hash,
      },
    }),
  );
}
