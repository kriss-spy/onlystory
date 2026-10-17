import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSourceCache, writeJson, importPjsk } from './pjsk-import.mjs';
import { assetBase, sha256 } from './pjsk-scenario.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const report = JSON.parse(
  await readFile(
    resolve(root, '.cache/pjsk/all-events-validation/acquisition.json'),
    'utf8',
  ),
);
const get = createSourceCache(resolve(root, '.cache/pjsk/http'));
const queue = report.episodes.filter((row) =>
  row.error?.includes('Scenario ID mismatch'),
);
const bindings = [];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const entry = queue.shift();
      const [source, reference] = await Promise.all([
        get(assetBase('cn') + entry.path),
        get(assetBase('jp') + entry.path),
      ]);
      const cn = JSON.parse(source.bytes),
        jp = JSON.parse(reference.bytes);
      const voices = (value) =>
        value.TalkData.flatMap((t) => t.Voices).map((v) => v.VoiceId);
      const digest = sha256(JSON.stringify(voices(cn)));
      if (
        cn.ScenarioId !== jp.ScenarioId ||
        cn.Snippets.length !== jp.Snippets.length ||
        !voices(cn).length ||
        digest !== sha256(JSON.stringify(voices(jp)))
      )
        throw new Error('Unverified source identity ' + entry.scenarioId);
      const binding = {
        scenarioId: entry.scenarioId,
        sourceScenarioId: cn.ScenarioId,
        sourceUrl: source.url,
        sourceSha256: source.sha256,
        referenceUrl: reference.url,
        referenceSha256: reference.sha256,
        voiceIdsSha256: digest,
      };
      await importPjsk({
        region: 'cn',
        kind: 'event',
        scenario: entry.scenarioId,
        cacheDir: resolve(root, '.cache/pjsk/http'),
        outputDir: resolve(root, '.cache/pjsk/packages'),
        offline: true,
        identityBinding: binding,
      });
      bindings.push(binding);
      console.log(`Verified ${entry.scenarioId} -> ${cn.ScenarioId}`);
    }
  }),
);
bindings.sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
await writeJson(resolve(root, 'docs/pjsk-scenario-identities.json'), {
  schemaVersion: 1,
  reason:
    'Canonical catalog paths contain original internal scenario IDs shared by CN and JP shipped sources. Raw source remains unchanged.',
  bindings,
});
