import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  assetBase,
  catalogEntries,
  decodeScenario,
  masterUrl,
  sha256,
} from './pjsk-scenario.mjs';

const jsonWrites = new Map();
export function writeJson(path, value) {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  // Media downloads share one index. Serialize replacements on Windows, where
  // concurrent renames and short-lived scanner/read handles can yield EPERM.
  const operation = (jsonWrites.get(path) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, bytes);
        for (let attempt = 0; ; attempt++) {
          try {
            await rename(temporary, path);
            break;
          } catch (error) {
            if (
              !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) ||
              attempt >= 6
            )
              throw error;
            await delay(20 * 2 ** attempt);
          }
        }
      } finally {
        await rm(temporary, { force: true });
      }
    });
  jsonWrites.set(path, operation);
  void operation
    .finally(() => {
      if (jsonWrites.get(path) === operation) jsonWrites.delete(path);
    })
    .catch(() => {});
  return operation;
}

export function createSourceCache(
  directory,
  { offline = false, refresh = false, fetcher = fetch } = {},
) {
  if (offline && refresh)
    throw new Error('--offline and --refresh cannot be combined.');
  return async function get(url) {
    await mkdir(directory, { recursive: true });
    const indexPath = resolve(directory, `${sha256(url)}.json`);
    let index;
    try {
      index = JSON.parse(await readFile(indexPath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT')
        throw new Error(
          `Invalid source cache index for ${url}: ${error.message}`,
        );
    }
    if (index && !refresh) {
      if (index.url !== url || !/^[a-f0-9]{64}$/.test(index.sha256))
        throw new Error(`Invalid source cache identity for ${url}`);
      const path = resolve(directory, `${index.sha256}.bin`);
      const bytes = await readFile(path);
      if (bytes.length !== index.bytes || sha256(bytes) !== index.sha256)
        throw new Error(
          `Source cache checksum mismatch for ${url}. Run with --refresh to repair.`,
        );
      return { ...index, path, bytes };
    }
    if (offline)
      throw new Error(`Source is not cached for offline import: ${url}`);
    let bytes;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetcher(url, {
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status} for ${url}`);
          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        }
        bytes = Buffer.from(await response.arrayBuffer());
        // These endpoints must return JSON, never a login/error HTML page.
        JSON.parse(bytes.toString('utf8'));
        break;
      } catch (error) {
        if (
          attempt === 2 ||
          error.retryable === false ||
          error instanceof SyntaxError
        )
          throw error;
        await new Promise((done) => setTimeout(done, 250 * 2 ** attempt));
      }
    }
    const digest = sha256(bytes);
    const path = resolve(directory, `${digest}.bin`);
    await writeFile(path, bytes);
    const metadata = {
      url,
      sha256: digest,
      bytes: bytes.length,
      fetchedAt: new Date().toISOString(),
    };
    await writeJson(indexPath, metadata);
    return { ...metadata, path, bytes };
  };
}

export async function importPjsk({
  region = 'cn',
  kind = 'unit',
  scenario = 'mmj_01_00',
  cacheDir,
  outputDir,
  offline,
  refresh,
  list = false,
  fetcher,
  identityBinding,
}) {
  const masterSourceUrl = masterUrl(region, kind);
  const get = createSourceCache(cacheDir, { offline, refresh, fetcher });
  const master = await get(masterSourceUrl);
  const catalog = catalogEntries(
    JSON.parse(master.bytes.toString('utf8')),
    region,
    kind,
  );
  if (list)
    return {
      region,
      kind,
      entries: catalog.map(({ metadata, ...entry }) => entry),
    };
  const matches = catalog.filter((entry) => entry.scenarioId === scenario);
  if (matches.length !== 1)
    throw new Error(
      `Expected one ${region}/${kind} episode for ${scenario}, found ${matches.length}. Use --list to inspect metadata.`,
    );
  const entry = matches[0];
  const scenarioSource = await get(assetBase(region) + entry.path);
  const rawScenario = scenarioSource.bytes.toString('utf8');
  const source = JSON.parse(rawScenario);
  let referenceSource;
  if (source.ScenarioId !== scenario && identityBinding) {
    const binding = identityBinding;
    if (
      binding.scenarioId !== scenario ||
      binding.sourceScenarioId !== source.ScenarioId ||
      binding.sourceUrl !== scenarioSource.url ||
      binding.sourceSha256 !== scenarioSource.sha256 ||
      binding.referenceUrl !== assetBase('jp') + entry.path ||
      !/^[a-f0-9]{64}$/.test(binding.referenceSha256)
    )
      throw new Error(`Invalid source identity binding for ${scenario}`);
    referenceSource = await get(binding.referenceUrl);
    const reference = JSON.parse(referenceSource.bytes);
    const voiceIds = (value) =>
      value.TalkData.flatMap((talk) => talk.Voices).map(
        (voice) => voice.VoiceId,
      );
    if (
      referenceSource.sha256 !== binding.referenceSha256 ||
      reference.ScenarioId !== source.ScenarioId ||
      sha256(JSON.stringify(voiceIds(source))) !== binding.voiceIdsSha256 ||
      sha256(JSON.stringify(voiceIds(reference))) !== binding.voiceIdsSha256 ||
      source.Snippets.length !== reference.Snippets.length
    )
      throw new Error(`Source identity evidence mismatch for ${scenario}`);
  }
  const decoded = decodeScenario(source, scenario, {
    sourceScenarioId: referenceSource ? source.ScenarioId : undefined,
  });
  const sources = [
    master,
    scenarioSource,
    ...(referenceSource ? [referenceSource] : []),
  ].map(({ bytes, path, ...record }) => ({
    ...record,
    byteLength: bytes.length,
    cacheFile: relative(outputDir, path).replaceAll('\\', '/'),
  }));
  const report = {
    schemaVersion: 1,
    region,
    kind,
    scenarioId: scenario,
    ...(referenceSource ? { sourceIdentity: identityBinding } : {}),
    title: entry.title,
    playbackReady: false,
    coverage: {
      snippets: decoded.timeline.length,
      dialogue: decoded.transcript.filter((line) => line.kind === 'talk')
        .length,
      fullscreen: decoded.transcript.filter(
        (line) => line.kind === 'fullscreen',
      ).length,
      captions: decoded.transcript.filter((line) => line.kind === 'caption')
        .length,
      voicedText: decoded.transcript.filter((line) => line.voices.length)
        .length,
      dependencies: decoded.dependencies.length,
      downloadedMedia: 0,
      issues: decoded.issues.length,
    },
    issues: decoded.issues,
    limitations: [
      'No PJSK renderer is connected. Recognized commands are preserved, not executed.',
      'Media candidates are not verified or downloaded. Live2D, motion, expression, sound effects and bundle references need resolution.',
      'Voice candidates can require region-specific or part-voice fallback mapping.',
      'This package covers one scenario, not the complete regional archive.',
    ],
    sources,
  };
  const result = {
    schemaVersion: 1,
    entry,
    report,
    scenario: decoded,
    rawScenario,
  };
  await mkdir(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, `${entry.id}-${scenario}.json`);
  // Publish only after every input and reference passes validation.
  await writeJson(outputPath, result);
  return { outputPath, ...report };
}
