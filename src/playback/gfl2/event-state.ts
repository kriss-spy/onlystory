import type { Command } from './types';
import type { EventProgram, SceneState, VisualLayer } from './event-types';
import { isHologramEffect } from './effect-assets';

const number = (text: string | undefined, fallback = 0) => {
  if (!text?.trim()) return fallback;
  const value = Number(text);
  return Number.isFinite(value) ? value : fallback;
};
const positive = (text: string | undefined, fallback = 0) =>
  Math.max(0, number(text, fallback));

// The shipped event needs arithmetic assignments and &name references only.
// Keep this parser independent of JavaScript and of browser globals.
function arithmetic(
  expression: string,
  params: Record<string, number>,
): number {
  const tokens =
    expression.match(/(?:\d+(?:\.\d*)?|\.\d+)|[A-Za-z_]\w*|[()+*/-]/g) || [];
  if (tokens.join('') !== expression.replace(/\s/g, ''))
    throw Error('Invalid expression');
  let index = 0;
  const atom = (): number => {
    const token = tokens[index++];
    if (token === '-') return -atom();
    if (token === '+') return atom();
    if (token === '(') {
      const value = sum();
      if (tokens[index++] !== ')') throw Error('Missing parenthesis');
      return value;
    }
    if (token && /^[A-Za-z_]/.test(token)) {
      if (!Object.hasOwn(params, token))
        throw Error(`Unknown parameter ${token}`);
      return params[token];
    }
    if (!token || !/^(?:\d|\.)/.test(token)) throw Error('Missing operand');
    return Number(token);
  };
  const product = (): number => {
    let value = atom();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const operator = tokens[index++];
      const right = atom();
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const operator = tokens[index++];
      const right = product();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };
  const value = sum();
  if (index !== tokens.length) throw Error('Unexpected expression suffix');
  return value;
}

function initial(): SceneState {
  return {
    layers: [],
    music: null,
    ambience: [],
    shots: [],
    audioStops: [],
    audioVolumes: [],
    soundVolumes: {},
    layerOrders: {},
    zoom: { scale: 1, x: 0, y: 0, duration: 0, delay: 0 },
    params: {},
    warnings: [],
  };
}

const blankPattern = [{ name: 'Idle', at: 0 }];
function patterns(text: string, delay: number): VisualLayer['pattern'] {
  if (!text) return structuredClone(blankPattern);
  return text
    .split('|')
    .filter(Boolean)
    .map((part) => {
      const [name, time] = part.split(',');
      return { name, at: delay + positive(time) };
    });
}

function matches(layer: VisualLayer, target: string): boolean {
  if (target === 'All') return true;
  if (target === 'AllBgLayers' || target === 'AllBgObjects')
    return layer.kind === 'background';
  if (target === 'AllCharacterLayers' || target === 'AllCharacterObjects')
    return layer.kind === 'character';
  return layer.id === target || layer.layer === target;
}

/** Compile source command state at each dialogue boundary, without replaying effects. */
export function buildPathTimeline(
  program: EventProgram,
  path: string[],
): SceneState[] {
  if (!program.steps.some((s) => s.incoming)) return buildTimeline(program);
  const byId = new Map(
    program.steps.map((s, i) => [s.id, { step: s, index: i }]),
  );
  const selected = path.map((id, i) => {
    const item = byId.get(id);
    if (!item) throw new Error(`Unknown scene passage ${id}`);
    const step = item.step;
    if (!step.incoming) return step;
    const previous = byId.get(path[i - 1])?.step;
    const commands =
      previous?.script === step.script
        ? step.incoming[previous.id]
        : step.entryCommands;
    if (!commands) throw new Error(`Missing scene edge to ${id}`);
    return { ...step, reset: previous?.script !== step.script, commands };
  });
  const visited = buildTimeline({ ...program, steps: selected });
  const result: SceneState[] = [];
  path.forEach((id, i) => {
    result[byId.get(id)!.index] = visited[i];
  });
  return result;
}

export function buildTimeline(program: EventProgram): SceneState[] {
  let state = initial();
  const timeline: SceneState[] = [];
  const retiring = new Set<string>();
  let addressedBackgrounds = new Set<string>();
  const warn = (command: Command, message: string) => {
    const text = `${command.sourceRow}: ${message}`;
    if (!state.warnings.includes(text)) state.warnings.push(text);
  };
  const resolveValue = (
    text: string,
    fallback: number,
    command: Command,
  ): number => {
    if (!text) return fallback;
    if (text.startsWith('&')) {
      const name = text.slice(1);
      if (Object.hasOwn(state.params, name)) return state.params[name];
      warn(command, `Unknown parameter ${name}`);
      return fallback;
    }
    return number(text, fallback);
  };
  const remove = (
    kind: VisualLayer['kind'],
    target: string,
    command: Command,
  ) => {
    for (const layer of state.layers.filter(
      (layer) => layer.kind === kind && (!target || matches(layer, target)),
    )) {
      const delay = positive(command.Arg7);
      state.removals!.push({
        id: layer.id,
        fade: positive(command.Arg6, 0.2),
        delay,
      });
      // Unity keeps a delayed outgoing object in its manager until the fade
      // starts. A same-batch Character command only updates it; it cannot redraw.
      if (delay > 0) retiring.add(`${kind}:${layer.id}`);
    }
    state.layers = state.layers.filter(
      (layer) =>
        layer.kind !== kind || (target !== '' && !matches(layer, target)),
    );
  };
  const draw = (command: Command, kind: VisualLayer['kind']) => {
    const id = command.Arg1;
    if (kind === 'character' && retiring.has(`${kind}:${id}`)) return;
    const asset =
      kind === 'sprite' || kind === 'particle' ? command.Arg2 || id : id;
    const layerName =
      command.Arg3 ||
      (kind === 'background'
        ? 'BgDefault'
        : kind === 'character'
          ? '中'
          : 'EffectLayer');
    const preset = program.layers[layerName];
    const existing = state.layers.find(
      (layer) => layer.id === id && layer.kind === kind,
    );
    if (kind === 'background' || kind === 'character') {
      state.layers = state.layers.filter(
        (layer) =>
          layer.id === id ||
          layer.kind !== kind ||
          layer.layer !== layerName ||
          (kind === 'background' && addressedBackgrounds.has(layer.id)),
      );
    }
    const fade = positive(command.Arg6, kind === 'particle' ? 0 : 0.2);
    const delay = positive(command.Arg7);
    const actor = program.characters[asset];
    const previousPattern = existing?.pattern.at(-1)?.name || 'Idle';
    const pattern =
      kind === 'character'
        ? patterns(command.Arg2 || previousPattern, delay)
        : [];
    const layer: VisualLayer = existing || {
      id,
      asset,
      kind,
      layer: layerName,
      pattern,
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      color: '#ffffff',
      darkness: 0,
      maskHeight: 1,
      order: state.layerOrders?.[layerName] ?? preset?.order ?? 0,
      sourceRow: command.sourceRow,
      fade,
      delay,
    };
    // Moving an existing actor to another layer resets its local offset.
    if (layer.layer !== layerName) {
      layer.x = 0;
      layer.y = 0;
    }
    layer.asset = asset;
    layer.layer = layerName;
    layer.order = state.layerOrders?.[layerName] ?? preset?.order ?? 0;
    layer.pattern = pattern;
    layer.x = number(command.Arg4, layer.x);
    layer.y = number(command.Arg5, layer.y);
    layer.fade = fade;
    layer.delay = delay;
    layer.sourceRow = command.sourceRow;
    if (kind === 'character') {
      const variant = actor?.variants[pattern[0]?.name];
      if (!existing) layer.maskHeight = variant?.maskHeight ?? layer.maskHeight;
      if (!actor) warn(command, `Missing character ${asset}`);
    } else if (kind === 'particle') {
      warn(
        command,
        `Unity particle ${asset} requires its original effect renderer`,
      );
    } else if (!program.backgrounds[asset])
      warn(command, `Missing graphic ${asset}`);
    if (!existing) state.layers.push(layer);
  };
  const apply = (command: Command) => {
    const target = command.Arg1;
    switch (command.Command) {
      case 'Bg':
        draw(command, 'background');
        break;
      case 'Character':
        draw(command, 'character');
        break;
      case 'Sprite':
        draw(command, 'sprite');
        break;
      case 'Particle':
        draw(command, 'particle');
        break;
      case 'CustomCharacter':
        warn(
          command,
          `Custom character ${target} has no recovered CharacterSetting graphic`,
        );
        break;
      case 'SetTrigger':
      case 'PlayCharAnim':
        warn(
          command,
          `Unity animation ${target}:${command.Arg2} requires its original animation controller`,
        );
        break;
      case 'LayerSortingOrder': {
        const order = Number(command.Arg2);
        if (
          !program.layers[target] ||
          !command.Arg2.trim() ||
          !Number.isInteger(order)
        ) {
          warn(
            command,
            `Invalid layer sorting order ${target}:${command.Arg2}`,
          );
          break;
        }
        state.layerOrders![target] = order;
        for (const layer of state.layers.filter(
          (layer) => layer.layer === target,
        ))
          layer.order = order;
        break;
      }
      case 'BgOff':
        remove('background', target, command);
        break;
      case 'CharacterOff':
        remove('character', target, command);
        break;
      case 'SpriteOff':
        remove('sprite', target, command);
        break;
      case 'ParticleOff':
        remove('particle', target, command);
        break;
      case 'ChangeLayer': {
        const layer = state.layers.find((layer) => layer.id === target);
        if (!layer) {
          warn(command, `Missing layer target ${target}`);
          break;
        }
        const from = program.layers[layer.layer];
        const to = program.layers[command.Arg3];
        if (!to) {
          warn(command, `Unknown destination layer ${command.Arg3}`);
          break;
        }
        if (!command.Arg2 || command.Arg2 === 'KeepGlobal') {
          layer.x += (from?.x ?? 0) - to.x;
          layer.y += (from?.y ?? 0) - to.y;
        } else if (command.Arg2 === 'ResetLocal') {
          layer.x = 0;
          layer.y = 0;
        } else if (command.Arg2 !== 'KeepLocal')
          warn(command, `Unknown reposition mode ${command.Arg2}`);
        layer.layer = command.Arg3;
        layer.order = state.layerOrders?.[command.Arg3] ?? to.order;
        layer.fade = positive(command.Arg6, 0.2);
        layer.delay = positive(command.Arg7);
        layer.sourceRow = command.sourceRow;
        break;
      }
      case 'Param': {
        const match = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(target);
        try {
          if (!match) throw Error('Invalid assignment');
          state.params[match[1]] = arithmetic(match[2], state.params);
        } catch {
          warn(command, `Unsupported parameter assignment ${target}`);
        }
        break;
      }
      case 'ZoomCamera': {
        const scale = resolveValue(command.Arg2, state.zoom.scale, command);
        if (!(scale > 0) || !Number.isFinite(scale)) {
          warn(command, 'Invalid camera zoom');
          break;
        }
        const x = resolveValue(command.Arg3, state.zoom.x, command);
        const y = resolveValue(command.Arg4, state.zoom.y, command);
        state.zoom = {
          scale,
          x: Number.isFinite(x) ? x : 0,
          y: Number.isFinite(y) ? y : 0,
          duration: positive(command.Arg6, 0.2),
          delay: positive(command.Arg7),
        };
        break;
      }
      case 'Bgm':
        state.music = { label: target, command: structuredClone(command) };
        if (!program.audio[target]) warn(command, `Missing audio ${target}`);
        break;
      case 'StopBgm':
        state.audioStops!.push(structuredClone(command));
        state.music = null;
        break;
      case 'Se': {
        const cue = { label: target, command: structuredClone(command) };
        if (command.Arg2.toLowerCase() === 'true' || command.Arg2 === '1') {
          state.ambience = state.ambience.filter((cue) => cue.label !== target);
          state.ambience.push(cue);
        } else state.shots.push(cue);
        if (!program.audio[target]) warn(command, `Missing audio ${target}`);
        break;
      }
      case 'StopSe':
        state.audioStops!.push(structuredClone(command));
        state.ambience = state.ambience.filter(
          (cue) => !!target && cue.label !== target,
        );
        state.shots = state.shots.filter(
          (cue) => !!target && cue.label !== target,
        );
        break;
      case 'ChangeSoundVolume': {
        const groups =
          target === 'All'
            ? ['Bgm', 'Ambience', 'Se', 'Voice']
            : target.split(',').map((group) => group.trim());
        if (!command.Arg2.trim() || !Number.isFinite(Number(command.Arg2))) {
          warn(command, `Invalid sound volume ${command.Arg2}`);
          break;
        }
        // Label changes affect existing players only, not future plays of a cue.
        if (command.Arg3 && target !== 'All') {
          if (groups.length !== 1) {
            warn(
              command,
              'A labeled volume change requires exactly one sound group',
            );
            break;
          }
          state.audioVolumes!.push(structuredClone(command));
          const cues =
            groups[0] === 'Bgm'
              ? state.music
                ? [state.music]
                : []
              : groups[0] === 'Se'
                ? [...state.ambience, ...state.shots]
                : [];
          for (const cue of cues.filter((cue) =>
            cue.label.includes(command.Arg3),
          ))
            cue.volume = structuredClone(command);
        } else {
          for (const group of groups) {
            if (!['Bgm', 'Ambience', 'Se', 'Voice'].includes(group)) {
              warn(command, `Unknown sound group ${group}`);
              continue;
            }
            state.soundVolumes![group] = structuredClone(command);
          }
        }
        break;
      }
      case 'Tween': {
        const layers = state.layers.filter((layer) => matches(layer, target));
        if (!layers.length) {
          warn(command, `Missing tween target ${target}`);
          break;
        }
        const args: Record<string, number | boolean> = {};
        for (const pair of command.Arg3.trim().split(/\s+/).filter(Boolean)) {
          const match = /^(\w+)=(.+)$/.exec(pair);
          if (!match) {
            warn(command, `Unsupported tween option ${pair}`);
            continue;
          }
          if (match[1] === 'islocal')
            args.islocal = match[2].toLowerCase() === 'true';
          else
            try {
              args[match[1]] = arithmetic(match[2], state.params);
            } catch {
              warn(command, `Unsupported tween value ${pair}`);
            }
        }
        const loop = command.Arg5 ? number(command.Arg5.split('=')[1], 1) : 1;
        for (const layer of layers) {
          const x = typeof args.x === 'number' ? args.x : undefined;
          const y = typeof args.y === 'number' ? args.y : undefined;
          const preset = program.layers[layer.layer];
          switch (command.Arg2) {
            case 'MoveTo':
              if (x !== undefined)
                layer.x = args.islocal ? x : x - (preset?.x ?? 0);
              if (y !== undefined)
                layer.y = args.islocal ? y : y - (preset?.y ?? 0);
              break;
            case 'ScaleTo':
              if (x !== undefined) layer.scaleX = x;
              if (y !== undefined) layer.scaleY = y;
              break;
            case 'ColorTo':
              if (typeof args.alpha === 'number')
                layer.alpha = Math.min(1, Math.max(0, args.alpha));
              break;
            case 'ScaleFrom':
            case 'PunchPosition':
            case 'ShakePosition':
              break;
            default:
              warn(command, `Unsupported tween ${command.Arg2}`);
          }
          layer.tween = {
            type: command.Arg2,
            args,
            ease: command.Arg4 || 'Linear',
            loop,
            sourceRow: command.sourceRow,
          };
        }
        break;
      }
      case 'TweenOff':
        for (const layer of state.layers.filter(
          (layer) => !target || matches(layer, target),
        )) {
          if (layer.tween?.loop === 0) delete layer.tween;
        }
        break;
      case 'SetShaderFloat':
      case 'SetShaderColor': {
        const layers = state.layers.filter((layer) => matches(layer, target));
        if (!layers.length) warn(command, `Missing shader target ${target}`);
        for (const layer of layers) {
          if (command.Command === 'SetShaderColor')
            layer.color = command.Arg4 || '#ffffff';
          else {
            const value = number(command.Arg4);
            layer.shaders = { ...layer.shaders, [command.Arg2]: value };
            if (command.Arg2 === '_DarkRampMask') layer.darkness = value;
            else if (command.Arg2 === '_MaskHeight') layer.maskHeight = value;
          }
        }
        break;
      }
      case 'AddEffect':
        for (const layer of state.layers.filter((layer) =>
          matches(layer, target),
        )) {
          layer.effect = command.Arg2 || undefined;
          layer.effectDelay = positive(command.Arg7);
          layer.effectRow = command.sourceRow;
        }
        if (command.Arg2 && !isHologramEffect(command.Arg2))
          warn(
            command,
            `Unity effect ${command.Arg2} requires its original effect renderer`,
          );
        break;
      case 'Text':
      case 'Wait':
      case 'ChangeMessageWindow':
      case 'AutoPlay':
      case 'EndScenario':
        break;
      default:
        warn(command, `Unsupported command ${command.Command}`);
    }
  };
  for (const step of program.steps) {
    // Several transparent CG pieces share a layer and are then shaded
    // individually. A later draw must not discard those explicit targets.
    addressedBackgrounds = new Set(
      step.commands
        .filter((command) =>
          ['SetShaderFloat', 'SetShaderColor'].includes(command.Command),
        )
        .map((command) => command.Arg1),
    );
    state = step.reset ? initial() : structuredClone(state);
    state.shots = [];
    state.removals = [];
    retiring.clear();
    state.audioStops = [];
    state.audioVolumes = [];
    state.warnings = [];
    for (const layer of state.layers) {
      const last = layer.pattern.at(-1);
      layer.pattern = last ? [{ name: last.name, at: 0 }] : [];
      layer.fade = 0;
      layer.delay = 0;
      if (layer.tween?.loop !== 0) delete layer.tween;
    }
    for (const command of step.commands) apply(command);
    timeline.push(structuredClone(state));
    // Source-book trailing commands affect subsequent state, never this text.
    for (const command of step.exit || []) apply(command);
  }
  return timeline;
}
