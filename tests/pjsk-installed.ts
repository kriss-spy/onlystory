import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Episode } from '../src/model';
import { pjskLibraryRoot } from '../scripts/local-environment.mjs';
import { decodePjskText } from '../src/playback/pjsk/text';
import type { Program } from '../src/playback/pjsk/types';
import { parseVoiceListing } from '../scripts/pjsk-voice-listing.mjs';

export function readPjskEpisode(path: string): Episode {
  const episode = JSON.parse(readFileSync(path, 'utf8')) as Episode;
  return episode.content?.format === 'pjsk-text-v1'
    ? decodePjskText(
        JSON.parse(
          readFileSync(
            resolve(pjskLibraryRoot, '.' + episode.content.url),
            'utf8',
          ),
        ),
        episode,
      )
    : episode;
}

let publishedEpisodes: Map<string, Episode>;
// The reader prefers the current download catalog over historical installed
// metadata. Browser expectations must inspect the same immutable program.
export function readPublishedPjskEpisode(path: string): Episode {
  const installed = JSON.parse(readFileSync(path, 'utf8')) as Episode;
  publishedEpisodes ??= new Map(
    JSON.parse(readFileSync('src/downloads/pjsk-catalog.json', 'utf8')).map(
      (item: { episode: Episode }) => [item.episode.id, item.episode],
    ),
  );
  const episode = publishedEpisodes.get(installed.id) ?? installed;
  return episode.content?.format === 'pjsk-text-v1'
    ? decodePjskText(
        JSON.parse(
          readFileSync(
            resolve(pjskLibraryRoot, '.' + episode.content.url),
            'utf8',
          ),
        ),
        episode,
      )
    : episode;
}

let deferred: Record<
  string,
  {
    url: string;
    sourceUrl: string;
    md5: string;
    bytes: number;
    cacheSource?: string;
  }
>;
const listings = new Map<string, Map<string, { md5: string; bytes: number }>>();
const hash = (bytes: Buffer | string, algorithm = 'sha256') =>
  createHash(algorithm).update(bytes).digest('hex');
export function assertPjskFile(
  file: Program['media']['files'][number],
  checked: Set<string>,
) {
  if (checked.has(file.url)) return;
  if (!file.deferred) {
    const bytes = readFileSync(resolve(pjskLibraryRoot, '.' + file.url));
    assert.equal(bytes.length, file.bytes, file.url);
    assert.equal(hash(bytes), file.sha256, file.url);
  } else {
    deferred ??= JSON.parse(
      readFileSync(
        resolve(pjskLibraryRoot, 'private/pjsk/deferred.json'),
        'utf8',
      ),
    );
    assert.ok(
      file.sourceUrl && file.md5 && file.listing,
      `Missing source evidence: ${file.url}`,
    );
    const digest = hash(file.sourceUrl);
    assert.equal(file.url, `/private/pjsk/remote/${digest}.mp3`);
    assert.match(file.md5, /^[a-f0-9]{32}$/);
    const record = deferred[digest];
    assert.equal(record.url, file.url);
    assert.equal(record.sourceUrl, file.sourceUrl);
    assert.equal(record.bytes, file.bytes);
    assert.equal(record.md5, file.md5);
    let entries = listings.get(file.listing.url);
    if (!entries) {
      const bytes = readFileSync(
        resolve(pjskLibraryRoot, '.' + file.listing.url),
      );
      assert.equal(hash(bytes), file.listing.sha256);
      entries = new Map(
        parseVoiceListing(bytes.toString('utf8')).entries.map(
          (entry: { key: string; bytes: number; md5: string }) => [
            entry.key,
            entry,
          ],
        ),
      );
      listings.set(file.listing.url, entries);
    }
    const original = entries.get(
      decodeURIComponent(
        new URL(file.sourceUrl).pathname.slice('/sekai-jp-assets/'.length),
      ),
    );
    assert.equal(original?.bytes, file.bytes, file.sourceUrl);
    assert.equal(original?.md5, file.md5, file.sourceUrl);
    for (const url of [record.cacheSource, file.url]) {
      if (!url || !existsSync(resolve(pjskLibraryRoot, '.' + url))) continue;
      const bytes = readFileSync(resolve(pjskLibraryRoot, '.' + url));
      assert.equal(bytes.length, file.bytes, url);
      assert.equal(hash(bytes, 'md5'), file.md5, url);
      if (url === record.cacheSource) assert.ok(url.includes(hash(bytes)), url);
    }
  }
  checked.add(file.url);
}
