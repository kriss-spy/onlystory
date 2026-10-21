import { useEffect, useState } from 'react';
import { matchMedia as matchCachedMedia } from './media-storage';

let localLibrary: Promise<boolean> | undefined;
export function useLocalLibrary() {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    // Prepared maintainer imports are served only by the local library server.
    // A static host must not turn their catalog metadata into playable content.
    localLibrary ??= window.onlystoryDesktop
      ? Promise.resolve(false)
      : fetch('/onlystory-local-library.json', { cache: 'no-store' })
          .then(async (response) => {
            if (
              !response.ok ||
              !response.headers
                .get('content-type')
                ?.includes('application/json')
            )
              return false;
            const value = await response.json();
            return value.version === 1 && value.localLibrary === true;
          })
          .catch(() => false);
    void localLibrary.then((value) => {
      if (active) setAvailable(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return available;
}

export function useNarrow() {
  const [value, setValue] = useState(
    () => matchMedia('(max-width: 760px)').matches,
  );
  useEffect(() => {
    const query = matchMedia('(max-width: 760px)');
    const update = () => setValue(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return value;
}
export function useOnline() {
  const [value, setValue] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setValue(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return value;
}
export function useMediaUrl(path: string | undefined) {
  const [media, setMedia] = useState<{ path?: string; url?: string }>({});
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    if (!path) {
      setMedia({});
      return;
    }
    void (async () => {
      try {
        const cache =
          'caches' in window ? await caches.open('onlystory.media.v1') : null;
        const response = await matchCachedMedia(cache, path);
        if (response) objectUrl = URL.createObjectURL(await response.blob());
      } catch {
        /* The network path remains usable if private browsing disables CacheStorage. */
      }
      if (active) setMedia({ path, url: objectUrl ?? path });
      else if (objectUrl) URL.revokeObjectURL(objectUrl);
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return media.path === path ? media.url : undefined;
}
