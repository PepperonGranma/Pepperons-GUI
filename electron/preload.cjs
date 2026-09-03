const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('scrcpyStudio', {
  getWindowState: () => ipcRenderer.invoke('window:state'),
  windowAction: (action) => ipcRenderer.invoke('window:action', action),
  onWindowState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('window:state-changed', listener)
    return () => ipcRenderer.removeListener('window:state-changed', listener)
  },
  getRuntimeStatus: () => ipcRenderer.invoke('runtime:status'),
  chooseRuntime: () => ipcRenderer.invoke('runtime:choose'),
  installRuntime: () => ipcRenderer.invoke('runtime:install'),
  listDevices: () => ipcRenderer.invoke('device:list'),
  getDeviceCapabilities: (serial, force = false) => ipcRenderer.invoke('device:capabilities', serial, force),
  start: (request) => ipcRenderer.invoke('scrcpy:start', request),
  applyConfig: (request) => ipcRenderer.invoke('scrcpy:apply-config', request),
  stop: () => ipcRenderer.invoke('scrcpy:stop'),
  retry: () => ipcRenderer.invoke('scrcpy:retry'),
  getSessionState: () => ipcRenderer.invoke('scrcpy:state'),
  validateArgs: (args) => ipcRenderer.invoke('scrcpy:validate-args', args),
  reportDevicePresence: (serial, present) => ipcRenderer.invoke('scrcpy:device-presence', serial, present),
  runScrcpyAction: (args) => ipcRenderer.invoke('scrcpy:run-once', args),
  adbAction: (action, payload) => ipcRenderer.invoke('adb:action', action, payload),
  chooseRecordingPath: (format) => ipcRenderer.invoke('dialog:save-recording', format),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  onLog: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('scrcpy:log', listener)
    return () => ipcRenderer.removeListener('scrcpy:log', listener)
  },
  onState: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('scrcpy:state', listener)
    return () => ipcRenderer.removeListener('scrcpy:state', listener)
  },
  onInstallProgress: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('runtime:install-progress', listener)
    return () => ipcRenderer.removeListener('runtime:install-progress', listener)
  },
})
