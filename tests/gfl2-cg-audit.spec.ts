import { test, expect } from '@playwright/test';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  buildTimeline,
  buildPathTimeline,
} from '../src/playback/gfl2/event-state';
import { routeTo } from '../scripts/gfl2-route.mjs';
import type { EventProgram } from '../src/playback/gfl2/event-types';

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const readUrl = (url: string) =>
  read(
    `public${decodeURIComponent(new URL(url, 'http://localhost').pathname)}`,
  );
const output = 'private-review/cg-audit';
const auditVersion = createHash('sha256')
  .update(readFileSync('src/playback/gfl2/event-state.ts'))
  .update(readFileSync('src/playback/gfl2/event-stage.ts'))
  .update(readFileSync('tests/gfl2-cg-audit.spec.ts'))
  .digest('hex');
mkdirSync(output, { recursive: true });
const packages = [
  {
    event: read('src/generated/gfl2-event.json'),
    scenes: read('src/generated/gfl2-scenes.json'),
    id: 'gfl2-event',
    books: '../onlystory-gfl2/event_books',
  },
  {
    event: read('src/generated/gfl2-ilion.json'),
    scenes: read('src/generated/gfl2-ilion-scenes.json'),
    id: 'gfl2-ilion',
    books: '.cache/gfl2-ilion/books',
  },
  ...read('src/generated/gfl2-packages.json').map((p: any) => ({
    ...p,
    id: p.event.id,
    books: `.cache/${p.event.id}/books`,
  })),
];
const findings: any[] = [];
const cgCases: any[] = [];
let bookCount = 0,
  graphicCount = 0;
const normalize = (c: any) =>
  Object.fromEntries(
    [
      'Command',
      'Arg1',
      'Arg2',
      'Arg3',
      'Arg4',
      'Arg5',
      'Arg6',
      'Arg7',
      'Arg8',
      'WaitType',
      'sourceRow',
    ].map((k) => [k, c[k] ?? '']),
  );
for (const p of packages) {
  const media = read(`public/private/${p.id}/media/manifest.json`);
  for (const section of p.event.sections) {
    const archive = readUrl(section.sourceUrl),
      program = readUrl(p.scenes.sections[section.id].url) as EventProgram;
    const timeline = buildTimeline(program);
    const reader = readUrl(section.contentUrl);
    for (const book of archive.books) {
      bookCount++;
      const sourcePath = `${p.books}/${book.script}.book.json`,
        bytes = readFileSync(sourcePath);
      const provenance = p.event.provenance.books.find(
        (b: any) => b.script === book.script,
      );
      const raw = JSON.parse(bytes.toString('utf8')),
        grid = raw.importGridList[0],
        header = grid.rows[0].strings;
      const entities = new Map(
        (grid.entityIndexTbl ?? []).map((row: number, i: number) => [
          row,
          grid.entityDataList[i].originalStrings,
        ]),
      );
      for (const row of grid.rows
        .slice(1)
        .filter((r: any) => !r.isEmpty && !r.isCommentOut)) {
        const strings = entities.get(row.rowIndex) ?? row.strings;
        const command: any = {
          ...Object.fromEntries(
            header.map((k: string, i: number) => [
              k,
              (strings as string[])[i] ?? '',
            ]),
          ),
          sourceRow: row.rowIndex,
        };
        if (!['Bg', 'Sprite'].includes(command.Command)) continue;
        graphicCount++;
        const compiled = book.commands.find(
          (c: any) => c.sourceRow === row.rowIndex,
        );
        const matches = program.steps
          .flatMap((s) =>
            [...s.commands, ...(s.exit ?? [])].map((c) => ({
              step: s,
              command: c,
            })),
          )
          .filter(
            (x) =>
              x.step.script === book.script &&
              x.command.sourceRow === row.rowIndex,
          );
        const asset = media.backgrounds[command.Arg1];
        const cg = /cg/i.test(
          [command.Arg1, command.Arg2, asset?.sourcePath ?? ''].join(' '),
        );
        const entry: any = {
          event: p.id,
          section: section.id,
          title: section.title,
          script: book.script,
          row: row.rowIndex,
          label: command.Arg1,
          cg,
          sourceHashValid:
            provenance?.sha256 ===
            createHash('sha256').update(bytes).digest('hex'),
          compiledExact:
            JSON.stringify(normalize(compiled ?? {})) ===
            JSON.stringify(normalize(command)),
          sceneExact:
            matches.length === 1 &&
            JSON.stringify(normalize(matches[0].command)) ===
              JSON.stringify(normalize(command)),
          assetAvailable: !!program.backgrounds[command.Arg1],
          sourcePath: asset?.sourcePath ?? null,
        };
        if (cg) {
          const match = matches[0];
          const index = match ? program.steps.indexOf(match.step) : -1;
          const route = match
            ? routeTo(reader.passages, match.step.id)
            : undefined;
          const states =
            program.steps.some((s) => s.incoming) && route
              ? buildPathTimeline(program, route.ids)
              : timeline;
          const layer =
            index < 0
              ? undefined
              : states[index].layers.find(
                  (l) => l.asset === command.Arg1 || l.id === command.Arg1,
                );
          entry.step = match?.step.id;
          entry.answers = route?.answers ?? {};
          entry.retainedAtPassage = !!layer;
          entry.alpha = layer?.alpha;
          entry.url = program.backgrounds[command.Arg1]?.url;
          entry.explicitlyHidden =
            layer?.alpha === 0 &&
            match?.step.commands.some(
              (c) =>
                c.Command === 'Tween' &&
                c.Arg1 === command.Arg1 &&
                c.Arg2 === 'ColorTo' &&
                /\balpha=0(?:\s|$)/.test(c.Arg3),
            );
          if (entry.explicitlyHidden) {
            const reveal = timeline.findIndex(
              (state, i) =>
                i > index &&
                program.steps[i].script === book.script &&
                state.layers.some(
                  (l) =>
                    (l.asset === command.Arg1 || l.id === command.Arg1) &&
                    l.alpha > 0,
                ),
            );
            entry.revealStep = program.steps[reveal]?.id;
          }
          cgCases.push({ ...entry, index });
        }
        findings.push(entry);
      }
    }
  }
}
const summary = {
  auditVersion,
  events: packages.length,
  books: bookCount,
  graphicCommands: graphicCount,
  cgReferences: cgCases.length,
  uniqueCGs: new Set(cgCases.map((c) => c.url)).size,
  findings,
};
writeFileSync(
  `${output}/source-audit.json`,
  JSON.stringify(summary, null, 2) + '\n',
);

test('all 36 events preserve every source graphic command; every CG has an asset and passage', () => {
  expect(packages).toHaveLength(36);
  for (const entry of findings) {
    expect(entry.sourceHashValid, JSON.stringify(entry)).toBe(true);
    expect(entry.compiledExact, JSON.stringify(entry)).toBe(true);
    expect(entry.sceneExact, JSON.stringify(entry)).toBe(true);
  }
  expect(cgCases.length).toBeGreaterThan(0);
  for (const c of cgCases) {
    expect(c.assetAvailable, JSON.stringify(c)).toBe(true);
    expect(c.retainedAtPassage, JSON.stringify(c)).toBe(true);
    if (c.explicitlyHidden)
      expect(c.revealStep, JSON.stringify(c)).toBeTruthy();
    else expect(c.alpha, JSON.stringify(c)).toBeGreaterThan(0);
    expect(existsSync(`public${c.url}`), JSON.stringify(c)).toBe(true);
  }
});

for (const [index, c] of cgCases.entries()) {
  test(`${String(index + 1).padStart(3, '0')} ${c.event} ${c.script}:${c.row} ${c.label}`, async ({
    page,
  }) => {
    expect(c.step).toBeTruthy();
    const requests: string[] = [];
    page.on('requestfailed', (r) => requests.push(r.url()));
    await page.goto(
      `/read/gfl2/${c.section}?line=${encodeURIComponent(c.revealStep ?? c.step)}&choices=${encodeURIComponent(JSON.stringify(c.answers))}`,
    );
    const host = page.getByTestId('native-layers');
    await expect(host.locator('canvas')).toBeVisible({ timeout: 15000 });
    const graphic = () =>
      host.evaluate(
        (el, label) =>
          (
            el as HTMLElement & {
              playbackDiagnostics?: {
                graphics: {
                  id: string;
                  url: string;
                  alpha: number;
                  visible: boolean;
                  width: number;
                  height: number;
                }[];
              };
            }
          ).playbackDiagnostics?.graphics.find((g) => g.id === label),
        c.label,
      );
    try {
      await expect
        .poll(
          async () => {
            const g = await graphic();
            return (
              !!g &&
              g.visible &&
              g.alpha > 0 &&
              g.width > 0 &&
              g.height > 0 &&
              g.url === c.url
            );
          },
          { timeout: 15000 },
        )
        .toBe(true);
    } catch (error) {
      const name = `${String(index + 1).padStart(3, '0')}-${c.event}-${c.script}-${c.row}`;
      writeFileSync(
        `${output}/${name}.json`,
        JSON.stringify(
          {
            label: c.label,
            step: c.step,
            graphic: await graphic(),
            expectedUrl: c.url,
            result: 'fail',
          },
          null,
          2,
        ),
      );
      await page.screenshot({ path: `${output}/${name}-failed.png` });
      throw error;
    }
    expect(requests.filter((u) => u.includes(c.url))).toEqual([]);
    const name = `${String(index + 1).padStart(3, '0')}-${c.event}-${c.script}-${c.row}`;
    await page.screenshot({ path: `${output}/${name}.png` });
    writeFileSync(
      `${output}/${name}.json`,
      JSON.stringify(
        {
          event: c.event,
          section: c.section,
          script: c.script,
          row: c.row,
          label: c.label,
          step: c.step,
          graphic: await graphic(),
          result: 'pass',
          auditVersion,
        },
        null,
        2,
      ) + '\n',
    );
  });
}
