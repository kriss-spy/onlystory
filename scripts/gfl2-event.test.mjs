import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileBook, hash } from './gfl2-event.mjs';
import { fields, tableRows, localizedContent } from './gfl2-tables.mjs';

const encodeVarint = (value) => {
  let n = BigInt(value);
  const bytes = [];
  do {
    bytes.push(Number(n & 127n) | (n > 127n ? 128 : 0));
    n >>= 7n;
  } while (n);
  return Buffer.from(bytes);
};
const field = (number, value) =>
  typeof value === 'number'
    ? Buffer.concat([encodeVarint(number * 8), encodeVarint(value)])
    : Buffer.concat([
        encodeVarint(number * 8 + 2),
        encodeVarint(value.length),
        value,
      ]);
const table = (rows) =>
  Buffer.concat([Buffer.alloc(4), ...rows.map((row) => field(1, row))]);
const header = ['Command', 'Arg1', 'Text', 'WindowType'];
const row = (rowIndex, strings, extras = {}) => ({
  rowIndex,
  strings,
  ...extras,
});
const book = (rows) => ({
  importGridList: [{ rows: [{ strings: header }, ...rows] }],
});
const content = new Map([
  [
    1,
    {
      text: 'Second ID, first source row',
      textFemale: 'Alternate text',
      textId: 11,
    },
  ],
  [9, { text: 'First ID, second source row', textId: 19 }],
  [860, { text: 'Speaker', textFemale: 'Alternate speaker', textId: 90 }],
]);

test('source gaps require exact reviewed row/reference identity and stay visibly labeled', () => {
  const raw = book([row(1, ['Text', '', '']), row(2, ['EndScenario'])]);
  assert.throws(() => compileBook(raw, 'A18011', content), /nonnumeric/);
  const options = {
    sourceGaps: [
      {
        script: 'A18011',
        row: 1,
        reference: '',
        reason: 'Installed row has no text ID',
      },
    ],
  };
  const result = compileBook(raw, 'A18011', content, options);
  assert.equal(
    result.passages[0].source.unavailable,
    'Installed row has no text ID',
  );
  assert.match(result.passages[0].text, /原始游戏文件缺少/);
  assert.equal(result.commands[0].Text, '');
  assert.throws(
    () => compileBook(raw, 'A18012', content, options),
    /nonnumeric/,
  );
});

test('source EOF requires explicit review and a final dialogue row', () => {
  const raw = book([row(1, ['Text', '', '1'])]);
  assert.throws(() => compileBook(raw, 'A16001', content), /boundary/);
  const result = compileBook(raw, 'A16001', content, { allowEof: true });
  assert.equal(result.boundary, 'source-eof');
  assert.equal(result.commands.length, 1);
  assert.throws(
    () =>
      compileBook(
        book([row(1, ['Text', '', '1']), row(2, ['Wait', '1'])]),
        'A16001',
        content,
        { allowEof: true },
      ),
    /boundary/,
  );
  assert.throws(
    () =>
      compileBook(book([row(1, ['Jump', 'target'])]), 'A16001', content, {
        allowEof: true,
      }),
    /control flow/,
  );
});

test('local table reader joins nested localization references and rejects truncated fields', () => {
  const language = table([
    Buffer.concat([field(1, 11), field(2, Buffer.from('原文'))]),
  ]);
  const references = table([
    Buffer.concat([field(1, 1), field(2, field(1, 11))]),
  ]);
  assert.equal(localizedContent(language, references).get(1).text, '原文');
  assert.throws(
    () => [...fields(Buffer.from([0x12, 0x09, 0x01]))],
    /Truncated/,
  );
  assert.throws(
    () => [...tableRows(Buffer.from([255, 255, 255, 255]))],
    /index/,
  );
});
test('book compilation follows grid order, resolves speakers and retains variants and commands', () => {
  const result = compileBook(
    book([
      row(1, ['ChangeMessageWindow', 'AVGWindowFull']),
      row(2, ['Text', '860', '9']),
      row(3, ['Text', '', '1']),
      row(4, ['Text', '', 'missing'], { isCommentOut: true }),
      row(5, ['EndScenario']),
    ]),
    'A33001',
    content,
  );
  assert.deepEqual(
    result.passages.map((p) => p.source.contentId),
    [9, 1],
  );
  assert.equal(result.passages[0].speaker, 'Speaker');
  assert.equal(result.passages[0].speakerFemale, 'Alternate speaker');
  assert.equal(result.passages[1].textFemale, 'Alternate text');
  assert.equal(result.passages[0].window, 'AVGWindowFull');
  assert.equal(result.commands.length, 4);
  assert.equal(result.commands.at(-1).Command, 'EndScenario');
});
test('missing text, missing speakers, unknown flow and reordered source rows fail import', () => {
  assert.throws(
    () => compileBook(book([row(1, ['Jump', 'target'])]), 'A33001', content),
    /control flow/,
  );
  assert.throws(
    () =>
      compileBook(
        book([row(1, ['Text', '', '8']), row(2, ['EndScenario'])]),
        'A33001',
        content,
      ),
    /missing original text/,
  );
  assert.throws(
    () =>
      compileBook(
        book([row(1, ['Text', '861', '1']), row(2, ['EndScenario'])]),
        'A33001',
        content,
      ),
    /unresolved speaker/,
  );
  assert.throws(
    () =>
      compileBook(
        book([row(2, ['Text', '', '1']), row(1, ['EndScenario'])]),
        'A33001',
        content,
      ),
    /strictly ordered/,
  );
});

test('dynamic command arguments retain the original parameter references', () => {
  const source = book([
    row(1, ['ZoomCamera', '0']),
    row(2, ['Text', '', '1']),
    row(3, ['EndScenario']),
  ]);
  source.importGridList[0].entityIndexTbl = [1];
  source.importGridList[0].entityDataList = [
    { originalStrings: ['ZoomCamera', '&needSize'] },
  ];
  assert.equal(
    compileBook(source, 'A33001', content).commands[0].Arg1,
    '&needSize',
  );
  source.importGridList[0].entityDataList = [];
  assert.throws(
    () => compileBook(source, 'A33001', content),
    /dynamic argument/,
  );
});

const manifestPath = resolve('src/generated/gfl2-event.json');
const event = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : null;
test(
  'private import retains every original row across all thirty scripts',
  { skip: !event },
  () => {
    assert.equal(event.sections.length, 24);
    assert.equal(event.coverage.textRows, 4443);
    assert.equal(event.coverage.scripts, 30);
    assert.equal(event.coverage.unresolvedSpeakers, 0);
    assert.equal(
      new Set(event.sections.map((section) => section.title)).size,
      24,
    );
    assert.equal(event.sections[0].title, 'CS-1-1 长梦初醒');
    assert.equal(event.sections[1].title, 'CA-1-1 精英姿态 · 战前');
    assert.equal(event.sections[2].title, 'CA-1-1 精英姿态 · 战后');
    assert.equal(event.sections.at(-1).title, 'CS-1-6 祈盼明天');
    assert.equal(event.sections[1].source.plotKind, 11);
    assert.equal(event.sections[2].source.plotKind, 21);
    const books = [];
    const ids = new Set();
    let textRows = 0;
    let commands = 0;
    for (const section of event.sections) {
      const path = (url) =>
        resolve(`public${new URL(url, 'http://localhost').pathname}`);
      const reader = JSON.parse(readFileSync(path(section.contentUrl), 'utf8'));
      const archive = JSON.parse(readFileSync(path(section.sourceUrl), 'utf8'));
      assert.deepEqual(
        reader.passages,
        archive.books.flatMap((book) => book.passages),
      );
      assert.equal(reader.passages.length, section.textRows);
      for (const passage of reader.passages) {
        assert(!ids.has(passage.id));
        ids.add(passage.id);
      }
      for (const book of archive.books) {
        books.push(book.script);
        textRows += book.passages.length;
        commands += book.commands.length;
        assert.deepEqual(
          book.passages.map((p) => [p.source.row, p.source.contentId]),
          book.commands
            .filter((c) => c.Command === 'Text')
            .map((c) => [c.sourceRow, Number(c.Text)]),
        );
        const source = resolve(
          process.env.ONLYSTORY_GFL2_PROTOTYPE || '../onlystory-gfl2/prototype',
          '../event_books',
          `${book.script}.book.json`,
        );
        if (existsSync(source))
          assert.equal(
            hash(readFileSync(source)),
            event.provenance.books.find((item) => item.script === book.script)
              .sha256,
          );
      }
    }
    assert.equal(new Set(books).size, 30);
    assert.equal(textRows, 4443);
    assert.equal(commands, 14007);
    const opening = JSON.parse(
      readFileSync('src/generated/gfl2-opening.json', 'utf8'),
    );
    const first = JSON.parse(
      readFileSync(
        `public${new URL(event.sections[0].contentUrl, 'http://localhost').pathname}`,
        'utf8',
      ),
    ).passages;
    for (let i = 0; i < 12; i++) {
      assert.equal(first[i].text, opening.steps[i].text);
      assert.equal(first[i].speaker, opening.steps[i].speaker);
    }
  },
);
