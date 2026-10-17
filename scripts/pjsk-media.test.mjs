import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pjskCatalogMetadata,
  withResolvedPjskMediaIssues,
} from './pjsk-media.mjs';

const entry = {
  id: 'pjsk-cn-event-1000001',
  region: 'cn',
  kind: 'event',
  collection: '1',
  episodeNo: 1,
  metadata: { chapter: { eventId: 1, assetbundleName: 'event_stella_2020' } },
};

test('source main/sub unit relations classify focused and mixed events', () => {
  const rows = [
    { eventStoryId: 1, unit: 'idol', eventStoryUnitRelation: 'main' },
    { eventStoryId: 1, unit: 'street', eventStoryUnitRelation: 'sub' },
  ];
  const source = {
    id: 1,
    name: 'Event',
    assetbundleName: 'event_stella_2020',
    startAt: 1633762800000,
    unit: 'none',
  };
  assert.equal(pjskCatalogMetadata(entry, [source], rows).group, 'idol');
  assert.equal(
    pjskCatalogMetadata(
      entry,
      [source],
      rows.map((row) => ({ ...row, eventStoryUnitRelation: 'sub' })),
    ).group,
    'mixed',
  );
});
const event = {
  id: 1,
  name: '雨过天晴的启明星',
  assetbundleName: 'event_stella_2020',
  startAt: 1633762800000,
};

test('event catalog uses original CN name, release date, event group and episode order', () => {
  assert.deepEqual(pjskCatalogMetadata(entry, [event]), {
    story: '雨过天晴的启明星',
    category: 'Event',
    collectionId: 'pjsk-cn-event-1',
    group: 'light_sound',
    date: '2021-10-09',
    order: 1,
  });
  assert.equal(
    pjskCatalogMetadata({ ...entry, episodeNo: 8 }, [event]).order,
    8,
  );
  assert.equal(
    pjskCatalogMetadata(entry, [
      { ...event, startAt: Date.UTC(2021, 9, 8, 23) },
    ]).date,
    '2021-10-09',
  );
});

test('event metadata cannot silently use another event or bundle', () => {
  for (const events of [
    [],
    [event, event],
    [{ ...event, id: 2 }],
    [{ ...event, assetbundleName: 'other' }],
  ])
    assert.throws(
      () => pjskCatalogMetadata(entry, events),
      /metadata mismatch/,
    );
  assert.throws(
    () =>
      pjskCatalogMetadata(
        {
          ...entry,
          metadata: { chapter: { ...entry.metadata.chapter, eventId: 2 } },
        },
        [event],
      ),
    /metadata mismatch/,
  );
});

test('group metadata preserves mixed events and newer source unit labels', () => {
  const metadataFor = (id, unit) =>
    pjskCatalogMetadata(
      {
        ...entry,
        collection: String(id),
        metadata: { chapter: { ...entry.metadata.chapter, eventId: id } },
      },
      [{ ...event, id, unit }],
    );
  assert.equal(metadataFor(4, 'none').group, 'mixed');
  assert.equal(metadataFor(9, 'none').group, 'mixed');
  assert.equal(metadataFor(150, 'school_refusal').group, 'school_refusal');
  assert.equal(metadataFor(999, 'none').group, undefined);
});

test('existing MMJ fixture retains its catalog identity', () => {
  assert.deepEqual(
    pjskCatalogMetadata({
      region: 'cn',
      kind: 'unit',
      collection: 'idol',
      episodeNo: 2,
    }),
    {
      story: 'MORE MORE JUMP! · 主线故事',
      category: 'Main story',
      collectionId: 'pjsk-cn-idol-main',
      group: 'idol',
      date: '2020-09-30',
      order: 2,
    },
  );
});

test('all six main-story groups retain separate ordered collections', () => {
  for (const group of [
    'idol',
    'light_sound',
    'street',
    'theme_park',
    'school_refusal',
    'piapro',
  ]) {
    const metadata = pjskCatalogMetadata({
      region: 'cn',
      kind: 'unit',
      collection: group,
      episodeNo: 21,
    });
    assert.equal(metadata.group, group);
    assert.equal(metadata.collectionId, `pjsk-cn-${group}-main`);
    assert.equal(metadata.category, 'Main story');
    assert.equal(metadata.order, 21);
    assert.equal(metadata.date, '2020-09-30');
  }
  assert.throws(
    () =>
      pjskCatalogMetadata({
        region: 'cn',
        kind: 'unit',
        collection: 'unknown',
      }),
    /Unsupported/,
  );
});

test('verified encoded filenames resolve only matching media issues without mutating source', () => {
  const issue = {
    code: 'invalid-media-reference',
    kind: 'voice',
    reference: 'voice_01 ',
    at: 'snippet:12',
  };
  const other = { ...issue, at: 'snippet:13' };
  const pkg = {
    rawScenario: 'original',
    scenario: { source: { VoiceId: 'voice_01 ' }, issues: [issue, other] },
  };
  const correction = {
    kind: 'voice',
    originalReference: 'voice_01 ',
    locations: ['snippet:12'],
    evidence: {
      bytes: 100,
      sha256: 'a'.repeat(64),
      sourceUrl: 'https://example.com/voice_01%20.mp3',
    },
  };
  const resolved = withResolvedPjskMediaIssues(pkg, [correction]);
  assert.deepEqual(resolved.scenario.issues, [other]);
  assert.deepEqual(pkg.scenario.issues, [issue, other]);
  assert.equal(resolved.scenario.source, pkg.scenario.source);
  assert.equal(resolved.rawScenario, pkg.rawScenario);
  assert.deepEqual(
    withResolvedPjskMediaIssues(pkg, [{ ...correction, evidence: null }])
      .scenario.issues,
    pkg.scenario.issues,
  );
});
