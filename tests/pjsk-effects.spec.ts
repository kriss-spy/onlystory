import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pjskLibraryRoot } from '../scripts/local-environment.mjs';
import { emptyData, type Episode } from '../src/model';
import type { Program, Step } from '../src/playback/pjsk/types';

const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8'));
const effectTypes = (step: Step) =>
  step.commands
    .flatMap((command) => command.effects ?? [])
    .map((effect) => effect.EffectType);
const cases = [
  {
    name: 'native window shake stop',
    id: 'pjsk-cn-event-1000468',
    effects: [26],
  },
  {
    name: 'memory tint enters and clears',
    id: 'pjsk-cn-event-1000432',
    effects: [27, 28],
    memory: true,
    transient: true,
  },
  {
    name: 'all four horizontal wipe commands',
    id: 'pjsk-cn-event-1000520',
    effects: [29, 30, 31, 32],
  },
  {
    name: 'monitor character shader',
    id: 'pjsk-cn-event-1000519',
    effects: [22],
    monitor: true,
  },
  {
    name: 'adaptive BGM retains original full score',
    id: 'pjsk-cn-event-1001095',
    effects: [],
    adaptive: true,
  },
  {
    name: 'original snow sprites',
    id: 'pjsk-cn-event-1000064',
    effects: [15],
    overlay: 'snow',
  },
  {
    name: 'original sakura sprites',
    id: 'pjsk-cn-event-1000144',
    effects: [15],
    overlay: 'sakura',
    transient: true,
  },
  {
    name: 'original rain sprites',
    id: 'pjsk-cn-event-1000177',
    effects: [15],
    overlay: 'rain_01',
  },
  {
    name: 'original still particles',
    id: 'pjsk-cn-event-1000482',
    effects: [15],
    overlay: 'kirakira_01_still_an',
  },
  {
    name: 'generic still atlas stays small and animates',
    id: 'pjsk-cn-event-1000588',
    effects: [15],
    overlay: 'still_haruka_01',
  },
];

for (const fixture of cases)
  test(`archive effects: ${fixture.name}`, async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const episode = read<Episode>(
      resolve('src/generated', fixture.id + '.json'),
    );
    const program = read<Program>(
      resolve(
        pjskLibraryRoot,
        '.' + (episode.renderer!.payload as { url: string }).url,
      ),
    );
    const indexes = fixture.transient
      ? [
          program.steps.findIndex((step) =>
            step.commands.some((command) =>
              command.effects?.some((effect) =>
                fixture.memory
                  ? effect.EffectType === 27
                  : effect.EffectType === 15 &&
                    effect.StringVal === fixture.overlay,
              ),
            ),
          ),
        ]
      : fixture.adaptive
        ? [program.steps.findIndex((step) => step.after.bgmControl?.mode === 5)]
        : fixture.overlay
          ? [
              program.steps.findIndex(
                (step) =>
                  step.after.scenarioEffects.includes(fixture.overlay!) &&
                  step.after.curtain.alpha === 0,
              ),
            ]
          : fixture.monitor
            ? [
                program.steps.findIndex(
                  (step) =>
                    Object.entries(step.after.characterShaders).some(
                      ([id, shader]) =>
                        shader === 'monitor' &&
                        step.after.characters[id]?.visible,
                    ) && step.after.curtain.alpha === 0,
                ),
              ]
            : fixture.effects.map((type) =>
                program.steps.findIndex((step) =>
                  effectTypes(step).includes(type),
                ),
              );
    expect(
      indexes.every((index) => index >= 0),
      'Real episode must contain every selected native feature',
    ).toBe(true);
    const data = emptyData();
    Object.assign(data.preferences, {
      textSpeed: 0,
      voiceVolume: 0,
      musicVolume: 0,
      soundVolume: 0,
      reducedMotion: false,
    });
    await page.addInitScript(
      (value) => localStorage.setItem('onlystory.v1', JSON.stringify(value)),
      data,
    );
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const initial = fixture.transient ? indexes[0] - 1 : indexes[0];
    await page.goto(
      `/read/pjsk/${episode.id}?line=${encodeURIComponent(program.steps[initial].id)}`,
    );
    const layers = page.getByTestId('pjsk-layers');
    if (fixture.transient) {
      await expect
        .poll(
          () => layers.evaluate((el) => (el as any).playbackDiagnostics?.index),
          { timeout: 120000 },
        )
        .toBe(initial);
      await expect(page.getByTestId('scene-stage')).toHaveAttribute(
        'aria-busy',
        'false',
      );
      await page
        .getByRole('button', { name: 'Next passage', exact: true })
        .click();
      await expect
        .poll(
          () =>
            layers.evaluate((el, fixture) => {
              const state = (el as any).playbackDiagnostics.state;
              return fixture.memory
                ? state?.memory
                : state?.scenarioEffects.includes(fixture.overlay) &&
                    state.curtain.alpha === 0;
            }, fixture),
          { timeout: 15000 },
        )
        .toBe(true);
    }
    const results = [];
    for (const index of [...new Set(indexes)]) {
      if (index !== initial && !fixture.transient)
        await page
          .getByRole('slider', { name: 'Story position', exact: true })
          .fill(String(index));
      let expected = program.steps[index].after;
      if (fixture.transient) {
        expected = await layers.evaluate(
          (el) => (el as any).playbackDiagnostics.state,
        );
        expect(
          program.steps[index].commands.some(
            (command) =>
              JSON.stringify(command.state) === JSON.stringify(expected),
          ),
        ).toBe(true);
      } else {
        await expect
          .poll(
            () =>
              layers.evaluate((el) => (el as any).playbackDiagnostics?.index),
            { timeout: 120000 },
          )
          .toBe(index);
        await expect(page.getByTestId('scene-stage')).toHaveAttribute(
          'aria-busy',
          'false',
        );
        expect(
          await layers.evaluate((el) => (el as any).playbackDiagnostics.state),
        ).toEqual(expected);
      }
      const render = await layers.evaluate((el) => {
        let fiber = (el as any)[
          Object.keys(el).find((key) => key.startsWith('__reactFiber'))!
        ];
        let player: any;
        while (fiber && !player) {
          let hook = fiber.memoizedState;
          while (hook) {
            if (hook.memoizedState?.models instanceof Map) {
              player = hook.memoizedState;
              break;
            }
            hook = hook.next;
          }
          fiber = fiber.return;
        }
        if (!player) throw new Error('Native player diagnostics unavailable');
        (el as any).nativeEffectProbe = player;
        return {
          memoryTint:
            player.scene.filters?.includes(player.memoryTint) ?? false,
          monitorModels: [...player.models.values()].filter((view: any) =>
            view.model.filters?.includes(view.monitor),
          ).length,
          sprites: player.particles.children.map((sprite: any) => ({
            name: player.effectSpriteState.get(sprite)?.name,
            x: sprite.x,
            y: sprite.y,
            width: sprite.width,
            height: sprite.height,
            valid: !!sprite.texture?.baseTexture?.valid,
          })),
          activeOriginalTextures: [...player.spriteEffects],
          music: player.music?.name ?? null,
          musicVolume: player.music?.gain.gain.value ?? null,
          musicDuration: player.music?.source.buffer.duration ?? 0,
          windowAnimations: player.animations.size,
        };
      });
      if (fixture.memory) expect(render.memoryTint).toBe(!!expected.memory);
      if (fixture.monitor) expect(render.monitorModels).toBeGreaterThan(0);
      if (fixture.overlay) {
        expect(
          program.media.effectAssets?.[fixture.overlay]?.textures.length,
        ).toBeGreaterThan(0);
        expect(render.activeOriginalTextures).toContain(fixture.overlay);
        const particles = render.sprites.filter(
          (sprite: any) => sprite.name === fixture.overlay,
        );
        expect(particles.length).toBeGreaterThan(0);
        expect(
          particles.every(
            (sprite: any) =>
              sprite.valid && sprite.width < 1280 && sprite.height < 720,
          ),
        ).toBe(true);
        const beforePixels = await page.locator('canvas').screenshot();
        await page.waitForTimeout(350);
        const positions = await layers.evaluate((el, name) => {
          const player = (el as any).nativeEffectProbe;
          return player.particles.children
            .filter(
              (sprite: any) =>
                player.effectSpriteState.get(sprite)?.name === name,
            )
            .map((sprite: any) => ({ x: sprite.x, y: sprite.y }));
        }, fixture.overlay);
        expect(positions).not.toEqual(
          particles.map((sprite: any) => ({ x: sprite.x, y: sprite.y })),
        );
        const afterPixels = await page.locator('canvas').screenshot();
        expect(beforePixels.equals(afterPixels)).toBe(false);
        await testInfo.attach('original-particles.png', {
          body: afterPixels,
          contentType: 'image/png',
        });
        expect(render.sprites.length).toBeGreaterThan(0);
        expect(
          render.sprites.every(
            (sprite: any) =>
              sprite.valid && sprite.width > 0 && sprite.height > 0,
          ),
        ).toBe(true);
        expect(
          render.sprites.some(
            (sprite: any) => sprite.width < 1280 && sprite.height < 720,
          ),
          'Particle atlases must not be stretched as full-screen stills',
        ).toBe(true);
      }
      if (fixture.adaptive) {
        expect(expected.bgmControl?.volume).toBe(0);
        expect(render.music).toBe(expected.music);
        expect(render.musicVolume).toBe(1);
        expect(render.musicDuration).toBeGreaterThan(0);
      }
      if (fixture.effects.includes(26)) expect(render.windowAnimations).toBe(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
      if (fixture.transient) {
        await expect
          .poll(
            () =>
              layers.evaluate((el) => (el as any).playbackDiagnostics.index),
            { timeout: 30000 },
          )
          .toBe(index);
        expect(
          await layers.evaluate((el) => (el as any).playbackDiagnostics.state),
        ).toEqual(program.steps[index].after);
        if (fixture.memory)
          expect(
            await layers.evaluate(
              (el) =>
                (el as any).nativeEffectProbe.scene.filters?.includes(
                  (el as any).nativeEffectProbe.memoryTint,
                ) ?? false,
            ),
          ).toBe(false);
        if (fixture.overlay)
          expect(
            await layers.evaluate(
              (el, name) =>
                (el as any).nativeEffectProbe.spriteEffects.has(name),
              fixture.overlay,
            ),
          ).toBe(false);
      }
      results.push({
        index,
        sourceCommands: program.steps[index].commands.map(
          (command) => command.index,
        ),
        state: expected,
        render,
      });
    }
    expect(errors).toEqual([]);
    await testInfo.attach('native-effect-verification.json', {
      body: JSON.stringify({ episodeId: episode.id, results }, null, 2),
      contentType: 'application/json',
    });
  });
