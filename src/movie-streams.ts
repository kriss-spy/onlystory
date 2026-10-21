import type { MovieStreams, MovieTrack, VoiceLanguage } from './model';

export function supportsMovieStreams(streams: MovieStreams, voice: string) {
  const audio = streams.audio[voice as VoiceLanguage];
  return (
    typeof MediaSource !== 'undefined' &&
    !!audio &&
    MediaSource.isTypeSupported(streams.video.mime) &&
    MediaSource.isTypeSupported(audio.mime)
  );
}

export const movieTrackFiles = (track: MovieTrack) => [
  track.init,
  ...track.segments,
];

export async function movieAudioCached(
  streams: MovieStreams,
  voice: VoiceLanguage,
) {
  const track = streams.audio[voice];
  if (!track || !('caches' in globalThis)) return false;
  const cache = await caches.open('onlystory.media.v1');
  for (const file of movieTrackFiles(track))
    if (!(await cache.match(file.url))) return false;
  return true;
}

// Video and audio share one media clock. Only a small segment window is held in
// MSE; random seeks fetch the corresponding independent keyframe segments.
export function attachMovieStreams(
  player: HTMLVideoElement,
  streams: MovieStreams,
  voice: VoiceLanguage,
  start: number,
  onError: (error: Error) => void,
) {
  const controller = new AbortController();
  const { signal } = controller;
  const source = new MediaSource();
  const url = URL.createObjectURL(source);
  let timer: ReturnType<typeof setInterval> | undefined;
  let failed = false;
  const fail = (error: unknown) => {
    if (signal.aborted || failed) return;
    failed = true;
    onError(error instanceof Error ? error : new Error(String(error)));
  };
  const get = async (file: { url: string; bytes: number }) => {
    signal.throwIfAborted();
    const cache =
      'caches' in globalThis
        ? await caches.open('onlystory.media.v1')
        : undefined;
    const response =
      (await cache?.match(file.url)) ?? (await fetch(file.url, { signal }));
    if (!response.ok)
      throw Error(`Movie segment unavailable (${response.status})`);
    const bytes = await response.arrayBuffer();
    signal.throwIfAborted();
    if (bytes.byteLength !== file.bytes)
      throw Error('Movie segment size does not match its manifest');
    return bytes;
  };
  const update = (buffer: SourceBuffer, run: () => void) =>
    new Promise<void>((resolve, reject) => {
      const done = () => {
        cleanup();
        resolve();
      };
      const error = () => {
        cleanup();
        reject(new Error('Movie buffer rejected a segment'));
      };
      const abort = () => {
        cleanup();
        reject(signal.reason);
      };
      const cleanup = () => {
        buffer.removeEventListener('updateend', done);
        buffer.removeEventListener('error', error);
        signal.removeEventListener('abort', abort);
      };
      buffer.addEventListener('updateend', done, { once: true });
      buffer.addEventListener('error', error, { once: true });
      signal.addEventListener('abort', abort, { once: true });
      try {
        signal.throwIfAborted();
        run();
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  source.addEventListener(
    'sourceopen',
    () => {
      void (async () => {
        const audio = streams.audio[voice];
        if (!audio) throw Error('Movie audio language unavailable');
        const tracks = [streams.video, audio].map((track) => ({
          track,
          buffer: source.addSourceBuffer(track.mime),
          busy: false,
          loaded: new Set<number>(),
        }));
        await Promise.all(
          tracks.map(async (item) => {
            const init = await get(item.track.init);
            await update(item.buffer, () => item.buffer.appendBuffer(init));
          }),
        );
        source.duration = streams.duration;
        // Metadata restoration may already have set the player clock.
        if (start > 0 && Math.abs(player.currentTime - start) > 0.25)
          player.currentTime = Math.min(start, streams.duration - 0.01);
        const pump = () => {
          if (signal.aborted || failed || source.readyState === 'closed')
            return;
          const time = player.currentTime;
          if (
            time > streams.duration - 16 &&
            tracks.every(
              (item) =>
                !item.busy && item.loaded.has(item.track.segments.length - 1),
            ) &&
            source.readyState === 'open'
          )
            source.endOfStream();
          for (const item of tracks) {
            if (item.busy) continue;
            item.busy = true;
            void (async () => {
              const { track, buffer, loaded } = item;
              // Eviction and bookkeeping use the same window so a backward seek
              // can request previously discarded segments again.
              if (
                buffer.buffered.length &&
                time > 30 &&
                buffer.buffered.start(0) < time - 30
              ) {
                await update(buffer, () => buffer.remove(0, time - 24));
                for (const index of loaded)
                  if (track.segments[index].start < time - 24)
                    loaded.delete(index);
              }
              if (
                buffer.buffered.length &&
                buffer.buffered.end(buffer.buffered.length - 1) > time + 30
              ) {
                await update(buffer, () =>
                  buffer.remove(
                    time + 24,
                    buffer.buffered.end(buffer.buffered.length - 1),
                  ),
                );
                for (const index of loaded)
                  if (
                    track.segments[index].start +
                      track.segments[index].duration >
                    time + 24
                  )
                    loaded.delete(index);
              }
              const wanted = track.segments
                .map((segment, index) => ({ segment, index }))
                .filter(
                  ({ segment, index }) =>
                    !loaded.has(index) &&
                    segment.start + segment.duration > time - 0.15 &&
                    segment.start <= time + 16,
                );
              for (const { segment, index } of wanted) {
                if (Math.abs(player.currentTime - time) > 20) break;
                const bytes = await get(segment);
                await update(buffer, () => buffer.appendBuffer(bytes));
                loaded.add(index);
              }
            })()
              .catch(fail)
              .finally(() => {
                item.busy = false;
              });
          }
        };
        pump();
        timer = setInterval(pump, 250);
        player.addEventListener('seeking', pump, { signal });
      })().catch(fail);
    },
    { once: true, signal },
  );
  player.src = url;
  player.load();
  return () => {
    controller.abort();
    if (timer) clearInterval(timer);
    if (player.getAttribute('src') === url) {
      player.pause();
      player.removeAttribute('src');
      player.load();
    }
    URL.revokeObjectURL(url);
  };
}
