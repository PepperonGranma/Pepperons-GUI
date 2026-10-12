import { FALLBACK_OPTIONS } from './options'
import type { Device, DeviceCapabilities, RuntimeStatus, SessionState, StudioApi } from './types'

// Opening the browser preview with ?sample-device shows the interface as it looks
// with a phone attached, so device-dependent pages can be worked on without hardware.
const sampleDevice = new URLSearchParams(location.search).has('sample-device')

const status: RuntimeStatus = {
  installed: sampleDevice,
  installedVersion: sampleDevice ? '5.0.1' : '',
  latestVersion: '5.0.1',
  releaseUrl: 'https://github.com/Genymobile/scrcpy/releases/latest',
  source: 'browser-preview',
  path: '',
  options: FALLBACK_OPTIONS,
}

const devices: Device[] = sampleDevice
  ? [{ serial: 'SAMPLE0001', state: 'device', model: 'Sample Phone', product: 'sample', transportId: '1', connection: 'USB', usable: true }]
  : []
const sampleCapabilities = (serial: string): DeviceCapabilities => ({
  serial, capturedAt: Date.now(), cacheKey: `${serial}|preview`,
  hardware: { manufacturer: 'Sample', model: 'Sample Phone', androidVersion: '15', sdk: 35, abi: 'arm64-v8a', device: 'sample' },
  display: { physicalWidth: 1264, physicalHeight: 2780, currentWidth: 1264, currentHeight: 2780, densityDpi: 476, currentRefreshRate: 120, maxRefreshRate: 120, supportedRefreshRates: [60, 90, 120], displayIds: [0], modes: [] },
  video: { codecs: ['h264', 'h265', 'av1'], encoders: [{ codec: 'h264', name: 'c2.qti.avc.encoder' }, { codec: 'h265', name: 'c2.qti.hevc.encoder' }, { codec: 'av1', name: 'c2.android.av1.encoder' }], reported: true },
  audio: { forwardingSupported: true, supportMessage: 'Audio forwarding is supported by this Android version.', codecs: ['opus', 'aac', 'flac'], encoders: [{ codec: 'opus', name: 'c2.android.opus.encoder' }, { codec: 'aac', name: 'c2.android.aac.encoder' }, { codec: 'flac', name: 'c2.android.flac.encoder' }], reported: true },
  camera: { reported: false, cameras: [], message: 'Camera details are not part of the sample device.' }, warnings: [],
})
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
  async getAppSettings() { return { minimizeToTray: false, closeToTray: false } },
  async setAppSetting() { throw new Error('The system tray is available in the Electron desktop app.') },
  async getRuntimeStatus() { return status },
  async chooseRuntime() { return null },
  async installRuntime() { throw new Error('Open the Electron desktop app to install Scrcpy.') },
  async listDevices() { return devices },
  async getDeviceCapabilities(serial) { return sampleDevice ? sampleCapabilities(serial) : emptyCapabilities(serial) },
  async start() { throw new Error('Open the Electron desktop app to launch Scrcpy.') },
  async applyConfig() { return { accepted: true, generation: 1, restartScheduled: false, state } },
  async stop() { state = { running: false, status: 'offline' }; stateListener?.(state); return state },
  async retry() { return state },
  async getSessionState() { return state },
  async validateArgs(args) { return { valid: true, args } },
  async reportDevicePresence() { return state },
  async runScrcpyAction() { return { code: 1, output: 'Scrcpy actions require the desktop app.' } },
  async adbAction() { return { code: 1, output: 'ADB actions require the desktop app.' } },
  async chooseRecordingPath(format) { return `scrcpy-recording.${format}` },
  async exportProfiles() { throw new Error('Open the Electron desktop app to export profiles.') },
  async importProfiles() { throw new Error('Open the Electron desktop app to import profiles.') },
  async openExternal(url) { window.open(url, '_blank', 'noopener,noreferrer'); return true },
  onLog() { return () => undefined },
  onState(callback) { stateListener = callback; return () => { stateListener = undefined } },
  onInstallProgress() { return () => undefined },
}
