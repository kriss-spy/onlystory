import emotionNames from '../src/playback/ba/emotions.json' with { type: 'json' };
import emotionGaps from '../src/playback/ba/emotion-gaps.json' with { type: 'json' };
import expressionGaps from '../src/playback/ba/expression-gaps.json' with { type: 'json' };
import { resolveBaExpression } from '../src/playback/ba/expressions.ts';
import {
  matchingBaSourceGap,
  validateBaSourceGaps,
} from '../src/playback/ba/source-gaps.ts';
import {
  applyBaSourceCorrections,
  baSourceCorrections,
} from '../src/playback/ba/source-corrections.ts';
import backgroundEffects from '../src/playback/ba/background-effects.json' with { type: 'json' };
import { canonicalBaScriptLine } from '../src/playback/ba/script.ts';
import {
  emotionComposition,
  isDotEmotion,
} from '../src/playback/ba/emotion-composition.ts';

export function compileBaScenes(source, chapter, assets) {
  source = applyBaSourceCorrections(source);
  if (assets.version !== 1 || assets.region !== 'JP')
    throw new Error('Invalid JP asset manifest.');
  const characters = assets.characters;
  const warnings = [];
  validateBaSourceGaps(source, assets.sourceGaps);
  for (const [index, row] of source.content.entries()) {
    for (const gap of assets.sourceGaps ?? [])
      if (gap.row === index) warnings.push({ ...gap, type: 'source-gap' });
    for (const [key, collection] of [
      ['BGName', assets.backgrounds],
      ['Sound', assets.sounds],
      ['VoiceJp', assets.voices],
    ]) {
      if (
        row[key] &&
        !collection[row[key]] &&
        !matchingBaSourceGap(
          assets.sourceGaps,
          source.GroupId,
          index,
          key,
          row[key],
        )
      )
        throw new Error(`Missing BA ${key} at row ${index}: ${row[key]}`);
    }
    if (row.BGMId && row.BGMId !== 999 && !assets.music[row.BGMId])
      throw new Error(`Missing BA music at ${index}`);
    if (row.Transition && !assets.transitions[row.Transition])
      throw new Error(`Missing BA transition at ${index}`);
    if (row.Transition) {
      const transition = assets.transitions[row.Transition];
      for (const key of ['TransitionIn', 'TransitionOut'])
        if (
          !['', 'fade', 'fade_white', 'bgoverlap'].includes(transition[key]) &&
          !(
            ['1', '2', '9'].includes(transition[key]) &&
            /^Effect\/UI\/BGFX\/UI_FX_HorSwipe_(?:LtoR|RtoL|M)_(?:In|Out)$/.test(
              transition[key + 'Resource'] ?? '',
            )
          )
        )
          throw new Error(
            `Unsupported BA ${key} at ${index}: ${transition[key]}`,
          );
    }
    if (row.PopupFileName && !assets.popups?.[row.PopupFileName])
      throw new Error(
        `Missing BA popup image at ${index}: ${row.PopupFileName}`,
      );
    if (
      row.BGEffect &&
      !(row.BGEffect in backgroundEffects) &&
      !matchingBaSourceGap(
        assets.sourceGaps,
        source.GroupId,
        index,
        'BGEffect',
        row.BGEffect,
      )
    )
      throw new Error(
        `Unsupported BA background effect at ${index}: ${row.BGEffect}`,
      );
    if (row.BGEffect === 3134544579)
      for (const name of [
        'FX_TEX_Smoke_17',
        'BA_UnderFire_Fire1',
        'BA_UnderFire_Fire2',
        'BA_UnderFire_Fire3',
        'BA_UnderFire_HardRain',
      ])
        if (!assets.effects[name])
          throw new Error(`Missing UnderFire texture at ${index}: ${name}`);
    if (row.BGEffect === 3134544579 && !assets.sounds.UI_FX_BG_UnderFire)
      throw new Error(`Missing UnderFire sound at ${index}`);
    const video = /(?:^|\n)#(?:video|videons2);([^\n;]+)/i.exec(
      row.ScriptKr,
    )?.[1];
    if (video && !assets.videos?.[video])
      throw new Error(`Missing BA video at ${index}: ${video}`);
    const cutscene = /(?:^|\n)#timelineNS;([^\n;]+)/i.exec(row.ScriptKr)?.[1];
    if (cutscene) {
      const declared = assets.cutscenes?.[cutscene];
      if (!declared || declared.supported !== false || !declared.reason?.trim())
        throw new Error(
          `Missing BA cutscene capability declaration at ${index}: ${cutscene}`,
        );
      warnings.push({
        type: 'unsupported-cutscene',
        row: index,
        path: cutscene,
        reason: declared.reason,
      });
    }
    for (const line of row.ScriptKr.split('\n').map(canonicalBaScriptLine)) {
      if (/^[1-5];/.test(line)) {
        const actor = line.split(';')[1];
        if (
          !characters[actor] &&
          !matchingBaSourceGap(
            assets.sourceGaps,
            source.GroupId,
            index,
            'Character',
            actor,
          )
        )
          throw new Error(`Missing BA character at ${index}`);
      }
      const [command, action, value] = line.trim().split(';');
      if (
        command === '#fx' &&
        !['Shot_Center', 'AronaTouch', 'PlanaTouch'].includes(action)
      )
        throw new Error(`Unsupported BA scene effect at ${index}: ${action}`);
      const effectKeys =
        command === '#fx' && action === 'Shot_Center'
          ? ['FX_TEX_Hit_01']
          : /^#[1-5]$/.test(command) && action === 'fx' && value === 'nkultra'
            ? ['FX_TEX_Flare_03', 'FX_TEX_Noise_15']
            : /^#[1-5]$/.test(command) &&
                action === 'fx' &&
                value === 'nkultrabreak'
              ? [
                  'FX_TEX_Lightning_RGB_02a',
                  'FX_TEX_Circle_01',
                  'FX_TEX_Stretch_Scroll_06',
                ]
              : [];
      for (const key of effectKeys)
        if (!assets.effects?.[key])
          throw new Error(
            `Missing BA native effect texture at ${index}: ${key}`,
          );
      if (
        /^[1-5]$/.test(command) &&
        characters[action]?.expressionNames &&
        !characters[action].invisible
      ) {
        const asset = characters[action];
        const resolution = resolveBaExpression(value, asset.expressionNames);
        if (resolution.mode === 'hold') {
          if (
            !expressionGaps.some(
              (gap) =>
                gap.group === source.GroupId &&
                gap.row === index &&
                gap.model === asset.model &&
                gap.face === value,
            )
          )
            throw new Error(
              `Unsupported BA expression at ${index}: ${action} ${value}`,
            );
          warnings.push({
            row: index,
            character: action,
            model: asset.model,
            expression: value,
            behavior: 'keep-previous-expression',
            reason:
              'The authored expression is absent from the original packaged skeleton. Keep the preceding expression.',
          });
        }
      }
      if (/^#[1-5]$/.test(command)) {
        if (action === 'em' && !isDotEmotion(value)) {
          const sprite = emotionNames[value];
          if (!sprite) {
            if (
              !emotionGaps.some(
                (gap) =>
                  gap.group === source.GroupId &&
                  gap.row === index &&
                  gap.value === value,
              )
            )
              throw new Error(`Unsupported BA emotion at ${index}: ${value}`);
            warnings.push({
              row: index,
              character: action,
              expression: value,
              behavior: 'omit-unknown-emotion',
              reason:
                'The authored emoji label has no pinned original sprite mapping. Continue without this emoji.',
            });
          } else
            for (const piece of emotionComposition(sprite).pieces)
              if (!assets.emotions?.[piece.sprite])
                throw new Error(
                  `Missing BA emotion at ${index}: ${piece.sprite}`,
                );
        }
        if (
          action === 'fx' &&
          !['{shot}', 'nkultra', 'nkultrabreak'].includes(value)
        ) {
          if (
            !matchingBaSourceGap(
              assets.sourceGaps,
              source.GroupId,
              index,
              'ActorEffect',
              value,
            )
          )
            throw new Error(
              `Unsupported BA actor effect at ${index}: ${value}`,
            );
          warnings.push({
            row: index,
            character: action,
            expression: value,
            behavior: 'omit-unsupported-actor-effect',
            reason:
              'The authored actor effect has no reader implementation. Continue without this effect.',
          });
        }
      }
    }
  }
  const steps = compileBaSceneSteps(source, chapter);
  return {
    version: 1,
    id: chapter.id,
    steps,
    ...(chapter.rowLocales ? { rowLocales: chapter.rowLocales } : {}),
    assets,
    ...(baSourceCorrections(source.GroupId).length
      ? { sourceCorrections: baSourceCorrections(source.GroupId) }
      : {}),
    ...(warnings.length ? { warnings } : {}),
  };
}

export function compileBaSceneSteps(source, chapter) {
  source = applyBaSourceCorrections(source);
  let previous = -1;
  const steps = chapter.nodes.map((node) => {
    const row = node.source?.row ?? source.content.length - 1;
    const selection = node.source
      ? (source.content[row]?.SelectionGroup ?? 0)
      : 0;
    const incoming = source.content
      .slice(previous + 1, row + 1)
      .map((data, i) => ({ ...data, row: previous + 1 + i }))
      .filter(
        (data) =>
          (data.SelectionGroup ?? 0) === selection ||
          (data.SelectionGroup ?? 0) === 0,
      );
    previous = row;
    // A branch can finish with command-only cues. These run when leaving its
    // final readable passage, before the common join, only on the chosen path.
    const afterRows = [];
    if (node.source && selection) {
      for (let i = row + 1; i < source.content.length; i++) {
        const data = source.content[i];
        if (data.SelectionGroup !== selection) break;
        if (data.TextJp.trim()) {
          afterRows.length = 0;
          break;
        }
        afterRows.push({ ...data, row: i });
      }
    }
    return {
      id: node.id,
      rows: incoming,
      ...(afterRows.length ? { afterRows } : {}),
    };
  });
  const accounted = steps
    .flatMap((step) => [...step.rows, ...(step.afterRows ?? [])])
    .map((row) => row.row);
  if (
    accounted.length !== source.content.length ||
    new Set(accounted).size !== accounted.length
  )
    throw new Error('BA scene/source alignment failed.');
  return steps;
}
