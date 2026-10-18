import { describe, expect, it } from 'vitest';
import { decodeGfl1Story } from './story';
import type { Episode } from '../../model';

const episode = {
  id: 'gfl1-test',
  entryNodeId: 'test:1',
  content: { count: 2 },
} as Episode;
const story = () => ({
  version: 1,
  id: episode.id,
  nodes: [
    {
      id: 'test:1',
      kind: 'text',
      speaker: 'Kalina',
      text: { en: 'Hello', 'zh-CN': 'Hello' },
      next: 'test:end',
    },
    { id: 'test:end', kind: 'end', speaker: '', text: { en: '', 'zh-CN': '' } },
  ],
  frames: {
    'test:1': { background: { name: 'black', color: '#000000' }, actors: [] },
    'test:end': { background: { name: 'black', color: '#000000' }, actors: [] },
  },
});
describe('GFL1 story packages', () => {
  it('rejects interactive gates with invalid answers, timing or external media', () => {
    for (const interaction of [
      {
        kind: 'password',
        password: '1234',
        answerId: 'absent',
        errorMessages: [],
        prefab: 'InputBox',
      },
      {
        kind: 'exploration',
        tips: '',
        spots: [{ id: '1', x: Infinity, y: 0 }],
      },
      { kind: 'quiz', correctAnswerId: 'absent' },
      { kind: 'shoot', answerId: 'fire', count: -1, manualCount: 1, audio: [] },
    ]) {
      const input = story();
      Object.assign(input.nodes[0], {
        kind: 'choice',
        choices: [
          {
            id: '1',
            label: { en: 'Inspect', 'zh-CN': 'Inspect' },
            next: 'test:end',
          },
        ],
      });
      Object.assign(input.frames['test:1'], { interaction });
      expect(() => decodeGfl1Story(input, episode)).toThrow();
    }
  });
  it('loads valid interactive choices and rejects model URLs outside the library', () => {
    const input = story();
    Object.assign(input.nodes[0], {
      kind: 'choice',
      choices: [
        {
          id: 'fire',
          label: { en: 'Fire', 'zh-CN': 'Fire' },
          next: 'test:end',
        },
      ],
    });
    const interaction = {
      kind: 'shoot',
      answerId: 'fire',
      count: 1,
      manualCount: 1,
      portraitName: 'native',
      portraitPath: 'AVGPicPrefabs',
      background: { name: 'black', color: '#000000' },
      audio: [],
      tweens: [],
      motions: { wait: 111, shoot: 201, gunShoot: 201, gunWait: -110 },
      models: {
        target: {
          modelUrl: '/private/gfl1/live2d/target/model3.json',
          motions: {},
        },
        gun: { modelUrl: '/private/gfl1/live2d/gun/model3.json', motions: {} },
        assets: ['/private/gfl1/live2d/gun/model.moc3'],
      },
    };
    Object.assign(input.frames['test:1'], { interaction });
    expect(decodeGfl1Story(input, episode).renderer?.id).toBe('gfl1');
    interaction.models.target.modelUrl = 'https://example.com/model3.json';
    expect(() => decodeGfl1Story(input, episode)).toThrow();
  });
  it('loads the complete graph and renderer payload', () => {
    expect(decodeGfl1Story(story(), episode).nodes).toHaveLength(2);
    expect(decodeGfl1Story(story(), episode).renderer?.id).toBe('gfl1');
  });
  it('loads an explicit unavailable-source notice without inventing scene assets', () => {
    const input = story();
    const node = { ...input.nodes[0], kind: 'unsupported', next: undefined };
    const loaded = decodeGfl1Story(
      { ...input, nodes: [node], frames: {} },
      { ...episode, content: { ...episode.content!, count: 1 } },
    );
    expect(loaded.nodes[0].kind).toBe('unsupported');
  });
  it('rejects version mismatches, truncated files, duplicate IDs and dangling links', () => {
    const input = story();
    input.version = 2;
    expect(() => decodeGfl1Story(input, episode)).toThrow();
    expect(() => decodeGfl1Story({ ...story(), nodes: [] }, episode)).toThrow();
    const duplicate = story();
    duplicate.nodes[1].id = 'test:1';
    expect(() => decodeGfl1Story(duplicate, episode)).toThrow();
    const broken = story();
    broken.nodes[0].next = 'missing';
    expect(() => decodeGfl1Story(broken, episode)).toThrow();
  });
  it('rejects scene media outside the private GFL1 library', () => {
    const input = story();
    Object.assign(input.frames['test:1'].background, {
      url: 'https://example.com/image.png',
    });
    expect(() => decodeGfl1Story(input, episode)).toThrow();
  });
  it('accepts private assets whose native cue name contains a space', () => {
    const input = story();
    const frame = input.frames['test:1'] as unknown as {
      bgm: string | undefined;
    };
    frame.bgm =
      '/private/gfl1/audio/GF_The_Division_Ola_Strandh_Dark Zone.7d8413e0bfc7ec1bd108.ogg';
    expect(decodeGfl1Story(input, episode).renderer?.id).toBe('gfl1');
  });
  it('validates loop snapshots, montage media and numeric fields before rendering', () => {
    for (const extra of [
      {
        activeSounds: [
          {
            channel: 'SE1',
            cue: 'wind',
            action: 'play',
            url: 'https://example.com/wind.ogg',
          },
        ],
      },
      {
        flash: {
          duration: 2,
          rate: 10,
          delay: 0,
          backgrounds: [{ name: 'bad', url: '/private/gfl1/../outside.webp' }],
          portraits: [],
        },
      },
      { blackout: { color: '#000000', duration: -1 } },
      { backgroundMove: { pivotX: 0.5, pivotY: 0.5, scale: 0, duration: 1 } },
      { controlledShake: { typeId: 1, duration: -1, delay: 0, range: 10 } },
      { nativeEffects: [{ code: null }] },
      {
        flash: {
          duration: 2,
          rate: 10,
          delay: 0,
          backgrounds: null,
          portraits: [],
        },
      },
      {
        flash: {
          duration: -1,
          rate: 10,
          delay: 0,
          backgrounds: [],
          portraits: [],
        },
      },
    ]) {
      const input = story();
      Object.assign(input.frames['test:1'], extra);
      expect(() => decodeGfl1Story(input, episode)).toThrow();
    }
  });
  it('accepts choice graphs and rejects a choice pointing outside the package', () => {
    const input = story();
    Object.assign(input.nodes[0], {
      kind: 'choice',
      choices: [
        { id: '1', label: { en: 'Go', 'zh-CN': 'Go' }, next: 'test:end' },
      ],
    });
    expect(decodeGfl1Story(input, episode).nodes[0].kind).toBe('choice');
    Object.assign(input.nodes[0], {
      choices: [
        { id: '1', label: { en: 'Go', 'zh-CN': 'Go' }, next: 'outside' },
      ],
    });
    expect(() => decodeGfl1Story(input, episode)).toThrow();
  });
});
