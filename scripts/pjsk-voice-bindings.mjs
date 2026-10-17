import { readFileSync } from 'node:fs';
import { sha256 } from './pjsk-scenario.mjs';

const reviewed = JSON.parse(
  readFileSync(
    new URL('../docs/pjsk-voice-bindings.json', import.meta.url),
    'utf8',
  ),
).bindings;

export async function reviewedPjskVoice(
  pkg,
  reference,
  acquire,
  bindings = reviewed,
) {
  const matches = bindings.filter(
    (binding) =>
      binding.scenarioId === pkg.entry.scenarioId &&
      binding.originalReference === reference,
  );
  if (!matches.length) return null;
  if (matches.length !== 1) throw new Error('Ambiguous reviewed voice binding');
  const binding = matches[0];
  const sourceHash =
    pkg.report.sourceIdentity?.sourceSha256 ?? pkg.report.sources.at(-1).sha256;
  const cn = pkg.scenario.source.TalkData[binding.talkIndex];
  if (
    sourceHash !== binding.cnSha256 ||
    cn?.Body !== binding.evidence.cnBody ||
    !cn.Voices.some(
      (voice) =>
        voice.VoiceId === reference &&
        voice.Character2dId === binding.character2dId,
    ) ||
    JSON.stringify(cn.Motions) !== JSON.stringify(binding.evidence.motions)
  )
    throw new Error('CN dialogue does not match the reviewed voice binding');
  const original = await acquire(binding.jpSourceUrl);
  if (sha256(original.data) !== binding.jpSha256)
    throw new Error('JP source does not match the reviewed voice binding');
  const jp = JSON.parse(original.data).TalkData[binding.talkIndex];
  if (
    jp?.Body !== binding.evidence.jpBody ||
    !jp.Voices.some(
      (voice) =>
        voice.VoiceId === binding.resolvedReference &&
        voice.Character2dId === binding.character2dId,
    ) ||
    JSON.stringify(jp.Motions) !== JSON.stringify(cn.Motions)
  )
    throw new Error('JP dialogue does not match the reviewed voice binding');
  return binding;
}
