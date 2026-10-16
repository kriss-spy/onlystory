import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash, writeChanged } from './gfl2-event.mjs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const compact = (object, keys) =>
  Object.fromEntries(
    keys
      .filter((key) => object[key] !== undefined)
      .map((key) => [key, object[key]]),
  );
const imageKeys = ['url', 'color', 'width', 'height', 'sourceScale'];
const soundKeys = [
  'url',
  'loop',
  'loopStart',
  'loopEnd',
  'gain',
  'layers',
  'limitation',
];

export function sceneSteps(books) {
  const steps = [];
  for (const book of books) {
    let pending = [];
    let first = true;
    for (const raw of book.commands) {
      const command = compact(raw, [
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
      ]);
      if (
        (['Text', 'Selection', 'Video'].includes(command.Command) &&
          (!book.flow ||
            book.passages.some(
              (p) => p.id === `${book.script}:${command.sourceRow}`,
            ))) ||
        (command.Command === 'EndScenario' &&
          book.passages?.some(
            (p) =>
              p.id === `${book.script}:${command.sourceRow}` &&
              p.kind === 'end',
          ))
      ) {
        steps.push({
          id: `${book.script}:${command.sourceRow}`,
          script: book.script,
          reset: first,
          commands: pending,
        });
        pending = [];
        first = false;
      } else pending.push(command);
    }
    // Preserve the actual exit commands separately; they run on leaving the book.
    if (steps.length) steps.at(-1).exit = pending;
    if (book.flow) {
      const ownSteps = steps.filter((s) => s.script === book.script);
      for (const step of ownSteps) {
        step.incoming = {};
        if (step.id === book.flow.entry.to)
          step.entryCommands = book.flow.entry.commands;
        for (const edge of book.flow.edges.filter((e) => e.to === step.id)) {
          const old = step.incoming[edge.from];
          if (old && JSON.stringify(old) !== JSON.stringify(edge.commands))
            throw Error('Ambiguous scene edge');
          step.incoming[edge.from] = edge.commands;
        }
      }
    }
    if (book.boundary === 'source-eof' && book.passages?.at(-1)?.kind === 'end')
      steps.push({
        id: book.passages.at(-1).id,
        script: book.script,
        reset: false,
        commands: [],
      });
  }
  return steps;
}

export function importScenes(root, prototype, options = {}) {
  const eventName = options.event ?? 'gfl2-event';
  const manifestName =
    eventName === 'gfl2-event' ? 'gfl2-scenes' : `${eventName}-scenes`;
  const generated = resolve(root, `src/generated/${manifestName}.json`);
  const eventFile = resolve(root, `src/generated/${eventName}.json`);
  const mediaFile = resolve(
    root,
    `public/private/${eventName}/media/manifest.json`,
  );
  const castFile = resolve(
    root,
    `public/private/${eventName}/characters/manifest.json`,
  );
  const settingsFile = resolve(
    prototype,
    '../current_book_probe/Adv.setting.json',
  );
  if (![eventFile, mediaFile, castFile, settingsFile].every(existsSync)) {
    if (!existsSync(generated)) writeChanged(generated, null);
    console.log(
      'GFL2 scene import: awaiting recovered media and characters; keeping previous import.',
    );
    return;
  }
  const event = read(eventFile);
  if (!event) return;
  const media = read(mediaFile);
  const videoFile = resolve(
    root,
    `public/private/${eventName}/videos/manifest.json`,
  );
  if (existsSync(videoFile)) {
    const video = read(videoFile);
    media.videos = video.videos;
    media.files.push(...video.files);
  }
  const effectsFile = resolve(root, 'src/generated/gfl2-effects.json');
  const effectsManifest = existsSync(effectsFile)
    ? read(effectsFile)
    : { effects: {}, files: [] };
  const cast = read(castFile);
  const settings = read(settingsFile);
  const grid = settings.settingList.find((grid) =>
    grid.name.endsWith(':Layer'),
  );
  const layers = Object.fromEntries(
    grid.rows
      .filter((row) => row.rowIndex && !row.isEmpty && !row.isCommentOut)
      .map((row) => [
        row.strings[0],
        {
          type: row.strings[1],
          x: Number(row.strings[2]) || 0,
          y: Number(row.strings[3]) || 0,
          order: Number(row.strings[4]) || 0,
        },
      ]),
  );
  const available = new Map(
    [...media.files, ...cast.files, ...effectsManifest.files].map((file) => [
      file.url,
      file,
    ]),
  );
  const sections = {};
  const coverage = {
    passages: 0,
    backgrounds: 0,
    characters: 0,
    music: 0,
    sounds: 0,
    unresolved: [],
  };
  for (const section of event.sections) {
    const archive = read(
      resolve(
        root,
        `public${new URL(section.sourceUrl, 'http://localhost').pathname}`,
      ),
    );
    const commands = archive.books.flatMap((book) => book.commands);
    const labels = (names) => [
      ...new Set(
        commands
          .filter((command) => names.includes(command.Command))
          .map((command) => command.Arg1),
      ),
    ];
    const backgrounds = Object.fromEntries(
      labels(['Bg', 'Sprite', 'CustomCharacter'])
        .filter((label) => media.backgrounds[label])
        .map((label) => [
          label,
          {
            ...compact(media.backgrounds[label], imageKeys),
            sourceX: Number(media.backgrounds[label].setting?.X) || 0,
            sourceY: Number(media.backgrounds[label].setting?.Y) || 0,
          },
        ]),
    );
    const characters = Object.fromEntries(
      labels(['Character'])
        .filter((label) => cast.characters[label])
        .map((label) => [label, cast.characters[label]]),
    );
    const audio = Object.fromEntries(
      labels(['Bgm', 'Se'])
        .filter((label) => media.audio[label])
        .map((label) => [label, compact(media.audio[label], soundKeys)]),
    );
    const videos = Object.fromEntries(
      labels(['Video'])
        .filter((label) => media.videos?.[label])
        .map((label) => [label, media.videos[label]]),
    );
    const urls = new Set(['/vendor/live2dcubismcore.min.js']);
    const collect = (object) => {
      if (Array.isArray(object)) object.forEach(collect);
      else if (object && typeof object === 'object') {
        if (typeof object.url === 'string') urls.add(object.url);
        if (Array.isArray(object.files))
          object.files.forEach((url) => urls.add(url));
        Object.values(object).forEach(collect);
      }
    };
    const effectNames = [
      ...new Set(
        commands
          .filter((command) => command.Command === 'AddEffect')
          .map((command) => command.Arg2),
      ),
    ];
    for (const name of effectNames) {
      const effect = effectsManifest.effects[name];
      if (effect) {
        urls.add(effect.mask);
        urls.add(effect.turbulence);
      }
    }
    collect({ backgrounds, characters, audio, videos });
    const steps = sceneSteps(archive.books);
    const unresolved = [
      ...archive.books.flatMap((book) =>
        book.passages
          .filter((p) => p.source.unavailable)
          .map((p) => ({
            kind: 'text',
            label: `${p.id}: ${p.source.unavailable}`,
          })),
      ),
      ...(cast.unresolved ?? [])
        .filter(
          (item) => labels(['Character']).includes(item.label) && item.pattern,
        )
        .map((item) => ({
          kind: 'expression',
          label: `${item.label}/${item.pattern}`,
        })),
      ...labels(['Video'])
        .filter((label) => !videos[label])
        .map((label) => ({ kind: 'video', label })),
      ...labels(['Bg', 'Sprite', 'CustomCharacter'])
        .filter((label) => !backgrounds[label])
        .map((label) => ({ kind: 'background', label })),
      ...labels(['Character'])
        .filter((label) => !characters[label])
        .map((label) => ({ kind: 'character', label })),
      ...labels(['Bgm', 'Se'])
        .filter((label) => !audio[label])
        .map((label) => ({ kind: 'audio', label })),
    ];
    const files = [...urls].map((url) => ({
      url,
      bytes: available.get(url)?.bytes ?? 0,
    }));
    const program = {
      version: 1,
      id: section.id,
      steps,
      layers,
      backgrounds,
      characters,
      audio,
      videos,
      files,
      unresolved,
    };
    const path = `/private/${eventName}/scenes/${section.id}.json`;
    writeChanged(resolve(root, `public${path}`), program);
    sections[section.id] = {
      url: `${path}?v=${hash(JSON.stringify(program)).slice(0, 16)}`,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
      unresolved: unresolved.length,
    };
    coverage.passages += steps.length;
    coverage.unresolved.push(
      ...unresolved.map((item) => ({ ...item, section: section.id })),
    );
  }
  coverage.backgrounds = Object.keys(media.backgrounds).length;
  coverage.characters = Object.keys(cast.characters).length;
  coverage.music = media.coverage?.Bgm ?? 0;
  coverage.sounds = media.coverage?.Se ?? 0;
  const manifest = { version: 1, sections, coverage };
  writeChanged(generated, manifest);
  console.log(
    `GFL2 scenes: ${Object.keys(sections).length} sections, ${coverage.passages} passages; ${coverage.unresolved.length} unresolved asset references.`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  importScenes(
    root,
    resolve(
      process.env.ONLYSTORY_GFL2_PROTOTYPE ||
        resolve(root, '../onlystory-gfl2/prototype'),
    ),
  );
}
