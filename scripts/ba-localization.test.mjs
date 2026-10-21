import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import initSqlJs from 'sql.js';
import { compileStory } from './ba-story.mjs';
import {
  localizeBaChapter,
  validateBaEnglishAlignment,
} from './ba-localization.mjs';
import {
  decodeRow,
  decryptDatabase,
  exportDatabaseChapter,
} from '../src/downloads/ba/database.mjs';
import { cachedDatabaseChapter } from '../src/downloads/ba/source-cache.mjs';
import globalSchema from './ba-gl-schema-1.93.json' with { type: 'json' };

const row = (ScriptKr, TextJp, SelectionGroup = 0) => ({
  GroupId: 77,
  ScriptKr,
  TextJp,
  SelectionGroup,
});
const source = () => ({
  GroupId: 77,
  content: [
    row('3;린;01;hello', 'こんにちは[wa:300]、[USERNAME]。'),
    row('[s1] yes\n[s2] no', '[s1] はい\n[s2] いいえ'),
    row('#na;yes', '進む', 1),
    row('#na;no', '待つ', 2),
  ],
});
const names = { DataList: [{ NameKR: '린', NameJP: 'リン', NameEN: 'Rin' }] };
const english = () => ({
  ...source(),
  content: source().content.map((r, i) => ({
    ...r,
    TextEn: ['Hello[wa:300], [USERNAME].', '[s1] Yes\n[s2] No', 'Go.', 'Wait.'][
      i
    ],
  })),
});

test('adds actual English text, speakers, choices and wait positions without changing passage identities or source bytes', () => {
  const original = source(),
    before = JSON.stringify(original);
  const chapter = compileStory(original, names),
    graph = chapter.nodes.map((n) => [
      n.id,
      n.next,
      n.choices?.map((c) => [c.id, c.next]),
    ]);
  assert.equal(chapter.nodes[0].text.en, '');
  localizeBaChapter(chapter, original, english(), names);
  assert.equal(JSON.stringify(original), before);
  assert.equal(chapter.nodes[0].text.en, 'Hello, [USERNAME].');
  assert.equal(chapter.nodes[0].speakerLocales.en, 'Rin');
  assert.equal(chapter.nodes[0].playerName.fallbackLocales.en, 'Sensei');
  assert.equal(chapter.nodes[1].choices[1].label.en, 'No');
  assert.deepEqual(
    chapter.nodes.map((n) => [
      n.id,
      n.next,
      n.choices?.map((c) => [c.id, c.next]),
    ]),
    graph,
  );
});

test('withholds incomplete, reordered, wrong-speaker and wrong-branch translations', () => {
  for (const alter of [
    (s) => s.content.pop(),
    (s) => {
      s.content[0].TextEn = '';
    },
    (s) => {
      s.content[0].ScriptKr = '3;다른사람;01;changed';
    },
    (s) => {
      s.content[2].SelectionGroup = 2;
    },
    (s) => {
      s.content[1].TextEn = '[s1] Yes\n[s3] No';
    },
  ]) {
    const changed = english();
    alter(changed);
    assert.throws(
      () => validateBaEnglishAlignment(source(), changed),
      /BA English/,
    );
  }
});

test('accepts regional presentation timing and exact Japanese anchors with the same speaker and choice role', () => {
  const translated = english();
  translated.content[0].ScriptKr += '\n#wait;500';
  validateBaEnglishAlignment(source(), translated);
  translated.content[0].ScriptKr = '3;린;01;revised Korean typo';
  validateBaEnglishAlignment(source(), translated);
});

const originalPath = '.cache/ba-gl-assets/gl/android/raw/tables/ExcelDB.db';
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
test(
  'every advertised BA English chapter matches decoded official global rows and retains its complete JP graph',
  {
    skip: !fs.existsSync(originalPath)
      ? 'Acquire pinned global original database first'
      : false,
  },
  async () => {
    const encrypted = fs.readFileSync(originalPath);
    assert.equal(
      createHash('sha256').update(encrypted).digest('hex'),
      globalSchema.databaseSha256,
    );
    const plain = await decryptDatabase(
      encrypted,
      fs.readFileSync('.cache/ba-gl-source/key.txt', 'utf8').trim(),
    );
    const SQL = await initSqlJs();
    // Exercise the actual whole-database exporter, including unimported groups.
    // Retain just these two groups to avoid duplicating the whole source cache.
    const cache = new Map();
    const exported = new Set();
    globalThis.caches = {
      async open() {
        return {
          async match(key) {
            return cache.get(key)?.clone();
          },
          async put(key, value) {
            exported.add(key);
            if (/\/(11000|83300100100|characters)$/.test(key))
              cache.set(key, value.clone());
          },
        };
      },
    };
    const config = { schema: 'gl-1.93' };
    const originalChapter = await exportDatabaseChapter(
      plain,
      config,
      11000,
      () => {},
    );
    assert.equal(originalChapter.source.GroupId, 11000);
    assert.ok([...exported].some((key) => key.endsWith('/83300100100')));
    const largeGroup = await cachedDatabaseChapter(83300100100, config);
    assert.equal(largeGroup.source.GroupId, 83300100100);
    assert.ok(largeGroup.source.content.length);
    assert.ok(
      largeGroup.source.content.every((row) => row.GroupId === 83300100100),
    );
    const db = new SQL.Database(plain);
    try {
      const characters = {
        DataList: db
          .exec(
            'SELECT Bytes FROM ScenarioCharacterNameDBSchema ORDER BY rowid',
          )[0]
          .values.map(([b]) =>
            decodeRow(b, 'ScenarioCharacterNameExcel', globalSchema),
          ),
      };
      const episodes = read('src/generated/ba-stories.json');
      const released = new Set(
        read('.cache/ba-gl-source/availability.json').groups,
      );
      const statement = db.prepare(
        'SELECT Bytes FROM ScenarioScriptDBSchema WHERE GroupId=? ORDER BY rowid',
      );
      let advertised = 0;
      try {
        for (const episode of episodes) {
          if (!episode.textLocales.includes('en')) continue;
          assert.ok(
            released.has(Number(episode.id.replace('ba-jp-', ''))),
            `${episode.id} global release gate`,
          );
          advertised++;
          const group = Number(episode.id.replace('ba-jp-', ''));
          statement.bind([group]);
          const content = [];
          while (statement.step()) {
            const row = decodeRow(
              statement.get()[0],
              'ScenarioScriptExcel',
              globalSchema,
            );
            if (!row.TeenMode) content.push(row);
          }
          statement.reset();
          const folder = `public/private/ba-jp/${group}/`;
          const original = read(folder + 'source.json'),
            jpNames = read(folder + 'characters.json');
          const chapter = compileStory(original, jpNames);
          const identities = chapter.nodes.map((n) => [
            n.id,
            n.next,
            n.choices?.map((c) => [c.id, c.next]),
          ]);
          localizeBaChapter(
            chapter,
            original,
            { GroupId: group, content },
            characters,
          );
          const published = read(folder + 'chapter.json');
          for (const [i, node] of chapter.nodes.entries()) {
            assert.equal(
              published.nodes[i].text.en,
              node.text.en,
              `${node.id} English`,
            );
            assert.deepEqual(
              published.nodes[i].speakerLocales,
              node.speakerLocales,
              `${node.id} speaker`,
            );
            assert.deepEqual(
              published.nodes[i].choices?.map((c) => c.label.en),
              node.choices?.map((c) => c.label.en),
              `${node.id} choices`,
            );
          }
          assert.deepEqual(
            published.nodes.map((n) => [
              n.id,
              n.next,
              n.choices?.map((c) => [c.id, c.next]),
            ]),
            identities,
          );
          assert.deepEqual(
            read(folder + 'scenes.json').rowLocales.en,
            content.map((r) => r.TextEn ?? ''),
          );
        }
      } finally {
        statement.free();
      }
      assert.equal(
        advertised,
        read('docs/ba-english-verification.json').alignedChapters,
      );
    } finally {
      db.close();
    }
  },
);
