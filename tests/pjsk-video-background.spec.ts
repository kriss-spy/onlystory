import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { emptyData, type Episode } from '../src/model';
import type { Program } from '../src/playback/pjsk/types';
import { pjskLibraryRoot } from '../scripts/local-environment.mjs';

for (const fixture of [
  { id: 'pjsk-cn-event-1001321', background: 'bg_mv_01band_20_ep7' },
  { id: 'pjsk-cn-event-1001397', background: 'bg_link2_leoneed_ed5' },
])
  test(`native video background plays continuously: ${fixture.background}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180000);
    const episode: Episode = JSON.parse(
      readFileSync(resolve('src/generated', fixture.id + '.json'), 'utf8'),
    );
    const program: Program = JSON.parse(
      readFileSync(
        resolve(
          pjskLibraryRoot,
          '.' + (episode.renderer!.payload as { url: string }).url,
        ),
        'utf8',
      ),
    );
    const asset = program.media.videoBackgrounds?.[fixture.background];
    expect(asset).toBeDefined();
    expect(asset!.loop).toBe(true);
    expect(asset!.muted).toBe(true);
    const indexes = program.steps
      .map((step, i) =>
        step.kind === 'text' && step.after.background === fixture.background
          ? i
          : -1,
      )
      .filter((i) => i >= 0);
    const transitionIndex = program.steps.findIndex((step) =>
      step.commands.some(
        (command) => command.state.background === fixture.background,
      ),
    );
    expect(transitionIndex).toBeGreaterThanOrEqual(0);
    const transient = indexes.length === 0;
    const index = transient
      ? transitionIndex - 1
      : indexes[Math.floor(indexes.length / 2)];
    const data = emptyData();
    Object.assign(data.preferences, {
      textSpeed: 0,
      voiceVolume: 0,
      musicVolume: 0,
      soundVolume: 0,
      reducedMotion: false,
    });
    await page.addInitScript(
      (d) => localStorage.setItem('onlystory.v1', JSON.stringify(d)),
      data,
    );
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      `/read/pjsk/${fixture.id}?line=${encodeURIComponent(program.steps[index].id)}`,
    );
    const layers = page.getByTestId('pjsk-layers');
    const ready = async (i: number) => {
      await expect
        .poll(
          () => layers.evaluate((el) => (el as any).playbackDiagnostics?.index),
          { timeout: 120000 },
        )
        .toBe(i);
      await expect(page.getByTestId('scene-stage')).toHaveAttribute(
        'aria-busy',
        'false',
      );
      await expect(page.getByRole('alert')).toHaveCount(0);
    };
    await ready(index);
    if (transient) {
      await page
        .getByRole('button', { name: 'Next passage', exact: true })
        .click();
      await expect
        .poll(
          () =>
            layers.evaluate(
              (el) => (el as any).playbackDiagnostics.videoBackground?.name,
            ),
          { timeout: 15000 },
        )
        .toBe(fixture.background);
    }
    const inspect = () =>
      layers.evaluate((el, name) => {
        let fiber = (el as any)[
          Object.keys(el).find((key) => key.startsWith('__reactFiber'))!
        ];
        let player: any;
        while (fiber && !player) {
          let hook = fiber.memoizedState;
          while (hook) {
            if (hook.memoizedState?.videoBackgrounds instanceof Map) {
              player = hook.memoizedState;
              break;
            }
            hook = hook.next;
          }
          fiber = fiber.return;
        }
        if (!player) throw new Error('Native player unavailable');
        const video = player.videoBackgrounds.get(name);
        const texture = player.textures.get(name);
        const scope = window as any;
        scope.originalBackgroundVideo ??= video;
        scope.originalBackgroundVideoSrc ??= video.src;
        return {
          sameElement: scope.originalBackgroundVideo === video,
          currentTime: video.currentTime,
          duration: video.duration,
          paused: video.paused,
          loop: video.loop,
          muted: video.muted,
          width: video.videoWidth,
          height: video.videoHeight,
          readyState: video.readyState,
          originalVideoResource: texture.baseTexture.resource.source === video,
          dirtyId: texture.baseTexture.dirtyId,
          textureValid: texture.baseTexture.valid,
        };
      }, fixture.background);
    await expect
      .poll(async () => (await inspect()).currentTime)
      .toBeGreaterThan(0.15);
    const before = await inspect();
    expect(before.width).toBeGreaterThan(0);
    expect(before.height).toBeGreaterThan(0);
    expect(before.readyState).toBeGreaterThanOrEqual(2);
    expect(before.originalVideoResource).toBe(true);
    expect(before.textureValid).toBe(true);
    const firstPixels = await page.locator('canvas').screenshot();
    await page.waitForTimeout(350);
    const moving = await inspect();
    expect(moving.dirtyId).toBeGreaterThan(before.dirtyId);
    const nextPixels = await page.locator('canvas').screenshot();
    expect(firstPixels.equals(nextPixels)).toBe(false);
    let videoRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === asset!.url) videoRequests++;
    });
    const states: Record<string, unknown> = { before, moving };
    if (transient) {
      // This clip exists only between two native commands, not at a passage
      // boundary. Natural continuation must play it; seeking skips its prelude.
      await ready(transitionIndex);
      const finished = await inspect();
      expect(finished.paused).toBe(true);
      expect(finished.sameElement).toBe(true);
      await page
        .getByRole('slider', { name: 'Story position', exact: true })
        .fill(String(index));
      await ready(index);
      await page
        .getByRole('slider', { name: 'Story position', exact: true })
        .fill(String(transitionIndex));
      await ready(transitionIndex);
      const skipped = await inspect();
      expect(skipped.paused).toBe(true);
      expect(skipped.currentTime).toBe(finished.currentTime);
      Object.assign(states, { finished, skipped });
    } else {
      const preFast = await inspect();
      await page
        .getByRole('button', { name: 'Fast-forward', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Stop fast-forward', exact: true })
        .click();
      const postFast = await inspect();
      expect(postFast.sameElement).toBe(true);
      expect(
        (postFast.currentTime - preFast.currentTime + postFast.duration) %
          postFast.duration,
      ).toBeLessThan(1.5);
      const outside = program.steps.findIndex(
        (step) =>
          step.after.background !== fixture.background && step.kind === 'text',
      );
      expect(outside).toBeGreaterThanOrEqual(0);
      await page
        .getByRole('slider', { name: 'Story position', exact: true })
        .fill(String(outside));
      await ready(outside);
      expect((await inspect()).paused).toBe(true);
      const paused = await inspect();
      await page
        .getByRole('slider', { name: 'Story position', exact: true })
        .fill(String(index));
      await ready(index);
      const resumed = await inspect();
      expect(resumed.sameElement).toBe(true);
      expect(resumed.paused).toBe(false);
      expect(
        (resumed.currentTime - paused.currentTime + resumed.duration) %
          resumed.duration,
      ).toBeLessThan(1.5);
      Object.assign(states, { preFast, postFast, paused, resumed });
    }
    expect(videoRequests).toBe(0);
    expect(errors).toEqual([]);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page
      .getByRole('link', { name: 'Back to stories', exact: true })
      .click();
    await expect(page.getByTestId('scene-stage')).toHaveCount(0);
    const disposed = await page.evaluate(async () => {
      const scope = window as any;
      let revoked = false;
      try {
        await fetch(scope.originalBackgroundVideoSrc);
      } catch {
        revoked = true;
      }
      return {
        paused: scope.originalBackgroundVideo.paused,
        source: scope.originalBackgroundVideo.getAttribute('src'),
        revoked,
      };
    });
    expect(disposed).toEqual({ paused: true, source: null, revoked: true });
    await testInfo.attach('original-video-background.json', {
      body: JSON.stringify(
        { fixture, transient, states, videoRequests, disposed },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  });
