export interface CharacterState {
  id: number;
  costume: string;
  visible: boolean;
  x: number;
  y?: number;
  fromX: number;
  fromY?: number;
  depth: number;
  motion: string;
  expression: string;
}
export interface SceneState {
  background: string;
  music: string;
  musicVolume: number;
  bgmBlockIndex?: number;
  bgmControl?: { mode: 5; bgm: string; volume: number; duration: number };
  characters: Record<string, CharacterState>;
  curtain: {
    color: string;
    alpha: number;
    wipe?: 'top' | 'bottom' | 'left' | 'right';
  };
  ambient: string;
  flashback: boolean;
  memory?: boolean;
  caption: string;
  fullscreen: boolean;
  layoutMode?: number;
  loopingSounds?: Record<string, number>;
  characterShaders?: Record<string, string>;
  characterBlur?: Record<string, number>;
  scenarioEffects?: string[];
  camera?: { x: number; y: number; zoom: number };
  blur?: boolean;
}
export interface NativeRecord {
  Character2dId?: number;
  MotionName?: string;
  FacialName?: string;
  Motions?: NativeRecord[];
  Type?: number;
  EffectType?: number;
  Duration?: number;
  StringVal?: string;
  PlayMode?: number;
  Bgm?: string;
  Se?: string;
  Volume?: number;
  RequirePlaySound?: number;
  SoundReferenceIdx?: number;
  BgmBlockIndex?: number;
}
export interface Command {
  index: number;
  action: number;
  delay: number;
  wait: boolean;
  duration: number;
  record: NativeRecord | null;
  effects?: NativeRecord[];
  sounds?: NativeRecord[];
  state: SceneState;
}
export interface Step {
  id: string;
  index: number;
  kind: 'text' | 'end' | 'choice' | 'video';
  choices?: string[];
  movie?: string;
  performance?: number;
  speaker: string;
  text: string;
  before: SceneState;
  after: SceneState;
  commands: Command[];
}
export interface Program {
  version: number;
  id: string;
  scenarioId: string;
  title: string;
  region: string;
  sourceCommands: number;
  sourceHash: string;
  steps: Step[];
  media: {
    region: string;
    backgrounds: Record<string, string>;
    videoBackgrounds?: Record<
      string,
      {
        url: string;
        loop: boolean;
        muted: true;
        presentation?: 'background' | 'overlay';
      }
    >;
    music: Record<string, string>;
    voices: Record<string, string>;
    sounds: Record<string, string>;
    movies?: Record<string, string>;
    performances?: Record<
      string,
      { url: string; title: string; musicVocalId: number; notice: string }
    >;
    effects?: Record<string, string>;
    effectAssets?: Record<
      string,
      {
        textures: string[];
        kind:
          | 'image'
          | 'particles'
          | 'rain'
          | 'snow'
          | 'petals'
          | 'flare'
          | 'glitch'
          | 'lines'
          | 'vignette'
          | 'eye';
        columns?: number;
        rows?: number;
      }
    >;
    models: Record<
      string,
      { id: number; url: string; motions: string[]; expressions: string[] }
    >;
    files: {
      url: string;
      sourceUrl?: string;
      sha256: string | null;
      bytes: number;
      md5?: string;
      deferred?: boolean;
      listing?: { url: string; sha256: string };
    }[];
  };
}
