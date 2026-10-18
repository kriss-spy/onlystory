import { matchMedia } from '../../media-storage';

export async function baResource(url: string, signal?: AbortSignal) {
  const cache =
    'caches' in window
      ? await caches.open('onlystory.media.v1').catch(() => null)
      : null;
  const response =
    (await matchMedia(cache, url)) ?? (await fetch(url, { signal }));
  if (
    !response.ok ||
    response.headers.get('content-type')?.includes('text/html')
  )
    throw new Error(`BA asset unavailable: ${url.split('/').at(-1)}`);
  return response;
}
