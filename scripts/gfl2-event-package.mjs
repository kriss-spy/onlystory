import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash, writeChanged } from './gfl2-event.mjs';
import { tableRows, record, localizedContent, varint } from './gfl2-tables.mjs';

const links = (value) => {
  if (Buffer.isBuffer(value)) {
    const ids = [];
    let offset = 0;
    while (offset < value.length) {
      const [id, next] = varint(value, offset);
      ids.push(id);
      offset = next;
    }
    return ids;
  }
  return Array.isArray(value) ? value : value ? [value] : [];
};
const linkValue = (value) => {
  const ids = links(value);
  return ids.length > 1 ? ids : (ids[0] ?? 0);
};
import { compileIlionBook } from './gfl2-ilion.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const tableNames = [
  'ChapterData',
  'StoryData',
  'StageData',
  'AvgPlotData',
  'LangPackageTableCnData',
  'AvgContentData',
];
export function readEventSpec(path) {
  const spec = JSON.parse(readFileSync(path, 'utf8'));
  if (
    !/^gfl2-[a-z0-9-]+$/.test(spec.id) ||
    !spec.title ||
    !Array.isArray(spec.chapters) ||
    !spec.chapters.length
  )
    throw Error('Invalid event specification');
  return spec;
}
function loadTables() {
  const directory =
    process.env.ONLYSTORY_GFL2_TABLES ||
    resolve(
      process.env.GF2_GAME_ROOT || 'D:/Program Files/GF2Exilium',
      'GF2 Game/GF2_Exilium_Data/LocalCache/Data/Table',
    );
  return Object.fromEntries(
    tableNames.map((name) => [
      name,
      readFileSync(resolve(directory, `${name}.bytes`)),
    ]),
  );
}
export function eventNodes(spec, tables) {
  const load = (name) => [...tableRows(tables[name])];
  const lang = new Map(
    load('LangPackageTableCnData').map((row) => [
      row[1],
      row[2]?.toString('utf8'),
    ]),
  );
  const text = (value) =>
    lang.get(Buffer.isBuffer(value) ? record(value)[1] : value);
  const chapters = new Map(load('ChapterData').map((row) => [row[1], row]));
  for (const chapter of spec.chapters)
    if (text(chapters.get(chapter.id)?.[3]) !== chapter.title)
      throw Error(`Chapter identity mismatch: ${chapter.id}`);
  const stages = new Map(load('StageData').map((row) => [row[1], row]));
  const plots = load('AvgPlotData');
  const chapterIds = new Set(spec.chapters.map((chapter) => chapter.id));
  const nodes = load('StoryData')
    .filter((row) => chapterIds.has(row[2]))
    .map((row) => {
      const stage = stages.get(row[4]);
      return {
        id: row[1],
        chapter: row[2],
        before: linkValue(row[5]),
        after: linkValue(row[6]),
        position: row[7]?.toString('utf8'),
        kind: row[11],
        flag: row[23],
        code: stage?.[3]?.toString('utf8'),
        title: text(stage?.[4]),
        plots: plots
          .filter((plot) => Math.floor(plot[1] / 100) === row[4])
          .sort((a, b) => (a[5] ?? 0) - (b[5] ?? 0) || a[1] - b[1])
          .map((plot) => ({
            id: plot[1],
            kind: plot[5],
            scripts: plot[2].toString('utf8').split(',').filter(Boolean),
          })),
      };
    });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const result = [];
  for (const chapter of spec.chapters) {
    const main = nodes
      .filter(
        (node) => node.chapter === chapter.id && [1, 2, 13].includes(node.kind),
      )
      .sort(
        (a, b) =>
          Number(a.position?.split(',')[0]) -
            Number(b.position?.split(',')[0]) || a.id - b.id,
      );
    if (!main.length) throw Error(`No main route in chapter ${chapter.id}`);
    const mainIds = new Set(main.map((node) => node.id)),
      visited = new Set();
    for (const node of main) {
      for (const predecessor of links(node.before).filter((id) =>
        mainIds.has(id),
      )) {
        if (!visited.has(predecessor))
          throw Error(
            `Main route is not topologically ordered: ${predecessor} -> ${node.id}`,
          );
        if (!links(byId.get(predecessor).after).includes(node.id))
          throw Error(
            `Inconsistent main route edge: ${predecessor} -> ${node.id}`,
          );
      }
      visited.add(node.id);
    }
    for (const node of main) result.push(node);
    const side = nodes.filter(
      (node) =>
        node.chapter === chapter.id &&
        [11, 12, 14].includes(node.kind) &&
        node.flag !== 0,
    );
    for (const branch of side.filter(
      (node) => !side.some((other) => links(node.before).includes(other.id)),
    )) {
      let current = branch;
      const seen = new Set();
      while (current) {
        if (
          seen.has(current.id) ||
          current.chapter !== chapter.id ||
          current.kind !== branch.kind
        )
          throw Error('Invalid side-story chain');
        seen.add(current.id);
        const predecessors = links(branch.before);
        if (predecessors.length > 1)
          throw Error('Multiple side-story anchors require review');
        const anchor = byId.get(predecessors[0]);
        result.push({
          ...current,
          placement: {
            kind: 'side',
            branch: `${spec.id}-branch-${branch.id}`,
            ...(anchor?.plots.length && [1, 2, 13].includes(anchor.kind)
              ? { after: `${spec.id}-${anchor.id}` }
              : {}),
          },
        });
        const successors = links(current.after);
        if (successors.length > 1)
          throw Error('Branching side-story chain requires review');
        const next = byId.get(successors[0]);
        if (
          next &&
          (next.kind !== branch.kind ||
            !links(next.before).includes(current.id))
        )
          throw Error('Side story leaves its source branch');
        current = next;
      }
    }
    if (
      result.filter((node) => node.chapter === chapter.id && node.placement)
        .length !== side.length
    )
      throw Error('Unvisited side story');
  }
  const covered = new Set(result.map((node) => node.id));
  const unhandled = nodes.filter(
    (node) => node.plots.length && !covered.has(node.id),
  );
  if (unhandled.length)
    throw Error(
      `Unsupported story-bearing node kinds: ${unhandled.map((n) => `${n.id}:${n.kind}`).join(',')}`,
    );
  for (const node of result)
    if (node.plots.length && (!node.title || !node.code))
      throw Error(`Missing stage identity ${node.id}`);
  return result;
}
export function importEventPackage(project, spec) {
  const generated = resolve(project, `src/generated/${spec.id}.json`);
  const baseDir = resolve(project, `.cache/${spec.id}`);
  if (!existsSync(resolve(baseDir, 'books-provenance.json'))) {
    if (!existsSync(generated)) writeChanged(generated, null);
    return null;
  }
  const tables = loadTables();
  const graph = eventNodes(spec, tables);
  const nodes = graph.filter((node) => node.plots.length);
  const content = localizedContent(
    tables.LangPackageTableCnData,
    tables.AvgContentData,
  );
  const books = new Map(),
    counts = {},
    sections = [];
  for (const node of nodes) {
    const compiled = node.plots
      .flatMap((plot) => plot.scripts)
      .map((script) => {
        if (!/^[A-Za-z0-9_]+$/.test(script))
          throw Error('Invalid script label');
        const bytes = readFileSync(
          resolve(baseDir, 'books', `${script}.book.json`),
        );
        const allowed = [
          'Shake',
          'SetShader',
          'RuleFadeIn',
          'WaitInput',
          'EndPage',
          'RuleFadeOut',
          'TextGroup',
          'TextGroupOff',
        ];
        if (
          (spec.presentationCommands ?? []).some(
            (name) => !allowed.includes(name),
          )
        )
          throw Error('Unreviewed additional presentation command');
        const raw = JSON.parse(bytes.toString('utf8'));
        for (const grid of raw.importGridList ?? []) {
          const header = grid.rows[0].strings;
          const entities = new Map(
            (grid.entityIndexTbl ?? []).map((row, i) => [
              row,
              grid.entityDataList[i].originalStrings,
            ]),
          );
          for (const row of grid.rows.slice(1)) {
            if (row.isEmpty || row.isCommentOut) continue;
            const strings = entities.get(row.rowIndex) ?? row.strings;
            const name = strings[header.indexOf('Command')];
            if (
              ['WaitInput', 'EndPage'].includes(name) &&
              header.some(
                (key, index) => /^Arg\d+$/.test(key) && strings[index]?.trim(),
              )
            )
              throw Error('Parameterized page/input wait needs review');
          }
        }
        const book = compileIlionBook(raw, script, content, {
          allowEof: spec.allowSourceEof === true,
          presentation: spec.presentationCommands ?? [],
          sourceGaps: spec.sourceGaps ?? [],
        });
        books.set(script, {
          script,
          sha256: hash(bytes),
          textRows: book.passages.length,
          ...(book.boundary ? { boundary: book.boundary } : {}),
        });
        for (const [name, count] of Object.entries(book.commandCounts))
          counts[name] = (counts[name] ?? 0) + count;
        return book;
      });
    const last = compiled.at(-1);
    if (last.passages.at(-1)?.kind === 'video') {
      const command = last.commands.at(-1);
      last.passages.push({
        id:
          last.boundary === 'source-eof'
            ? `${last.script}:end`
            : `${last.script}:${command.sourceRow}`,
        kind: 'end',
        text: '',
        textFemale: '',
        speaker: '',
        speakerFemale: '',
        window: 'AVGNarrator',
        source: {
          script: last.script,
          row: command.sourceRow,
          contentId: 0,
          textId: 0,
        },
      });
    }
    const passages = compiled.flatMap((book) => book.passages);
    for (let i = 0; i < compiled.length; i++) {
      const book = compiled[i];
      if (!book.flow) continue;
      for (const p of book.passages)
        if (book.flow.exits.includes(p.id)) {
          p.next = compiled[i + 1]?.passages[0]?.id ?? null;
          if (!p.next) p.kind = 'end';
        }
    }
    if (!passages.length) throw Error(`Story ${node.id} has no passages`);
    const id = `${spec.id}-${node.id}`,
      base = `/private/${spec.id}`;
    const reader = { id, passages },
      archive = { id, title: `${node.code} ${node.title}`, books: compiled };
    const readerPath = `${base}/readers/${node.id}.json`,
      sourcePath = `${base}/sections/${node.id}.json`;
    writeChanged(resolve(project, `public${readerPath}`), reader);
    writeChanged(resolve(project, `public${sourcePath}`), archive);
    const chapter = spec.chapters.find((c) => c.id === node.chapter);
    sections.push({
      id,
      title: archive.title,
      order: sections.length + 1,
      ...(spec.chapters.length > 1
        ? {
            chapter: {
              id: String(chapter.id),
              title: chapter.label ?? chapter.title,
              order: spec.chapters.indexOf(chapter) + 1,
            },
          }
        : {}),
      ...(node.placement ? { placement: node.placement } : {}),
      scripts: compiled.map((book) => book.script),
      textRows: passages.length,
      firstNode: passages[0].id,
      lastNode: last.flow?.exits[0] ?? passages.at(-1).id,
      characters: passages.reduce((sum, p) => sum + p.text.length, 0),
      contentUrl: `${readerPath}?v=${hash(JSON.stringify(reader)).slice(0, 16)}`,
      sourceUrl: `${sourcePath}?v=${hash(JSON.stringify(archive)).slice(0, 16)}`,
      source: node,
    });
  }
  if (
    spec.expectedSections !== undefined &&
    spec.expectedSections !== sections.length
  )
    throw Error(
      `Expected ${spec.expectedSections} sections; found ${sections.length}`,
    );
  if (spec.expectedScripts !== undefined && spec.expectedScripts !== books.size)
    throw Error(
      `Expected ${spec.expectedScripts} scripts; found ${books.size}`,
    );
  const coverage = {
    scripts: books.size,
    sections: sections.length,
    textRows: counts.Text ?? 0,
    passages: sections.reduce((sum, s) => sum + s.textRows, 0),
    commandCounts: counts,
    mainStories: nodes.filter((n) => !n.placement).length,
    sideStories: nodes.filter((n) => n.placement).length,
    combatOnlyNodes: graph.filter((n) => !n.plots.length).map((n) => n.id),
    unresolvedText: spec.sourceGaps?.length ?? 0,
    unresolvedSpeakers: 0,
    mode: 'text',
  };
  const provenance = {
    tables: tableNames.map((name) => ({ name, sha256: hash(tables[name]) })),
    books: [...books.values()],
    extraction: JSON.parse(
      readFileSync(resolve(baseDir, 'books-provenance.json'), 'utf8'),
    ),
  };
  const event = { ...spec, sections, coverage, provenance };
  writeChanged(generated, event);
  writeChanged(resolve(project, `public/private/${spec.id}/provenance.json`), {
    coverage,
    provenance,
    edition: spec.edition,
    versionLabel: spec.versionLabel,
  });
  console.log(
    `${spec.id}: ${sections.length} stories, ${books.size} scripts, ${coverage.textRows} text rows.`,
  );
  return event;
}
export function eventSpecs(project = root) {
  const directory = resolve(project, 'scripts/events');
  return existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => readEventSpec(resolve(directory, name)))
    : [];
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const index = process.argv.includes('--index');
  const path = process.argv[index ? 3 : 2];
  if (!path) throw Error('Pass an event specification JSON path');
  const spec = readEventSpec(resolve(path));
  if (index) {
    const nodes = eventNodes(spec, loadTables());
    writeChanged(resolve(root, `.cache/${spec.id}/nodes.json`), nodes);
    console.log(
      `${spec.id}: ${nodes.length} source route nodes, ${nodes.filter((n) => n.plots.length).length} story nodes.`,
    );
  } else importEventPackage(root, spec);
}
