import knownGaps from './source-gaps.json' with { type: 'json' };

export interface BaSourceGap {
  group: number;
  row: number;
  field:
    'BGName' | 'BGEffect' | 'Sound' | 'TextJp' | 'Character' | 'ActorEffect';
  value: number | string;
  reason: string;
}
export const baSourceGaps = (group: number) =>
  knownGaps.filter((gap) => gap.group === group) as BaSourceGap[];
export const matchingBaSourceGap = (
  gaps: readonly BaSourceGap[] | undefined,
  group: number | undefined,
  row: number,
  field: string,
  value: number | string,
) =>
  gaps?.find(
    (gap) =>
      gap.group === group &&
      gap.row === row &&
      gap.field === field &&
      gap.value === value,
  );

export function validateBaSourceGaps(
  source: { GroupId: number; content: Record<string, unknown>[] },
  declared: readonly BaSourceGap[] = [],
) {
  for (const gap of declared) {
    const allowed = baSourceGaps(source.GroupId).find(
      (known) =>
        known.row === gap.row &&
        known.field === gap.field &&
        known.value === gap.value &&
        known.reason === gap.reason &&
        known.group === gap.group,
    );
    const present =
      gap.field === 'Character'
        ? source.content[gap.row]?.ScriptKr?.toString()
            .split('\n')
            .some(
              (line) =>
                /^[1-5];/.test(line) && line.split(';')[1] === gap.value,
            )
        : gap.field === 'ActorEffect'
          ? source.content[gap.row]?.ScriptKr?.toString()
              .split('\n')
              .some((line) => {
                const parts = line.trim().split(';');
                return (
                  /^#[1-5]$/.test(parts[0]) &&
                  parts[1] === 'fx' &&
                  parts[2] === gap.value
                );
              })
          : source.content[gap.row]?.[gap.field] === gap.value;
    if (!allowed || !present)
      throw new Error(
        `Unsupported BA source-gap declaration: ${gap.group}:${gap.row} ${gap.field}`,
      );
  }
}

export function baSoundForRow(
  row: { GroupId?: number; row: number; Sound: string },
  assets: { sourceGaps?: readonly BaSourceGap[] },
) {
  return matchingBaSourceGap(
    assets.sourceGaps,
    row.GroupId,
    row.row,
    'Sound',
    row.Sound,
  )
    ? ''
    : row.Sound;
}
