import type { Episode, StoryNode } from '../../model';

export interface Gfl1ShootingModels {
  target: {
    modelUrl: string;
    motions: Record<string, { group: string; index: number }>;
  };
  gun: Gfl1ShootingModels['target'];
  assets: string[];
}
export type Gfl1Interaction =
  | {
      kind: 'password';
      password: string;
      errorMessages: string[];
      answerId: string;
      prefab: string;
    }
  | {
      kind: 'shoot';
      answerId: string;
      count: number;
      manualCount: number;
      portraitName: string;
      portraitPath: string;
      background: Gfl1Frame['background'];
      audio: { cue: string; url?: string; delay: number }[];
      motions: {
        wait: number;
        shoot: number;
        gunShoot: number;
        gunWait: number;
      };
      tweens: { code: number; delay: number }[];
      models?: Gfl1ShootingModels;
    }
  | {
      kind: 'exploration';
      tips: string;
      spots: { id: string; x: number; y: number }[];
    }
  | { kind: 'quiz'; correctAnswerId: string };

export interface Gfl1Frame {
  background: { name: string; url?: string; color?: string };
  contextBackground?: Gfl1Frame['background'];
  actors: {
    name: string;
    expression: number;
    url?: string;
    active: boolean;
    communication: boolean;
    x?: number;
    y?: number;
    scale?: number;
    grey?: boolean;
    shake?: boolean;
    opacity?: number;
    fade?: { kind: 'in' | 'out'; duration: number };
    delay?: number;
  }[];
  bgm?: string;
  sounds?: {
    channel: 'SE1' | 'SE2';
    action?: 'play' | 'stop';
    cue: string;
    url?: string;
    loop?: boolean;
  }[];
  activeSounds?: Gfl1Frame['sounds'];
  shake?: boolean;
  night?: boolean;
  mask?: 'memory';
  sparks?: boolean;
  border?: number;
  blackout?: { color: '#000000'; duration: number };
  transitions?: { kind: string; value: string }[];
  flash?: {
    duration: number;
    rate: number;
    delay: number;
    backgrounds: Gfl1Frame['background'][];
    portraits: Gfl1Frame['actors'][];
  };
  effects?: string[];
  backgroundMove?: {
    pivotX: number;
    pivotY: number;
    scale: number;
    duration: number;
  };
  controlledShake?: {
    typeId: number;
    duration: number;
    delay: number;
    range: number;
  };
  nativeEffects?: { code: string; wait?: boolean }[];
  narrator?: boolean;
  hideDialogue?: boolean;
  interaction?: Gfl1Interaction;
}
export interface Gfl1Program {
  version: 1;
  id: string;
  nodes: StoryNode[];
  frames: Record<string, Gfl1Frame>;
  communication?: { frameUrl: string; markerUrl: string };
}
const privateAsset = (value: unknown) =>
  value === undefined ||
  (typeof value === 'string' &&
    /^\/private\/gfl1\/[\w /.-]+$/.test(value) &&
    !value.includes('..'));
const validBackground = (background: Gfl1Frame['background']) =>
  !!background &&
  typeof background.name === 'string' &&
  privateAsset(background.url) &&
  (background.color === undefined || /^#[\da-f]{6}$/i.test(background.color));
const validActor = (actor: Gfl1Frame['actors'][number]) =>
  !!actor &&
  typeof actor.name === 'string' &&
  Number.isInteger(actor.expression) &&
  actor.expression >= 0 &&
  privateAsset(actor.url) &&
  typeof actor.active === 'boolean' &&
  typeof actor.communication === 'boolean' &&
  [actor.x, actor.y, actor.scale].every(
    (value) => value === undefined || Number.isFinite(value),
  ) &&
  (actor.scale === undefined || actor.scale > 0) &&
  (actor.opacity === undefined ||
    (Number.isFinite(actor.opacity) &&
      actor.opacity >= 0 &&
      actor.opacity <= 1)) &&
  (actor.delay === undefined ||
    (Number.isFinite(actor.delay) && actor.delay >= 0)) &&
  (actor.fade === undefined ||
    (actor.fade &&
      ['in', 'out'].includes(actor.fade.kind) &&
      Number.isFinite(actor.fade.duration) &&
      actor.fade.duration >= 0));
const validSounds = (sounds: Gfl1Frame['sounds']) =>
  sounds === undefined ||
  (Array.isArray(sounds) &&
    sounds.every(
      (sound) =>
        !!sound &&
        ['SE1', 'SE2'].includes(sound.channel) &&
        typeof sound.cue === 'string' &&
        (sound.action === undefined ||
          ['play', 'stop'].includes(sound.action)) &&
        (sound.action === 'stop' || typeof sound.url === 'string') &&
        privateAsset(sound.url) &&
        (sound.loop === undefined || typeof sound.loop === 'boolean'),
    ));

const validInteraction = (
  interaction: Gfl1Frame['interaction'],
  node: StoryNode,
) => {
  if (interaction === undefined) return true;
  if (!interaction || node.kind !== 'choice') return false;
  const answer = (id: unknown) =>
    typeof id === 'string' && node.choices?.some((choice) => choice.id === id);
  if (interaction.kind === 'password')
    return (
      typeof interaction.password === 'string' &&
      interaction.password.length > 0 &&
      typeof interaction.prefab === 'string' &&
      Array.isArray(interaction.errorMessages) &&
      interaction.errorMessages.every(
        (message) => typeof message === 'string',
      ) &&
      answer(interaction.answerId)
    );
  if (interaction.kind === 'quiz') return answer(interaction.correctAnswerId);
  if (interaction.kind === 'exploration')
    return (
      typeof interaction.tips === 'string' &&
      Array.isArray(interaction.spots) &&
      new Set(interaction.spots.map((spot) => spot.id)).size ===
        interaction.spots.length &&
      interaction.spots.every(
        (spot) =>
          !!spot &&
          answer(spot.id) &&
          Number.isFinite(spot.x) &&
          Number.isFinite(spot.y),
      )
    );
  if (interaction.kind !== 'shoot') return false;
  const validModel = (model: Gfl1ShootingModels['target']) =>
    !!model &&
    typeof model.modelUrl === 'string' &&
    privateAsset(model.modelUrl) &&
    !!model.motions &&
    typeof model.motions === 'object' &&
    Object.values(model.motions).every(
      (motion) =>
        !!motion &&
        typeof motion.group === 'string' &&
        Number.isInteger(motion.index) &&
        motion.index >= 0,
    );
  return (
    (interaction.models === undefined ||
      (validModel(interaction.models.target) &&
        validModel(interaction.models.gun) &&
        Array.isArray(interaction.models.assets) &&
        interaction.models.assets.every(
          (url) => typeof url === 'string' && privateAsset(url),
        ))) &&
    answer(interaction.answerId) &&
    Number.isInteger(interaction.count) &&
    interaction.count > 0 &&
    Number.isInteger(interaction.manualCount) &&
    interaction.manualCount > 0 &&
    typeof interaction.portraitName === 'string' &&
    typeof interaction.portraitPath === 'string' &&
    validBackground(interaction.background) &&
    !!interaction.motions &&
    ['wait', 'shoot', 'gunShoot', 'gunWait'].every((key) =>
      Number.isFinite(
        interaction.motions[key as keyof typeof interaction.motions],
      ),
    ) &&
    Array.isArray(interaction.tweens) &&
    interaction.tweens.every(
      (tween) =>
        !!tween &&
        Number.isFinite(tween.code) &&
        Number.isFinite(tween.delay) &&
        tween.delay >= 0,
    ) &&
    Array.isArray(interaction.audio) &&
    interaction.audio.every(
      (cue) =>
        !!cue &&
        typeof cue.cue === 'string' &&
        privateAsset(cue.url) &&
        Number.isFinite(cue.delay) &&
        cue.delay >= 0,
    )
  );
};

export function decodeGfl1Story(input: unknown, episode: Episode): Episode {
  const program = input as Gfl1Program | null;
  if (
    !program ||
    program.version !== 1 ||
    program.id !== episode.id ||
    !Array.isArray(program.nodes) ||
    program.nodes.length !== episode.content?.count ||
    !program.nodes.length ||
    !program.frames ||
    typeof program.frames !== 'object'
  )
    throw new Error(
      'The GFL1 story does not match this library version. Reimport the source scripts.',
    );
  const ids = new Set<string>();
  if (
    program.communication &&
    (!privateAsset(program.communication.frameUrl) ||
      !privateAsset(program.communication.markerUrl))
  )
    throw new Error('The GFL1 transmission assets are invalid.');
  for (const node of program.nodes) {
    if (
      !node ||
      typeof node.id !== 'string' ||
      ids.has(node.id) ||
      !['text', 'choice', 'end', 'unsupported'].includes(node.kind) ||
      typeof node.speaker !== 'string' ||
      typeof node.text?.en !== 'string' ||
      typeof node.text?.['zh-CN'] !== 'string' ||
      !privateAsset(node.bgm)
    )
      throw new Error('The GFL1 story contains an invalid passage.');
    ids.add(node.id);
    const frame = program.frames[node.id];
    if (
      node.kind !== 'unsupported' &&
      (!frame ||
        !validInteraction(frame.interaction, node) ||
        !validBackground(frame.background) ||
        (frame.contextBackground !== undefined &&
          !validBackground(frame.contextBackground)) ||
        !validSounds(frame.activeSounds) ||
        !validSounds(frame.sounds) ||
        (frame.nativeEffects !== undefined &&
          (!Array.isArray(frame.nativeEffects) ||
            frame.nativeEffects.some(
              (effect) =>
                !effect ||
                typeof effect.code !== 'string' ||
                (effect.wait !== undefined && typeof effect.wait !== 'boolean'),
            ))) ||
        (frame.backgroundMove !== undefined &&
          (!frame.backgroundMove ||
            ![
              frame.backgroundMove.pivotX,
              frame.backgroundMove.pivotY,
              frame.backgroundMove.scale,
              frame.backgroundMove.duration,
            ].every(Number.isFinite) ||
            frame.backgroundMove.scale <= 0 ||
            frame.backgroundMove.duration < 0)) ||
        (frame.controlledShake !== undefined &&
          (!frame.controlledShake ||
            ![
              frame.controlledShake.typeId,
              frame.controlledShake.duration,
              frame.controlledShake.delay,
              frame.controlledShake.range,
            ].every(Number.isFinite) ||
            frame.controlledShake.duration < 0 ||
            frame.controlledShake.delay < 0 ||
            frame.controlledShake.range < 0)) ||
        (frame.blackout !== undefined &&
          (!frame.blackout ||
            frame.blackout.color !== '#000000' ||
            !Number.isFinite(frame.blackout.duration) ||
            frame.blackout.duration < 0 ||
            frame.blackout.duration > 10)) ||
        (frame.mask !== undefined && frame.mask !== 'memory') ||
        (frame.border !== undefined && !Number.isFinite(frame.border)) ||
        (frame.effects !== undefined &&
          (!Array.isArray(frame.effects) ||
            frame.effects.some(
              (effect) => effect !== 'credits' && effect !== 'snow',
            ))) ||
        (frame.flash !== undefined &&
          (!frame.flash ||
            ![frame.flash.duration, frame.flash.rate, frame.flash.delay].every(
              Number.isFinite,
            ) ||
            frame.flash.duration <= 0 ||
            frame.flash.rate <= 0 ||
            frame.flash.delay < 0 ||
            !Array.isArray(frame.flash.backgrounds) ||
            !frame.flash.backgrounds.every(validBackground) ||
            !Array.isArray(frame.flash.portraits) ||
            !frame.flash.portraits.every(
              (actors) => Array.isArray(actors) && actors.every(validActor),
            ))) ||
        !privateAsset(frame.bgm) ||
        !Array.isArray(frame.actors) ||
        !frame.actors.every(validActor))
    )
      throw new Error('The GFL1 story contains an invalid scene.');
  }
  if (
    !ids.has(episode.entryNodeId ?? '') ||
    program.nodes.some(
      (node) =>
        (node.next !== undefined && !ids.has(node.next)) ||
        (node.kind === 'choice' &&
          (!Array.isArray(node.choices) ||
            !node.choices.length ||
            new Set(node.choices.map((choice) => choice.id)).size !==
              node.choices.length ||
            node.choices.some(
              (choice) =>
                typeof choice.id !== 'string' ||
                typeof choice.label?.en !== 'string' ||
                typeof choice.label?.['zh-CN'] !== 'string' ||
                !ids.has(choice.next),
            ))),
    )
  )
    throw new Error('The GFL1 story contains a broken passage link.');
  return {
    ...episode,
    nodes: program.nodes.map((node) => ({
      ...node,
      scene: {
        background: 'platform',
        actors: [],
        window:
          node.speaker && !program.frames[node.id]?.narrator
            ? 'dialogue'
            : 'narration',
      },
    })),
    renderer: { id: 'gfl1', payload: program },
  };
}
