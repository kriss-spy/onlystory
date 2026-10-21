const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('onlystoryDesktop', {
  platform: process.platform,
  readOriginal: (id) => ipcRenderer.invoke('onlystory:original', id),
  convertMedia: (id, inputs) =>
    ipcRenderer.invoke('onlystory:convert', id, inputs),
  cancelDownloads: () => ipcRenderer.invoke('onlystory:cancel'),
});
