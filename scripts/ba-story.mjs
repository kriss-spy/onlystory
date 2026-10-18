// BA Archive data adapter. No upstream player implementation is used.
import { scriptNameHash } from './ba-script-name.mjs';
import { applyBaSourceCorrections } from '../src/playback/ba/source-corrections.ts';
import { parseBaText } from '../src/playback/ba/markup.ts';
import {
  canonicalBaScriptLine,
  canonicalBaScript,
} from '../src/playback/ba/script.ts';
import { baSourceGaps } from '../src/playback/ba/source-gaps.ts';
export const plainText = (text) => parseBaText(text).text;
const localized = (text) => ({ en: text, 'zh-CN': text, ja: text });
const fail = (message) => {
  throw new Error(`BA import: ${message}`);
};

const presentationCommands = new Set([
  'hidemenu',
  'showmenu',
  'hidetextbox',
  'wait',
  'all',
  'stm',
  'st',
  'clearST',
  'na',
  'place',
  'zmc',
  'zmlt',
  'bgshake',
  'fontsize',
  'title',
  'continued',
  'Ending',
  'video',
  'nextepisode',
  'str',
  'fx',
  'touch',
  'videons2',
  'timelineNS',
]);
const actorCommands = new Set([
  'a',
  'h',
  'greeting',
  'd',
  'em',
  'm5',
  'hophop',
  'm3',
  'dr',
  'shake',
  'stiff',
  'al',
  'm1',
  'm2',
  'm4',
  'hide',
  'fx',
  'ar',
  'dl',
  'closeup',
  'black',
  'jump',
  'falldownL',
  'falldownR',
  'falldownLAuto',
  'sig',
  'white',
]);

export function baScriptCommandSupported(command, action) {
  [command, action] = canonicalBaScriptLine(
    [command, action].filter((part) => part !== undefined).join(';'),
  ).split(';');
  return /^#[1-5]$/.test(command)
    ? actorCommands.has(action)
    : presentationCommands.has(command.slice(1));
}

export function compileStory(input, characters) {
  input = applyBaSourceCorrections(input);
  if (
    !Number.isSafeInteger(input?.GroupId) ||
    !Array.isArray(input.content) ||
    !input.content.length
  )
    fail('invalid source story');
  const group = input.GroupId;
  const rows = input.content;
  const names = new Map();
  const hashedNames = new Map();
  for (const c of characters?.DataList ?? []) {
    if (c.NameKR && c.NameJP) names.set(c.NameKR, c.NameJP);
    if (c.CharacterName && typeof c.NameJP === 'string')
      hashedNames.set(c.CharacterName, c.NameJP);
  }
  // Communication portraits use a prefix in ScriptKr, but share the base name.
  const nameOf = (name) =>
    hashedNames.get(scriptNameHash(name)) ??
    names.get(name) ??
    (name.startsWith('통신') ? names.get(name.slice(2)) : undefined) ??
    fail(`unresolved speaker ${name}`);
  const idOf = (row) => `${group}:${row}`;
  const nodes = [];
  const rowNodes = new Map();
  const rowKinds = [];
  const retainedCommands = {};
  for (const [index, row] of rows.entries()) {
    if (
      row.GroupId !== group ||
      typeof row.ScriptKr !== 'string' ||
      typeof row.TextJp !== 'string' ||
      !Number.isInteger(row.SelectionGroup) ||
      row.SelectionGroup < 0
    )
      fail(`invalid row ${index}`);
    // Control flow beyond observed selection groups is deliberately rejected.
    if (
      /#(?:jump|goto|label|if|else|endif|end|call|return)\b/i.test(row.ScriptKr)
    )
      fail(`unsupported control flow at row ${index}`);
    for (const line of row.ScriptKr.split('\n')
      .map(canonicalBaScriptLine)
      .filter(Boolean)) {
      const [command, action] = line.split(';');
      if (command.startsWith('#')) {
        if (!baScriptCommandSupported(command, action))
          fail(`unsupported command ${command};${action ?? ''} at ${index}`);
        const key = /^#[1-5]$/.test(command) ? `#actor;${action}` : command;
        retainedCommands[key] = (retainedCommands[key] ?? 0) + 1;
      } else if (!/^[1-5]$/.test(command) && !/^\[n?s\d*\]/.test(command))
        fail(`unsupported script syntax at ${index}`);
    }
    const normalizedScript = canonicalBaScript(row.ScriptKr);
    const video = /^#(?:video|videons2);/m.test(normalizedScript);
    const touch = /^#touch;/m.test(normalizedScript);
    const timeline = /^#timelineNS;/m.test(normalizedScript);
    const declaredTextGap = baSourceGaps(group).some(
      (gap) => gap.row === index && gap.field === 'TextJp',
    );
    let commandBranchEntry = false;
    if (
      row.SelectionGroup &&
      rows[index - 1]?.SelectionGroup !== row.SelectionGroup
    ) {
      let end = index;
      while (
        end < rows.length &&
        rows[end].SelectionGroup === row.SelectionGroup
      )
        end++;
      commandBranchEntry = rows
        .slice(index, end)
        .every((part) => !part.TextJp.trim());
    }
    if (!row.TextJp.trim() && !video) {
      if (/\[n?s\d*\]/.test(row.ScriptKr))
        fail(`untranslated choice/branch at row ${index}`);
      if (
        !declaredTextGap &&
        row.ScriptKr.split('\n')
          .map(canonicalBaScriptLine)
          .some((line) => {
            if (/^#st[mr]?;/.test(line))
              return (
                row.TextJp.length === 0 &&
                line.split(';').slice(4).join(';').trim() !== ''
              );
            if (/^[1-5];/.test(line))
              return !/^[.。…?？!！\s]*$/.test(
                line.split(';').slice(3).join(';'),
              );
            if (/^#na;/.test(line))
              return !/^[.。…\s]*$/.test(line.split(';').slice(-1)[0]);
            return /^#(?:place|title);/.test(line);
          })
      )
        fail(`untranslated dialogue at row ${index}`);
      if (!commandBranchEntry && !touch && !timeline) {
        rowKinds.push('command');
        continue;
      }
    }
    const selection = [...row.ScriptKr.matchAll(/^\[n?s(\d*)\]\s*(.+)$/gm)];
    let speaker = '';
    for (const line of row.ScriptKr.split('\n').map(canonicalBaScriptLine)) {
      const parts = line.split(';');
      if (parts[0] === '#na' && parts.length >= 3) speaker = nameOf(parts[1]);
      if (/^[1-5]$/.test(parts[0]) && parts.length >= 4)
        speaker = nameOf(parts[1]);
    }
    const node = {
      id: idOf(index),
      kind: video ? 'video' : selection.length ? 'choice' : 'text',
      speaker,
      text: localized(
        selection.length || timeline ? '' : plainText(row.TextJp),
      ),
      scene: {
        background: 'platform',
        actors: [],
        window: speaker ? 'dialogue' : 'narration',
        ...(parseBaText(row.TextJp).pauses.length
          ? { textPauses: parseBaText(row.TextJp).pauses }
          : {}),
        ...(commandBranchEntry || touch || timeline
          ? { autoAdvance: true, window: 'system' }
          : {}),
      },
      playerName: { token: '[USERNAME]', fallback: 'プレイヤー' },
      source: {
        script: String(group),
        row: index,
        contentId: group,
        index: nodes.length,
      },
    };
    if (selection.length) {
      const labels = [...row.TextJp.matchAll(/^\[n?s(\d*)\]\s*(.+)$/gm)];
      if (
        labels.length !== selection.length ||
        labels.some((l, i) => l[1] !== selection[i][1])
      )
        fail(`choice translation mismatch at ${index}`);
      node.choices = labels.map((label) => {
        const key = Number(label[1]);
        if (labels.filter((other) => other[1] === label[1]).length !== 1)
          fail(`duplicate selection group ${key} at ${index}`);
        return {
          id: `s${key}`,
          label: localized(plainText(label[2])),
          next: '',
        };
      });
    } else if (/\[n?s\d*\]/.test(row.TextJp))
      fail(`unmatched choice at ${index}`);
    nodes.push(node);
    rowNodes.set(index, node);
    rowKinds.push(
      commandBranchEntry || touch || timeline || (video && !row.TextJp.trim())
        ? 'command'
        : selection.length
          ? 'choice'
          : 'text',
    );
  }
  if (!nodes.length) fail('no Japanese passages');
  // A choice owns its immediately following response blocks. Nested prompts
  // return their exits to the containing branch, so sibling responses never run.
  const claimed = new Set();
  const parsedChoices = new Set();
  const connect = (tails, target) => {
    for (const tail of tails) tail.next = target;
  };
  function parseChoice(index) {
    const node = rowNodes.get(index);
    parsedChoices.add(index);
    if (node.choices.length === 1 && node.choices[0].id === 's0') {
      if (
        rows[index + 1]?.SelectionGroup !== rows[index].SelectionGroup &&
        rows[index + 1]?.SelectionGroup
      )
        fail(`unexpected response after single prompt at ${index}`);
      node.choices[0].next =
        nodes.find((n) => n.source.row > index)?.id ?? `${group}:end`;
      return { end: index + 1, tails: [] };
    }
    if (node.choices.some((c) => c.id === 's0'))
      fail(`mixed unnumbered choices at ${index}`);
    const allowed = new Set(node.choices.map((c) => Number(c.id.slice(1))));
    const starts = new Map();
    const tails = [];
    let cursor = index + 1;
    let remote = false;
    let furthest = cursor;
    if (
      rows[index].SelectionGroup &&
      node.choices.length === 1 &&
      !allowed.has(rows[cursor]?.SelectionGroup)
    ) {
      let search = cursor;
      while (
        search < rows.length &&
        rows[search].SelectionGroup !== 0 &&
        !allowed.has(rows[search].SelectionGroup)
      )
        search++;
      if (allowed.has(rows[search]?.SelectionGroup)) {
        cursor = search;
        remote = true;
      }
    }
    // Later events place command-only rows between a prompt and its responses.
    let probe = cursor;
    while (probe < rows.length && rows[probe].SelectionGroup === 0) probe++;
    if (probe > cursor && allowed.has(rows[probe]?.SelectionGroup)) {
      furthest = Math.max(furthest, probe);
      cursor = probe;
    }
    const seen = new Set();
    while (cursor < rows.length && allowed.has(rows[cursor].SelectionGroup)) {
      const key = rows[cursor].SelectionGroup;
      if (seen.has(key)) fail(`noncontiguous branch at ${cursor}`);
      let branchStart;
      let branchTails = [];
      while (cursor < rows.length && rows[cursor].SelectionGroup === key) {
        claimed.add(cursor);
        const passage = rowNodes.get(cursor);
        if (!passage) {
          cursor++;
          continue;
        }
        if (!branchStart) branchStart = passage.id;
        connect(branchTails, passage.id);
        if (
          passage.kind === 'choice' &&
          !(passage.choices.length === 1 && passage.choices[0].id === 's0')
        ) {
          const child = parseChoice(cursor);
          branchTails = child.tails;
          furthest = Math.max(furthest, child.remoteEnd);
          cursor = child.end;
        } else {
          // Single prompts also need a deferred continuation when they end a branch.
          if (passage.kind === 'choice') {
            parsedChoices.add(cursor);
            branchTails = [
              {
                set next(value) {
                  passage.choices[0].next = value;
                },
              },
            ];
          } else branchTails = [passage];
          cursor++;
        }
      }
      seen.add(key);
      if (branchStart) starts.set(key, branchStart);
      else {
        // A response branch that carries only commands continues at the join.
        const choice = node.choices.find(
          (candidate) => Number(candidate.id.slice(1)) === key,
        );
        tails.push({
          set next(value) {
            choice.next = value;
          },
        });
      }
      tails.push(...branchTails);
    }
    if (seen.size !== allowed.size) fail(`missing response branch at ${index}`);
    for (const choice of node.choices) {
      const target = starts.get(Number(choice.id.slice(1)));
      if (target) choice.next = target;
    }
    return {
      end: remote ? index + 1 : Math.max(cursor, furthest),
      remoteEnd: Math.max(cursor, furthest),
      tails,
    };
  }
  for (const [index, node] of rowNodes) {
    if (node.kind !== 'choice' || parsedChoices.has(index)) continue;
    const result = parseChoice(index);
    const join =
      nodes.find((n) => n.source.row >= result.end)?.id ?? `${group}:end`;
    connect(result.tails, join);
  }
  for (const [index, row] of rows.entries())
    if (row.SelectionGroup && !claimed.has(index))
      fail(`orphan response at ${index}`);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.kind !== 'choice' && !node.next)
      node.next = nodes[i + 1]?.id ?? `${group}:end`;
  }
  nodes.push({
    id: `${group}:end`,
    kind: 'end',
    speaker: '',
    text: localized(''),
    scene: { background: 'platform', actors: [], window: 'narration' },
  });
  return {
    version: 1,
    format: 'ba-text-v1',
    id: `ba-jp-${group}`,
    entryNodeId: nodes[0].id,
    nodes,
    coverage: {
      sourceRows: rows.length,
      textRows: rowKinds.filter((k) => k === 'text').length,
      choices: rowKinds.filter((k) => k === 'choice').length,
      commandRows: rowKinds.filter((k) => k === 'command').length,
    },
    retainedCommands,
    rows: rows.map((row, index) => ({
      row: index,
      kind: rowKinds[index],
      nodeId: rowNodes.get(index)?.id ?? null,
    })),
  };
}
