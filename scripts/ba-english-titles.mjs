import { parseBaText } from '../src/playback/ba/markup.ts';
import { scriptNameHash } from './ba-script-name.mjs';

export function baEnglishTitles(definitions, localize, scripts) {
  const byKey = new Map(localize.map((row) => [row.Key, row]));
  const translated = (key) => {
    const text = byKey.get(
      typeof key === 'string' ? scriptNameHash(key) : key,
    )?.En;
    return text?.trim()
      ? parseBaText(text).text.replace(/;/g, ' · ')
      : undefined;
  };
  const result = {};
  const previousTitles = new Map();
  for (const definition of definitions) {
    let title, collection;
    const metadata = definition.mainStory ?? definition.groupStory;
    if (metadata) {
      title = translated(metadata.labels?.Episode?.hash);
      const volume = translated(metadata.labels?.Volume?.hash);
      const chapter = translated(metadata.labels?.Chapter?.hash);
      collection = definition.groupStory
        ? volume
        : definition.collectionId === 'ba-jp-prologue'
          ? 'Prologue'
          : volume && chapter
            ? `Part ${metadata.part} · ${volume} · Chapter ${metadata.chapter} ${chapter}`
            : undefined;
      const segment = / · (\d+\/\d+)$/.exec(definition.title)?.[0];
      if (title && segment) title += segment;
    } else if (definition.group === 11000) {
      // All official localization cells with this exact JP label agree.
      const names = new Set(
        localize
          .filter((r) => r.Jp === definition.story && r.En?.trim())
          .map((r) => r.En),
      );
      if (names.size === 1) collection = [...names][0];
      if (collection) title = `${collection} · ${definition.group}`;
    } else if (definition.category === 'Event') {
      collection = translated(
        `Event_Name_${definition.collectionId.replace('ba-jp-event-', '')}`,
      );
      const rows = scripts[definition.group] ?? [];
      const caption = rows.find(
        (row) => /(?:^|\n)#title;/.test(row.ScriptKr) && row.TextEn?.trim(),
      )?.TextEn;
      if (caption) {
        title = parseBaText(caption).text.replace(/;/g, ' · ');
        previousTitles.set(definition.collectionId, title);
      } else if (previousTitles.has(definition.collectionId))
        title = `${previousTitles.get(definition.collectionId)} (continued)`;
    }
    if (title || collection)
      result[`ba-jp-${definition.group}`] = {
        ...(title ? { titleLocales: { en: title } } : {}),
        ...(collection ? { collectionLocales: { en: collection } } : {}),
      };
  }
  return result;
}
