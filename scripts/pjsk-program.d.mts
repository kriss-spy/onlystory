import type { Program } from '../src/playback/pjsk/types';
import type { StoryNode } from '../src/model';
export function compilePjskDownloadText(
  program: ReturnType<typeof compilePjskEpisode>,
  programUrl?: string,
): {
  format: string;
  id: string;
  nodes: StoryNode[];
  assets: string[];
};

export function compilePjskEpisode(
  pkg: {
    entry: { id: string; title: string; region: string; scenarioId: string };
    scenario: { source: unknown; issues: unknown[]; timeline: unknown[] };
    report: { sourceIdentity: { sourceSha256: string } };
  },
  media: Program['media'],
): Omit<Program, 'steps'> & {
  steps: (Program['steps'][number] & { voices: { VoiceId: string }[] })[];
};
