export interface Command {
  Command: string;
  Arg1: string;
  Arg2: string;
  Arg3: string;
  Arg4: string;
  Arg5: string;
  Arg6: string;
  Arg7: string;
  Arg8: string;
  WaitType: string;
  sourceRow: number;
}
export interface Sound {
  url?: string;
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;
  gain?: number;
}
export interface Opening {
  title: string;
  subtitle: string;
  steps: {
    text: string;
    speaker: string;
    window: string;
    source: { script: string; row: number; contentId: number };
    commands: Command[];
  }[];
  assets: {
    backgrounds: Record<string, { url?: string; color?: string }>;
    audio: Record<string, Sound & { layers?: Sound[] }>;
    layerOrders: Record<string, number>;
  };
  importedFrom: { files: { url: string }[] };
}
