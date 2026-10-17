import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewedPjskVoice } from './pjsk-voice-bindings.mjs';
import { sha256 } from './pjsk-scenario.mjs';

function fixture() {
  const motions = [
    { Character2dId: 278, MotionName: 'tilthead', FacialName: 'smile' },
  ];
  const pkg = {
    entry: { scenarioId: 'event_121_02' },
    report: { sources: [{ sha256: 'c'.repeat(64) }] },
    scenario: {
      source: {
        TalkData: [
          {
            Body: '原文',
            Motions: motions,
            Voices: [{ Character2dId: 278, VoiceId: 'bad_suffix' }],
          },
        ],
      },
    },
  };
  const data = Buffer.from(
    JSON.stringify({
      TalkData: [
        {
          Body: '日本語',
          Motions: motions,
          Voices: [{ Character2dId: 278, VoiceId: 'exact_original' }],
        },
      ],
    }),
  );
  const binding = {
    scenarioId: 'event_121_02',
    talkIndex: 0,
    originalReference: 'bad_suffix',
    resolvedReference: 'exact_original',
    cnSha256: 'c'.repeat(64),
    jpSourceUrl: 'https://storage.sekai.best/original.asset',
    jpSha256: sha256(data),
    character2dId: 278,
    evidence: { cnBody: '原文', jpBody: '日本語', motions },
  };
  return { pkg, data, binding };
}

test('reviewed voice replacement requires exact CN/JP provenance and matching native dialogue', async () => {
  const { pkg, data, binding } = fixture();
  const before = structuredClone(pkg);
  assert.equal(
    await reviewedPjskVoice(pkg, 'bad_suffix', async () => ({ data }), [
      binding,
    ]),
    binding,
  );
  assert.deepEqual(pkg, before);
  for (const bad of [
    { ...binding, cnSha256: 'd'.repeat(64) },
    { ...binding, jpSha256: 'e'.repeat(64) },
    { ...binding, character2dId: 999 },
    { ...binding, resolvedReference: 'guessed' },
  ]) {
    await assert.rejects(
      reviewedPjskVoice(pkg, 'bad_suffix', async () => ({ data }), [bad]),
      /reviewed voice binding/,
    );
  }
  await assert.rejects(
    reviewedPjskVoice(
      pkg,
      'bad_suffix',
      async () => ({ data: Buffer.from('{}') }),
      [binding],
    ),
    /JP source/,
  );
});

test('other voice names and scenarios are never rewritten or probed', async () => {
  const { pkg, binding } = fixture();
  const forbidden = () => {
    throw new Error('Unexpected network request');
  };
  assert.equal(
    await reviewedPjskVoice(pkg, 'similar_suffix', forbidden, [binding]),
    null,
  );
  pkg.entry.scenarioId = 'another';
  assert.equal(
    await reviewedPjskVoice(pkg, 'bad_suffix', forbidden, [binding]),
    null,
  );
});
