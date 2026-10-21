const inventoryPath = (id: string) => `/private/pjsk/installations/${id}.json`;

/** Keep large file inventories in quota-managed app storage, outside localStorage. */
export async function savePjskInventory(
  cache: Cache,
  id: string,
  files: string[],
) {
  const url = inventoryPath(id);
  const body = JSON.stringify({ version: 1, id, files: [...new Set(files)] });
  await cache.put(
    url,
    new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(new TextEncoder().encode(body).length),
      },
    }),
  );
  return [url];
}

export async function installationFiles(
  cache: Cache,
  id: string,
  files: string[],
): Promise<string[]> {
  const url = inventoryPath(id);
  if (!files.includes(url)) return files; // Existing installations retain their format.
  const response = await cache.match(url);
  if (!response) return files;
  const manifest = await response.json();
  if (
    manifest?.version !== 1 ||
    manifest.id !== id ||
    !Array.isArray(manifest.files) ||
    !manifest.files.length ||
    manifest.files.some(
      (file: unknown) =>
        typeof file !== 'string' ||
        !file.startsWith('/') ||
        file.startsWith('//'),
    )
  )
    throw Error('Invalid chapter installation inventory.');
  return [...new Set([...files, ...manifest.files])] as string[];
}
