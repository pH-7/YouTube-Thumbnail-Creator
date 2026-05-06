const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectImages: () => ipcRenderer.invoke('select-images'),
    selectSingleImage: () => ipcRenderer.invoke('select-single-image'),
    createThumbnail: (data) => ipcRenderer.invoke('create-thumbnail', data),
    openOutputFolder: (outputDir) => ipcRenderer.invoke('open-output-folder', outputDir)
});
