import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { libraryRoot } from '../scripts/local-environment.mjs';
import { emptyData, type Episode } from '../src/model';
import type { Gfl1Program } from '../src/playback/gfl1/story';

interface Package extends Gfl1Program {
  complete: boolean;
  audit: { kind: string; row: number; cue?: string }[];
  sourceRows: { id: string; row: number; raw: string }[];
}
const catalogPath = resolve('src/generated/gfl1-catalog.json');
const milestoneCollections = new Set([
  'gfl1-chapter-1-normal',
  'gfl1-operation-cube',
  'gfl1-deep-dive',
  'gfl1-continuum-turbulence',
  'gfl1-dual-randomness',
]);
const catalog: Episode[] = (
  existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, 'utf8')) : []
).filter(
  (episode: Episode) =>
    milestoneCollections.has(episode.collectionId ?? '') &&
    (episode.collectionId !== 'gfl1-chapter-1-normal' ||
      /^gfl1-1-\d+-[12]$/.test(episode.id)),
);
const milestone = catalog.filter((episode) => episode.category === 'Event');
const ready = milestone.length === 223;
const events = [
  ['gfl1-operation-cube', 'Operation Cube', 11],
  ['gfl1-deep-dive', 'Deep Dive', 46],
  ['gfl1-continuum-turbulence', 'Continuum Turbulence', 86],
  ['gfl1-dual-randomness', 'Dual Randomness', 80],
] as const;
function episodeOf(id: string) {
  const episode = catalog.find((entry) => entry.id === id);
  if (!episode) throw new Error(`Missing milestone episode ${id}`);
  return episode;
}
function packageOf(episode: Episode): Package {
  return JSON.parse(
    readFileSync(resolve(libraryRoot, '.' + episode.content!.url), 'utf8'),
  );
}
function passageUrl(episode: Episode, id: string) {
  const program = packageOf(episode);
  const nodes = new Map(program.nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  function find(
    current: string,
    answers: Record<string, string>,
  ): Record<string, string> | undefined {
    if (current === id) return answers;
    if (visited.has(current)) return;
    visited.add(current);
    const node = nodes.get(current)!;
    if (node.choices) {
      for (const choice of node.choices) {
        const result = find(choice.next, { ...answers, [node.id]: choice.id });
        if (result) return result;
      }
    } else if (node.next) return find(node.next, answers);
  }
  const answers = find(episode.entryNodeId!, {});
  if (!answers) throw new Error(`Unreachable source passage ${id}`);
  const params = new URLSearchParams({ line: id });
  if (Object.keys(answers).length)
    params.set('choices', JSON.stringify(answers));
  return `/read/gfl1/${episode.id}?${params}`;
}
async function loadedImages(
  page: Page,
  selector = '[data-testid="gfl1-stage"] img',
) {
  await expect
    .poll(() =>
      page
        .locator(selector)
        .evaluateAll(
          (images) =>
            images.length > 0 &&
            images.every(
              (image) => (image as HTMLImageElement).naturalWidth > 0,
            ),
        ),
    )
    .toBe(true);
}
async function next(page: Page) {
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
}
async function atRow(page: Page, id: string) {
  await expect
    .poll(() => new URL(page.url()).searchParams.get('line'))
    .toBe(id);
}

test.beforeEach(async ({ page }) => {
  test.skip(!ready, 'Import the four-event Steam EN milestone first.');
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    {
      ...emptyData(),
      preferences: {
        ...emptyData().preferences,
        textSpeed: 0,
        soundVolume: 0.25,
      },
    },
  );
});

test('all 235 packages decode in the browser and preserve every source row, branch and local dependency', async ({
  page,
}) => {
  test.setTimeout(90000);
  expect(catalog).toHaveLength(235);
  expect(milestone).toHaveLength(223);
  let rows = 0;
  let choices = 0;
  const missingMusic = new Set<string>();
  let missingMusicRows = 0;
  for (const episode of catalog) {
    const program = packageOf(episode);
    expect(program.complete, episode.id).toBe(true);
    expect(program.nodes.length, episode.id).toBe(episode.content!.count);
    expect(program.nodes.at(-1)!.kind, episode.id).toBe('end');
    expect(
      program.audit.filter((entry) =>
        /unsupported|ambiguous|missing-portrait|missing-background/.test(
          entry.kind,
        ),
      ),
      episode.id,
    ).toEqual([]);
    for (const entry of program.audit.filter((entry) =>
      entry.kind.startsWith('missing-'),
    )) {
      expect(entry.kind, `${episode.id}: unexpected missing media`).toBe(
        'missing-bgm',
      );
      missingMusic.add(entry.cue!);
      missingMusicRows++;
    }
    const raw = readFileSync(
      resolve(libraryRoot, '.' + episode.sourceUrl!),
      'utf8',
    );
    const sourceRows = raw
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((line) => line.trim());
    expect(program.sourceRows.length, episode.id).toBe(sourceRows.length);
    expect(program.nodes.length - 1, episode.id).toBe(sourceRows.length);
    expect(
      program.sourceRows.map((source) => source.raw),
      episode.id,
    ).toEqual(sourceRows);
    for (const asset of episode.assets ?? [])
      expect(
        existsSync(resolve(libraryRoot, '.' + asset)),
        `${episode.id}: ${asset}`,
      ).toBe(true);
    const nodes = new Map(program.nodes.map((node) => [node.id, node]));
    const visited = new Set<string>();
    function visit(id: string) {
      expect(nodes.has(id), `${episode.id}: missing link ${id}`).toBe(true);
      if (visited.has(id)) return;
      visited.add(id);
      const node = nodes.get(id)!;
      expect(node.text.en, id).not.toMatch(/<[^>]*>/);
      for (const target of node.choices?.map((choice) => choice.next) ??
        (node.next ? [node.next] : []))
        visit(target);
    }
    visit(episode.entryNodeId!);
    expect(visited.size, episode.id).toBe(program.nodes.length);
    // Check each source branch block against the actual option graph, including
    // interleaved 1,2,1,2 rows, rather than merely checking that targets exist.
    for (const [index, source] of program.sourceRows.entries()) {
      const node = nodes.get(source.id)!;
      if (node.kind !== 'choice') continue;
      const block: { id: string; branch: string }[] = [];
      let end = index + 1;
      while (end < program.sourceRows.length) {
        const branch =
          program.sourceRows[end].raw.match(/<分支>(\d+)<\/分支>/)?.[1];
        if (!branch) break;
        block.push({ id: program.sourceRows[end].id, branch });
        end++;
      }
      const join = program.sourceRows[end]?.id ?? `${episode.id.slice(5)}:end`;
      for (const choice of node.choices!) {
        const path = block.filter((row) => row.branch === choice.id);
        expect(choice.next, `${source.id} option ${choice.id}`).toBe(
          path[0]?.id ?? join,
        );
        for (const [part, branch] of path.entries())
          expect(nodes.get(branch.id)!.next, branch.id).toBe(
            path[part + 1]?.id ?? join,
          );
      }
    }
    if (episode.category === 'Event') {
      rows += sourceRows.length;
      choices += program.nodes.filter((node) => node.kind === 'choice').length;
    }
  }
  expect(rows).toBe(9921);
  expect(choices).toBe(60);
  expect([...missingMusic].sort()).toEqual(
    ['SpecialActivity', 'bossbattle_loop'].sort(),
  );
  expect(missingMusicRows).toBe(4);
  await page.goto('/games/gfl1');
  const decoded = await page.evaluate(async (episodes) => {
    const modulePath = '/src/playback/gfl1/story.ts';
    const { decodeGfl1Story } = await import(modulePath);
    const failures: string[] = [];
    let count = 0;
    for (let index = 0; index < episodes.length; index += 12) {
      await Promise.all(
        episodes.slice(index, index + 12).map(async (episode) => {
          try {
            const response = await fetch(episode.content!.url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const loaded = decodeGfl1Story(await response.json(), episode);
            if (loaded.nodes.length !== episode.content!.count)
              throw new Error('Decoded row count changed');
            count++;
          } catch (error) {
            failures.push(`${episode.id}: ${String(error)}`);
          }
        }),
      );
    }
    return { count, failures };
  }, catalog);
  expect(decoded.failures).toEqual([]);
  expect(decoded.count).toBe(235);
});

test('four event catalogs retain native chapters and distinguish alternate, map and unresolved scenes', async ({
  page,
}) => {
  for (const [id, title, count] of events) {
    expect(
      milestone.filter((episode) => episode.collectionId === id),
    ).toHaveLength(count);
    await page.goto(`/games/gfl1/events/${id}`);
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await expect(page.locator('.story-chapter').first()).toBeVisible();
  }
  for (const [event, id, label] of [
    ['gfl1-operation-cube', 'gfl1--1-2-2End', 'Alternate repeat ending'],
    ['gfl1-deep-dive', 'gfl1--10-3-4-Point4229', 'Gameplay trigger: map 4229'],
    ['gfl1-deep-dive', 'gfl1--13-1-1', 'Additional gameplay scene'],
    [
      'gfl1-dual-randomness',
      'gfl1--41-specoalbattletips',
      'Placement unresolved',
    ],
  ]) {
    await page.goto(`/games/gfl1/events/${event}`);
    await page
      .getByRole('searchbox', { name: 'Search stories' })
      .fill(episodeOf(id).title);
    const story = page.locator(`[data-story-id="${id}"]`);
    await expect(story).toHaveAttribute('data-story-kind', 'side');
    await expect(story).toContainText(label);
    expect(episodeOf(id).nextEpisodeId, id).toBeUndefined();
  }
});

test('real CT choices rejoin correctly and preserve answers through reload, rewind and a copied path', async ({
  page,
}) => {
  const episode = episodeOf('gfl1--24-1-2First');
  await page.goto(passageUrl(episode, '-24-1-2First:41'));
  // Choice containers deliberately use aria-label without a group role.
  const responses = page.locator('.story-choices');
  await expect(responses.getByRole('button')).toHaveCount(3);
  await responses
    .getByRole('button', { name: 'Who are you?', exact: true })
    .click();
  await atRow(page, '-24-1-2First:42');
  await next(page);
  await next(page);
  await atRow(page, '-24-1-2First:44');
  await page.screenshot({
    path: resolve('.cache/gfl1/qa/ct-native-choice.png'),
  });
  await responses
    .getByRole('button', { name: 'Can I have a glass of water?', exact: true })
    .click();
  await atRow(page, '-24-1-2First:47');
  await expect(page.locator('.dialogue-window')).toContainText(
    'You will have one',
  );
  const copiedPath = page.url();
  await page.reload();
  await atRow(page, '-24-1-2First:47');
  await expect(page.locator('.dialogue-window')).toContainText(
    'You will have one',
  );
  await next(page);
  await atRow(page, '-24-1-2First:48');
  await next(page);
  await atRow(page, '-24-1-2First:49');
  await page
    .getByRole('button', { name: 'Previous passage', exact: true })
    .click();
  await atRow(page, '-24-1-2First:48');
  await page
    .getByRole('button', { name: 'Previous passage', exact: true })
    .click();
  await atRow(page, '-24-1-2First:47');
  await page
    .getByRole('button', { name: 'Previous passage', exact: true })
    .click();
  await atRow(page, '-24-1-2First:44');
  await responses
    .getByRole('button', { name: 'Can you speak?', exact: true })
    .click();
  await atRow(page, '-24-1-2First:46');
  await expect(page.locator('.dialogue-window')).toContainText(
    'do not respond',
  );
  await next(page);
  await atRow(page, '-24-1-2First:49');
  await page.goto(copiedPath);
  await atRow(page, '-24-1-2First:47');
  await expect(page.locator('.dialogue-window')).toContainText(
    'You will have one',
  );
  expect(
    JSON.parse(new URL(page.url()).searchParams.get('choices')!),
  ).toMatchObject({ '-24-1-2First:41': '1', '-24-1-2First:44': '3' });
});

test('Dual Randomness investigation alternatives skip unrelated evidence and restore their native actor position', async ({
  page,
}) => {
  const episode = episodeOf('gfl1--41-3-9');
  await page.goto(passageUrl(episode, '-41-3-9:7'));
  const responses = page.locator('.story-choices');
  await expect(responses.getByRole('button')).toHaveCount(4);
  await loadedImages(page);
  await expect(page.locator('.gfl1-portrait').first()).toHaveCSS('bottom', /-/);
  await responses
    .getByRole('button', { name: 'D. The walls.', exact: true })
    .click();
  await atRow(page, '-41-3-9:11');
  await expect(page.locator('.dialogue-window')).toContainText(
    'door to the office',
  );
  await next(page);
  await atRow(page, '-41-3-9:12');
  await responses
    .getByRole('button', { name: 'B. The office desk.', exact: true })
    .click();
  await atRow(page, '-41-3-9:14');
  await expect(page.locator('.dialogue-window')).toContainText('photo frame');
  await page.reload();
  await expect(page.locator('.dialogue-window')).toContainText('photo frame');
  await next(page);
  await atRow(page, '-41-3-9:17');
});

test('ordinary flashes keep the scene visible under reduced motion and montage images load on desktop and phone', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const flashEpisode = episodeOf('gfl1--24-11-2');
  await page.goto(passageUrl(flashEpisode, '-24-11-2:5'));
  await expect(page.locator('.dialogue-window')).toContainText('AHHHHHHH');
  await loadedImages(page);
  await expect(page.locator('.gfl1-montage')).toHaveCount(0);
  await expect(page.locator('.gfl1-flash')).toHaveCount(0);
  const montageEpisode = episodeOf('gfl1--25-10-1');
  await page.goto(passageUrl(montageEpisode, '-25-10-1:6'));
  await expect(
    page.getByLabel('Memory montage', { exact: true }),
  ).toBeVisible();
  await loadedImages(page, '.gfl1-montage img');
  await expect(page.locator('.dialogue-window')).not.toBeVisible();
  await expect(page.locator('.gfl1-stage')).toHaveClass(/gfl1-memory/);
  await page.screenshot({
    path: resolve('.cache/gfl1/qa/ct-native-montage-desktop.png'),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = (await page.locator('.gfl1-montage').boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(391);
  await loadedImages(page, '.gfl1-montage img');
  await page.screenshot({
    path: resolve('.cache/gfl1/qa/ct-native-montage-phone.png'),
  });
});

test('a downloaded event montage works after original media requests are blocked', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const episode = episodeOf('gfl1--25-10-1');
  await page.goto('/manage?game=gfl1');
  await page
    .getByRole('searchbox', { name: 'Search downloads' })
    .fill(episode.title);
  const row = page.locator('.download-item').filter({
    has: page.getByRole('link', { name: episode.title, exact: true }),
  });
  await row
    .getByRole('button', { name: `Download ${episode.title}`, exact: true })
    .click();
  await expect(row).toContainText('On this device', { timeout: 45000 });
  await page.route('**/private/gfl1/**', (route) => route.abort());
  await row.getByRole('link', { name: episode.title, exact: true }).click();
  await page
    .getByRole('slider', { name: 'Story position', exact: true })
    .fill('5');
  await atRow(page, '-25-10-1:6');
  await loadedImages(page, '.gfl1-montage img');
  await expect(page.locator('.gfl1-montage img').first()).toHaveAttribute(
    'src',
    /^blob:/,
  );
});

test('native looping effects restore on seek and channel replacement and story completion cancel them', async ({
  page,
}) => {
  const episode = episodeOf('gfl1--41-3-7');
  const program = packageOf(episode);
  expect(program.frames['-41-3-7:3'].sounds).toBeUndefined();
  expect(program.frames['-41-3-7:3'].activeSounds?.[0].loop).toBe(true);
  await page.goto(passageUrl(episode, '-41-3-7:3'));
  const player = page.getByTestId('gfl1-sfx-SE1');
  await expect(player).toHaveAttribute('data-cue', 'AVG_amb_thunderrain');
  await expect(player).toHaveAttribute('loop', '');
  const enableAudio = page.getByRole('button', {
    name: 'Enable audio',
    exact: true,
  });
  if (
    await player.evaluate((element) => (element as HTMLAudioElement).paused)
  ) {
    await expect(enableAudio).toBeVisible();
    await enableAudio.click();
  }
  await expect
    .poll(() =>
      player.evaluate(
        (element) =>
          !(element as HTMLAudioElement).paused &&
          (element as HTMLAudioElement).currentTime > 0,
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      player.evaluate((element) => (element as HTMLAudioElement).volume),
    )
    .toBe(0.25);
  await page.goto(passageUrl(episode, '-41-3-7:8'));
  await expect(player).toHaveAttribute('data-cue', 'AVG_brake');
  await expect(player).not.toHaveAttribute('loop');
  await page.goto(passageUrl(episode, '-41-3-7:3'));
  await expect(player).toHaveAttribute('data-cue', 'AVG_amb_thunderrain');
  await expect(player).toHaveAttribute('src');
  await page.goto(passageUrl(episode, '-41-3-7:end'));
  await expect(player).not.toHaveAttribute('src');
});

test('an explicit stop action fixture cancels a playing native looping channel during natural advancement', async ({
  page,
}) => {
  // The selected installed scripts replace sounds and end scenes but contain
  // no SE Empty commands. Intercept one package to exercise the supported stop
  // grammar without claiming that this synthetic command is original dialogue.
  const episode = episodeOf('gfl1--41-3-7');
  const fixture = packageOf(episode);
  fixture.frames['-41-3-7:4'].sounds = [
    { channel: 'SE1', action: 'stop', cue: 'Empty' },
  ];
  fixture.frames['-41-3-7:4'].activeSounds = [];
  await page.route(`**${episode.content!.url}`, (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.goto(passageUrl(episode, '-41-3-7:3'));
  const player = page.getByTestId('gfl1-sfx-SE1');
  await expect(player).toHaveAttribute('data-cue', 'AVG_amb_thunderrain');
  await expect(player).toHaveAttribute('loop', '');
  if (
    await player.evaluate((element) => (element as HTMLAudioElement).paused)
  ) {
    const enable = page.getByRole('button', {
      name: 'Enable audio',
      exact: true,
    });
    await expect(enable).toBeVisible();
    await enable.click();
  }
  await expect
    .poll(() =>
      player.evaluate(
        (element) =>
          !(element as HTMLAudioElement).paused &&
          (element as HTMLAudioElement).currentTime > 0,
      ),
    )
    .toBe(true);
  await next(page);
  await atRow(page, '-41-3-7:4');
  await expect(player).not.toHaveAttribute('src');
  await expect
    .poll(() =>
      player.evaluate((element) => (element as HTMLAudioElement).paused),
    )
    .toBe(true);
});
