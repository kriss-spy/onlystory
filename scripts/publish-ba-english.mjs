// Add verified translations to prepared chapters without replacing any media.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { localizeBaChapter } from './ba-localization.mjs';
import { baEnglishTitles } from './ba-english-titles.mjs';

const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const save = (path, value) => fs.writeFileSync(path, JSON.stringify(value));
const root = process.cwd();
const cache = root + '/.cache/ba-gl-source/';
const provenance = read(cache + 'provenance.json');
const scripts = read(cache + 'scripts.json');
const names = { DataList: read(cache + 'ScenarioCharacterNameExcel.json') };
const availability = read(cache + 'availability.json');
const released = new Set(availability.groups);
const definitions = read(root + '/scripts/ba-library.json');
const titles = baEnglishTitles(
  definitions,
  read(cache + 'LocalizeExcel.json'),
  scripts,
);
const episodes = read(root + '/src/generated/ba-stories.json');
const ok = [],
  issues = [];
let passages = 0,
  choices = 0;
for (const episode of episodes) {
  const group = Number(episode.id.replace('ba-jp-', ''));
  const folder = root + `/public/private/ba-jp/${group}/`;
  const chapter = read(folder + 'chapter.json');
  delete chapter.rowLocales;
  const source = read(folder + 'source.json');
  for (const node of chapter.nodes) {
    node.text.en = '';
    for (const choice of node.choices ?? []) choice.label.en = '';
    delete node.speakerLocales;
    delete node.scene.textPausesLocales;
    if (node.playerName) delete node.playerName.fallbackLocales;
  }
  let translated = false;
  try {
    if (!released.has(group))
      throw Error(
        'Group is not open in the pinned global source release tables',
      );
    localizeBaChapter(
      chapter,
      source,
      { GroupId: group, content: scripts[group] },
      names,
    );
    translated = true;
    ok.push(group);
    passages += chapter.coverage.textRows;
    choices += chapter.coverage.choices;
  } catch (error) {
    issues.push({
      group,
      reason: !scripts[group]
        ? 'group absent from pinned global source'
        : error.message,
    });
  }
  if (!translated) {
    for (const node of chapter.nodes) {
      node.text.en = '';
      for (const choice of node.choices ?? []) choice.label.en = '';
      delete node.speakerLocales;
      delete node.scene.textPausesLocales;
      if (node.playerName) delete node.playerName.fallbackLocales;
    }
    delete chapter.rowLocales;
  }
  episode.textLocales = translated ? ['ja', 'en'] : ['ja'];
  episode.capabilities = episode.capabilities.filter(
    (c) => c !== 'Official global English text',
  );
  if (translated) episode.capabilities.push('Official global English text');
  episode.description = episode.description.replace(
    /^JP Japanese (?:\+ official global English )?text/,
    translated
      ? 'JP Japanese + official global English text'
      : 'JP Japanese text',
  );
  Object.assign(episode, titles[episode.id]);
  save(folder + 'chapter.json', chapter);
  const program = read(folder + 'scenes.json');
  for (const step of program.steps)
    for (const row of [...step.rows, ...(step.afterRows ?? [])]) {
      if (source.content[row.row].TextEn === undefined) delete row.TextEn;
      else row.TextEn = source.content[row.row].TextEn;
    }
  if (translated) program.rowLocales = chapter.rowLocales;
  else delete program.rowLocales;
  const revision = createHash('sha256')
    .update(JSON.stringify(program))
    .digest('hex')
    .slice(0, 16);
  const version = (url) =>
    /\/(?:chapter|scenes)\.json(?:\?|$)/.test(url)
      ? url.split('?')[0] + '?v=' + revision
      : url;
  episode.content.url = version(episode.content.url);
  episode.content.sceneUrl = version(episode.content.sceneUrl);
  episode.assets = episode.assets.map(version);
  save(folder + 'scenes.json', program);
  const evidence = read(folder + 'provenance.json');
  evidence.textLocales = episode.textLocales;
  if (translated) evidence.english = provenance;
  else delete evidence.english;
  save(folder + 'provenance.json', evidence);
}
fs.writeFileSync(
  root + '/src/generated/ba-stories.json',
  JSON.stringify(episodes, null, 2) + '\n',
);
fs.writeFileSync(
  root + '/src/ba-localized-titles.json',
  JSON.stringify(titles, null, 2) + '\n',
);
const report = {
  source: provenance,
  availabilityAsOf: availability.asOf,
  alignedChapters: ok.length,
  japaneseOnlyChapters: issues.length,
  englishTextPassages: passages,
  englishChoicePrompts: choices,
  chapters: ok,
  withheld: issues,
};
fs.writeFileSync(
  root + '/docs/ba-english-verification.json',
  JSON.stringify(report, null, 2) + '\n',
);
save(cache + 'alignment.json', { ok, issues });
console.log(
  `Published official English for ${ok.length}/${episodes.length} BA chapters, ${passages} passages, ${choices} choices`,
);
