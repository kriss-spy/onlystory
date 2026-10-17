import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assetBase, sha256, safeAssetPath } from './pjsk-scenario.mjs';
import { writeJson } from './pjsk-import.mjs';
import { compilePjskEpisode, collectPjskCostumes } from './pjsk-program.mjs';
import {
  createVoiceResolver,
  parseVoiceListing,
} from './pjsk-voice-listing.mjs';
import { reviewedPjskVoice } from './pjsk-voice-bindings.mjs';
import {
  reviewedMotionOwners,
  reviewedAbsentModelMetadata,
} from './pjsk-model-overrides.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { readFileSync } from 'node:fs';

let cdnCooldownUntil = 0;
const resolveVoice = createVoiceResolver();
const missingOriginals = new Map();
const videoBackgroundRules = JSON.parse(
  readFileSync(
    new URL('../docs/pjsk-video-backgrounds.json', import.meta.url),
    'utf8',
  ),
).backgrounds;

async function completeBatch(operations) {
  const results = await Promise.allSettled(operations);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
  return results.map((result) => result.value);
}

const mainGroups = {
  idol: 'MORE MORE JUMP!',
  light_sound: 'Leo/need',
  piapro: 'VIRTUAL SINGER',
  school_refusal: '25点，Nightcord见。',
  street: 'Vivid BAD SQUAD',
  theme_park: 'Wonderlands×Showtime',
};

export function pjskCatalogMetadata(entry, events = [], storyUnits = []) {
  if (entry.region !== 'cn')
    throw new Error('Playback requires CN story text.');
  if (entry.kind === 'unit' && Object.hasOwn(mainGroups, entry.collection))
    return {
      story: `${mainGroups[entry.collection]} · 主线故事`,
      category: 'Main story',
      collectionId: `pjsk-cn-${entry.collection}-main`,
      group: entry.collection,
      // These are launch stories. Use their original release, rather than a
      // later regional app launch that would put them after the early events.
      date: '2020-09-30',
      order: entry.episodeNo,
    };
  if (entry.kind !== 'event')
    throw new Error('Unsupported playback story collection.');
  const chapter = entry.metadata.chapter;
  const matches = events.filter(
    (event) => String(event.id) === entry.collection,
  );
  if (
    matches.length !== 1 ||
    String(chapter.eventId) !== entry.collection ||
    matches[0].assetbundleName !== chapter.assetbundleName ||
    !matches[0].name ||
    !Number.isFinite(matches[0].startAt)
  )
    throw new Error(`Event metadata mismatch for ${entry.id}`);
  const event = matches[0];
  // Early CN masters omit focus units. Keep reviewed collection mappings
  // explicit: a banner character alone cannot identify a mixed-unit event.
  const earlyGroups = {
    1: 'light_sound',
    2: 'school_refusal',
    3: 'theme_park',
    4: 'mixed',
    5: 'idol',
    6: 'street',
    9: 'mixed',
  };
  const relations = storyUnits.filter(
    (row) => String(row.eventStoryId) === String(event.id),
  );
  const main = [
    ...new Set(
      relations
        .filter((row) => row.eventStoryUnitRelation === 'main')
        .map((row) => row.unit),
    ),
  ];
  const all = [...new Set(relations.map((row) => row.unit))];
  const group =
    main.length === 1
      ? main[0]
      : all.length > 1
        ? 'mixed'
        : (all[0] ??
          (event.unit && event.unit !== 'none'
            ? event.unit
            : earlyGroups[event.id]));
  return {
    story: event.name,
    category: 'Event',
    collectionId: `pjsk-cn-event-${event.id}`,
    ...(group ? { group } : {}),
    // The catalog displays the original CN release date, in the CN region's time zone.
    date: new Date(event.startAt + 8 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
    order: entry.episodeNo,
  };
}

export function withResolvedPjskMediaIssues(pkg, corrections) {
  return {
    ...pkg,
    scenario: {
      ...pkg.scenario,
      issues: pkg.scenario.issues.filter(
        (issue) =>
          !corrections.some(
            (correction) =>
              correction.evidence?.bytes > 0 &&
              (/^[a-f0-9]{64}$/.test(correction.evidence?.sha256) ||
                (/^[a-f0-9]{32}$/.test(correction.evidence?.md5) &&
                  /^[a-f0-9]{64}$/.test(
                    correction.evidence?.listing?.sha256,
                  ))) &&
              issue.code === 'invalid-media-reference' &&
              issue.kind === correction.kind &&
              issue.reference === correction.originalReference &&
              correction.locations.includes(issue.at),
          ),
      ),
    },
  };
}

export async function installPjskEpisode(
  pkg,
  {
    libraryDir,
    generatedDir,
    offline = false,
    mediaRegion = 'jp',
    state,
    prefetchDir = fileURLToPath(
      new URL('../.cache/pjsk/prefetch', import.meta.url),
    ),
  },
) {
  if (
    pkg.entry.region !== 'cn' ||
    !(
      pkg.entry.kind === 'event' ||
      (pkg.entry.kind === 'unit' &&
        Object.hasOwn(mainGroups, pkg.entry.collection))
    ) ||
    mediaRegion !== 'jp'
  )
    throw new Error(
      'Playback installation supports CN event and unit stories with JP media.',
    );
  const root = resolve(libraryDir, 'private/pjsk');
  await mkdir(resolve(root, 'assets'), { recursive: true });
  const indexPath = resolve(root, 'sources.json');
  const deferredPath = resolve(root, 'deferred.json');
  if (state?.root && state.root !== root)
    throw new Error('Installation state belongs to another library');
  const readIndex = async (path) => {
    try {
      return JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return {};
    }
  };
  const index = state?.index ?? (await readIndex(indexPath));
  const deferred = state?.deferred ?? (await readIndex(deferredPath));
  if (state) Object.assign(state, { root, index, deferred });
  let indexChanged = false,
    deferredChanged = false;
  const flush = async () => {
    if (indexChanged) {
      await writeJson(indexPath, index);
      indexChanged = false;
    }
    if (deferredChanged) {
      await writeJson(deferredPath, deferred);
      deferredChanged = false;
    }
  };
  const files = new Map();
  function rememberFile(record) {
    const previous = files.get(record.url);
    // Distinct original URLs can have identical bytes. Choose provenance
    // deterministically instead of retaining whichever download finishes last.
    if (
      !previous ||
      (record.sourceUrl &&
        (!previous.sourceUrl || record.sourceUrl < previous.sourceUrl))
    )
      files.set(record.url, record);
  }
  const pending = new Map();
  let active = 0;
  const queue = [];
  const writes = new Map();
  async function put(bytes, extension, sourceUrl = null) {
    const digest = sha256(bytes);
    const url = `/private/pjsk/assets/${digest}${extension}`;
    const path = resolve(libraryDir, '.' + url);
    let writing = writes.get(path);
    if (!writing) {
      writing = (async () => {
        try {
          const existing = await readFile(path);
          if (existing.length === bytes.length && sha256(existing) === digest)
            return;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        const temp = `${path}.${randomUUID()}.tmp`;
        await writeFile(temp, bytes);
        await rename(temp, path);
      })();
      writes.set(path, writing);
    }
    await writing;
    const record = { url, sha256: digest, bytes: bytes.length, sourceUrl };
    rememberFile(record);
    return record;
  }
  async function acquire(url) {
    if (pending.has(url)) return pending.get(url);
    const operation = (async () => {
      const cached = index[url];
      if (cached) {
        if (
          !/^[a-f0-9]{64}$/.test(cached.sha256) ||
          (cached.url !== `/private/pjsk/assets/${cached.sha256}` &&
            !cached.url.startsWith(`/private/pjsk/assets/${cached.sha256}.`)) ||
          cached.url.includes('..') ||
          cached.sourceUrl !== url
        )
          throw new Error(`Invalid PJSK media cache identity: ${url}`);
        const bytes = await readFile(resolve(libraryDir, '.' + cached.url));
        if (sha256(bytes) !== cached.sha256 || bytes.length !== cached.bytes)
          throw new Error(`Corrupt PJSK media: ${url}`);
        rememberFile(cached);
        return { ...cached, data: bytes };
      }
      let staged;
      try {
        staged = JSON.parse(
          await readFile(resolve(prefetchDir, `${sha256(url)}.json`), 'utf8'),
        );
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (staged) {
        if (staged.sourceUrl !== url || !/^[a-f0-9]{64}$/.test(staged.sha256))
          throw new Error(`Invalid staged PJSK media identity: ${url}`);
        const bytes = await readFile(staged.path);
        if (bytes.length !== staged.bytes || sha256(bytes) !== staged.sha256)
          throw new Error(`Corrupt staged PJSK media: ${url}`);
        const record = await put(bytes, extname(new URL(url).pathname), url);
        index[url] = record;
        indexChanged = true;
        return { ...record, data: bytes };
      }
      if (offline) {
        const error = new Error(`PJSK media is not cached: ${url}`);
        error.cacheMiss = true;
        throw error;
      }
      if ((missingOriginals.get(url) ?? 0) > Date.now()) {
        const error = new Error(`HTTP 404: ${url}`);
        error.status = 404;
        throw error;
      }
      if (active >= 4) await new Promise((done) => queue.push(done));
      active++;
      try {
        let response, bytes;
        for (let attempt = 0; attempt < 8; attempt++) {
          try {
            if (cdnCooldownUntil > Date.now())
              await delay(cdnCooldownUntil - Date.now());
            response = await fetch(url, { signal: AbortSignal.timeout(30000) });
            if (response.status === 429) {
              const seconds = Number(response.headers.get('retry-after'));
              cdnCooldownUntil = Math.max(
                cdnCooldownUntil,
                Date.now() +
                  (Number.isFinite(seconds) && seconds > 0
                    ? seconds * 1000
                    : Math.min(120000, 15000 * 2 ** attempt)),
              );
            }
            if (response.status === 404) {
              missingOriginals.set(url, Date.now() + 60000);
              const error = new Error(`HTTP 404: ${url}`);
              error.status = 404;
              throw error;
            }
            if (!response.ok)
              throw new Error(`HTTP ${response.status}: ${url}`);
            bytes = Buffer.from(await response.arrayBuffer());
            break;
          } catch (error) {
            if (error.status === 404 || attempt === 7) throw error;
            if (!cdnCooldownUntil || cdnCooldownUntil <= Date.now())
              await delay(Math.min(10000, 500 * 2 ** attempt));
          }
        }
        if (
          !bytes.length ||
          response.headers.get('content-type')?.includes('text/html')
        )
          throw new Error(`Invalid media response: ${url}`);
        const record = await put(bytes, extname(new URL(url).pathname), url);
        index[url] = record;
        indexChanged = true;
        return { ...record, data: bytes };
      } finally {
        active--;
        queue.shift()?.();
      }
    })();
    pending.set(url, operation);
    void operation.catch(() => pending.delete(url));
    return operation;
  }
  async function fallback(urls) {
    // An original's own track must win over a cached fallback owner.
    urls = [...new Set(urls)];
    for (const [i, url] of urls.entries()) {
      try {
        return await acquire(url);
      } catch (error) {
        if ((!error.cacheMiss && error.status !== 404) || i === urls.length - 1)
          throw error;
      }
    }
  }
  try {
    const base = assetBase(mediaRegion);
    const source = pkg.scenario.source;
    const eventFile =
      pkg.entry.kind === 'event'
        ? await acquire(
            'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-cn-diff/main/events.json',
          )
        : null;
    const catalogMetadata = pjskCatalogMetadata(
      pkg.entry,
      eventFile ? JSON.parse(eventFile.data) : [],
      eventFile
        ? JSON.parse(
            (
              await acquire(
                'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-cn-diff/main/eventStoryUnits.json',
              )
            ).data,
          )
        : [],
    );
    const media = {
      region: mediaRegion,
      backgrounds: {},
      videoBackgrounds: {},
      music: {},
      sounds: {},
      voices: {},
      models: {},
      movies: {},
      performances: {},
      effects: {},
      effectAssets: {},
      files: [],
    };
    const corrections = [];
    const characterUrl = `https://raw.githubusercontent.com/Sekai-World/sekai-master-db-${pkg.entry.region === 'jp' ? '' : pkg.entry.region + '-'}diff/main/character2ds.json`;
    const [characterFile, listFile] = await completeBatch([
      acquire(characterUrl),
      acquire(
        'https://storage.sekai.best/sekai-live2d-assets/live2d/model_list.json',
      ),
    ]);
    const characters = JSON.parse(characterFile.data),
      models = JSON.parse(listFile.data);
    await completeBatch(
      pkg.scenario.dependencies
        .filter((d) =>
          ['background', 'bgm', 'voice', 'sound-effect'].includes(d.kind),
        )
        .map(async (dependency) => {
          const { reference: originalReference, kind } = dependency;
          // Some source IDs contain spaces that also exist in the real filename.
          // Validate the non-space portion, then encode the exact original name.
          const reference =
            kind === 'voice' ? originalReference.trim() : originalReference;
          let candidates = [];
          if (dependency.candidatePath)
            candidates = [base + dependency.candidatePath];
          const encodedVoice =
            kind === 'voice' &&
            /^[a-zA-Z0-9_ \[\]-]+$/.test(originalReference) &&
            /[ \[\]]/.test(originalReference);
          if (encodedVoice)
            candidates = [
              base +
                `sound/scenario/voice/${safeAssetPath(pkg.entry.scenarioId)}/${encodeURIComponent(originalReference)}.mp3`,
            ];
          if (kind === 'sound-effect') {
            const pack =
              /^se\d{5}$/.test(reference) && Number(reference.slice(2)) <= 528
                ? 'se_pack00001'
                : 'se_pack00001_b';
            candidates = [
              base +
                `sound/scenario/se/${pack}/${safeAssetPath(reference)}.mp3`,
            ];
            if (pkg.entry.kind === 'event')
              candidates.unshift(
                base +
                  `event_story/${safeAssetPath(pkg.entry.metadata.chapter.assetbundleName)}/scenario_se/${safeAssetPath(reference)}.mp3`,
              );
          }
          if (kind === 'voice') {
            const voice = source.TalkData.flatMap((talk) => talk.Voices).find(
              (v) => v.VoiceId === originalReference,
            );
            const character = characters.find(
              (c) => c.id === voice?.Character2dId,
            );
            if (character)
              candidates.push(
                base +
                  `sound/scenario/part_voice/${character.assetName}_${character.unit}/${encodedVoice ? encodeURIComponent(originalReference) : safeAssetPath(reference)}.mp3`,
                base +
                  `sound/scenario/voice/part_voice_${character.assetName}_${character.unit}/${encodedVoice ? encodeURIComponent(originalReference) : safeAssetPath(reference)}.mp3`,
              );
            // The source assigns Miku's exact shared track to Mikudayo.
            // Its verified original file lives under Miku's Wonderlands unit.
            if (
              pkg.entry.scenarioId === 'vswonder_01_01' &&
              originalReference === 'partvoice_32_021_wonder'
            )
              candidates.push(
                base +
                  'sound/scenario/part_voice/21miku_theme_park/partvoice_32_021_wonder.mp3',
              );
          }
          if (!candidates.length)
            throw new Error(`Unresolved ${kind}: ${reference}`);
          let file;
          if (kind === 'voice') {
            const binding = await reviewedPjskVoice(
              pkg,
              originalReference,
              acquire,
            );
            if (binding) candidates = [binding.audio.sourceUrl];
            const voiceEntry = await resolveVoice(candidates, acquire);
            if (
              binding &&
              (voiceEntry.md5 !== binding.audio.md5 ||
                voiceEntry.bytes !== binding.audio.bytes)
            )
              throw new Error(
                'Original voice differs from reviewed audio evidence',
              );
            rememberFile(voiceEntry.source);
            const digest = sha256(voiceEntry.sourceUrl);
            file = {
              url: `/private/pjsk/remote/${digest}.mp3`,
              sourceUrl: voiceEntry.sourceUrl,
              sha256: null,
              bytes: voiceEntry.bytes,
              md5: voiceEntry.md5,
              deferred: true,
              listing: {
                url: voiceEntry.source.url,
                sha256: voiceEntry.source.sha256,
              },
            };
            let cached = index[file.sourceUrl];
            if (!cached) {
              try {
                const staged = JSON.parse(
                  await readFile(
                    resolve(prefetchDir, `${digest}.json`),
                    'utf8',
                  ),
                );
                if (staged.sourceUrl !== file.sourceUrl)
                  throw new Error('Staged voice source mismatch');
                const bytes = await readFile(staged.path);
                if (
                  sha256(bytes) !== staged.sha256 ||
                  bytes.length !== staged.bytes
                )
                  throw new Error('Staged voice checksum mismatch');
                if (
                  bytes.length !== file.bytes ||
                  createHash('md5').update(bytes).digest('hex') !== file.md5
                )
                  throw new Error('Staged voice differs from original listing');
                cached = await put(bytes, '.mp3', file.sourceUrl);
                index[file.sourceUrl] = cached;
                indexChanged = true;
              } catch (error) {
                if (error.code !== 'ENOENT') throw error;
              }
            }
            const descriptor = {
              url: file.url,
              sourceUrl: file.sourceUrl,
              bytes: file.bytes,
              md5: file.md5,
              ...(cached ? { cacheSource: cached.url } : {}),
            };
            if (
              JSON.stringify(deferred[digest]) !== JSON.stringify(descriptor)
            ) {
              deferred[digest] = descriptor;
              deferredChanged = true;
            }
            rememberFile(file);
            if (binding)
              corrections.push({
                kind: 'voice',
                originalReference,
                resolvedReference: binding.resolvedReference,
                locations: dependency.locations,
                reason: binding.reason,
                evidence: {
                  sourceUrl: file.sourceUrl,
                  bytes: file.bytes,
                  md5: file.md5,
                  listing: file.listing,
                  cnSha256: binding.cnSha256,
                  jpSourceUrl: binding.jpSourceUrl,
                  jpSha256: binding.jpSha256,
                  talkIndex: binding.talkIndex,
                },
              });
          } else if (kind === 'background' && videoBackgroundRules[reference]) {
            const rule = videoBackgroundRules[reference];
            for (const metadata of rule.nativeMetadata) {
              const record = await acquire(metadata.url);
              if (record.sha256 !== metadata.sha256)
                throw new Error(
                  `Video background metadata changed: ${reference}`,
                );
            }
            file = await acquire(rule.sourceUrl);
            if (
              file.sha256 !== rule.sha256 ||
              file.bytes !== rule.bytes ||
              rule.muted !== true ||
              typeof rule.loop !== 'boolean'
            )
              throw new Error(
                `Video background does not match reviewed source: ${reference}`,
              );
            media.videoBackgrounds[reference] = {
              url: file.url,
              loop: rule.loop,
              muted: true,
              presentation: rule.presentation,
            };
            corrections.push({
              kind: 'video-background',
              originalReference: reference,
              resolvedReference: rule.sourceUrl,
              reason: rule.policy,
              evidence: {
                sourceUrl: file.sourceUrl,
                sha256: file.sha256,
                bytes: file.bytes,
                nativeCommand: rule.nativeCommand,
              },
            });
          } else file = await fallback(candidates);
          if (
            pkg.entry.scenarioId === 'vswonder_01_01' &&
            originalReference === 'partvoice_32_021_wonder'
          )
            corrections.push({
              kind,
              originalReference,
              resolvedReference: originalReference,
              locations: dependency.locations,
              reason:
                'Source assigns the exact shared Miku voice track to Mikudayo; verified original Miku unit folder retains the requested filename',
              evidence: {
                sourceUrl: file.sourceUrl,
                sha256: file.sha256,
                ...(file.deferred
                  ? { md5: file.md5, listing: file.listing }
                  : {}),
                bytes: file.bytes,
                url: file.url,
              },
            });
          if (encodedVoice)
            corrections.push({
              kind,
              originalReference,
              resolvedReference: originalReference,
              locations: dependency.locations,
              reason: 'Verified exact source filename requires URL encoding',
              evidence: {
                sourceUrl: file.sourceUrl,
                sha256: file.sha256,
                ...(file.deferred
                  ? { md5: file.md5, listing: file.listing }
                  : {}),
                bytes: file.bytes,
                url: file.url,
              },
            });
          media[
            {
              background: 'backgrounds',
              bgm: 'music',
              voice: 'voices',
              'sound-effect': 'sounds',
            }[kind]
          ][originalReference] = file.url;
        }),
    );
    await completeBatch(
      source.SpecialEffectData.filter((record) => record.EffectType === 19).map(
        async (record) => {
          const name = safeAssetPath(record.StringVal);
          let file;
          try {
            file = await acquire(
              base +
                (name.endsWith('_opening')
                  ? `movie/${name}/${name.slice(0, -'_opening'.length)}.mp4`
                  : `scenario/movie/${name}/${name}.mp4`),
            );
          } catch (error) {
            if (
              name.endsWith('_opening') ||
              (error.status !== 404 && !error.cacheMiss)
            )
              throw error;
            const directory = `scenario/movie/${name}/`;
            const listing = await acquire(
              `${base}?list-type=2&prefix=${encodeURIComponent(directory)}`,
            );
            const page = parseVoiceListing(listing.data.toString('utf8'));
            const movies = page.entries.filter(
              (entry) =>
                entry.key.startsWith(directory) &&
                !entry.key.includes('..') &&
                entry.key.endsWith('.mp4'),
            );
            if (page.continuation || movies.length !== 1)
              throw new Error(`Ambiguous original movie directory: ${name}`);
            file = await acquire(base + movies[0].key);
            corrections.push({
              kind: 'movie',
              originalReference: name,
              resolvedReference: movies[0].key,
              reason:
                'Original movie directory contains one MP4 with a different shipped filename',
              evidence: {
                sourceUrl: file.sourceUrl,
                sha256: file.sha256,
                bytes: file.bytes,
                listingUrl: listing.sourceUrl,
                listingSha256: listing.sha256,
              },
            });
          }
          media.movies[name] = file.url;
        },
      ),
    );
    const performances = source.SpecialEffectData.filter(
      (record) => record.EffectType === 37,
    );
    if (performances.length) {
      const masterBase =
        'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-cn-diff/main/';
      const [costumes, vocals, songs] = await completeBatch(
        ['episodeMusicVideoCostumes', 'musicVocals', 'musics'].map(
          async (table) =>
            JSON.parse((await acquire(masterBase + table + '.json')).data),
        ),
      );
      for (const record of performances) {
        const costume = costumes.find((item) => item.id === record.IntVal);
        const vocal = vocals.find((item) => item.id === costume?.musicVocalId);
        const song = songs.find((item) => item.id === vocal?.musicId);
        if (!costume || !vocal || !song)
          throw new Error('Unresolved native song performance');
        const bundle = safeAssetPath(vocal.assetbundleName);
        media.performances[record.IntVal] = {
          url: (await acquire(base + `music/long/${bundle}/${bundle}.mp3`)).url,
          title: song.title,
          musicVocalId: vocal.id,
          notice:
            'Original song audio. The native 3D performance is not reproduced.',
        };
      }
    }
    const namedEffects = source.SpecialEffectData.filter(
      (record) => record.EffectType === 15 && record.StringVal,
    );
    await completeBatch(
      namedEffects.map(async (record) => {
        const name = safeAssetPath(record.StringVal);
        const directory = safeAssetPath(
          record.StringValSub || `scenario/effect/${name}`,
        );
        const listingUrl = `${base}?list-type=2&prefix=${encodeURIComponent(directory + '/')}`;
        let listing;
        try {
          listing = JSON.parse(
            await readFile(
              resolve(prefetchDir, `${sha256(listingUrl)}.listing.json`),
              'utf8',
            ),
          );
        } catch (error) {
          if (error.code === 'ENOENT') return;
          throw error;
        }
        if (
          listing.sourceUrl !== listingUrl ||
          sha256(listing.rawXml) !== listing.sha256 ||
          listing.rawXml.includes('<IsTruncated>true</IsTruncated>')
        )
          throw new Error(`Invalid original effect texture listing: ${name}`);
        const imageKeys = [...listing.rawXml.matchAll(/<Key>([^<]+)<\/Key>/g)]
          .map((match) => match[1])
          .filter((key) => /\.(webp|png|jpe?g)$/i.test(key));
        const keys = imageKeys.filter(
          (key) =>
            !/\.png$/i.test(key) ||
            !imageKeys.includes(key.replace(/\.png$/i, '.webp')),
        );
        if (
          keys.some(
            (key) => !key.startsWith(directory + '/') || key.includes('..'),
          )
        )
          throw new Error(`Unsafe effect texture path: ${name}`);
        const textures = await completeBatch(
          keys.sort().map(async (key) => (await acquire(base + key)).url),
        );
        if (textures.length) {
          const kind = /snow/i.test(name)
            ? 'snow'
            : /rain/i.test(name)
              ? 'rain'
              : /sakura|petal/i.test(name)
                ? 'petals'
                : name.startsWith('still_')
                  ? 'particles'
                  : 'image';
          media.effectAssets[name] = { textures, kind };
          media.effects[name] = textures[0];
        }
      }),
    );
    const stillEffects = source.SpecialEffectData.filter(
      (record) =>
        record.EffectType === 15 &&
        [
          'still_kanade_nig14_01',
          'still_mizuki_nig19_01',
          'still_ena_nig19_01',
          'light_up_legend_02',
        ].includes(record.StringVal),
    );
    await completeBatch(
      stillEffects.map(async (record) => {
        const name = safeAssetPath(record.StringVal);
        const directory = safeAssetPath(record.StringValSub);
        media.effects[name] = (
          await acquire(
            base +
              `${directory}/tex_${name === 'light_up_legend_02' ? 'light_up_legend' : name}.webp`,
          )
        ).url;
        if (name === 'still_kanade_nig14_01')
          media.effects.still_kanade_nig14_02 = (
            await acquire(base + `${directory}/tex_still_kanade_nig14_02.webp`)
          ).url;
      }),
    );
    const liveBase = 'https://storage.sekai.best/sekai-live2d-assets/';
    for (const [costume, required] of collectPjskCostumes(source)) {
      const model = models.find((m) => m.modelBase === costume);
      if (!model) throw new Error(`No original model for ${costume}`);
      const modelBase = liveBase + `live2d/model/${model.modelPath}/`;
      const modelFile = await acquire(modelBase + model.modelFile);
      const settings = JSON.parse(modelFile.data);
      const refs = settings.FileReferences;
      const absent = reviewedAbsentModelMetadata[costume]?.DisplayInfo;
      if (absent) {
        if (
          refs.DisplayInfo !== absent.reference ||
          absent.listingTruncated !== false ||
          !/^[a-f0-9]{64}$/.test(absent.listingSha256)
        )
          throw new Error(
            `Unreviewed optional metadata mismatch for ${costume}`,
          );
        delete refs.DisplayInfo;
        corrections.push({
          kind: 'editor-metadata',
          costume,
          originalReference: absent.reference,
          resolvedReference: null,
          reason: absent.reason,
          evidence: {
            sourceUrl: absent.listingUrl,
            sha256: absent.listingSha256,
          },
        });
      }
      const motions = [...required.motions].sort();
      const expressions = [...required.expressions].sort();
      const motionDir = model.modelPath.split('/').slice(0, -1).join('/');
      let motionBase;
      const motionBaseCandidates = [];
      for (
        let name = model.modelBase;
        name;
        name = name.includes('_') ? name.slice(0, name.lastIndexOf('_')) : ''
      ) {
        motionBaseCandidates.push(
          `${liveBase}live2d/motion/${motionDir}/${name}_motion_base/BuildMotionData.json`,
        );
      }
      const backMotionBase = {
        v2_20mizuki_culture_back: 'v2_20mizuki_back',
        v2_20mizuki_school_back: 'v2_20mizuki_back',
        v2_19ena_school_back: 'v2_19ena_back',
      }[model.modelBase];
      if (backMotionBase)
        motionBaseCandidates.push(
          `${liveBase}live2d/motion/v2/sub/${backMotionBase}_motion_base/BuildMotionData.json`,
        );
      const owner = reviewedMotionOwners[costume];
      for (const directory of owner?.bases ?? [])
        motionBaseCandidates.push(directory + 'BuildMotionData.json');
      try {
        const motionFile = await fallback(motionBaseCandidates);
        motionBase = motionFile.sourceUrl.slice(
          0,
          -'BuildMotionData.json'.length,
        );
      } catch (error) {
        if (error.status !== 404 && !error.cacheMiss) throw error;
      }
      if (!motionBase && (motions.length || expressions.length))
        throw new Error(`No motion base for ${costume}`);
      await completeBatch(
        ['Moc', 'Physics', 'Pose', 'DisplayInfo', 'UserData']
          .filter((key) => refs[key])
          .map(async (key) => {
            refs[key] = (
              await fallback([
                modelBase + refs[key],
                (modelBase + refs[key]).toLowerCase(),
              ])
            ).url;
          }),
      );
      refs.Textures = await completeBatch(
        refs.Textures.map(
          async (name) =>
            (
              await fallback([
                modelBase + name,
                (modelBase + name).toLowerCase(),
              ])
            ).url,
        ),
      );
      refs.Motions = {};
      for (const [group, names, folder] of [
        ['Motion', motions, 'motion'],
        ['Facial', expressions, 'facial'],
      ]) {
        refs.Motions[group] = await completeBatch(
          names.map(async (name) => {
            if (
              !/^[a-zA-Z0-9_ .-]+$/.test(name) ||
              name === '.' ||
              name === '..'
            )
              throw new Error(`Invalid motion filename: ${name}`);
            const path = `${motionBase}${folder}/${encodeURIComponent(name)}.motion3.json`;
            const normalized = name.replaceAll(' ', '');
            // CN event_09_07 command 274 assigns this exact Tsukasa-named track
            // to street Len. Its original owner has the requested track; Len's
            // archive does not. Preserve the native name and record provenance.
            const borrowedTrack =
              costume === '23len_street' && name === 'm-tsukasa-angry02'
                ? `${liveBase}live2d/motion/v1/main/13_tsukasa/13tsukasa_motion_base/motion/m-tsukasa-angry02.motion3.json`
                : null;
            const file = await fallback([
              path,
              path.toLowerCase(),
              `${modelBase}motions/${encodeURIComponent(name)}.motion3.json`,
              ...(normalized !== name
                ? [
                    `${motionBase}${folder}/${safeAssetPath(normalized)}.motion3.json`,
                  ]
                : []),
              ...(borrowedTrack ? [borrowedTrack] : []),
              ...(owner?.bases ?? []).map(
                (directory) =>
                  `${directory}${folder}/${encodeURIComponent(name)}.motion3.json`,
              ),
            ]);
            if (
              normalized !== name ||
              file.sourceUrl === borrowedTrack ||
              owner?.bases.some((directory) =>
                file.sourceUrl.startsWith(directory),
              )
            )
              corrections.push({
                kind: group === 'Facial' ? 'expression' : 'motion',
                originalReference: name,
                resolvedReference: file.sourceUrl.includes(
                  encodeURIComponent(name),
                )
                  ? name
                  : normalized,
                locations: [],
                costume,
                reason: owner?.bases.some((directory) =>
                  file.sourceUrl.startsWith(directory),
                )
                  ? owner.reason
                  : file.sourceUrl === borrowedTrack
                    ? 'Exact native named motion acquired from original character owner because actor archive lacks it'
                    : 'Verified model motion filename resolution',
                evidence: {
                  sourceUrl: file.sourceUrl,
                  sha256: file.sha256,
                  bytes: file.bytes,
                  url: file.url,
                },
              });
            return {
              Name: name,
              File: file.url,
              FadeInTime: 0.1,
              FadeOutTime: 0.1,
            };
          }),
        );
      }
      delete refs.Expressions;
      media.models[costume] = {
        id: [...required.characterIds][0],
        url: (await put(Buffer.from(JSON.stringify(settings)), '.model3.json'))
          .url,
        motions,
        expressions,
      };
      console.log(`PJSK model ready: ${costume}`);
    }
    for (const kind of [
      'backgrounds',
      'videoBackgrounds',
      'music',
      'sounds',
      'voices',
      'models',
      'movies',
      'performances',
      'effects',
      'effectAssets',
    ])
      media[kind] = Object.fromEntries(
        Object.entries(media[kind]).sort(([a], [b]) => a.localeCompare(b)),
      );
    media.files = [...files.values()].sort((a, b) =>
      a.url.localeCompare(b.url),
    );
    await flush();
    const playbackPackage = withResolvedPjskMediaIssues(pkg, corrections);
    const program = compilePjskEpisode(playbackPackage, media);
    const programFile = await put(
      Buffer.from(JSON.stringify(program)),
      '.json',
    );
    const nodes = program.steps.map((step, i) => ({
      id: step.id,
      kind: step.kind,
      speaker: step.speaker,
      text: { en: step.text, 'zh-CN': step.text },
      scene: {
        background: 'platform',
        actors: [],
        window: step.after.fullscreen ? 'system' : 'dialogue',
      },
      voice: step.voices[0] ? media.voices[step.voices[0].VoiceId] : undefined,
      ...(step.movie ? { video: media.movies[step.movie] } : {}),
      ...(step.performance
        ? {
            video: media.performances[step.performance].url,
            performance: media.performances[step.performance],
          }
        : {}),
      ...(step.choices
        ? {
            choices: step.choices.map((label, choice) => ({
              id: `${step.id}:choice:${choice}`,
              label: { en: label, 'zh-CN': label },
              next: program.steps[i + 1]?.id,
            })),
          }
        : {}),
      source: {
        script: program.scenarioId,
        row: step.index,
        index: i,
        contentId: step.index,
      },
      next: program.steps[i + 1]?.id,
    }));
    const textFile = await put(
      Buffer.from(
        JSON.stringify({
          format: 'pjsk-text-v1',
          id: pkg.entry.id,
          nodes,
          assets: [...files.keys()].sort(),
        }),
      ),
      '.json',
    );
    const assets = [textFile.url, '/vendor/live2dcubismcore.min.js'];
    const episode = {
      id: pkg.entry.id,
      game: 'pjsk',
      ...catalogMetadata,
      title: pkg.entry.title,
      description: '原始简体中文剧情、日语配音、Live2D、背景、音乐与音效。',
      minutes: Math.ceil(nodes.length / 6),
      availability: 'available',
      capabilities: [
        'Original Chinese text',
        'Japanese voice',
        'Live2D',
        'BGM & sound effects',
        ...(Object.keys(media.videoBackgrounds).length
          ? ['Original video backgrounds with browser loop/mute policy']
          : []),
        ...[...collectPjskCostumes(source).keys()].flatMap((costume) =>
          reviewedMotionOwners[costume]?.limitation
            ? ['Original motion projected onto the native costume rig']
            : [],
        ),
        ...(performances.length
          ? ['Original song audio in place of native 3D performance']
          : []),
        ...(source.SoundData.some((sound) => sound.PlayMode === 6)
          ? ['Continuous score approximation for native music blocks']
          : []),
        ...(source.SoundData.some((sound) => sound.PlayMode === 5)
          ? [
              'Continuous score approximation for native adaptive music controls',
            ]
          : []),
      ],
      origin: 'game',
      textLocales: ['zh-CN'],
      completionLabel: '本话结束',
      assets,
      nodes: [],
      entryNodeId: nodes[0].id,
      content: {
        format: 'pjsk-text-v1',
        url: textFile.url,
        count: nodes.length,
      },
      renderer: { id: 'pjsk', payload: { url: programFile.url } },
    };
    await mkdir(generatedDir, { recursive: true });
    await writeJson(resolve(root, `${pkg.entry.id}-report.json`), {
      schemaVersion: 1,
      id: pkg.entry.id,
      source: pkg.report,
      corrections: corrections.sort((a, b) =>
        a.originalReference.localeCompare(b.originalReference),
      ),
      playbackReady: true,
      snippets: program.sourceCommands,
      dialogue: source.TalkData.length,
      files: [...files.values()].sort((a, b) => a.url.localeCompare(b.url)),
      bytes: [...files.values()].reduce((n, f) => n + f.bytes, 0),
      limitations: [
        'Browser transitions and animation timing approximate the original Unity presentation.',
        ...Object.keys(media.videoBackgrounds).map(
          (name) => `${name}: ${videoBackgroundRules[name].policy}`,
        ),
        ...[...collectPjskCostumes(source).keys()].flatMap((costume) =>
          reviewedMotionOwners[costume]?.limitation
            ? [`${costume}: ${reviewedMotionOwners[costume].limitation}`]
            : [],
        ),
        ...(source.SoundData.some((sound) => sound.PlayMode === 5)
          ? [
              'Native adaptive music control commands are preserved; browser playback keeps the full score continuous rather than reproducing CRI cue controls.',
            ]
          : []),
        ...(performances.length
          ? [
              'Native 3D music-video performances use explicit original-song audio interludes; choreography is not reproduced.',
            ]
          : []),
        ...(source.SpecialEffectData.some((record) =>
          [15, 16].includes(record.EffectType),
        )
          ? [
              'Named particle effects use browser animation approximations; original particle texture atlases are preserved.',
            ]
          : []),
        ...(source.SoundData.some((sound) => sound.PlayMode === 6)
          ? [
              'Native PlayMode 6 BgmBlockIndex commands are preserved; browser playback keeps the full score continuous rather than jumping native music blocks.',
            ]
          : []),
      ],
    });
    await writeJson(resolve(generatedDir, `${pkg.entry.id}.json`), episode);
    return {
      id: episode.id,
      passages: nodes.length,
      files: files.size + 1,
      program: programFile.url,
    };
  } finally {
    // Drain even on failure: the next episode must never race this index writer.
    await Promise.allSettled([...pending.values()]);
    await flush();
  }
}
