import corrections from './source-corrections.json' with { type: 'json' };

export function applyBaSourceCorrections<
  T extends { GroupId: number; content: { ScriptKr: string }[] },
>(source: T): T {
  const scoped = corrections.filter(
    (correction) => correction.group === source?.GroupId,
  );
  if (!scoped.length) return source;
  const copy = structuredClone(source);
  for (const correction of scoped) {
    const row = copy.content[correction.row];
    if (!row)
      throw new Error(
        `BA correction row missing: ${correction.group}:${correction.row}`,
      );
    if (row.ScriptKr.includes(correction.from))
      row.ScriptKr = row.ScriptKr.replace(correction.from, correction.to);
    else if (!row.ScriptKr.includes(correction.to))
      throw new Error(
        `BA correction source changed: ${correction.group}:${correction.row}`,
      );
  }
  return copy;
}
export function baSourceCorrections(group: number) {
  return corrections.filter((correction) => correction.group === group);
}
