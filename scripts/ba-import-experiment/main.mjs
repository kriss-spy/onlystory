import { emptyData, parseData } from '../../src/model.ts';
const recipe = await (await fetch('./recipe.json')).json();
const select = document.querySelector('#files'),
  start = document.querySelector('#import'),
  cancel = document.querySelector('#cancel'),
  status = document.querySelector('#status');
let worker;
status.textContent = `Select ${recipe.inputs.length} original files, including two prologue ZIP packs.`;
for (const input of recipe.inputs) {
  const li = document.createElement('li'),
    a = document.createElement('a');
  a.href = input.url;
  a.textContent = `${input.filename} (${input.bytes} bytes)`;
  a.target = '_blank';
  a.rel = 'noopener';
  li.append(a);
  document.querySelector('#sources').append(li);
}
select.onchange = () => {
  start.disabled = !select.files.length;
};
start.onclick = () => {
  start.disabled = true;
  cancel.disabled = false;
  window.importResult = null;
  window.importError = null;
  worker = new Worker(new URL('./worker.mjs', import.meta.url), {
    type: 'module',
  });
  worker.onerror = (e) => {
    window.importError = e.message;
    status.textContent = e.message;
    cancel.disabled = true;
    start.disabled = false;
  };
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') status.textContent = data.message;
    else {
      cancel.disabled = true;
      start.disabled = false;
      if (data.type === 'error') {
        window.importError = data.message;
        status.textContent = data.message;
      } else {
        try {
          const raw = localStorage.getItem('onlystory.v1'),
            stored = raw ? parseData(JSON.parse(raw)) : emptyData();
          stored.installed[recipe.episode.id] = true;
          stored.installations = {
            ...stored.installations,
            [recipe.episode.id]: {
              files: data.result.installationFiles,
              voices: ['ja'],
            },
          };
          stored.preferences.games = {
            ...stored.preferences.games,
            ba: {
              ...stored.preferences.games?.ba,
              textLocale: 'ja',
              voice: 'ja',
            },
          };
          localStorage.setItem('onlystory.v1', JSON.stringify(stored));
          window.importResult = data.result;
          status.textContent = 'Import complete';
          document.querySelector('#result').textContent = JSON.stringify(
            data.result,
            null,
            2,
          );
        } catch (error) {
          window.importError = String(error);
          status.textContent = String(error);
        }
      }
      worker.terminate();
    }
  };
  worker.postMessage({ recipe, files: [...select.files] });
};
cancel.onclick = () => {
  worker?.terminate();
  status.textContent = 'Import canceled';
  cancel.disabled = true;
  start.disabled = false;
};
