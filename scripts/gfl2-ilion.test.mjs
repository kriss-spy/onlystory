import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { compileIlionBook } from './gfl2-ilion.mjs';
import { sceneSteps } from './gfl2-scenes.mjs';
const fixture = (rows) => ({
  importGridList: [
    {
      rows: [
        { strings: ['Command', 'Arg1', 'Text'] },
        ...rows.map((strings, i) => ({ rowIndex: i + 1, strings })),
      ],
    },
  ],
});
const content = new Map([
  [1, { text: 'Original prompt', textId: 11 }],
  [2, { text: 'Original reply', textId: 12 }],
]);

test('reviewed video EOF preserves source commands and creates a distinct reader endpoint', () => {
  const raw = fixture([['CharacterOff'], ['Video', '30301', '', 'UICamera']]);
  raw.importGridList[0].rows[0].strings.push('Arg2');
  assert.throws(() => compileIlionBook(raw, 'AA03001', content), /video flow/);
  const result = compileIlionBook(raw, 'AA03001', content, { allowEof: true });
  assert.equal(result.boundary, 'source-eof');
  assert.deepEqual(
    result.commands.map((c) => c.Command),
    ['CharacterOff', 'Video'],
  );
  result.passages.push({ id: 'AA03001:end', kind: 'end' });
  assert.deepEqual(
    sceneSteps([result]).map((s) => s.id),
    ['AA03001:2', 'AA03001:end'],
  );
  raw.importGridList[0].rows.push({ rowIndex: 3, strings: ['Text', '', '1'] });
  assert.throws(
    () => compileIlionBook(raw, 'AA03001', content, { allowEof: true }),
    /video flow/,
  );
});
test('Ilion preserves single-option prompt text and refuses divergent selections', () => {
  const raw = fixture([
    ['**M24011062 Begin'],
    ['Selection', '**M24011062', '1'],
    ['**M24011062'],
    ['Text', '', '2'],
    ['EndScenario'],
  ]);
  const compiled = compileIlionBook(raw, 'M24011', content);
  assert.deepEqual(
    compiled.passages.map((p) => p.text),
    ['Original prompt', 'Original reply'],
  );
  assert.equal(compiled.commands[1].Command, 'Selection');
  assert.equal(compiled.passages[0].source.command, 'Selection');
  assert.deepEqual(
    sceneSteps([compiled]).map((s) => s.id),
    compiled.passages.map((p) => p.id),
  );
  raw.importGridList[0].rows[3].strings[0] = '**OTHER';
  assert.throws(
    () => compileIlionBook(raw, 'M24011', content),
    /unsupported selection graph/,
  );
});
test('video-only books retain original media reference and reject mixed control flow', () => {
  const book = compileIlionBook(
    fixture([['Video', '12201'], ['EndScenario']]),
    'MA22001',
    content,
  );
  assert.equal(book.passages[0].kind, 'video');
  assert.equal(book.passages[0].video, '12201');
  assert.deepEqual(
    sceneSteps([book]).map((p) => p.id),
    ['MA22001:1'],
  );
  assert.throws(
    () =>
      compileIlionBook(
        fixture([['Video', '12201'], ['Text', '', '1'], ['EndScenario']]),
        'MA22001',
        content,
      ),
    /unsupported mixed video flow/,
  );
});
const manifest = 'src/generated/gfl2-ilion.json';
const event = existsSync(manifest)
  ? JSON.parse(readFileSync(manifest, 'utf8'))
  : null;
test(
  'real Ilion import covers all three chapters and 14 optional stories without losing source passages',
  { skip: !event },
  () => {
    assert.equal(event.sections.length, 65);
    assert.equal(event.coverage.scripts, 101);
    assert.equal(event.coverage.textRows, 14511);
    assert.deepEqual(
      [1, 2, 3].map(
        (order) =>
          event.sections.filter((s) => s.chapter.order === order).length,
      ),
      [24, 25, 16],
    );
    const side = event.sections.filter((s) => s.placement);
    assert.equal(side.length, 14);
    const byId = new Map(event.sections.map((s) => [s.id, s]));
    for (const s of side) {
      const anchor = byId.get(s.placement.after);
      assert(anchor);
      assert(!anchor.placement);
      assert.equal(anchor.chapter.id, s.chapter.id);
    }
    const a = byId.get('gfl2-ilion-345813'),
      b = byId.get('gfl2-ilion-345818');
    assert.equal(a.placement.branch, b.placement.branch);
    assert.equal(a.placement.after, 'gfl2-ilion-34516');
    assert.equal(b.placement.after, a.placement.after);
    let text = 0,
      selection = 0,
      video = 0,
      end = 0;
    const scripts = new Set(),
      ids = new Set();
    for (const s of event.sections) {
      const read = (url) =>
        JSON.parse(
          readFileSync(
            'public' + new URL(url, 'http://localhost').pathname,
            'utf8',
          ),
        );
      const reader = read(s.contentUrl),
        archive = read(s.sourceUrl);
      assert.deepEqual(
        reader.passages,
        archive.books.flatMap((b) => b.passages),
      );
      for (const book of archive.books) {
        assert(!scripts.has(book.script));
        scripts.add(book.script);
        text += book.commands.filter((c) => c.Command === 'Text').length;
        selection += book.commands.filter(
          (c) => c.Command === 'Selection',
        ).length;
        video += book.passages.filter((p) => p.kind === 'video').length;
        end += book.passages.filter((p) => p.kind === 'end').length;
      }
      for (const p of reader.passages) {
        assert(!ids.has(p.id));
        ids.add(p.id);
        if (!p.kind) assert(p.text.length > 0);
      }
    }
    assert.equal(text, 14511);
    assert.equal(selection, 3);
    assert.equal(video, 4);
    assert.equal(end, 2);
    assert.equal(scripts.size, 101);
  },
);
const sceneManifest = 'src/generated/gfl2-ilion-scenes.json';
const scenes = existsSync(sceneManifest)
  ? JSON.parse(readFileSync(sceneManifest, 'utf8'))
  : null;
test(
  'real Ilion scene packages align video, prompt and end boundaries with every reader passage',
  { skip: !event || !scenes },
  () => {
    const read = (url) =>
      JSON.parse(
        readFileSync(
          'public' + new URL(url, 'http://localhost').pathname,
          'utf8',
        ),
      );
    assert.equal(Object.keys(scenes.sections).length, 65);
    for (const section of event.sections) {
      const program = read(scenes.sections[section.id].url);
      const reader = read(section.contentUrl);
      assert.deepEqual(
        program.steps.map((p) => p.id),
        reader.passages.map((p) => p.id),
      );
      for (const passage of reader.passages)
        if (passage.kind === 'video') {
          const movie = program.videos[passage.video];
          assert(movie?.url);
          assert.equal(movie.voices['zh-CN'].sourceAudioTrack, 0);
          assert.equal(movie.voices.ja.sourceAudioTrack, 1);
          assert.notEqual(movie.voices['zh-CN'].url, movie.voices.ja.url);
          for (const voice of Object.values(movie.voices))
            assert(
              program.files.some((file) => file.url === voice.url),
              `Voice missing from offline package: ${voice.url}`,
            );
        }
      for (const file of program.files)
        assert(
          existsSync(
            'public' +
              decodeURIComponent(
                new URL(file.url, 'http://localhost').pathname,
              ),
          ),
          `Missing local media: ${file.url}`,
        );
    }
  },
);
