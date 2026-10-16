import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(root, 'public/private/gfl2-event/media/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const mediaRoot = dirname(manifestPath);
const prefix =
  '/' +
  relative(resolve(root, 'public'), mediaRoot).split('\\').join('/') +
  '/';
const files = new Map(manifest.files.map((file) => [file.url, file]));
assert.equal(manifest.provenance.audioDecoder?.name, 'vgmstream');
assert.equal(manifest.provenance.audioDecoder?.version, 'r2117');

function checkUrl(url) {
  assert.ok(
    url.startsWith(prefix) ||
      /^\/private\/shared\/[a-f0-9]{64}\.[a-z0-9]+$/.test(url),
    `Unexpected media URL: ${url}`,
  );
  const publicRoot = resolve(root, 'public');
  const path = resolve(publicRoot, url.slice(1));
  const rel = relative(publicRoot, path);
  assert.ok(
    !isAbsolute(rel) && !rel.startsWith('..'),
    'Media path escaped root',
  );
  const bytes = readFileSync(path);
  const file = files.get(url);
  assert.ok(file, `Missing file inventory: ${url}`);
  assert.equal(bytes.length, file.bytes, `Media length changed: ${url}`);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    file.sha256,
    `Media digest changed: ${url}`,
  );
}

let bgm = 0;
let se = 0;
for (const [label, background] of Object.entries(manifest.backgrounds)) {
  assert.equal(background.setting.Label, label);
  assert.ok(background.catalogueKey && background.sourcePath);
  if (background.url) {
    assert.ok(background.assetInternalId && background.pathId);
    assert.ok(background.width > 0 && background.height > 0);
    checkUrl(background.url);
  } else {
    assert.ok(['BG_None_Black_01', 'BG_None_Black_02'].includes(label));
    assert.equal(background.color, '#000000');
    assert.match(background.representation, /replacement/i);
  }
}
for (const [label, audio] of Object.entries(manifest.audio)) {
  assert.equal(audio.setting.Label, label);
  assert.equal(audio.setting.FileName, audio.cueName);
  assert.equal(audio.setting.CueSheet, audio.cueSheet);
  if (audio.kind === 'Bgm') bgm++;
  else if (audio.kind === 'Se') se++;
  else assert.fail(`Unknown audio kind: ${audio.kind}`);
  const waveforms = [
    ...(audio.url ? [audio] : []),
    ...(audio.layers || []),
    ...(audio.alternatives || []),
  ];
  assert.ok(waveforms.length, `Cue has no recovered waveforms: ${label}`);
  for (const waveform of waveforms) {
    checkUrl(waveform.url);
    assert.ok(
      waveform.url.startsWith('/private/shared/') ||
        waveform.url.endsWith(
          `.${files.get(waveform.url).sha256.slice(0, 12)}.ogg`,
        ),
      `Audio URL lacks a content digest: ${waveform.url}`,
    );
    assert.ok(waveform.duration > 0);
    if (waveform.loopStart !== undefined || waveform.loopEnd !== undefined) {
      assert.ok(waveform.loopStart >= 0);
      assert.ok(waveform.loopEnd > waveform.loopStart);
      assert.ok(waveform.loopEnd <= waveform.duration + 0.001);
    }
  }
}
assert.equal(manifest.provenance.books.length, manifest.coverage.books ?? 30);
assert.equal(
  Object.keys(manifest.backgrounds).length +
    manifest.unresolved.filter((item) => item.kind === 'background').length,
  manifest.coverage.backgroundLabels ?? manifest.coverage.Bg,
);
assert.equal(bgm, manifest.coverage.Bgm);
assert.equal(
  se + manifest.unresolved.filter((item) => item.kind === 'audio').length,
  manifest.coverage.Se,
);
for (const item of manifest.unresolved) {
  if (item.kind === 'audio') {
    assert.equal(item.label, '2021001');
    assert.equal(item.cueName, 'BGE_Act_Female_36');
    assert.equal(item.cueSheet, 'BGE_AVG_Special_Somi');
    assert.ok(item.sourcePath && item.sourceSha256);
    assert.ok(
      [
        '',
        'Original cue BGE_Act_Female_36 is absent from installed BGE_AVG_Special_Somi CueNameTable',
      ].includes(item.error),
    );
    continue;
  }
  assert.equal(item.kind, 'background');
  assert.equal(item.label, '地图');
  assert.equal(
    item.sourcePath,
    'Assets/ConfigPrefab/AVG/0ob/Item/ITEM_Map_01.prefab',
  );
  assert.equal(item.setting.Type, 'BgPrefab');
  assert.equal(item.error, 'No original Texture2D catalogue location');
}
assert.equal(manifest.layerOrders.BgDefault, 5);
console.log(
  `Verified ${Object.keys(manifest.backgrounds).length} background labels, ${bgm} BGM cues, ${se} sound cues, ${files.size} original media files across ${manifest.provenance.books.length} scripts.`,
);
