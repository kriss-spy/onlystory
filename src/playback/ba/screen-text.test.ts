import { describe, expect, it } from 'vitest';
import { isBaScreenTextStep } from './screen-text';
import type { BaProgram, BaRow } from './types';
const row = (ScriptKr: string, TextJp: string) =>
  ({ ScriptKr, TextJp }) as BaRow;
const program = (...rows: BaRow[]) =>
  ({ steps: [{ id: 'passage', rows }] }) as BaProgram;
describe('manual screen-text stops', () => {
  it('preserves the timing of serial cinematic captions', () => {
    expect(
      isBaScreenTextStep(
        program(row('#stm;[0,75];serial;85;', 'opening')),
        'passage',
      ),
    ).toBe(false);
    expect(
      isBaScreenTextStep(
        program(row('#stm;[0,75];Serial;85;', 'opening')),
        'passage',
      ),
    ).toBe(false);
  });
  it('recognizes a paragraph after its leading pause', () => {
    expect(
      isBaScreenTextStep(
        program(
          row('#wait;1500', ''),
          row('#STM;[0,500];smooth;64;', 'paragraph'),
        ),
        'passage',
      ),
    ).toBe(true);
  });
  it('keeps ordinary dialogue timing after a blank caption clearing command', () => {
    expect(
      isBaScreenTextStep(
        program(
          row('#st;[0,0];instant;1;', ''),
          row('#1;em;normal;', 'spoken dialogue'),
        ),
        'passage',
      ),
    ).toBe(false);
    expect(
      isBaScreenTextStep(program(row('#st;[0,0];instant;1;', '')), 'passage'),
    ).toBe(false);
  });
});
