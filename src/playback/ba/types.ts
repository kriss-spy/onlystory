export interface BaRow {
  GroupId?: number;
  row: number;
  ScriptKr: string;
  TextJp: string;
  BGName: number;
  BGMId: number;
  Sound: string;
  Transition: number;
  BGEffect: number;
  PopupFileName?: string;
}
export interface BaActorAsset {
  model: string;
  name: string;
  signal: boolean;
  skeleton: string;
  atlas: string;
  pages: string[];
  expressionNames?: string[];
  invisible?: boolean;
  skin?: string;
}
export interface BaSpineBackgroundAsset {
  renderer: 'spine';
  name: string;
  skeleton: string;
  atlas: string;
  pages: string[];
  animation: string;
  scale?: number;
  x?: number;
  y?: number;
}
export interface BaAssets {
  version: number;
  gameVersion: string;
  backgrounds: Record<
    string,
    { renderer?: 'image'; name: string; url: string } | BaSpineBackgroundAsset
  >;
  characters: Record<string, BaActorAsset>;
  music: Record<
    string,
    { url: string; gain: number; loopStart: number; loopEnd: number }
  >;
  sounds: Record<string, string>;
  voices: Record<string, string>;
  emotions: Record<string, string>;
  effects: Record<string, string>;
  popups?: Record<string, string>;
  videos?: Record<string, string>;
  cutscenes?: Record<string, { supported: false; reason: string }>;
  sourceGaps?: {
    group: number;
    row: number;
    field: 'BGName' | 'BGEffect' | 'Sound' | 'TextJp' | 'Character';
    value: number | string;
    reason: string;
  }[];
  transitions: Record<
    string,
    {
      TransitionOut: string;
      TransitionIn: string;
      TransitionOutResource?: string;
      TransitionInResource?: string;
      TransitionOutDuration: number;
      TransitionInDuration: number;
    }
  >;
  files: { url: string; bytes: number; sha256: string }[];
}
export interface BaProgram {
  version: 1;
  id: string;
  steps: { id: string; rows: BaRow[]; afterRows?: BaRow[] }[];
  assets: BaAssets;
  warnings?: {
    row: number;
    type?: 'source-gap' | 'unsupported-cutscene';
    group?: number;
    field?: 'BGName' | 'BGEffect' | 'Sound';
    value?: number | string;
    reason?: string;
    path?: string;
    character?: string;
    model?: string;
    expression?: string;
    behavior?: string;
  }[];
}
export interface BaActor {
  name: string;
  position: number;
  face: string;
  visible: boolean;
  highlight: boolean;
  closeup: boolean;
  action: string;
  emotion: string;
  fx: string;
  silhouette: boolean;
  whiteSilhouette: boolean;
  requestedFace?: string;
  signal: boolean;
}
export interface BaState {
  background: number;
  music: number;
  actors: Record<string, BaActor>;
  zoom: { x: number; y: number; size: number };
  effect: number;
  shake: boolean;
  captions: {
    row: number;
    text: string;
    x: number;
    y: number;
    size: number;
    color: string;
    alignment?: 'center' | 'right';
    pauses?: { offset: number; delay: number }[];
    instant?: boolean;
  }[];
  place: string;
  title: string;
  popup: string;
  globalFx: { name: string; x: number; y: number }[];
}
