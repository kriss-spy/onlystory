import type { BaActor, BaAssets, BaRow, BaState } from './types';
import { resolveBaExpression } from './expressions';
import { canonicalBaScript, canonicalBaScriptLine } from './script';
import { parseBaText } from './markup';
import { matchingBaSourceGap } from './source-gaps';

export const initialBaState = (): BaState => ({
  background: 0,
  music: 999,
  actors: {},
  zoom: { x: 0, y: 0, size: 3000 },
  effect: 0,
  shake: false,
  captions: [],
  place: '',
  title: '',
  popup: '',
  globalFx: [],
});
export function applyBaRow(
  previous: BaState,
  row: BaRow,
  assets?: BaAssets,
): BaState {
  const state = structuredClone(previous);
  if (
    row.BGName &&
    !matchingBaSourceGap(
      assets?.sourceGaps,
      row.GroupId,
      row.row,
      'BGName',
      row.BGName,
    )
  )
    state.background = row.BGName;
  if (row.BGMId) state.music = row.BGMId;
  state.effect = matchingBaSourceGap(
    assets?.sourceGaps,
    row.GroupId,
    row.row,
    'BGEffect',
    row.BGEffect,
  )
    ? 0
    : row.BGEffect;
  state.shake = false;
  state.place = '';
  state.title = '';
  state.popup = row.PopupFileName ?? '';
  state.globalFx = [];
  // Camera effects end on an effect-free row. Wait/shake rows retain the
  // current framing, while a replacement background starts at its base frame.
  // Matches the pinned reference player's playEffect/removeZmc lifecycle.
  const script = canonicalBaScript(row.ScriptKr);
  if (
    (row.BGName && state.background === row.BGName) ||
    (!state.effect && !/^#(?:zmc|zmlt|wait|bgshake);?/m.test(script))
  )
    state.zoom = { x: 0, y: 0, size: 3000 };
  for (const actor of Object.values(state.actors)) {
    actor.highlight = false;
    actor.action = '';
    actor.emotion = '';
    actor.fx = '';
    actor.closeup = false;
    actor.silhouette = false;
    actor.whiteSilhouette = false;
    actor.signal = false;
  }
  for (const raw of row.ScriptKr.split('\n')) {
    const [command, a, b, ...rest] = canonicalBaScriptLine(raw).split(';');
    if (/^[1-5]$/.test(command)) {
      if (
        !assets?.characters[a] &&
        matchingBaSourceGap(
          assets?.sourceGaps,
          row.GroupId,
          row.row,
          'Character',
          a,
        )
      )
        continue;
      for (const actor of Object.values(state.actors))
        if (actor.position === Number(command) && actor.name !== a)
          actor.visible = false;
      const actor: BaActor = state.actors[a] ?? {
        name: a,
        position: Number(command),
        face: '',
        visible: true,
        highlight: false,
        closeup: false,
        action: '',
        emotion: '',
        fx: '',
        silhouette: false,
        whiteSilhouette: false,
        signal: false,
      };
      const expressions = assets?.characters[a]?.expressionNames;
      const resolution = expressions
        ? resolveBaExpression(b, expressions)
        : null;
      Object.assign(actor, {
        face: resolution
          ? resolution.mode === 'hold' || resolution.mode === 'unchanged'
            ? actor.face
            : resolution.animation
          : (b ?? actor.face),
        requestedFace: b,
        position: Number(command),
        visible: true,
        highlight: rest.length > 0,
      });
      state.actors[a] = actor;
    } else if (command === '#fx') {
      if (a === 'Shot_Center')
        state.globalFx.push({
          name: a,
          x: Number(b) || 0,
          y: Number(rest[0]) || 0,
        });
    } else if (command === '#all' && a?.toLowerCase() === 'hide') {
      for (const actor of Object.values(state.actors)) actor.visible = false;
    } else if (command === '#bgshake') state.shake = true;
    else if (command === '#zmc' || command === '#zmlt') {
      const [x, y] = (b ?? '0,0').split(',').map(Number);
      state.zoom = { x, y, size: Number(rest[0]) || 3000 };
    } else if (/^#[1-5]$/.test(command)) {
      const actor = Object.values(state.actors).find(
        (actor) => actor.position === Number(command.slice(1)) && actor.visible,
      );
      if (!actor) continue;
      if (['hide', 'd', 'dl', 'dr', 'falldownL', 'falldownR'].includes(a)) {
        actor.visible = false;
        actor.action = a;
      } else if (a === 'h') actor.highlight = true;
      else if (a === 'black') actor.silhouette = true;
      else if (a === 'white') actor.whiteSilhouette = true;
      else if (a === 'sig') actor.signal = true;
      else if (a === 'closeup') actor.closeup = true;
      else if (/^m[1-5]$/.test(a)) actor.position = Number(a.slice(1));
      else if (a === 'em') actor.emotion = b ?? '';
      else if (a === 'fx') actor.fx = b ?? '';
      else actor.action = a;
    }
    if (command === '#clearST') state.captions = [];
    if (command === '#place') state.place = row.TextJp;
    if (command === '#title' || command === '#nextepisode')
      state.title = row.TextJp.replace(/;/g, '\n');
    if (command === '#continued') state.title = row.TextJp || 'つづく';
    if (command === '#Ending') state.title = row.TextJp || 'おわり';
    if (command === '#st' || command === '#stm' || command === '#str') {
      const [x, y] = JSON.parse(a) as number[];
      state.captions.push({
        row: row.row,
        text: parseBaText(row.TextJp).text,
        pauses: parseBaText(row.TextJp).pauses,
        instant: b?.toLowerCase() === 'instant',
        x,
        y,
        size: Number(rest[0]) || 64,
        color: /\[FF6666\]/i.test(row.TextJp) ? '#ff6666' : '#fff',
        alignment:
          command === '#str' ? 'right' : command === '#stm' ? 'center' : 'left',
      });
    }
  }
  return state;
}
export function rowDelay(row: BaRow) {
  const script = canonicalBaScript(row.ScriptKr);
  const waits = [...script.matchAll(/#wait;(\d+)/g)].reduce(
    (n, m) => n + Number(m[1]),
    0,
  );
  const camera = /#(?:zmc|zmlt);move;[^;]+;[^;]+;(\d+)/.exec(script);
  const action =
    /#(?:[1-5]);(?:d|dl|dr|al|ar|hophop|stiff|shake|jump|falldownL|falldownR)\b/.test(
      script,
    )
      ? 600
      : /#[1-5];greeting\b/.test(script)
        ? 400
        : /#[1-5];a\b/.test(script)
          ? 250
          : 0;
  const shot = /;fx;\{shot\}/.test(script) ? 550 : 0;
  return Math.max(waits, Number(camera?.[1] ?? 0), action, shot);
}
