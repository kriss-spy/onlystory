/** Browser locks span windows and release automatically if a window closes. */
export async function withMediaLock<T>(
  name: string,
  signal: AbortSignal | undefined,
  work: () => Promise<T>,
  mode: LockMode = 'exclusive',
): Promise<T> {
  signal?.throwIfAborted();
  if (!globalThis.navigator?.locks) return work();
  return navigator.locks.request(
    name,
    { mode, ...(signal ? { signal } : {}) },
    work,
  );
}

/** Hold a shared library lock for a complete import, including its install record. */
export function acquireLibraryLock(signal: AbortSignal): Promise<() => void> {
  signal.throwIfAborted();
  if (!globalThis.navigator?.locks) return Promise.resolve(() => {});
  return new Promise((resolve, reject) => {
    void navigator.locks
      .request(
        'onlystory:media-library',
        { mode: 'shared', signal },
        () => new Promise<void>((release) => resolve(release)),
      )
      .catch(reject);
  });
}
