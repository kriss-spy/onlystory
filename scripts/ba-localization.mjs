import { canonicalBaScriptLine } from '../src/playback/ba/script.ts';
import { parseBaText } from '../src/playback/ba/markup.ts';
import { scriptNameHash } from './ba-script-name.mjs';
import { applyBaSourceCorrections } from '../src/playback/ba/source-corrections.ts';

// Presentation can change between regions without changing a passage. Keep the
// complete Korean narrative and choice anchors, their source order and branch.
export function baNarrativeAnchor(row) {
  return row.ScriptKr.split('\n')
    .map(canonicalBaScriptLine)
    .filter((line) =>
      /^(?:[1-5];|\[n?s\d*\]|#(?:na|st[mr]?|place|title|continued|Ending|nextepisode)(?:;|$))/.test(
        line,
      ),
    )
    .join('\n');
}

export function validateBaEnglishAlignment(source, english) {
  if (
    source.GroupId !== english?.GroupId ||
    source.content.length !== english.content?.length
  )
    throw Error('BA English source row count or group differs');
  for (const [index, row] of source.content.entries()) {
    const translated = english.content[index];
    const role = (r) =>
      baNarrativeAnchor(r)
        .split('\n')
        .map((line) => {
          const parts = line.split(';');
          return /^[1-5]$/.test(parts[0]) || parts[0] === '#na'
            ? parts.slice(0, 2).join(';')
            : /^\[/.test(line)
              ? line.match(/^\[n?s\d*\]/)?.[0]
              : parts[0];
        })
        .join('\n');
    const sameJapaneseAnchor =
      row.TextJp.trim() &&
      row.TextJp === translated.TextJp &&
      role(row) === role(translated);
    if (
      translated.GroupId !== source.GroupId ||
      row.SelectionGroup !== translated.SelectionGroup ||
      (baNarrativeAnchor(row) !== baNarrativeAnchor(translated) &&
        !sameJapaneseAnchor)
    )
      throw Error(
        `BA English narrative/branch identity differs at ${source.GroupId}:${index}`,
      );
    // The database uses a command placeholder in TextJp for some movie rows.
    // It is not dialogue and has no translated text in the global source.
    const moviePlaceholder = /^#(?:video|videons2);/.test(row.TextJp.trim());
    if (row.TextJp.trim() && !moviePlaceholder && !translated.TextEn?.trim())
      throw Error(`BA English dialogue missing at ${source.GroupId}:${index}`);
    const keys = (text) =>
      [...text.matchAll(/^\[n?s(\d*)\]/gm)].map((m) => m[1]);
    if (
      JSON.stringify(keys(row.TextJp)) !==
      JSON.stringify(keys(translated.TextEn ?? ''))
    )
      throw Error(
        `BA English choice identities differ at ${source.GroupId}:${index}`,
      );
  }
}

export function localizeBaChapter(chapter, source, english, characters) {
  validateBaEnglishAlignment(source, english);
  const corrected = applyBaSourceCorrections(english);
  const names = new Map(
    (characters?.DataList ?? []).map((c) => [c.CharacterName, c.NameEN]),
  );
  const koreanNames = new Map(
    (characters?.DataList ?? []).map((c) => [c.NameKR, c.NameEN]),
  );
  for (const node of chapter.nodes) {
    if (!node.source) continue;
    const translated = english.content[node.source.row];
    const text = translated.TextEn ?? '';
    node.text.en =
      node.kind === 'choice' || /#timelineNS;/.test(translated.ScriptKr)
        ? ''
        : parseBaText(text).text;
    if (node.choices) {
      const labels = [...text.matchAll(/^\[n?s(\d*)\]\s*(.+)$/gm)];
      for (const choice of node.choices) {
        const label = labels.find((m) => `s${Number(m[1])}` === choice.id);
        if (!label)
          throw Error(`BA English choice missing: ${node.id}/${choice.id}`);
        choice.label.en = parseBaText(label[2]).text;
      }
    }
    if (node.speaker) {
      let englishName;
      for (const line of corrected.content[node.source.row].ScriptKr.split(
        '\n',
      ).map(canonicalBaScriptLine)) {
        const parts = line.split(';');
        if (
          (parts[0] === '#na' && parts.length >= 3) ||
          (/^[1-5]$/.test(parts[0]) && parts.length >= 4)
        ) {
          englishName =
            names.get(scriptNameHash(parts[1])) ??
            koreanNames.get(parts[1]) ??
            (parts[1].startsWith('통신')
              ? koreanNames.get(parts[1].slice(2))
              : undefined);
        }
      }
      if (!englishName) throw Error(`BA English speaker missing at ${node.id}`);
      node.speakerLocales = {
        ja: node.speaker,
        en: englishName,
        'zh-CN': node.speaker,
      };
    }
    node.scene.textPausesLocales = {
      ja: node.scene.textPauses ?? [],
      en: parseBaText(text).pauses,
    };
    node.playerName.fallbackLocales = {
      ja: 'プレイヤー',
      en: 'Sensei',
      'zh-CN': 'プレイヤー',
    };
  }
  // Command-only caption and location rows also need a real translation.
  chapter.rowLocales = { en: english.content.map((row) => row.TextEn ?? '') };
  return chapter;
}
