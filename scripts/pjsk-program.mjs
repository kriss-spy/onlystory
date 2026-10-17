const clone = (value) => structuredClone(value);

function layoutCostume(source, record, previous) {
  // Motion/depth commands address the current model. Their costume field is
  // not a model change (event_74_05 even contains a literal backslash here).
  if ([0, 6].includes(record.Type) && previous) return previous;
  return (
    record.CostumeType ||
    previous ||
    source.AppearCharacters.find(
      (actor) => actor.Character2dId === record.Character2dId,
    )?.CostumeType
  );
}

/** Native command order determines which costume owns each required track. */
export function collectPjskCostumes(source) {
  const active = new Map();
  const result = new Map();
  const tracks = (costume, record) => {
    if (!costume) return;
    let entry = result.get(costume);
    if (!entry)
      result.set(
        costume,
        (entry = {
          motions: new Set(),
          expressions: new Set(),
          characterIds: new Set(),
        }),
      );
    entry.characterIds.add(record.Character2dId);
    if (record.MotionName) entry.motions.add(record.MotionName);
    if (record.FacialName) entry.expressions.add(record.FacialName);
  };
  const layout = (record) => {
    const previous = active.get(record.Character2dId);
    const costume = layoutCostume(source, record, previous?.costume);
    const current = {
      ...record,
      costume,
      MotionName: record.MotionName || previous?.MotionName || '',
      FacialName: record.FacialName || previous?.FacialName || '',
    };
    active.set(record.Character2dId, current);
    tracks(costume, current);
  };
  for (const record of source.FirstLayout) layout({ ...record, Type: 2 });
  for (const snippet of source.Snippets) {
    if ([2, 4].includes(snippet.Action))
      layout(source.LayoutData[snippet.ReferenceIndex]);
    if (snippet.Action === 1)
      for (const motion of source.TalkData[snippet.ReferenceIndex].Motions) {
        const current = active.get(motion.Character2dId);
        if (!current) continue;
        current.MotionName = motion.MotionName || current.MotionName;
        current.FacialName = motion.FacialName || current.FacialName;
        tracks(current.costume, current);
      }
  }
  return result;
}

export const supportedPjskEffects = new Set([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23,
  24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42,
  43, 44,
]);

export function compilePjskEpisode(pkg, media) {
  const source = pkg.scenario.source;
  const scenarioId = pkg.entry.scenarioId ?? source.ScenarioId;
  if (
    source.FirstCharacterLayoutMode !== undefined &&
    ![0, 3].includes(source.FirstCharacterLayoutMode)
  )
    throw new Error('Unimplemented initial character layout mode.');
  if (
    pkg.scenario.issues.some(
      (issue) =>
        !(
          (issue.code === 'interaction-required' &&
            issue.value === 'SimpleSelectable') ||
          (issue.code === 'unknown-sound-mode' && [5, 6].includes(issue.value))
        ),
    )
  )
    throw new Error('Resolve source issues before publishing playback.');
  const state = {
    background: source.FirstBackground,
    music: source.FirstBgm,
    musicVolume: 1,
    bgmBlockIndex: 0,
    characters: {},
    curtain: { color: 'black', alpha: 0 },
    ambient: 'normal',
    flashback: false,
    memory: false,
    caption: '',
    fullscreen: false,
    layoutMode: source.FirstCharacterLayoutMode ?? 0,
    loopingSounds: {},
    characterShaders: {},
    characterBlur: {},
    scenarioEffects: [],
    camera: { x: 0, y: 0, zoom: 1 },
    blur: false,
  };
  const position = (side, offset = 0) => {
    const left = state.layoutMode === 3 ? 320 : 380;
    const right = state.layoutMode === 3 ? 960 : 900;
    return {
      x:
        ({
          2: -640,
          3: left,
          4: 640,
          6: 1920,
          7: right,
          9: left,
          10: 640,
          12: right,
        }[side] ?? 640) +
        offset * (1280 / 1920),
      y: [9, 10, 12].includes(side) ? 735 : 15,
    };
  };
  const layout = (record) => {
    if (
      record.Type !== 0 &&
      [record.SideFrom, record.SideTo].some(
        (side) =>
          side !== undefined && ![0, 2, 3, 4, 6, 7, 9, 10, 12].includes(side),
      )
    )
      throw new Error('Unimplemented character layout position.');
    const key = String(record.Character2dId);
    const previous = state.characters[key];
    const costume = layoutCostume(source, record, previous?.costume);
    if (!costume || !media.models[costume])
      throw new Error(`Missing costume for character ${key}`);
    const preservePosition = [0, 6].includes(record.Type);
    const to = preservePosition
      ? { x: previous?.x ?? 640, y: previous?.y ?? 15 }
      : position(record.SideTo, record.SideToOffsetX);
    const from =
      record.Type === 2
        ? position(record.SideFrom, record.SideFromOffsetX)
        : { x: previous?.x ?? 640, y: previous?.y ?? 15 };
    state.characters[key] = {
      id: record.Character2dId,
      costume,
      visible:
        record.Type === 2
          ? true
          : record.Type === 3
            ? false
            : (previous?.visible ?? false),
      x: to.x,
      y: to.y,
      fromX: from.x,
      fromY: from.y,
      depth: record.DepthType ?? previous?.depth ?? 0,
      motion: record.MotionName || previous?.motion || '',
      expression: record.FacialName || previous?.expression || '',
    };
  };
  for (const item of source.FirstLayout)
    layout({
      ...item,
      Type: 2,
      SideFrom: item.PositionSide,
      SideTo: item.PositionSide,
      SideToOffsetX: item.OffsetX,
    });
  const steps = [];
  let before = clone(state),
    commands = [];
  function sound(record) {
    if (![0, 2, 3, 4, 5, 6].includes(record.PlayMode))
      throw new Error(`Unimplemented sound mode ${record.PlayMode}`);
    if (record.PlayMode === 5) {
      state.bgmControl = {
        mode: 5,
        bgm: record.Bgm,
        volume: record.Volume,
        duration: record.Duration ?? 0,
      };
      return;
    }
    if (record.PlayMode === 4) state.musicVolume = record.Volume;
    else if (record.Bgm) {
      state.music = record.Bgm;
      state.musicVolume = record.Volume;
    }
    if (record.PlayMode === 6) {
      if (!Number.isInteger(record.BgmBlockIndex) || record.BgmBlockIndex < 0)
        throw new Error('Invalid BGM block index');
      state.bgmBlockIndex = record.BgmBlockIndex;
    }
    if (record.Se && record.PlayMode === 2)
      state.loopingSounds[record.Se] = record.Volume ?? 1;
    if (record.Se && record.PlayMode === 3)
      delete state.loopingSounds[record.Se];
  }
  function effect(record) {
    if (record.EffectType === 37) {
      if (!media.performances?.[record.IntVal]?.url)
        throw new Error('Missing original song performance audio');
      return;
    }
    const type = record.EffectType;
    if (type === 19) {
      if (!record.StringVal) throw new Error('Missing movie reference');
      return;
    }
    if (type === 23) {
      const choices = record.StringVal?.split('/').map((text) => text.trim());
      if (!choices || choices.length < 2 || choices.some((text) => !text))
        throw new Error('Invalid dialogue choices');
      return;
    }
    if (!supportedPjskEffects.has(type))
      throw new Error(`Unimplemented PJSK effect ${type}`);
    if ([1, 2, 3, 4, 20, 21, 38, 39].includes(type))
      state.curtain = {
        color: [3, 4, 20, 21].includes(type) ? 'white' : 'black',
        alpha: [2, 4, 21, 38].includes(type) ? 1 : 0,
      };
    if (type === 7) state.background = record.StringValSub || record.StringVal;
    if (type === 9) state.flashback = true;
    if (type === 10) state.flashback = false;
    if ([12, 13, 14].includes(type))
      state.ambient = { 12: 'normal', 13: 'evening', 14: 'night' }[type];
    if ([8, 18].includes(type)) state.caption = record.StringVal;
    if (type === 38 || type === 24) state.fullscreen = true;
    if (type === 39) state.fullscreen = false;
    if (type === 22) {
      if (
        !['hologram', 'monitor', 'blur', 'none', ''].includes(record.StringVal)
      )
        throw new Error(`Unimplemented character shader ${record.StringVal}`);
      state.characterShaders[String(record.IntVal)] = [
        'hologram',
        'monitor',
        'blur',
      ].includes(record.StringVal)
        ? record.StringVal
        : '';
      if (record.StringVal === 'blur') {
        const strength = Number(record.StringValSub);
        if (!Number.isFinite(strength) || strength < 0)
          throw new Error('Invalid character blur strength');
        state.characterBlur[String(record.IntVal)] = strength;
      }
    }
    if ([15, 16].includes(type)) {
      if (
        ![
          'line',
          'dash_line_l',
          'dash_line_r',
          'black_out_02',
          'bug_02_c',
          'bug_02_l',
          'bug_02_r',
          'rain_07',
          'still_kanade_nig14_01',
          'still_mizuki_nig19_01',
          'still_ena_nig19_01',
          'eye_close_quick_01',
          'light_up_legend_02',
        ].includes(record.StringVal) &&
        record.EffectType !== 16 &&
        !media.effectAssets?.[record.StringVal]?.textures?.length &&
        !media.effects?.[record.StringVal]
      )
        throw new Error(`Unimplemented scenario overlay ${record.StringVal}`);
      state.scenarioEffects = state.scenarioEffects.filter(
        (name) => name !== record.StringVal,
      );
      if (type === 15) state.scenarioEffects.push(record.StringVal);
    }
    if ([29, 30, 31, 32, 33, 34, 35, 36].includes(type))
      state.curtain = {
        color: 'black',
        alpha: [30, 32, 34, 36].includes(type) ? 1 : 0,
        wipe: {
          29: 'right',
          30: 'left',
          31: 'left',
          32: 'right',
          33: 'bottom',
          34: 'top',
          35: 'top',
          36: 'bottom',
        }[type],
      };
    if (type === 27) state.memory = true;
    if (type === 28) state.memory = false;
    if ([40, 41].includes(type))
      state.curtain = { color: 'white', alpha: type === 41 ? 1 : 0 };
    if (type === 42) {
      const parts = record.StringVal.split(',').map(Number);
      if (parts.length !== 2 || parts.some((value) => !Number.isFinite(value)))
        throw new Error('Invalid camera position');
      state.camera.x = parts[0] * (1280 / 1920);
      state.camera.y = parts[1] * (720 / 1080);
    }
    if (type === 43) {
      const zoom = Number(record.StringVal);
      if (!Number.isFinite(zoom) || zoom <= 0)
        throw new Error('Invalid camera zoom');
      state.camera.zoom = zoom;
    }
    if (type === 44) {
      if (!['true', 'false'].includes(record.StringVal))
        throw new Error('Invalid blur toggle');
      state.blur = record.StringVal === 'true';
    }
  }
  function addStep(index, record, kind = 'text') {
    steps.push({
      id: `${scenarioId}:${index}`,
      index,
      kind,
      ...(kind === 'choice'
        ? { choices: record.StringVal.split('/').map((text) => text.trim()) }
        : {}),
      ...(kind === 'video' && record.EffectType === 19
        ? { movie: record.StringVal }
        : {}),
      ...(kind === 'video' && record.EffectType === 37
        ? { performance: record.IntVal }
        : {}),
      speaker: record.WindowDisplayName ?? '',
      text: record.Body ?? record.StringVal ?? '',
      voices:
        record.Voices ??
        (record.StringValSub
          ? [{ VoiceId: record.StringValSub, Volume: 1 }]
          : []),
      before,
      after: clone(state),
      commands,
    });
    before = clone(state);
    commands = [];
  }
  for (const item of pkg.scenario.timeline) {
    const { snippet, record, index } = item;
    if (![0, 1, 2, 4, 6, 7, 8].includes(snippet.Action))
      throw new Error(`Unimplemented action ${snippet.Action}`);
    let duration = 0;
    const effects = [];
    const sounds = [];
    if ([2, 4].includes(snippet.Action)) {
      if (![0, 1, 2, 3, 6].includes(record.Type))
        throw new Error(`Unimplemented layout ${record.Type}`);
      layout(record);
      duration = [0.65, 0.4, 0.2][record.MoveSpeedType] ?? 0.4;
    }
    if (snippet.Action === 8) {
      if (![0, 3].includes(record.CharacterLayoutMode))
        throw new Error(
          `Unimplemented character layout mode ${record.CharacterLayoutMode}`,
        );
      state.layoutMode = record.CharacterLayoutMode;
    }
    if (snippet.Action === 6) {
      effect(record);
      effects.push(record);
      duration = record.Duration || 0;
    }
    if (snippet.Action === 7) {
      sound(record);
      sounds.push(record);
      duration = record.Duration || 0;
    }
    if (snippet.Action === 1) {
      if (record.Voices.length > 1)
        throw new Error('Unimplemented overlapping dialogue voices.');
      if (record.RequirePlayEffect) {
        const inline = source.SpecialEffectData[record.EffectReferenceIdx];
        effect(inline);
        effects.push(inline);
      }
      if (record.RequirePlaySound) {
        const inline = source.SoundData[record.SoundReferenceIdx];
        sound(inline);
        sounds.push(inline);
      }
      for (const motion of record.Motions) {
        const character = state.characters[String(motion.Character2dId)];
        if (character) {
          character.motion = motion.MotionName || character.motion;
          character.expression = motion.FacialName || character.expression;
        }
      }
    }
    commands.push({
      index,
      action: snippet.Action,
      delay: snippet.Delay,
      wait: snippet.ProgressBehavior === 1,
      duration,
      record,
      effects,
      sounds,
      state: clone(state),
    });
    if (
      snippet.Action === 1 ||
      (snippet.Action === 6 && [19, 23, 24, 37].includes(record.EffectType))
    )
      addStep(
        index,
        record,
        [19, 37].includes(record.EffectType)
          ? 'video'
          : record.EffectType === 23
            ? 'choice'
            : 'text',
      );
  }
  addStep(
    source.Snippets.length,
    { Body: '本话结束', WindowDisplayName: '' },
    'end',
  );
  if (steps.length < 2) throw new Error('Episode has no dialogue.');
  return {
    version: 1,
    id: pkg.entry.id,
    scenarioId,
    title: pkg.entry.title,
    region: pkg.entry.region,
    steps,
    media,
    sourceHash:
      pkg.report.sourceIdentity?.sourceSha256 ??
      pkg.report.sources.at(-1).sha256,
    sourceCommands: source.Snippets.length,
  };
}
