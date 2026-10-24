// CI builds the public app without the separately acquired game library.
// Create only absent catalog files; never replace a developer's installed data.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = new URL('../src/generated/', import.meta.url);
mkdirSync(directory, { recursive: true });
const defaults = {
  'gfl2-opening.json': null,
  'gfl2-event.json': null,
  'gfl2-ilion.json': null,
  'gfl2-ilion-scenes.json': null,
  'gfl2-scenes.json': null,
  'gfl2-packages.json': [],
  'ba-stories.json': [],
  'gfl2-effects.json': { effects: {} },
};
for (const [name, value] of Object.entries(defaults)) {
  try {
    writeFileSync(new URL(name, directory), JSON.stringify(value) + '\n', {
      flag: 'wx',
    });
    console.log(`Created empty CI catalog: ${name}`);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log(`Preserved installed catalog: ${name}`);
  }
}
console.log(`CI catalogs ready in ${fileURLToPath(directory)}`);
