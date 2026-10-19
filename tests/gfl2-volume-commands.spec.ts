import { test, expect } from '@playwright/test';

test('source volume fades retain the old level during delay, adjust an existing player, and seek to the resulting level', async ({
  page,
}) => {
  await page.goto('/library');
  const result = await page.evaluate(async () => {
    const audioModule = '/src/playback/gfl2/event-audio.ts';
    const stateModule = '/src/playback/gfl2/event-state.ts';
    const { EventAudio } = await import(audioModule);
    const { buildTimeline } = await import(stateModule);
    // A quiet constant tone makes changes in playback gain measurable, without
    // relying on the level of an arbitrary passage in a recovered music track.
    const rate = 48000;
    const wav = new ArrayBuffer(44 + rate * 2);
    const view = new DataView(wav);
    const text = (offset: number, value: string) =>
      [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    text(0, 'RIFF');
    view.setUint32(4, wav.byteLength - 8, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, rate * 2, true);
    for (let i = 0; i < rate; i++)
      view.setInt16(
        44 + i * 2,
        Math.round(Math.sin((i * 2 * Math.PI * 440) / rate) * 3276.7),
        true,
      );
    const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    const command = (name: string, args: string[], sourceRow: number) => ({
      Command: name,
      ...Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [`Arg${i + 1}`, args[i] || '']),
      ),
      WaitType: '',
      sourceRow,
    });
    const program = {
      version: 1,
      id: 'test',
      backgrounds: {},
      characters: {},
      layers: {},
      files: [],
      unresolved: [],
      audio: { tone: { url } },
      steps: [
        {
          id: 'one',
          script: 'test',
          reset: true,
          commands: [command('Bgm', ['tone', '', '.4'], 1)],
        },
        {
          id: 'two',
          script: 'test',
          reset: false,
          commands: [
            command(
              'ChangeSoundVolume',
              ['Bgm', '1.5', 'tone', '', '', '.2', '.2'],
              2,
            ),
            command('ChangeSoundVolume', ['Bgm', '.5'], 3),
          ],
        },
      ],
    };
    const states = buildTimeline(program);
    const render = async (instant: boolean) => {
      const offline = new OfflineAudioContext(1, rate, rate);
      Object.assign(offline, { close: async () => {} });
      const native = window.AudioContext;
      let audio;
      const errors: string[] = [];
      try {
        window.AudioContext = function () {
          return offline;
        } as unknown as typeof AudioContext;
        audio = new EventAudio(
          program,
          (message: string) => errors.push(message),
          () => {},
        );
      } finally {
        window.AudioContext = native;
      }
      try {
        audio.configure(1, 1);
        audio.update(states[instant ? 1 : 0], { instant, changed: true });
        const deadline = performance.now() + 5000;
        while (
          audio.diagnostics.playing.length !== 1 &&
          performance.now() < deadline
        )
          await new Promise((resolve) => setTimeout(resolve, 10));
        if (!instant)
          audio.update(states[1], { instant: false, changed: true });
        const buffer = await offline.startRendering();
        const rms = (start: number, end: number) => {
          const samples = buffer
            .getChannelData(0)
            .subarray(start * rate, end * rate);
          return Math.sqrt(
            samples.reduce((sum, n) => sum + n * n, 0) / samples.length,
          );
        };
        return {
          early: rms(0.05, 0.15),
          late: rms(0.5, 0.6),
          errors,
          sources: audio.diagnostics.playing.length,
        };
      } finally {
        audio.dispose();
      }
    };
    try {
      return { normal: await render(false), seek: await render(true) };
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  expect(result.normal.errors).toEqual([]);
  expect(result.normal.sources).toBe(1);
  expect(result.normal.early).toBeCloseTo((0.1 * 0.4 * 0.5) / Math.sqrt(2), 3);
  expect(result.normal.late).toBeCloseTo((0.1 * 1.5 * 0.5) / Math.sqrt(2), 3);
  expect(result.seek.early).toBeCloseTo(result.normal.late, 3);
  expect(result.seek.late).toBeCloseTo(result.normal.late, 4);
});
