import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { sceneSteps } from './gfl2-scenes.mjs';
import { createHash } from 'node:crypto';

test('published events cover every named CN catalog identity and all 28 remaining packages', (t) => {
  const path = 'src/generated/gfl2-packages.json';
  if (!existsSync(path)) return t.skip('Import private library first.');
  const packages = JSON.parse(readFileSync(path, 'utf8'));
  const catalog = JSON.parse(
    readFileSync('docs/gfl2-cn-event-catalog.json', 'utf8'),
  );
  const legacy = ['gfl2-event', 'gfl2-ilion'].map((id) =>
    JSON.parse(readFileSync(`src/generated/${id}.json`, 'utf8')),
  );
  assert.deepEqual(
    [
      ...packages.map((p) => p.event.branding ?? p.event.title),
      ...legacy.map((e) => e.title),
    ].sort(),
    catalog.events.map((e) => e.title).sort(),
  );
  const added = packages.filter((p) => p.event.id.startsWith('gfl2-cn-'));
  assert.equal(added.length, 28);
  assert.equal(
    added.reduce((n, p) => n + p.event.sections.length, 0),
    562,
  );
  assert.equal(
    added.reduce((n, p) => n + p.event.coverage.scripts, 0),
    1031,
  );
  assert.equal(
    added.reduce((n, p) => n + p.event.coverage.textRows, 0),
    88875,
  );
  assert.equal(
    added.reduce((n, p) => n + p.event.coverage.unresolvedText, 0),
    3,
  );
});

test('complete event library retains every source dialogue and aligned scene with verified shared payloads', (t) => {
  const path = 'src/generated/gfl2-packages.json';
  if (!existsSync(path)) return t.skip('Import private batch first.');
  const packages = JSON.parse(readFileSync(path, 'utf8'));
  if (!packages.length) return t.skip('Private batch unavailable.');
  assert.equal(packages.length, 34);
  const original = packages.filter((p) => !p.event.id.startsWith('gfl2-cn-'));
  assert.equal(
    original.reduce((n, p) => n + p.event.sections.length, 0),
    64,
  );
  assert.equal(
    original.reduce((n, p) => n + p.event.coverage.textRows, 0),
    9807,
  );
  const readUrl = (url) =>
    JSON.parse(
      readFileSync(
        `public${new URL(url, 'http://localhost').pathname}`,
        'utf8',
      ),
    );
  const verified = new Set();
  for (const { event, scenes } of packages) {
    if (event.edition === 'revised') assert.match(event.title, /重制版/);
    for (const section of event.sections) {
      const reader = readUrl(section.contentUrl),
        archive = readUrl(section.sourceUrl);
      const scene = readUrl(scenes.sections[section.id].url);
      assert.equal(
        new Set(reader.passages.map((p) => p.id)).size,
        reader.passages.length,
      );
      assert.deepEqual(
        scene.steps.map((s) => s.id),
        reader.passages.map((p) => p.id),
      );
      assert.equal(reader.passages[0].id, section.firstNode);
      assert.ok(reader.passages.some((p) => p.id === section.lastNode));
      assert.deepEqual(
        reader.passages,
        archive.books.flatMap((b) => b.passages),
      );
      assert.equal(
        archive.books.reduce((n, b) => n + (b.commandCounts.Text ?? 0), 0),
        reader.passages.filter((p) =>
          archive.books.some((b) =>
            b.commands.some(
              (c) =>
                c.Command === 'Text' && `${b.script}:${c.sourceRow}` === p.id,
            ),
          ),
        ).length,
      );
    }
    for (const kind of ['media', 'characters', 'videos']) {
      const path = `public/private/${event.id}/${kind}/manifest.json`;
      if (!existsSync(path)) continue;
      for (const file of JSON.parse(readFileSync(path, 'utf8')).files) {
        if (verified.has(file.url)) continue;
        const bytes = readFileSync(`public${file.url}`);
        assert.equal(bytes.length, file.bytes, file.url);
        assert.equal(
          createHash('sha256').update(bytes).digest('hex'),
          file.sha256,
          file.url,
        );
        verified.add(file.url);
      }
    }
  }
});

test('legacy opening uses the same recovered audio as the full event', (t) => {
  const openingFile = 'src/generated/gfl2-opening.json';
  const mediaFile = 'public/private/gfl2-event/media/manifest.json';
  if (![openingFile, mediaFile].every(existsSync))
    return t.skip('Import private media first.');
  const opening = JSON.parse(readFileSync(openingFile, 'utf8'));
  const media = JSON.parse(readFileSync(mediaFile, 'utf8'));
  const urls = (cue) => (cue.layers ?? [cue]).map((sound) => sound.url);
  for (const [label, cue] of Object.entries(opening.assets.audio))
    assert.deepEqual(urls(cue), urls(media.audio[label]), label);
});

test('scene commands stay attached to original passages and preserve book boundaries', () => {
  const steps = sceneSteps([
    {
      script: 'A33001',
      commands: [
        { Command: 'Bg', Arg1: 'original', sourceRow: 1 },
        { Command: 'Text', sourceRow: 2 },
        { Command: 'Character', Arg1: 'actor', sourceRow: 3 },
        { Command: 'Text', sourceRow: 4 },
        { Command: 'StopBgm', sourceRow: 5 },
        { Command: 'EndScenario', sourceRow: 6 },
      ],
    },
    {
      script: 'A33002',
      commands: [
        { Command: 'Text', sourceRow: 1 },
        { Command: 'EndScenario', sourceRow: 2 },
      ],
    },
  ]);
  assert.deepEqual(
    steps.map((step) => step.id),
    ['A33001:2', 'A33001:4', 'A33002:1'],
  );
  assert.equal(steps[0].commands[0].Arg1, 'original');
  assert.equal(steps[1].commands[0].Arg1, 'actor');
  assert.equal(steps[1].exit[0].Command, 'StopBgm');
  assert.deepEqual(
    steps.map((step) => step.reset),
    [true, false, true],
  );
});

test('all 24 scene packages match all 4443 original passages and reference local recovered files', (t) => {
  if (!existsSync('src/generated/gfl2-scenes.json'))
    return t.skip('Import private scenes first.');
  const scenes = JSON.parse(
    readFileSync('src/generated/gfl2-scenes.json', 'utf8'),
  );
  if (!scenes) return t.skip('Import private scenes first.');
  const event = JSON.parse(
    readFileSync('src/generated/gfl2-event.json', 'utf8'),
  );
  assert.equal(Object.keys(scenes.sections).length, 24);
  let count = 0;
  for (const section of event.sections) {
    const file = `public${new URL(scenes.sections[section.id].url, 'http://localhost').pathname}`;
    const program = JSON.parse(readFileSync(file, 'utf8'));
    const reader = JSON.parse(
      readFileSync(
        `public${new URL(section.contentUrl, 'http://localhost').pathname}`,
        'utf8',
      ),
    );
    assert.deepEqual(
      program.steps.map((step) => step.id),
      reader.passages.map((passage) => passage.id),
    );
    assert.deepEqual(
      program.unresolved.filter((item) => item.kind !== 'expression'),
      [],
    );
    assert.ok(
      program.unresolved.every(
        (item) => item.kind === 'expression' && item.label === '布瑟尔/Think',
      ),
    );
    for (const file of program.files)
      assert.ok(existsSync(`public${file.url}`), file.url);
    for (const actor of Object.values(program.characters))
      if (actor.female)
        for (const url of actor.female.files)
          assert.ok(
            program.files.some((file) => file.url === url),
            'Female model omitted from offline package',
          );
    count += program.steps.length;
  }
  assert.equal(count, 4443);
  assert.equal(scenes.coverage.music, 46);
  assert.equal(scenes.coverage.sounds, 232);
});
