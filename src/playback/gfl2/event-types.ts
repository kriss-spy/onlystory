import type { Command, Sound } from './types';

export interface GraphicAsset {
  url?: string;
  color?: string;
  width?: number;
  height?: number;
  sourceScale?: number;
  sourceX?: number;
  sourceY?: number;
}
export interface CharacterVariant {
  expressionIndex?: number;
  url: string;
  sourceScale: number;
  sourceX: number;
  sourceY: number;
  maskHeight: number;
  renderRect?: number[] | string;
  renderTextureScale?: number;
}
export interface CharacterAsset {
  kind: 'live2d' | 'sound-only';
  url?: string;
  prefabScale?: { x: number; y: number; z: number };
  files: string[];
  variants: Record<string, CharacterVariant>;
  female?: CharacterAsset;
}
export interface SceneStep {
  id: string;
  script: string;
  reset: boolean;
  commands: Command[];
  exit?: Command[];
  incoming?: Record<string, Command[]>;
  entryCommands?: Command[];
}
export interface EventProgram {
  version: 1;
  id: string;
  steps: SceneStep[];
  backgrounds: Record<string, GraphicAsset>;
  characters: Record<string, CharacterAsset>;
  layers: Record<string, { type: string; x: number; y: number; order: number }>;
  audio: Record<string, Sound & { layers?: Sound[]; limitation?: string }>;
  videos?: Record<
    string,
    {
      url: string;
      subtitles?: import('../../model').StoryNode['videoSubtitles'];
      voices?: import('../../model').StoryNode['videoVoices'];
      female?: import('../../model').StoryNode['femaleVideo'];
    }
  >;
  files: { url: string; bytes: number }[];
  unresolved: { kind: string; label: string }[];
}
export interface VisualLayer {
  id: string;
  asset?: string;
  kind: 'background' | 'character' | 'sprite' | 'particle';
  layer: string;
  pattern: { name: string; at: number }[];
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  color: string;
  darkness: number;
  maskHeight: number;
  order: number;
  sourceRow: number;
  fade: number;
  delay: number;
  effect?: string;
  effectDelay?: number;
  effectRow?: number;
  shaders?: Record<string, number>;
  tween?: {
    type: string;
    args: Record<string, number | boolean>;
    ease: string;
    loop: number;
    sourceRow: number;
  };
}
export interface AudioCue {
  label: string;
  command: Command;
  volume?: Command;
}
export interface SceneState {
  layers: VisualLayer[];
  removals?: { id: string; fade: number; delay: number }[];
  music: AudioCue | null;
  ambience: AudioCue[];
  shots: AudioCue[];
  audioStops?: Command[];
  audioVolumes?: Command[];
  soundVolumes?: Record<string, Command>;
  layerOrders?: Record<string, number>;
  zoom: {
    scale: number;
    x: number;
    y: number;
    duration: number;
    delay?: number;
  };
  params: Record<string, number>;
  warnings: string[];
}
