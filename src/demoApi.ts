import { FALLBACK_OPTIONS } from './options'
import type { Device, DeviceCapabilities, RuntimeStatus, SessionState, StudioApi } from './types'

const status: RuntimeStatus = {
  installed: false,
  installedVersion: '',
  latestVersion: '4.1',
  releaseUrl: 'https://github.com/Genymobile/scrcpy/releases/latest',
  source: 'browser-preview',
  path: '',
  options: FALLBACK_OPTIONS,
}

const devices: Device[] = []
let stateListener: ((state: SessionState) => void) | undefined
let state: SessionState = { running: false, status: 'offline' }

const emptyCapabilities = (serial: string): DeviceCapabilities => ({
  serial, capturedAt: Date.now(), cacheKey: `${serial}|preview`, hardware: {},
  display: { supportedRefreshRates: [], displayIds: [0], modes: [] },
  video: { codecs: [], encoders: [], reported: false },
  audio: { supportMessage: 'Connect an authorized Android device to inspect audio support.', codecs: [], encoders: [], reported: false },
  camera: { reported: false, cameras: [], message: 'Connect an authorized Android device to inspect cameras.' }, warnings: [],
})

export const demoApi: StudioApi = {
  async getWindowState() { return { maximized: false } },
  async windowAction() {},
  onWindowState() { return () => undefined },
  async getRuntimeStatus() { return status },
  async chooseRuntime() { return null },
  async installRuntime() { throw new Error('Open the Electron desktop app to install Scrcpy.') },
  async listDevices() { return devices },
  async getDeviceCapabilities(serial) { return emptyCapabilities(serial) },
  async start() { throw new Error('Open the Electron desktop app to launch Scrcpy.') },
  async applyConfig() { return { accepted: true, generation: 1, restartScheduled: false, state } },
  async stop() { state = { running: false, status: 'offline' }; stateListener?.(state); return state },
  async retry() { return state },
  async getSessionState() { return state },
  async reportDevicePresence() { return state },
  async runScrcpyAction() { return { code: 1, output: 'Scrcpy actions require the desktop app.' } },
  async adbAction() { return { code: 1, output: 'ADB actions require the desktop app.' } },
  async chooseRecordingPath(format) { return `scrcpy-recording.${format}` },
  async openExternal(url) { window.open(url, '_blank', 'noopener,noreferrer'); return true },
  onLog() { return () => undefined },
  onState(callback) { stateListener = callback; return () => { stateListener = undefined } },
  onInstallProgress() { return () => undefined },
}
