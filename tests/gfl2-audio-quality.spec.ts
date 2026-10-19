import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(
  readFileSync('src/generated/gfl2-scenes.json', 'utf8'),
);

test('output peak protection preserves quiet audio volume', async ({
  page,
}) => {
  await page.goto('/library');
  const rms = await page.evaluate(async () => {
    const module = '/src/playback/audio-output.ts';
    const { createAudioOutput } = await import(module);
    const context = new OfflineAudioContext(1, 48000, 48000);
    const output = createAudioOutput(context);
    const tone = context.createOscillator();
    tone.frequency.value = 440;
    const gain = context.createGain();
    gain.gain.value = 0.1;
    tone.connect(gain);
    gain.connect(output.input);
    tone.start();
    const rendered = await context.startRendering();
    const samples = rendered.getChannelData(0).subarray(24000);
    const rms = Math.sqrt(
      samples.reduce((sum, value) => sum + value * value, 0) / samples.length,
    );
    output.disconnect();
    return rms;
  });
  expect(rms).toBeCloseTo(0.1 / Math.sqrt(2), 3);
});

for (const settings of [
  { label: 'default', music: 0.18, sfx: 0.8 },
  { label: 'maximum', music: 1, sfx: 1 },
]) {
  test(`${settings.label} volumes keep the original BGM and storm below clipping through the real player`, async ({
    page,
  }) => {
    await page.goto('/library');
    const result = await page.evaluate(
      async ({ url, music, sfx }) => {
        const audioModule = '/src/playback/gfl2/event-audio.ts';
        const stateModule = '/src/playback/gfl2/event-state.ts';
        const { EventAudio } = await import(audioModule);
        const { buildTimeline } = await import(stateModule);
        const program = await (await fetch(url)).json();
        // Render the actual player graph offline. This includes Chromium's OGG
        // decoder, cue gains, the two original storm layers and the music bus.
        const offline = new OfflineAudioContext(2, 135 * 48000, 48000);
        Object.assign(offline, { close: async () => {} });
        const nativeContext = window.AudioContext;
        const errors: string[] = [];
        let audio;
        try {
          window.AudioContext = function () {
            return offline;
          } as unknown as typeof AudioContext;
          audio = new EventAudio(
            program,
            (m: string) => errors.push(m),
            () => {},
          );
        } finally {
          window.AudioContext = nativeContext;
        }
        try {
          audio.configure(music, sfx);
          audio.update(buildTimeline(program)[0], {
            instant: false,
            changed: true,
          });
          const deadline = performance.now() + 10000;
          while (
            audio.diagnostics.playing.length < 3 &&
            performance.now() < deadline
          )
            await new Promise((resolve) => setTimeout(resolve, 20));
          const sources = audio.diagnostics.playing;
          const rendered = await offline.startRendering();
          let peak = 0,
            clipped = 0,
            energy = 0;
          for (let c = 0; c < rendered.numberOfChannels; c++)
            for (const sample of rendered.getChannelData(c)) {
              peak = Math.max(peak, Math.abs(sample));
              if (Math.abs(sample) >= 1) clipped++;
              energy += sample * sample;
            }
          return { errors, sources, peak, clipped, energy };
        } finally {
          audio.dispose();
        }
      },
      { url: manifest.sections['gfl2-event-3478101'].url, ...settings },
    );
    expect(result.errors).toEqual([]);
    expect(
      result.sources.map((source: { cue: string }) => source.cue).sort(),
    ).toEqual(['2010121', '2010121', '黄区荒凉废墟']);
    expect(result.energy).toBeGreaterThan(100);
    expect(result.clipped).toBe(0);
    expect(result.peak).toBeLessThan(1);
  });
}
