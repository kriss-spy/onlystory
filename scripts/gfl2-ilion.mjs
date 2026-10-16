import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileBook, hash, writeChanged } from './gfl2-event.mjs';
import { tableRows, record, localizedContent } from './gfl2-tables.mjs';
import { compileBranches } from './gfl2-branches.mjs';
const extraPresentation = [
  'ChangeSoundVolume',
  'LayerSortingOrder',
  'CustomCharacter',
  'SetTrigger',
  'ChangeUIType',
  'PlayCharAnim',
  'AutoPlay',
];
export function compileIlionBook(raw, script, content, options = {}) {
  const book = structuredClone(raw),
    grid = book.importGridList?.[0];
  if (!grid || book.importGridList.length !== 1)
    throw new Error(`${script}: expected one ordered grid`);
  const header = grid.rows[0].strings,
    ci = header.indexOf('Command'),
    ai = header.indexOf('Arg1');
  const entities = new Map(
    (grid.entityIndexTbl ?? []).map((row, i) => [
      row,
      grid.entityDataList[i].originalStrings,
    ]),
  );
  for (const row of grid.rows.slice(1))
    if (entities.has(row.rowIndex))
      row.strings = [...entities.get(row.rowIndex)];
  const active = grid.rows
      .slice(1)
      .filter((r) => !r.isEmpty && !r.isCommentOut),
    original = [];
  for (const row of active)
    original.push({
      ...Object.fromEntries(header.map((k, i) => [k, row.strings[i] ?? ''])),
      sourceRow: row.rowIndex,
    });
  if (original.some((c) => c.Command === 'Video')) {
    const eofVideo =
      options.allowEof &&
      original.length === 2 &&
      original[0].Command === 'CharacterOff' &&
      !original[0].Arg1 &&
      original[1].Command === 'Video' &&
      /^\d+$/.test(original[1].Arg1) &&
      original[1].Arg2 === 'UICamera';
    if (
      !eofVideo &&
      (original.length !== 2 ||
        original[0].Command !== 'Video' ||
        original[1].Command !== 'EndScenario')
    )
      throw new Error(`${script}: unsupported mixed video flow`);
    const c = original.find((c) => c.Command === 'Video');
    return {
      script,
      commands: original,
      commandCounts: eofVideo
        ? { CharacterOff: 1, Video: 1 }
        : { Video: 1, EndScenario: 1 },
      ...(eofVideo ? { boundary: 'source-eof' } : {}),
      passages: [
        {
          id: `${script}:${c.sourceRow}`,
          kind: 'video',
          video: c.Arg1,
          text: '',
          textFemale: '',
          speaker: '',
          speakerFemale: '',
          window: 'AVGNarrator',
          source: { script, row: c.sourceRow, contentId: 0, textId: 0 },
        },
      ],
    };
  }
  if (
    original.some(
      (c, i) =>
        c.Command === 'Jump' ||
        (c.Command === 'Selection' && original[i + 1]?.Command === 'Selection'),
    )
  )
    return compileBranches(original, script, content, [
      ...extraPresentation,
      ...(options.presentation ?? []),
    ]);
  const choiceRows = new Set(),
    labels = new Set();
  for (let i = 0; i < active.length; i++) {
    const row = active[i],
      name = row.strings[ci];
    if (name === 'Selection') {
      const target = row.strings[ai];
      // These are single-option prompts immediately followed by the same label.
      // Refuse actual jumps or multiple choices rather than flattening branches.
      if (
        !/^\*\*[A-Z0-9]+$/.test(target) ||
        active[i + 1]?.strings[ci] !== target ||
        active[i - 1]?.strings[ci] !== target + ' Begin'
      )
        throw new Error(
          `${script}:${row.rowIndex}: unsupported selection graph`,
        );
      choiceRows.add(row.rowIndex);
      labels.add(target);
      labels.add(target + ' Begin');
      row.strings[ci] = 'Text';
      row.strings[ai] = '';
      if (entities.has(row.rowIndex)) {
        entities.get(row.rowIndex)[ci] = 'Text';
        entities.get(row.rowIndex)[ai] = '';
      }
    }
  }
  const labelRows = active.filter((r) => labels.has(r.strings[ci]));
  for (const r of labelRows) r.isCommentOut = true;
  const compiled = compileBook(book, script, content, {
    presentation: [...extraPresentation, ...(options.presentation ?? [])],
    allowEof: options.allowEof,
    sourceGaps: options.sourceGaps,
  });
  compiled.commands = original;
  compiled.commandCounts = {};
  for (const c of original)
    compiled.commandCounts[c.Command] =
      (compiled.commandCounts[c.Command] ?? 0) + 1;
  for (const p of compiled.passages)
    if (choiceRows.has(p.source.row)) p.source.command = 'Selection';
  return compiled;
}
export function ilionCatalog(tables) {
  const load = (name) => [...tableRows(tables[name])];
  const lang = new Map(
    load('LangPackageTableCnData').map((r) => [r[1], r[2]?.toString('utf8')]),
  );
  const text = (v) => lang.get(Buffer.isBuffer(v) ? record(v)[1] : v);
  for (const [id, title] of [
    [4047, '伊利昂之围·上篇'],
    [4048, '伊利昂之围·中篇'],
    [4049, '伊利昂之围·下篇'],
  ]) {
    const chapter = load('ChapterData').find((r) => r[1] === id);
    if (!chapter || text(chapter[3]) !== title)
      throw new Error(`Unexpected chapter identity ${id}`);
  }
  const stages = new Map(load('StageData').map((r) => [r[1], r]));
  const plots = load('AvgPlotData');
  const nodes = load('StoryData')
    .filter((r) => [4047, 4048, 4049].includes(r[2]))
    .map((r) => {
      const s = stages.get(r[4]);
      return {
        id: r[1],
        chapter: r[2],
        before: r[5],
        after: r[6],
        position: r[7]?.toString('utf8'),
        kind: r[11],
        flag: r[23],
        code: s?.[3]?.toString('utf8'),
        title: text(s?.[4]),
        plots: plots
          .filter((p) => Math.floor(p[1] / 100) === r[4])
          .sort((a, b) => a[5] - b[5] || a[1] - b[1])
          .map((p) => ({
            id: p[1],
            kind: p[5],
            scripts: p[2].toString('utf8').split(','),
          })),
      };
    });
  const main = nodes.filter((n) => [1, 2].includes(n.kind));
  const side = nodes.filter((n) => n.kind === 14 && n.flag === 1);
  if (side.length !== 14 || main.length !== 51)
    throw new Error(
      `Unexpected story graph: ${main.length} main, ${side.length} side`,
    );
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const node of [...main, ...side])
    if (!node.plots.length || !node.title || !node.code)
      throw new Error(`Unresolved story ${node.id}`);
  const result = [];
  for (const chapter of [4047, 4048, 4049]) {
    const ordered = main
      .filter((n) => n.chapter === chapter)
      .sort(
        (a, b) =>
          Number(a.position.split(',')[0]) - Number(b.position.split(',')[0]),
      );
    for (let i = 1; i < ordered.length; i++)
      if (ordered[i].before !== ordered[i - 1].id)
        throw new Error('Main predecessor disagrees with source layout');
    for (const node of ordered) {
      result.push(node);
      const roots = side
        .filter((s) => s.chapter === chapter && s.before === node.id)
        .sort((a, b) => a.code.localeCompare(b.code));
      for (const branchRoot of roots) {
        let current = branchRoot;
        const seen = new Set();
        while (current) {
          if (
            seen.has(current.id) ||
            current.kind !== 14 ||
            current.chapter !== chapter
          )
            throw new Error('Invalid side graph');
          seen.add(current.id);
          result.push({
            ...current,
            placement: {
              kind: 'side',
              branch: `gfl2-ilion-branch-${branchRoot.id}`,
              after: `gfl2-ilion-${node.id}`,
            },
          });
          const next = current.after ? byId.get(current.after) : undefined;
          if (next && next.before !== current.id)
            throw new Error('Invalid side successor');
          current = next;
        }
      }
    }
  }
  if (
    result.length !== main.length + side.length ||
    new Set(result.map((n) => n.id)).size !== result.length
  )
    throw new Error('Incomplete Ilion graph');
  return result;
}
export function importIlion(root) {
  const generated = resolve(root, 'src/generated/gfl2-ilion.json'),
    booksDir = resolve(root, '.cache/gfl2-ilion/books');
  const tablesDir =
    process.env.ONLYSTORY_GFL2_TABLES ||
    resolve(
      process.env.GF2_GAME_ROOT || 'D:/Program Files/GF2Exilium',
      'GF2 Game/GF2_Exilium_Data/LocalCache/Data/Table',
    );
  const names = [
    'ChapterData',
    'StoryData',
    'StageData',
    'AvgPlotData',
    'LangPackageTableCnData',
    'AvgContentData',
  ];
  if (
    !existsSync(booksDir) ||
    !names.every((n) => existsSync(resolve(tablesDir, n + '.bytes')))
  ) {
    if (!existsSync(generated)) writeChanged(generated, null);
    return;
  }
  const tables = Object.fromEntries(
    names.map((n) => [n, readFileSync(resolve(tablesDir, n + '.bytes'))]),
  );
  const nodes = ilionCatalog(tables),
    content = localizedContent(
      tables.LangPackageTableCnData,
      tables.AvgContentData,
    ),
    books = [],
    sections = [],
    counts = {},
    used = new Set();
  for (const [i, node] of nodes.entries()) {
    const compiled = node.plots
      .flatMap((p) => p.scripts)
      .map((script) => {
        if (used.has(script)) throw new Error('Repeated script ' + script);
        used.add(script);
        const bytes = readFileSync(resolve(booksDir, script + '.book.json'));
        const b = compileIlionBook(
          JSON.parse(bytes.toString('utf8')),
          script,
          content,
        );
        books.push({
          script,
          sha256: hash(bytes),
          textRows: b.passages.filter((p) => p.kind !== 'video').length,
        });
        for (const [kind, num] of Object.entries(b.commandCounts))
          counts[kind] = (counts[kind] ?? 0) + num;
        return b;
      });
    const lastBook = compiled.at(-1);
    if (lastBook.passages.at(-1)?.kind === 'video') {
      const c = lastBook.commands.at(-1);
      lastBook.passages.push({
        id: `${lastBook.script}:${c.sourceRow}`,
        kind: 'end',
        text: '',
        textFemale: '',
        speaker: '',
        speakerFemale: '',
        window: 'AVGNarrator',
        source: {
          script: lastBook.script,
          row: c.sourceRow,
          contentId: 0,
          textId: 0,
        },
      });
    }
    const passages = compiled.flatMap((b) => b.passages),
      id = `gfl2-ilion-${node.id}`,
      base = '/private/gfl2-ilion';
    const reader = { id, passages },
      archive = { id, title: node.code + ' ' + node.title, books: compiled };
    const readerPath = `${base}/readers/${node.id}.json`,
      sourcePath = `${base}/sections/${node.id}.json`;
    writeChanged(resolve(root, 'public' + readerPath), reader);
    writeChanged(resolve(root, 'public' + sourcePath), archive);
    sections.push({
      id,
      title: archive.title,
      order: i + 1,
      chapter: {
        id: String(node.chapter),
        title: { 4047: '上篇', 4048: '中篇', 4049: '下篇' }[node.chapter],
        order: node.chapter - 4046,
      },
      ...(node.placement ? { placement: node.placement } : {}),
      scripts: compiled.map((b) => b.script),
      textRows: passages.length,
      firstNode: passages[0].id,
      lastNode: passages.at(-1).id,
      characters: passages.reduce((sum, p) => sum + p.text.length, 0),
      contentUrl: `${readerPath}?v=${hash(JSON.stringify(reader)).slice(0, 16)}`,
      sourceUrl: `${sourcePath}?v=${hash(JSON.stringify(archive)).slice(0, 16)}`,
      source: {
        storyId: node.id,
        chapterId: node.chapter,
        before: node.before ?? null,
        after: node.after ?? null,
        kind: node.kind,
        position: node.position,
        plots: node.plots,
      },
    });
  }
  const coverage = {
    scripts: used.size,
    sections: sections.length,
    textRows: counts.Text,
    selectionPrompts: counts.Selection ?? 0,
    videoPassages: counts.Video ?? 0,
    passages: sections.reduce((s, n) => s + n.textRows, 0),
    mainStories: nodes.filter((n) => !n.placement).length,
    sideStories: nodes.filter((n) => n.placement).length,
    commandCounts: counts,
    unresolvedText: 0,
    unresolvedSpeakers: 0,
    mode: 'text',
    order:
      'Source chapter IDs 4047..4049, main StoryData predecessor chain checked against map position; optional branches retain StoryData field5/6 anchor and successors; AvgPlotData type order then script list and original grid rows.',
  };
  const provenance = {
    tables: names.map((name) => ({ name, sha256: hash(tables[name]) })),
    books,
    extraction: JSON.parse(
      readFileSync(
        resolve(root, '.cache/gfl2-ilion/books-provenance.json'),
        'utf8',
      ),
    ),
  };
  writeChanged(generated, {
    title: '伊利昂之围',
    sections,
    coverage,
    provenance,
  });
  writeChanged(resolve(root, 'public/private/gfl2-ilion/provenance.json'), {
    coverage,
    provenance,
  });
  console.log(
    `Ilion import: ${coverage.sections} stories (${coverage.mainStories} main + ${coverage.sideStories} side), ${coverage.scripts} scripts, ${coverage.textRows} text rows, ${coverage.selectionPrompts} prompts, ${coverage.videoPassages} videos.`,
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  if (process.argv.includes('--index')) {
    const dir =
      process.env.ONLYSTORY_GFL2_TABLES ||
      resolve(
        process.env.GF2_GAME_ROOT || 'D:/Program Files/GF2Exilium',
        'GF2 Game/GF2_Exilium_Data/LocalCache/Data/Table',
      );
    const names = [
      'ChapterData',
      'StoryData',
      'StageData',
      'AvgPlotData',
      'LangPackageTableCnData',
    ];
    const tables = Object.fromEntries(
      names.map((n) => [n, readFileSync(resolve(dir, n + '.bytes'))]),
    );
    writeChanged(
      resolve(root, '.cache/gfl2-ilion/nodes.json'),
      ilionCatalog(tables),
    );
  } else importIlion(root);
}
