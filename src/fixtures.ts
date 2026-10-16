import type { Episode, Game, GameId, Locale, Scene, StoryNode } from './model';

export const games: Game[] = [
  {
    id: 'gfl2',
    name: "Girls' Frontline 2",
    shortName: 'GFL2',
    description: 'Messages, layered scenes and cinematic transitions.',
    accent: '#b7c79f',
    cover: 'platform',
  },
  {
    id: 'pjsk',
    name: 'Project SEKAI',
    shortName: 'PJSK',
    description: 'Voiced dialogue and characters moving together.',
    accent: '#adbbf0',
    cover: 'observatory',
  },
  {
    id: 'ba',
    name: 'Blue Archive',
    shortName: 'BA',
    description: 'Character dialogue, choices and scene effects.',
    accent: '#9fcfe0',
    cover: 'corridor',
  },
  {
    id: 'gfl1',
    name: "Girls' Frontline",
    shortName: 'GFL1',
    description: 'Illustrated stories and incomplete archive states.',
    accent: '#d7b797',
    cover: 'platform',
  },
];
const t = (en: string, zh: string): Record<Locale, string> => ({
  en,
  'zh-CN': zh,
});
const scene = (
  background: Scene['background'],
  window: Scene['window'] = 'dialogue',
  both = false,
): Scene => ({
  background,
  window,
  actors:
    window === 'system'
      ? []
      : [
          { name: 'Mira', position: 'right', expression: 'neutral' },
          ...(both
            ? [{ name: 'Ren', position: 'left', expression: 'smile' } as const]
            : []),
        ],
});
const media = [
  '/demo/platform.svg',
  '/demo/observatory.svg',
  '/demo/corridor.svg',
  '/demo/voice.wav',
  '/demo/music.wav',
  '/demo/arrival.mp4',
  '/demo/arrival.vtt',
];

function scenario(game: GameId, episode: number): StoryNode[] {
  const bg = games.find((g) => g.id === game)!.cover;
  const both = game === 'pjsk';
  return [
    {
      id: 'arrival',
      kind: 'text',
      speaker: 'Narrator',
      text: t(
        'The last train had gone. Along the platform, the lights came on one after another.',
        '末班车已经离开。站台上的灯，一盏接一盏地亮了起来。',
      ),
      scene: {
        ...scene(bg, 'narration', both),
        effect: game === 'pjsk' ? 'signal' : 'rain',
      },
      next: 'signal',
      bgm: '/demo/music.wav',
    },
    {
      id: 'signal',
      kind: 'text',
      speaker: 'Mira',
      text: t(
        'Wait. Did you hear that? Someone is still here.',
        '等一下。你听到了吗？这里还有人。',
      ),
      voice: '/demo/voice.wav',
      scene: {
        ...scene(bg, 'dialogue', both),
        actors: scene(bg, 'dialogue', both).actors.map((a) => ({
          ...a,
          expression: a.name === 'Mira' ? 'surprised' : a.expression,
        })),
      },
      next: 'decision',
    },
    {
      id: 'decision',
      kind: 'choice',
      speaker: 'You',
      text: t(
        'A faint signal is coming from the old announcement room.',
        '微弱的信号从旧广播室传来。',
      ),
      scene: scene(bg, 'dialogue', both),
      choices: [
        {
          id: 'listen',
          label: t('Stay and listen', '留下来听听'),
          next: 'listen',
        },
        {
          id: 'follow',
          label: t('Follow the signal', '跟着信号走'),
          next: 'follow',
        },
      ],
    },
    {
      id: 'listen',
      kind: 'text',
      speaker: 'Mira',
      text: t(
        'Then we will wait together. Some things are worth hearing all the way through.',
        '那我们就一起等吧。有些话，值得完整地听完。',
      ),
      scene: scene(bg, 'dialogue', both),
      next: 'system',
    },
    {
      id: 'follow',
      kind: 'text',
      speaker: 'Ren',
      text: t(
        'Take the light. I will stay close behind you.',
        '拿好灯。我会跟在你身后。',
      ),
      scene: scene('corridor', 'dialogue', true),
      next: 'system',
    },
    {
      id: 'system',
      kind: 'text',
      speaker: game === 'gfl2' ? 'Terminal' : 'Narrator',
      text: t(
        game === 'gfl2'
          ? 'ARCHIVE LINK RESTORED\nOne recording is available.'
          : 'The door opened, and an old recording began to play.',
        game === 'gfl2'
          ? '档案连接已恢复\n发现一段录音。'
          : '门打开了，一段旧影像开始播放。',
      ),
      scene: scene('observatory', game === 'gfl2' ? 'system' : 'narration'),
      next: 'recording',
    },
    {
      id: 'recording',
      kind: 'video',
      speaker: 'Narrator',
      text: t(
        'A memory of the platform, before the rain.',
        '下雨之前，站台的记忆。',
      ),
      scene: scene('platform', 'narration'),
      video: '/demo/arrival.mp4',
      next: episode === 2 ? 'gap' : 'morning',
    },
    {
      id: 'gap',
      kind: 'unsupported',
      speaker: 'Archive',
      text: t(
        'The archive refers to a conversation during a mission. That scene is missing from this sample.',
        '档案提到了一段任务中的对话。这个示例中缺少该场景。',
      ),
      scene: scene('corridor', 'system'),
      next: 'morning',
    },
    {
      id: 'morning',
      kind: 'end',
      speaker: 'Narrator',
      text: t(
        'When the recording ended, the rain had stopped. There was still time to find the next train.',
        '影像结束时，雨已经停了。我们还有时间，去等下一班列车。',
      ),
      scene: { ...scene('platform', 'narration'), actors: [] },
    },
  ];
}

const titles = [
  'The last train',
  'A signal after midnight',
  'What the archive remembers',
];
export const episodes: Episode[] = games.flatMap((game) =>
  titles.map((title, i): Episode => ({
    id: `${game.id}-${i + 1}`,
    game: game.id,
    story: 'Night platform',
    collectionId: `${game.id}-night-platform`,
    placement:
      i === 0
        ? undefined
        : {
            kind: 'side',
            branch: game.id === 'pjsk' && i === 2 ? 'fragments' : 'after-hours',
            title: game.id === 'pjsk' && i === 2 ? 'Fragments' : 'After hours',
            after: game.id === 'pjsk' && i === 2 ? undefined : `${game.id}-1`,
          },
    title,
    description:
      i === 0
        ? 'An empty platform. A voice over the radio. A choice about what comes next.'
        : i === 1
          ? 'Follow a faint transmission through the station after closing time.'
          : 'Return to a recording and the spaces between its memories.',
    category: i === 0 ? 'Main story' : i === 1 ? 'Event' : 'Side story',
    order: i + 1,
    date: `2026-10-${String(12 - i).padStart(2, '0')}`,
    minutes: 3,
    availability: i === 0 ? 'available' : i === 1 ? 'remote' : 'incomplete',
    capabilities:
      game.id === 'gfl2'
        ? ['Message windows', 'Video', 'Choices']
        : game.id === 'pjsk'
          ? ['Concurrent motion', 'Voice', 'Choices']
          : game.id === 'ba'
            ? ['Scene effects', 'Choices', 'Voice']
            : ['Archive gap', 'Illustrated text', 'Video'],
    nodes: scenario(game.id, i),
    assets: media,
  })),
);

export const episodeById = (id: string | undefined) =>
  episodes.find((e) => e.id === id);
export const gameById = (id: string | undefined) =>
  games.find((g) => g.id === id);
export const backgroundUrl = (scene: Scene['background']) =>
  `/demo/${scene}.svg`;
export function stressEpisodes(count: number): Episode[] {
  return Array.from(
    { length: Math.min(10000, Math.max(0, count)) },
    (_, i) => ({
      ...episodes[i % episodes.length],
      id: `stress-${i}`,
      collectionId: `stress-event-${i}`,
      story: `Archive ${String(i + 1).padStart(5, '0')}`,
      placement: undefined,
      title: `Archive ${String(i + 1).padStart(5, '0')}`,
      order: i + 1,
    }),
  );
}
