// Compile the installed command graph without concatenating alternative paths.
import { presentation } from './gfl2-event.mjs';

export function compileBranches(commands, script, content, extra = []) {
  const labels = new Map(),
    passages = [],
    boundaries = new Map(),
    counts = {};
  const labelPattern = /^\*\*[A-Z0-9]+(?:,[A-Z0-9]+)*(?: Begin)?$/;
  let previousRow = -1;
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i],
      name = c.Command;
    if (!Number.isInteger(c.sourceRow) || c.sourceRow <= previousRow)
      throw Error(`${script}: unordered branch source rows`);
    previousRow = c.sourceRow;
    counts[name] = (counts[name] ?? 0) + 1;
    if (labelPattern.test(name)) {
      if (labels.has(name)) throw Error(`${script}: duplicate label ${name}`);
      labels.set(name, i);
    } else if (
      ![
        'Text',
        'Selection',
        'Jump',
        'EndScenario',
        'ChangeMessageWindow',
      ].includes(name) &&
      !presentation.has(name) &&
      !extra.includes(name)
    ) {
      throw Error(
        `${script}:${c.sourceRow}: unreviewed branch command ${name}`,
      );
    }
  }
  const localize = (c, speaker = true) => {
    if (!/^\d+$/.test(c.Text)) throw Error(`${script}: invalid text ${c.Text}`);
    const line = content.get(Number(c.Text));
    if (typeof line?.text !== 'string')
      throw Error(`${script}: missing text ${c.Text}`);
    const who =
      speaker && /^\d+$/.test(c.Arg1) ? content.get(Number(c.Arg1)) : undefined;
    if (speaker && /^\d+$/.test(c.Arg1) && typeof who?.text !== 'string')
      throw Error(`${script}: missing speaker ${c.Arg1}`);
    return {
      id: `${script}:${c.sourceRow}`,
      text: line.text,
      textFemale: line.textFemale ?? line.text,
      speaker: who?.text ?? (speaker ? c.Arg1 : ''),
      speakerFemale: who?.textFemale ?? who?.text ?? (speaker ? c.Arg1 : ''),
      window: c.WindowType || 'AVGNarrator',
      source: {
        script,
        row: c.sourceRow,
        contentId: Number(c.Text),
        textId: line.textId,
        femaleTextId: line.femaleTextId ?? null,
        speakerContentId:
          speaker && /^\d+$/.test(c.Arg1) ? Number(c.Arg1) : null,
        speakerTextId: who?.textId ?? null,
        speakerFemaleTextId: who?.femaleTextId ?? null,
      },
    };
  };
  let window = 'AVGNarrator';
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (c.Command === 'ChangeMessageWindow') window = c.Arg1;
    if (c.Command === 'Text') {
      const p = {
        ...localize(c),
        window: c.WindowType || window,
        kind: 'text',
      };
      passages.push(p);
      boundaries.set(i, p);
    } else if (c.Command === 'Selection') {
      const options = [];
      const first = i;
      while (commands[i]?.Command === 'Selection') {
        const row = commands[i],
          localized = localize(row, false);
        if (!labels.has(row.Arg1))
          throw Error(`${script}: missing choice label ${row.Arg1}`);
        options.push({
          ...localized,
          id: row.Arg1,
          target: labels.get(row.Arg1),
        });
        i++;
      }
      i--;
      const p = {
        id: `${script}:${c.sourceRow}`,
        kind: 'choice',
        text: '',
        textFemale: '',
        speaker: '',
        speakerFemale: '',
        window,
        source: { script, row: c.sourceRow, contentId: 0 },
        choices: options,
      };
      passages.push(p);
      boundaries.set(first, p);
    }
  }
  function walk(start) {
    let pc = start;
    const seen = new Set(),
      trail = [];
    while (pc < commands.length) {
      if (boundaries.has(pc))
        return { to: boundaries.get(pc).id, commands: trail };
      if (seen.has(pc)) throw Error(`${script}: control-only loop at ${pc}`);
      seen.add(pc);
      const c = commands[pc];
      if (c.Command === 'EndScenario') return { to: null, commands: trail };
      if (c.Command === 'Jump') {
        if (!labels.has(c.Arg1))
          throw Error(`${script}: missing jump label ${c.Arg1}`);
        pc = labels.get(c.Arg1);
        continue;
      }
      if (c.Command === 'Selection')
        throw Error(`${script}: jump enters middle of choices`);
      if (!labelPattern.test(c.Command)) trail.push(c);
      pc++;
    }
    return { to: null, commands: trail };
  }
  const entry = walk(0),
    edges = [],
    exits = [];
  if (!entry.to || entry.to !== passages[0]?.id)
    throw Error(`${script}: invalid graph entry`);
  for (const [pc, p] of boundaries) {
    if (p.kind === 'choice') {
      for (const option of p.choices) {
        const edge = walk(option.target + 1);
        if (!edge.to) throw Error(`${script}: empty choice destination`);
        option.next = edge.to;
        delete option.target;
        edges.push({ from: p.id, ...edge });
      }
    } else {
      const edge = walk(pc + 1);
      p.next = edge.to;
      edges.push({ from: p.id, ...edge });
      if (!edge.to) exits.push(p.id);
    }
  }
  // Every source text and option must be reachable, including out-of-line branches.
  const reached = new Set(),
    queue = [entry.to];
  while (queue.length) {
    const id = queue.pop();
    if (reached.has(id)) continue;
    reached.add(id);
    queue.push(...edges.filter((e) => e.from === id && e.to).map((e) => e.to));
  }
  if (reached.size !== passages.length || !exits.length)
    throw Error(`${script}: unreachable text or no reachable ending`);
  return {
    script,
    passages,
    commands,
    commandCounts: counts,
    flow: { entry, edges, exits },
  };
}
