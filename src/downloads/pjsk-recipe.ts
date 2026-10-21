import type { Program } from '../playback/pjsk/types';

export interface PjskFile {
  url: string;
  sourceUrl?: string | null;
  sha256: string | null;
  bytes: number;
  md5?: string;
}
export interface PjskRecipe {
  version: number;
  id: string;
  sourceScenarioId?: string;
  entry: { id: string; title: string; region: string; scenarioId: string };
  program: { url: string };
  text: { url: string };
  scenario: PjskFile & { sha256: string };
  media: Program['media'];
  models: {
    original: string;
    target: string;
    motions?: unknown;
    references?: Record<string, unknown>;
  }[];
  extraFiles?: PjskFile[];
  issueResolutions?: { kind: string; reference: string; locations: number[] }[];
}
