import { test, expect, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import corpus from '../docs/pjsk-all-events.json' with { type: 'json' };
import { pjskLibraryRoot } from '../scripts/local-environment.mjs';
import { parseVoiceListing } from '../scripts/pjsk-voice-listing.mjs';
import { collectPjskCostumes } from '../scripts/pjsk-program.mjs';
import { decodePjskText } from '../src/playback/pjsk/text';
import {
  emptyData,
  passageText,
  readingPath,
  type Episode,
} from '../src/model';
import type { Program, SceneState } from '../src/playback/pjsk/types';

const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8'));
const digest = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');
const filePath = (url: string) => resolve(pjskLibraryRoot, '.' + url);
const saveEvidence = (name: string, value: unknown) => {
  const body = JSON.stringify(value, null, 2);
  writeFileSync(
    resolve('.cache/pjsk/all-events-validation', name),
    body + '\n',
  );
  return body;
};
const availability = read<{
  availableEpisodes: number;
  unavailableEpisodes: number;
  events: { eventId: string }[];
}>(resolve('.cache/pjsk/all-events-validation/availability.json'));
const unavailable = new Set(availability.events.map((event) => event.eventId));
const availableEvents = corpus.events.filter(
  (event) => !unavailable.has(event.eventId),
);
type Entry = (typeof corpus.events)[number]['episodes'][number];
type ArchiveFile = {
  url: string;
  sha256: string | null;
  bytes: number;
  sourceUrl?: string;
  md5?: string;
  deferred?: boolean;
  listing?: { url: string; sha256: string };
};
type Deferred = {
  url: string;
  sourceUrl: string;
  bytes: number;
  md5: string;
  cacheSource?: string;
};
function installed(id: string): Episode {
  const path = resolve('src/generated', `${id}.json`);
  assert.ok(
    existsSync(path),
    `Required available episode is not installed: ${id}`,
  );
  const episode = read<Episode>(path);
  return episode.content?.format === 'pjsk-text-v1'
    ? decodePjskText(read(filePath(episode.content.url)), episode)
    : episode;
}
const programFor = (episode: Episode) =>
  read<Program>(filePath((episode.renderer!.payload as { url: string }).url));

test('full CN archive: all available episodes preserve source commands, text, graphs and verified media', async ({}, testInfo) => {
  test.setTimeout(1800000);
  const publication = read<{
    finishedAt?: string;
    implementationHash: string;
    installed: number;
    failed: number;
    unavailable: number;
    episodes: Record<string, { status: string; implementationHash?: string }>;
  }>('.cache/pjsk/all-events-validation/installation.json');
  assert.ok(
    publication.finishedAt,
    'Full archive publication must finish before verification',
  );
  assert.equal(publication.installed, availability.availableEpisodes);
  assert.equal(publication.failed, 0);
  assert.equal(publication.unavailable, availability.unavailableEpisodes);
  const implementationHash = digest(
    Buffer.concat([
      ...[
        'pjsk-media.mjs',
        'pjsk-program.mjs',
        'pjsk-scenario.mjs',
        'pjsk-import.mjs',
        'pjsk-voice-listing.mjs',
        'pjsk-voice-bindings.mjs',
        'pjsk-model-overrides.mjs',
      ].map((name) => readFileSync(resolve('scripts', name))),
      ...[
        'pjsk-model-overrides.json',
        'pjsk-video-backgrounds.json',
        'pjsk-voice-bindings.json',
      ].map((name) => readFileSync(resolve('docs', name))),
    ]),
  );
  assert.equal(
    publication.implementationHash,
    implementationHash,
    'Archive must be published with the current compiler and reviewed source resolutions',
  );
  for (const event of availableEvents)
    for (const entry of event.episodes) {
      assert.equal(
        publication.episodes[entry.id]?.status,
        'installed',
        entry.id,
      );
      assert.equal(
        publication.episodes[entry.id].implementationHash,
        implementationHash,
        entry.id,
      );
    }
  assert.equal(
    availableEvents.length,
    182,
    'Availability evidence must cover the complete source snapshot',
  );
  assert.equal(
    availableEvents.flatMap((event) => event.episodes).length,
    availability.availableEpisodes,
  );
  assert.equal(
    availability.availableEpisodes + availability.unavailableEpisodes,
    corpus.expectedEpisodeCount,
  );
  const checked = new Set<string>();
  const deferred = read<Record<string, Deferred>>(
    filePath('/private/pjsk/deferred.json'),
  );
  const checkedDeferred = new Set<string>();
  type ModelSettings = {
    FileReferences: {
      Moc: string;
      Physics?: string;
      Pose?: string;
      DisplayInfo?: string;
      UserData?: string;
      Textures: string[];
      Motions: Record<string, { Name: string; File: string }[]>;
    };
  };
  const modelSettings = new Map<string, ModelSettings>();
  const listings = new Map<
    string,
    Map<string, { bytes: number; md5: string }>
  >();
  let commands = 0,
    passages = 0,
    aliases = 0,
    bytesChecked = 0;
  const hashAsset = (url: string, size?: number, expectedHash?: string) => {
    if (checked.has(url)) return;
    assert.match(
      url,
      /^\/private\/pjsk\/assets\/[a-f0-9]{64}(?:\.[A-Za-z0-9.]+)?$/,
      `Unexpected asset URL: ${url}`,
    );
    const bytes = readFileSync(filePath(url));
    const hash = digest(bytes);
    assert.ok(url.includes(hash), `Asset filename/hash mismatch: ${url}`);
    if (size !== undefined)
      assert.equal(bytes.length, size, `Asset size mismatch: ${url}`);
    if (expectedHash !== undefined)
      assert.equal(hash, expectedHash, `Asset checksum mismatch: ${url}`);
    checked.add(url);
    bytesChecked += bytes.length;
  };
  const verifyDeferred = (file: ArchiveFile) => {
    if (checkedDeferred.has(file.url)) return;
    assert.equal(
      file.sha256,
      null,
      'Deferred data must not claim a downloaded SHA256',
    );
    assert.ok(file.sourceUrl && file.listing && file.md5);
    const hash = digest(file.sourceUrl);
    assert.equal(file.url, `/private/pjsk/remote/${hash}.mp3`);
    assert.match(file.md5, /^[a-f0-9]{32}$/);
    assert.ok(file.bytes > 0);
    const descriptor = deferred[hash];
    assert.ok(descriptor, `Deferred route not published: ${file.url}`);
    assert.equal(descriptor.url, file.url);
    assert.equal(descriptor.sourceUrl, file.sourceUrl);
    assert.equal(descriptor.bytes, file.bytes);
    assert.equal(descriptor.md5, file.md5);
    hashAsset(file.listing.url, undefined, file.listing.sha256);
    let entries = listings.get(file.listing.url);
    if (!entries) {
      entries = new Map(
        parseVoiceListing(
          readFileSync(filePath(file.listing.url), 'utf8'),
        ).entries.map((entry) => [entry.key, entry]),
      );
      listings.set(file.listing.url, entries);
    }
    const source = new URL(file.sourceUrl);
    assert.equal(source.origin, 'https://storage.sekai.best');
    assert.ok(source.pathname.startsWith('/sekai-jp-assets/sound/'));
    const key = decodeURIComponent(
      source.pathname.slice('/sekai-jp-assets/'.length),
    );
    const original = entries.get(key);
    assert.ok(
      original,
      `Voice absent from checksum-pinned original listing: ${file.sourceUrl}`,
    );
    assert.equal(original.bytes, file.bytes);
    assert.equal(original.md5, file.md5);
    for (const cachedUrl of [
      file.url,
      ...(descriptor.cacheSource ? [descriptor.cacheSource] : []),
    ]) {
      const path = filePath(cachedUrl);
      if (!existsSync(path)) continue;
      const bytes = readFileSync(path);
      assert.equal(bytes.length, file.bytes);
      assert.equal(
        createHash('md5').update(bytes).digest('hex'),
        file.md5,
        `Cached original audio MD5 differs: ${cachedUrl}`,
      );
      if (cachedUrl === file.url && existsSync(path + '.json'))
        assert.equal(
          read<{ sha256: string }>(path + '.json').sha256,
          digest(bytes),
        );
      if (cachedUrl !== file.url) hashAsset(cachedUrl);
    }
    checkedDeferred.add(file.url);
  };
  for (const event of availableEvents) {
    assert.equal(event.episodes.length, event.expectedEpisodeCount);
    for (const entry of event.episodes) {
      const episode = installed(entry.id),
        program = programFor(episode);
      const source = read<{
        rawScenario: string;
        scenario: {
          source: {
            ScenarioId: string;
            Snippets: unknown[];
            AppearCharacters: { CostumeType: string }[];
          };
          timeline: {
            snippet: {
              Action: number;
              Delay: number;
              ProgressBehavior: number;
            };
            record: unknown;
          }[];
        };
        report: {
          sourceIdentity?: {
            scenarioId: string;
            sourceScenarioId: string;
            sourceSha256: string;
          };
          sources: { sha256: string }[];
        };
      }>(
        resolve('.cache/pjsk/packages', `${entry.id}-${entry.scenarioId}.json`),
      );
      assert.equal(episode.collectionId, `pjsk-cn-event-${event.eventId}`);
      assert.equal(episode.story, event.name);
      assert.equal(episode.category, 'Event');
      assert.equal(episode.order, entry.episodeNo);
      assert.equal(program.id, entry.id);
      assert.equal(program.scenarioId, entry.scenarioId);
      assert.equal(
        program.sourceCommands,
        source.scenario.source.Snippets.length,
      );
      assert.equal(program.sourceHash, digest(source.rawScenario));
      if (source.scenario.source.ScenarioId !== entry.scenarioId) {
        aliases++;
        assert.equal(
          source.report.sourceIdentity?.scenarioId,
          entry.scenarioId,
        );
        assert.equal(
          source.report.sourceIdentity?.sourceScenarioId,
          source.scenario.source.ScenarioId,
        );
        assert.equal(
          source.report.sourceIdentity?.sourceSha256,
          digest(source.rawScenario),
        );
      }
      const native = program.steps.flatMap((step) => step.commands);
      assert.equal(native.length, program.sourceCommands);
      for (const [index, command] of native.entries()) {
        const original = source.scenario.timeline[index];
        assert.equal(
          command.index,
          index,
          `${entry.id}: missing/reordered command`,
        );
        assert.equal(command.action, original.snippet.Action);
        assert.equal(command.delay, original.snippet.Delay);
        assert.equal(command.wait, original.snippet.ProgressBehavior === 1);
        assert.deepEqual(
          command.record,
          original.record,
          `${entry.id}: native command changed`,
        );
      }
      assert.equal(episode.nodes.length, program.steps.length);
      assert.equal(episode.nodes.at(-1)?.kind, 'end');
      const nodes = new Map(episode.nodes.map((node) => [node.id, node]));
      assert.equal(nodes.size, episode.nodes.length);
      assert.equal(episode.entryNodeId, episode.nodes[0].id);
      for (const [index, node] of episode.nodes.entries()) {
        const step = program.steps[index];
        assert.equal(node.id, step.id);
        assert.equal(node.text['zh-CN'], step.text);
        assert.equal(node.speaker, step.speaker);
        assert.equal(node.source?.row, step.index);
        assert.equal(node.source?.index, index);
        if (node.next)
          assert.ok(nodes.has(node.next), `${entry.id}: dangling next node`);
        for (const choice of node.choices ?? [])
          assert.ok(nodes.has(choice.next), `${entry.id}: dangling choice`);
        if (node.voice)
          assert.ok(Object.values(program.media.voices).includes(node.voice));
        if (node.video && !node.performance)
          assert.ok(
            Object.values(program.media.movies ?? {}).includes(node.video),
          );
      }
      const reachable = new Set<string>();
      const pending = [episode.entryNodeId!];
      while (pending.length) {
        const id = pending.pop()!;
        if (reachable.has(id)) continue;
        reachable.add(id);
        const node = nodes.get(id)!;
        if (node.next) pending.push(node.next);
        pending.push(...(node.choices ?? []).map((choice) => choice.next));
        if (node.kind !== 'end')
          assert.ok(
            node.next || node.choices?.length,
            `${entry.id}: passage cannot continue to its ending`,
          );
      }
      assert.equal(
        reachable.size,
        nodes.size,
        `${entry.id}: unreachable imported passages`,
      );
      for (const [costume, required] of collectPjskCostumes(
        source.scenario.source,
      )) {
        assert.ok(
          program.media.models[costume],
          `${entry.id}: missing native costume ${costume}`,
        );
        const model = program.media.models[costume];
        let settings = modelSettings.get(model.url);
        if (!settings) {
          hashAsset(model.url);
          settings = read<ModelSettings>(filePath(model.url));
          modelSettings.set(model.url, settings);
          const refs = settings.FileReferences;
          for (const url of [
            refs.Moc,
            refs.Physics,
            refs.Pose,
            refs.DisplayInfo,
            refs.UserData,
            ...refs.Textures,
            ...Object.values(refs.Motions)
              .flat()
              .map((track) => track.File),
          ])
            if (url) hashAsset(url);
        }
        for (const [group, names, declared] of [
          ['Motion', required.motions, model.motions],
          ['Facial', required.expressions, model.expressions],
        ] as const)
          for (const name of names) {
            assert.ok(
              declared.includes(name),
              `${entry.id}: missing ${costume} ${group} ${name}`,
            );
            assert.ok(
              settings.FileReferences.Motions[group]?.some(
                (track) => track.Name === name,
              ),
              `${entry.id}: model settings omit exact native ${costume} ${group} ${name}`,
            );
          }
      }
      for (const file of program.media.files as ArchiveFile[])
        if (file.deferred) verifyDeferred(file);
        else hashAsset(file.url, file.bytes, file.sha256 ?? undefined);
      for (const url of episode.assets)
        if (url.startsWith('/private/pjsk/assets/')) hashAsset(url);
      hashAsset((episode.renderer!.payload as { url: string }).url);
      if (episode.content) hashAsset(episode.content.url);
      commands += native.length;
      passages += episode.nodes.length;
    }
  }
  assert.equal(
    aliases,
    40,
    'All verified source ID aliases must remain represented',
  );
  const summary = {
    events: availableEvents.length,
    episodes: availability.availableEpisodes,
    commands,
    passages,
    aliases,
    uniqueAssets: checked.size,
    verifiedDeferredVoices: checkedDeferred.size,
    originalVoiceListings: listings.size,
    implementationHash,
    publicationFinishedAt: publication.finishedAt,
    bytesChecked,
    unavailableEvents: availability.events.map((event) => event.eventId),
  };
  const summaryJson = JSON.stringify(summary, null, 2);
  writeFileSync(
    '.cache/pjsk/all-events-validation/archive-verification.json',
    summaryJson + '\n',
  );
  await testInfo.attach('archive-verification.json', {
    body: summaryJson,
    contentType: 'application/json',
  });
});

type Diagnostics = {
  index: number;
  state: SceneState;
  models: { visible: boolean; width: number; height: number }[];
};
async function verifyEpisode(page: Page, entry: Entry, everyPassage = false) {
  const episode = installed(entry.id),
    program = programFor(episode);
  const answers = Object.fromEntries(
    episode.nodes
      .filter((node) => node.kind === 'choice')
      .map((node) => [node.id, node.choices![0].id]),
  );
  const link = (index: number) =>
    `/read/pjsk/${entry.id}?${new URLSearchParams({ line: program.steps[index].id, ...(Object.keys(answers).length ? { choices: JSON.stringify(answers) } : {}) })}`;
  const middle = Math.floor(program.steps.length / 2);
  await page.goto(link(middle));
  const layers = page.getByTestId('pjsk-layers');
  const current = () =>
    layers.evaluate(
      (el) =>
        (el as HTMLElement & { playbackDiagnostics: Diagnostics })
          .playbackDiagnostics,
    );
  const ready = async (index: number) => {
    await expect
      .poll(async () => (await current())?.index, { timeout: 120000 })
      .toBe(index);
    expect((await current()).state).toEqual(program.steps[index].after);
    await expect(page.getByTestId('scene-stage')).toHaveAttribute(
      'aria-busy',
      'false',
    );
    await expect(page.getByRole('alert')).toHaveCount(0);
    for (const model of (await current()).models.filter(
      (model) => model.visible,
    )) {
      expect(model.width).toBeGreaterThan(0);
      expect(model.height).toBeGreaterThan(0);
    }
  };
  await ready(middle);
  await expect(page.locator('canvas')).toBeVisible();
  const indexes = everyPassage
    ? program.steps.map((_, i) => i)
    : [0, program.steps.length - 1];
  for (const index of indexes) {
    if (Object.keys(answers).length) await page.goto(link(index));
    else
      await page
        .getByRole('slider', { name: 'Story position', exact: true })
        .fill(String(index));
    await ready(index);
  }
  await expect(page.locator('.episode-end')).toContainText('本话结束');
  return {
    id: entry.id,
    scenarioId: entry.scenarioId,
    passages: program.steps.length,
    models: Object.keys(program.media.models).length,
    verifiedSnapshots: indexes.length + 1,
  };
}

test.describe('archive browser', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.addInitScript(
      (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
      {
        ...emptyData(),
        preferences: {
          ...emptyData().preferences,
          textSpeed: 0,
          layout: testInfo.titlePath.includes(
            'complete archive text checkpoints',
          )
            ? 'text'
            : 'scene',
          textLocale: 'zh-CN',
          voice: 'ja',
          voiceVolume: 0,
          musicVolume: 0,
          soundVolume: 0,
        },
      },
    );
  });

  async function verifyTextEpisode(page: Page, entry: Entry) {
    const episode = installed(entry.id);
    const answers = Object.fromEntries(
      episode.nodes
        .filter((node) => node.kind === 'choice')
        .map((node) => [node.id, node.choices![0].id]),
    );
    const path = readingPath(episode, answers);
    const nodes = new Map(episode.nodes.map((node) => [node.id, node]));
    const readable = path
      .map((frame, index) => ({ node: nodes.get(frame.node)!, index }))
      .filter(({ node }) => node.kind === 'text');
    assert.ok(readable.length, `Original dialogue missing: ${entry.id}`);
    const checkpoints = [
      readable[Math.floor(readable.length / 2)],
      readable[0],
      { node: nodes.get(path.at(-1)!.node)!, index: path.length - 1 },
    ];
    assert.equal(checkpoints.at(-1)!.node.kind, 'end');
    const link = (node: string) =>
      `/read/pjsk/${entry.id}?${new URLSearchParams({ line: node, ...(Object.keys(answers).length ? { choices: JSON.stringify(answers) } : {}) })}`;
    await page.goto(link(checkpoints[0].node.id));
    const progress = page.getByRole('slider', {
      name: 'Story position',
      exact: true,
    });
    await expect(page.locator('.reader-page.layout-text')).toBeVisible();
    for (const point of checkpoints) {
      if (Object.keys(answers).length) await page.goto(link(point.node.id));
      else await progress.fill(String(point.index));
      await expect(progress).toHaveValue(String(point.index));
      const rendered = passageText(point.node, {
        ...emptyData().preferences,
        textLocale: 'zh-CN',
      });
      await expect(page.locator('.dialogue-window > p')).toHaveText(
        rendered.text,
      );
      await expect(page.locator('.speaker-row > span').first()).toHaveText(
        rendered.speaker,
      );
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.locator('canvas')).toHaveCount(0);
    }
    await expect(page.locator('.episode-end')).toContainText(
      episode.completionLabel!,
    );
    return {
      id: entry.id,
      scenarioId: entry.scenarioId,
      checkpoints: 3,
      passages: path.length,
    };
  }

  // Text checkpoints cover every available episode without repeatedly loading models.
  test.describe('complete archive text checkpoints', () => {
    for (const event of availableEvents) {
      test(`CN event ${event.eventId}: every episode opens, seeks and finishes`, async ({
        page,
      }, testInfo) => {
        test.setTimeout(600000);
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`/games/pjsk/events/pjsk-cn-event-${event.eventId}`);
        for (const entry of event.episodes)
          await expect(
            page.locator(`a[href^="/read/pjsk/${entry.id}?"]`).first(),
          ).toBeVisible();
        const snapshots = [];
        for (const entry of event.episodes)
          snapshots.push(await verifyTextEpisode(page, entry));
        expect(errors).toEqual([]);
        await testInfo.attach('event-verification.json', {
          body: saveEvidence(`browser-event-${event.eventId}.json`, {
            eventId: event.eventId,
            episodes: snapshots,
          }),
          contentType: 'application/json',
        });
      });
    }
  });

  // All five units, mixed events, original movies, adaptive BGM, source aliases,
  // and the revised model generation receive full scene checks as well.
  const sceneScenarios = [
    'event_01_01',
    'event_02_08',
    'event_03_08',
    'event_05_08',
    'event_06_08',
    'event_09_07',
    'event_100_08',
    'event_135_07',
    'event_150_08',
    'event_154_08',
    'event_168_08',
    'event_174_08',
    'event_175_05',
  ];
  for (const scenarioId of sceneScenarios) {
    test(`full scene: ${scenarioId} restores start, middle and end`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(600000);
      const entry = availableEvents
        .flatMap((event) => event.episodes)
        .find((entry) => entry.scenarioId === scenarioId);
      assert.ok(entry, `Representative scenario missing: ${scenarioId}`);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const summary = await verifyEpisode(page, entry);
      expect(errors).toEqual([]);
      await testInfo.attach('scene-verification.json', {
        body: saveEvidence(`browser-scene-${scenarioId}.json`, summary),
        contentType: 'application/json',
      });
    });
  }

  test('largest cast: all passages of the 37-costume finale restore correctly', async ({
    page,
  }, testInfo) => {
    test.setTimeout(1800000);
    const entry = availableEvents
      .flatMap((event) => event.episodes)
      .find((entry) => entry.scenarioId === 'event_105_08')!;
    assert.ok(entry, 'Largest native cast episode must be included');
    const summary = await verifyEpisode(page, entry, true);
    expect(summary.models).toBe(37);
    await testInfo.attach('largest-cast-verification.json', {
      body: saveEvidence('largest-cast-verification.json', summary),
      contentType: 'application/json',
    });
  });

  test('all original event movies decode metadata and their first frame', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180000);
    const movies = new Map<string, { scenarioId: string; name: string }[]>();
    for (const event of availableEvents)
      for (const entry of event.episodes) {
        const program = programFor(installed(entry.id));
        // Native 3D song interludes have a separate performances map. Only
        // original extracted video files belong in this browser decode check.
        const videoBackgrounds =
          (
            program.media as Program['media'] & {
              videoBackgrounds?: Record<string, { url: string }>;
            }
          ).videoBackgrounds ?? {};
        const nativeVideos = [
          ...Object.entries(program.media.movies ?? {}),
          ...Object.entries(videoBackgrounds).map(
            ([name, asset]) => [name, asset.url] as const,
          ),
        ];
        for (const [name, url] of nativeVideos) {
          if (!movies.has(url)) movies.set(url, []);
          movies.get(url)!.push({ scenarioId: entry.scenarioId, name });
        }
      }
    expect(movies.size).toBeGreaterThan(0);
    await page.goto('/games/pjsk');
    const results = await page.evaluate(
      async (urls) => {
        const pending = [...urls];
        const results: {
          url: string;
          duration?: number;
          width?: number;
          height?: number;
          firstFramePixel?: number[];
          firstFrameTime?: number;
          error?: string;
        }[] = [];
        await Promise.all(
          Array.from({ length: 2 }, async () => {
            while (pending.length) {
              const url = pending.shift()!;
              const video = document.createElement('video');
              video.preload = 'metadata';
              video.muted = true;
              video.playsInline = true;
              document.body.append(video);
              let firstFramePixel: number[] | undefined;
              try {
                await new Promise<void>((resolve, reject) => {
                  const timer = setTimeout(
                    () =>
                      reject(
                        new Error(
                          `First frame did not decode within 10 seconds (state=${video.readyState}, seeking=${video.seeking}, dimensions=${video.videoWidth}x${video.videoHeight})`,
                        ),
                      ),
                    10000,
                  );
                  const finish = (error?: string) => {
                    clearTimeout(timer);
                    if (error) reject(new Error(error));
                    else resolve();
                  };
                  video.onerror = () =>
                    finish(
                      `Media error ${video.error?.code}: ${video.error?.message ?? 'unknown'}`,
                    );
                  video.onloadedmetadata = () => {
                    if (!Number.isFinite(video.duration) || video.duration <= 0)
                      return finish(`Invalid duration ${video.duration}`);
                    video.preload = 'auto';
                    // Seeking within the opening frame asks the decoder for pixels
                    // even when the browser limits a metadata-only preload.
                    video.currentTime = Math.min(0.001, video.duration / 2);
                  };
                  const decoded = () => {
                    if (
                      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                      video.videoWidth > 0 &&
                      video.videoHeight > 0
                    ) {
                      const canvas = document.createElement('canvas');
                      canvas.width = canvas.height = 1;
                      const context = canvas.getContext('2d');
                      if (!context)
                        return finish('Canvas frame inspection unavailable');
                      try {
                        context.drawImage(video, 0, 0, 1, 1);
                        firstFramePixel = [
                          ...context.getImageData(0, 0, 1, 1).data,
                        ];
                      } catch (error) {
                        return finish(
                          `Decoded frame cannot be read: ${String(error)}`,
                        );
                      }
                      finish();
                    }
                  };
                  // loadeddata may already be queued when the metadata handler
                  // starts a seek. The seek temporarily drops readyState; wait
                  // for its decoded frame rather than rejecting that event.
                  video.onloadeddata = decoded;
                  video.onseeked = decoded;
                  video.oncanplay = decoded;
                  video.src = url;
                  video.load();
                });
                results.push({
                  url,
                  duration: video.duration,
                  width: video.videoWidth,
                  height: video.videoHeight,
                  firstFramePixel,
                  firstFrameTime: video.currentTime,
                });
              } catch (error) {
                results.push({
                  url,
                  error: error instanceof Error ? error.message : String(error),
                });
              } finally {
                video.pause();
                video.removeAttribute('src');
                video.load();
                video.remove();
              }
            }
          }),
        );
        return results;
      },
      [...movies.keys()],
    );
    await testInfo.attach('native-movie-decoding.json', {
      body: saveEvidence('native-movie-decoding.json', {
        uniqueMovies: movies.size,
        results: results.map((row) => ({
          ...row,
          sources: movies.get(row.url),
        })),
      }),
      contentType: 'application/json',
    });
    expect(results).toHaveLength(movies.size);
    expect(results.filter((row) => row.error)).toEqual([]);
  });
});
