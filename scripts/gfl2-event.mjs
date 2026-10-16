import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { localizedContent, tableRows, record } from './gfl2-tables.mjs';

export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function writeChanged(path, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
export const presentation = new Set([
  'Bg',
  'Bgm',
  'Se',
  'ChangeLayer',
  'BgOff',
  'StopSe',
  'Tween',
  'SetShaderFloat',
  'StopBgm',
  'Character',
  'Particle',
  'Sprite',
  'Wait',
  'SetShaderColor',
  'SpriteOff',
  'Param',
  'ZoomCamera',
  'ParticleOff',
  'CharacterOff',
  'AddEffect',
  'TweenOff',
]);

export function compileBook(book, script, content, options = {}) {
  if (book.importGridList?.length !== 1)
    throw new Error(
      `${script}: expected one ordered grid; multi-grid flow needs review.`,
    );
  const grid = book.importGridList[0];
  const header = grid.rows[0]?.strings;
  if (!header?.includes('Command') || !header.includes('Text'))
    throw new Error(`${script}: invalid command header.`);
  const passages = [];
  const commands = [];
  const counts = {};
  if ((grid.entityIndexTbl?.length ?? 0) !== (grid.entityDataList?.length ?? 0))
    throw new Error(`${script}: invalid dynamic argument table.`);
  const entities = new Map(
    (grid.entityIndexTbl ?? []).map((row, index) => [
      row,
      grid.entityDataList[index].originalStrings,
    ]),
  );
  let window = 'AVGNarrator';
  let previousRow = -1;
  let ended = false;
  for (const row of grid.rows.slice(1)) {
    if (row.isEmpty || row.isCommentOut) continue;
    if (!Number.isInteger(row.rowIndex) || row.rowIndex <= previousRow)
      throw new Error(`${script}: source rows are not strictly ordered.`);
    previousRow = row.rowIndex;
    const command = {
      ...Object.fromEntries(
        header.map((key, i) => [
          key,
          (entities.get(row.rowIndex) ?? row.strings)[i] ?? '',
        ]),
      ),
      sourceRow: row.rowIndex,
    };
    const name = command.Command;
    if (!name)
      throw new Error(
        `${script}:${row.rowIndex}: implicit command needs review.`,
      );
    if (ended)
      throw new Error(
        `${script}:${row.rowIndex}: command follows EndScenario.`,
      );
    if (
      name !== 'Text' &&
      name !== 'EndScenario' &&
      name !== 'ChangeMessageWindow' &&
      !presentation.has(name) &&
      !options.presentation?.includes(name)
    )
      throw new Error(
        `${script}:${row.rowIndex}: unsupported control flow ${name}.`,
      );
    commands.push(command);
    counts[name] = (counts[name] ?? 0) + 1;
    if (name === 'ChangeMessageWindow') window = command.Arg1;
    if (name === 'EndScenario') {
      ended = true;
      continue;
    }
    if (name !== 'Text') continue;
    const gap = options.sourceGaps?.find(
      (g) =>
        g.script === script &&
        g.row === command.sourceRow &&
        g.reference === command.Text,
    );
    if (!/^\d+$/.test(command.Text) && !gap)
      throw new Error(`${script}:${row.rowIndex}: nonnumeric text reference.`);
    const contentId = Number(command.Text);
    const originalLine = content.get(contentId);
    if (gap && typeof originalLine?.text === 'string')
      throw Error(`${script}: obsolete source gap at ${command.sourceRow}`);
    const line = gap
      ? {
          text: '［原始游戏文件缺少此处文本］',
          textId: originalLine?.textId ?? null,
        }
      : originalLine;
    if (typeof line?.text !== 'string')
      throw new Error(
        `${script}:${row.rowIndex}: missing original text ${contentId}.`,
      );
    const speakerId = /^\d+$/.test(command.Arg1)
      ? Number(command.Arg1)
      : undefined;
    const speaker =
      speakerId === undefined ? undefined : content.get(speakerId);
    if (speakerId !== undefined && typeof speaker?.text !== 'string')
      throw new Error(
        `${script}:${row.rowIndex}: unresolved speaker ${speakerId}.`,
      );
    passages.push({
      id: `${script}:${row.rowIndex}`,
      text: line.text,
      textFemale: line.textFemale ?? line.text,
      speaker: speaker?.text ?? command.Arg1,
      speakerFemale: speaker?.textFemale ?? speaker?.text ?? command.Arg1,
      window: command.WindowType || window,
      source: {
        script,
        row: row.rowIndex,
        contentId,
        textId: line.textId,
        femaleTextId: line.femaleTextId ?? null,
        speakerContentId: speakerId ?? null,
        speakerTextId: speaker?.textId ?? null,
        speakerFemaleTextId: speaker?.femaleTextId ?? null,
        ...(gap ? { unavailable: gap.reason } : {}),
      },
    });
  }
  if (
    (!ended && !(options.allowEof && commands.at(-1)?.Command === 'Text')) ||
    !passages.length
  )
    throw new Error(`${script}: missing text or EndScenario boundary.`);
  return {
    script,
    passages,
    commands,
    commandCounts: counts,
    ...(!ended ? { boundary: 'source-eof' } : {}),
  };
}

export function importFullEvent(root, prototype) {
  const recovered = resolve(prototype, '..');
  const indexFile = resolve(recovered, 'event_index.json');
  const tables =
    process.env.ONLYSTORY_GFL2_TABLES ||
    resolve(
      process.env.GF2_GAME_ROOT || 'D:/Program Files/GF2Exilium',
      'GF2 Game/GF2_Exilium_Data/LocalCache/Data/Table',
    );
  const languageFile = resolve(tables, 'LangPackageTableCnData.bytes');
  const contentFile = resolve(tables, 'AvgContentData.bytes');
  const generated = resolve(root, 'src/generated/gfl2-event.json');
  if (![indexFile, languageFile, contentFile].every(existsSync)) {
    if (!existsSync(generated)) writeChanged(generated, null);
    console.log(
      'Full GFL2 text import: sources unavailable; keeping any previous import.',
    );
    return;
  }
  const indexBytes = readFileSync(indexFile);
  const index = JSON.parse(indexBytes.toString('utf8'));
  if (index.event !== '金翅雀与橄榄枝')
    throw new Error('Unexpected event index.');
  const languageBytes = readFileSync(languageFile);
  const contentBytes = readFileSync(contentFile);
  const content = localizedContent(languageBytes, contentBytes);
  const stageBytes = readFileSync(resolve(tables, 'StageData.bytes'));
  const plotBytes = readFileSync(resolve(tables, 'AvgPlotData.bytes'));
  const stages = new Map(
    [...tableRows(stageBytes)].map((row) => [row[1], row]),
  );
  const plots = new Map([...tableRows(plotBytes)].map((row) => [row[1], row]));
  const language = new Map(
    [...tableRows(languageBytes)].map((row) => [
      row[1],
      row[2]?.toString('utf8'),
    ]),
  );
  const chapters = [...index.chapters].sort(
    (a, b) => a.raw_order_field4 - b.raw_order_field4,
  );
  const used = new Set();
  const books = [];
  const sections = [];
  const counts = {};
  const orders = new Set();
  for (const chapter of chapters) {
    const stageId = Math.floor(chapter.avg_id / 100);
    const stage = stages.get(stageId),
      plot = plots.get(chapter.avg_id);
    const stageCode = stage?.[3]?.toString('utf8');
    const stageTitle = stage?.[4] && language.get(record(stage[4])[1]);
    const plotKind = plot?.[5];
    const plotScripts = plot?.[2]?.toString('utf8').split(',').filter(Boolean);
    if (
      !stageCode ||
      !stageTitle ||
      ![1, 11, 21].includes(plotKind) ||
      JSON.stringify(plotScripts) !==
        JSON.stringify(chapter.script_labels_field2)
    )
      throw Error(`Unresolved original story identity: ${chapter.avg_id}`);
    const phase =
      plotKind === 11 ? '战前' : plotKind === 21 ? '战后' : undefined;
    const title = `${stageCode} ${stageTitle}${phase ? ` · ${phase}` : ''}`;
    if (
      !Number.isInteger(chapter.raw_order_field4) ||
      orders.has(chapter.raw_order_field4)
    )
      throw new Error('Ambiguous catalog order.');
    orders.add(chapter.raw_order_field4);
    const sectionBooks = [];
    for (const script of chapter.script_labels_field2) {
      if (!/^A330\d{2}$/.test(script) || used.has(script))
        throw new Error(`Unexpected or duplicated script ${script}.`);
      used.add(script);
      const path = resolve(recovered, 'event_books', `${script}.book.json`);
      const bytes = readFileSync(path);
      const book = compileBook(
        JSON.parse(bytes.toString('utf8')),
        script,
        content,
      );
      sectionBooks.push(book);
      books.push({
        script,
        sha256: hash(bytes),
        textRows: book.passages.length,
      });
      for (const [name, count] of Object.entries(book.commandCounts))
        counts[name] = (counts[name] ?? 0) + count;
    }
    const passages = sectionBooks.flatMap((book) => book.passages);
    const id = `gfl2-event-${chapter.avg_id}`;
    const sourcePath = `/private/gfl2-event/sections/${chapter.avg_id}.json`;
    const readerPath = `/private/gfl2-event/readers/${chapter.avg_id}.json`;
    const reader = { id, passages };
    const archive = { id, title, books: sectionBooks };
    writeChanged(resolve(root, `public${readerPath}`), reader);
    writeChanged(resolve(root, `public${sourcePath}`), archive);
    const section = {
      id,
      title,
      source: {
        stageId,
        stageCode,
        stageTitle,
        plotId: chapter.avg_id,
        plotKind,
      },
      order: chapter.raw_order_field4,
      scripts: chapter.script_labels_field2,
      textRows: passages.length,
      firstNode: passages[0].id,
      lastNode: passages.at(-1).id,
      characters: passages.reduce(
        (sum, passage) => sum + passage.text.length,
        0,
      ),
      contentUrl: `${readerPath}?v=${hash(JSON.stringify(reader)).slice(0, 16)}`,
      sourceUrl: `${sourcePath}?v=${hash(JSON.stringify(archive)).slice(0, 16)}`,
    };
    sections.push(section);
  }
  if (
    used.size !== 30 ||
    Array.from(
      { length: 30 },
      (_, i) => `A330${String(i + 1).padStart(2, '0')}`,
    ).some((script) => !used.has(script))
  )
    throw new Error(
      'The event index does not cover all thirty recovered scripts.',
    );
  const coverage = {
    scripts: books.length,
    sections: sections.length,
    textRows: sections.reduce((sum, section) => sum + section.textRows, 0),
    commandCounts: counts,
    unresolvedText: 0,
    unresolvedSpeakers: 0,
    mode: 'text',
    order:
      'Catalog raw_order_field4, then script_labels_field2, then original grid rows. Catalog-field meanings are inherited from the recovered index; no runtime story-graph comparison is claimed.',
  };
  const provenance = {
    indexSha256: hash(indexBytes),
    languageSha256: hash(languageBytes),
    contentSha256: hash(contentBytes),
    stageSha256: hash(stageBytes),
    plotSha256: hash(plotBytes),
    books,
  };
  const event = { title: index.event, sections, coverage, provenance };
  writeChanged(generated, event);
  writeChanged(resolve(root, 'public/private/gfl2-event/provenance.json'), {
    coverage,
    provenance,
  });
  console.log(
    `Full GFL2 text import: ${coverage.scripts} scripts, ${coverage.sections} sections, ${coverage.textRows} original text rows; all text and speakers resolved.`,
  );
}
