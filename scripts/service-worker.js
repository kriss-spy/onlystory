/* Build placeholders are replaced by pwa-plugin.mjs. */
const VERSION = __SHELL_VERSION__;
const FILES = __SHELL_FILES__;
const SHELL_PREFIX = 'onlystory.shell.';
const SHELL_CACHE = SHELL_PREFIX + VERSION;
const MEDIA_CACHE = 'onlystory.media.v1';
const shellFiles = new Set(FILES);

self.addEventListener('install', (event) => {
  // addAll is atomic: a failed asset leaves the previous app in place.
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        cache.addAll(FILES.map((url) => new Request(url, { cache: 'reload' }))),
      )
      .catch(async (error) => {
        await caches.delete(SHELL_CACHE);
        throw error;
      }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const shells = (await caches.keys()).filter((key) =>
        key.startsWith(SHELL_PREFIX),
      );
      // Keep the previous build's lazy chunks for other windows still reading.
      const previous = shells.filter((key) => key !== SHELL_CACHE).at(-1);
      await Promise.all(
        shells
          .filter((key) => key !== SHELL_CACHE && key !== previous)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE')
    event.waitUntil(self.skipWaiting());
});

async function downloaded(request, pathname) {
  if (!(await caches.has(MEDIA_CACHE))) return undefined;
  const cache = await caches.open(MEDIA_CACHE);
  let response = await cache.match(request.url);
  if (!response) {
    const index = await cache.match('/private/shared/index.json');
    const target = index && (await index.json()).aliases?.[pathname];
    if (target) response = await cache.match(target);
  }
  if (!response) return undefined;
  const range = request.headers.get('range');
  if (!range) return response;
  // Cached movies need the same byte-range semantics as the library host.
  const blob = await response.blob();
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  let start = 0;
  let end = blob.size - 1;
  if (match && (match[1] || match[2])) {
    if (!match[1]) start = Math.max(0, blob.size - Number(match[2]));
    else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    }
  }
  if (
    !match ||
    (!match[1] && !match[2]) ||
    start > end ||
    start >= blob.size ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end)
  ) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${blob.size}` },
    });
  }
  const headers = new Headers(response.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${blob.size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(blob.slice(start, end + 1), { status: 206, headers });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/private/')) {
    // The client refreshes the alias inventory at startup. Let it see new
    // imports online, while retaining the installed inventory offline.
    if (url.pathname === '/private/shared/index.json') {
      event.respondWith(
        fetch(request).catch(
          async () =>
            (await downloaded(request, url.pathname)) ?? Response.error(),
        ),
      );
      return;
    }
    event.respondWith(
      downloaded(request, url.pathname).then(
        (cached) => cached ?? fetch(request),
      ),
    );
  } else if (
    request.mode === 'navigate' &&
    /^\/(?:$|library\/?$|bookmarks\/?$|manage\/?$|lab\/?$|games\/|read\/)/.test(
      url.pathname,
    )
  ) {
    event.respondWith(
      caches
        .open(SHELL_CACHE)
        .then(
          async (cache) => (await cache.match('/index.html')) ?? fetch(request),
        ),
    );
  } else if (
    shellFiles.has(url.pathname) ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const current = await cache.match(url.pathname);
        if (current) return current;
        const shells = (await caches.keys()).filter((key) =>
          key.startsWith(SHELL_PREFIX),
        );
        for (const key of shells) {
          const previous = await caches.match(url.pathname, { cacheName: key });
          if (previous) return previous;
        }
        return fetch(request);
      })(),
    );
  }
});
