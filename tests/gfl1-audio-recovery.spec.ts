import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { libraryRoot } from '../scripts/local-environment.mjs';
import { emptyData } from '../src/model';
import type { Episode } from '../src/model';

const catalog: Episode[] = JSON.parse(
  readFileSync('src/generated/gfl1-catalog.json', 'utf8'),
);
const report = JSON.parse(
  readFileSync('.cache/gfl1/import-report.json', 'utf8'),
);
const restored = [
  'Room',
  'BGM_SpecialOPS',
  'AVG_Gray_Hand_Mech',
  'BGE_Carriage_Hit_01',
  'BGE_Drop_01',
  'BGE_Phone_Hangup_01',
  'BGE_Phone_Ring_01',
];

test('recovered cues have exact source provenance, available local files and decodable non-silent audio', async ({
  page,
}) => {
  expect(
    report.missing
      .filter((entry: { kind: string }) => ['bgm', 'sfx'].includes(entry.kind))
      .map((entry: { cue: string }) => entry.cue)
      .sort(),
  ).toEqual(
    [
      'AVG_2023Slow_Heart_telescreen3',
      'AVG_20Winter_Error',
      'AVG_20Winter_Open_Light',
      'AVG_Division_Camera',
      'AVG_Division_Flare_Gun',
      'AVG_The_Division_Grenade_Explosion',
      'BGM_Pause',
      'BGM_UnPause',
      'SpecialActivity',
      'bossbattle_loop',
      'm_va_spirit_potion',
    ].sort(),
  );
  const tracks = restored.map((cue) => {
    const record = report.audioProvenance.find(
      (entry: { cue: string }) => entry.cue === cue,
    );
    expect(record?.verifiedAlias?.evidence.length, cue).toBeGreaterThan(0);
    expect(record.sha256).toBe(record.verifiedAlias.bankSha256);
    return { cue, url: record.url };
  });
  await page.goto('/games/gfl1');
  const decoded = await page.evaluate(async (tracks) => {
    const audio = new AudioContext();
    try {
      return await Promise.all(
        tracks.map(async ({ cue, url }) => {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Missing ${cue}`);
          const buffer = await audio.decodeAudioData(
            await response.arrayBuffer(),
          );
          const data = buffer.getChannelData(0);
          let energy = 0;
          for (const sample of data) energy += sample * sample;
          return {
            cue,
            duration: buffer.duration,
            rms: Math.sqrt(energy / data.length),
          };
        }),
      );
    } finally {
      await audio.close();
    }
  }, tracks);
  for (const result of decoded) {
    expect(result.duration, result.cue).toBeGreaterThan(0.05);
    expect(result.rms, result.cue).toBeGreaterThan(0.00001);
    expect(Number.isFinite(result.rms)).toBe(true);
  }
});

test('the repaired Room cue restores native BGM without rewriting its source command', async ({
  page,
}) => {
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    {
      ...emptyData(),
      preferences: { ...emptyData().preferences, textSpeed: 0 },
    },
  );
  const record = report.audioProvenance.find(
    (entry: { cue: string }) => entry.cue === 'Room',
  );
  await page.goto('/read/gfl1/gfl1--41-3-7?line=-41-3-7%3A90');
  await expect(page.locator('audio[loop]')).toHaveAttribute('src', record.url);
  const episode = catalog.find((entry) => entry.id === 'gfl1--41-3-7')!;
  const program = JSON.parse(
    readFileSync(resolve(libraryRoot, '.' + episode.content!.url), 'utf8'),
  );
  expect(
    program.sourceRows.find((row: { row: number }) => row.row === 90).raw,
  ).toContain('<BGM>Room</BGM>');
  expect(
    program.audit.filter(
      (entry: { kind: string }) => entry.kind === 'missing-bgm',
    ),
  ).toEqual([]);
  await page.reload();
  await expect(page.locator('audio[loop]')).toHaveAttribute('src', record.url);
});

test('each recovered sound reaches the real reader effect channel', async ({
  page,
}) => {
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    {
      ...emptyData(),
      preferences: { ...emptyData().preferences, textSpeed: 0 },
    },
  );
  for (const [script, row, cue] of [
    ['-48-4-11', 88, 'AVG_Gray_Hand_Mech'],
    ['-77-A-46', 93, 'BGE_Phone_Ring_01'],
    ['-77-A-46', 96, 'BGE_Drop_01'],
    ['-77-A-46', 111, 'BGE_Phone_Hangup_01'],
    ['-77-A-46', 115, 'BGE_Carriage_Hit_01'],
  ] as const) {
    await page.goto(
      `/read/gfl1/gfl1-${script}?line=${encodeURIComponent(`${script}:${row}`)}`,
    );
    const effect = page.getByTestId('gfl1-sfx-SE1');
    await expect(effect).toHaveAttribute('data-cue', cue);
    await expect(effect).toHaveAttribute(
      'src',
      report.audioProvenance.find((entry: { cue: string }) => entry.cue === cue)
        .url,
    );
  }
});
