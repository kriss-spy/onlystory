const receiptsName = 'onlystory.ba-output.v1';
export const sha256 = async (bytes) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
async function receiptKey(recipe, output) {
  const ids = new Set([
    output.input,
    output.soundInput,
    ...(output.parts ?? []).map((p) => p.input),
  ]);
  const inputs = recipe.inputs
    .filter((i) => ids.has(i.id))
    .map((i) => ({ id: i.id, sha256: i.sha256 }));
  return (
    '/__onlystory/ba-output-v1/' +
    (await sha256(new TextEncoder().encode(JSON.stringify({ output, inputs }))))
  );
}
export async function reusableOutput(recipe, output) {
  const receipts = await caches.open(receiptsName),
    receipt = await receipts.match(await receiptKey(recipe, output));
  if (!receipt) return null;
  const expected = await receipt.json(),
    media = await caches.open('onlystory.media.v1'),
    response = await media.match(output.url);
  if (!response) return null;
  const bytes = await response.clone().arrayBuffer();
  if (
    bytes.byteLength !== expected.bytes ||
    (await sha256(bytes)) !== expected.sha256
  )
    return null;
  return { response, file: { url: output.url, ...expected } };
}
export async function recordOutput(recipe, output, file) {
  const cache = await caches.open(receiptsName);
  await cache.put(
    await receiptKey(recipe, output),
    new Response(JSON.stringify({ sha256: file.sha256, bytes: file.bytes }), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}
export async function requiredBaInputs(recipe) {
  const required = new Set([recipe.story, recipe.characters]);
  if (recipe.source) {
    const { cachedDatabaseChapter } = await import('./source-cache.mjs');
    if (!(await cachedDatabaseChapter(recipe.group, recipe.source)))
      required.add(recipe.source.input);
  }
  if (recipe.localization) {
    const { cachedDatabaseChapter } = await import('./source-cache.mjs');
    if (!(await cachedDatabaseChapter(recipe.group, recipe.localization)))
      required.add(recipe.localization.input);
  }
  for (const output of recipe.outputs) {
    if (await reusableOutput(recipe, output)) continue;
    if (output.input != null) required.add(output.input);
    if (output.soundInput != null) required.add(output.soundInput);
    for (const part of output.parts ?? []) required.add(part.input);
  }
  return recipe.inputs.filter((i) => required.has(i.id));
}
