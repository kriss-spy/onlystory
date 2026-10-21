import type { BaProgram } from './types';
import { canonicalBaScriptLine } from './script';

/** Paragraph captions are manual stops; serial captions retain cinematic timing. */
export function isBaScreenTextStep(program: BaProgram, nodeId: string) {
  const row = program.steps.find((step) => step.id === nodeId)?.rows.at(-1);
  return (
    !!row?.TextJp.trim() &&
    row.ScriptKr.split('\n').some((line) => {
      const script = canonicalBaScriptLine(line);
      return (
        /^#(?:st|stm|str);/.test(script) &&
        script.split(';')[2]?.trim().toLowerCase() !== 'serial'
      );
    })
  );
}
