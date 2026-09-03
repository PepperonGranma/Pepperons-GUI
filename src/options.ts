import type { CliOption, StudioConfig, ThemeSettings } from './types'

export const DEFAULT_CONFIG: StudioConfig = {
  serial: '',
  videoSource: 'display',
  videoCodec: 'h264',
  videoEncoder: '',
  videoBitRate: '8M',
  maxSize: '1920',
  maxFps: '60',
  videoBuffer: '0',
  crop: '',
  audioEnabled: true,
  audioCodec: 'opus',
  audioEncoder: '',
  audioSource: 'output',
  audioBitRate: '128K',
  audioBuffer: '50',
  audioDup: false,
  controlEnabled: true,
  keyboard: 'sdk',
  mouse: 'sdk',
  gamepad: 'disabled',
  clipboardSync: true,
  showTouches: false,
  stayAwake: true,
  turnScreenOff: false,
  powerOffOnClose: false,
  windowTitle: '',
  windowWidth: '',
  windowHeight: '',
  windowX: '',
  windowY: '',
  alwaysOnTop: false,
  borderless: false,
  fullscreen: false,
  disableScreensaver: true,
  recordingEnabled: false,
  recordPath: '',
  recordFormat: 'mp4',
  noPlayback: false,
  timeLimit: '',
  cameraId: '',
  cameraFacing: '',
  cameraSize: '',
  cameraFps: '30',
  cameraTorch: false,
  newDisplay: false,
  displayId: '0',
  displayOrientation: '0',
  newDisplaySize: '1920x1080',
  newDisplayDpi: '240',
  destroyDisplayContent: true,
  displayDecorations: true,
  autoStartOnConnect: false,
  autoReconnect: true,
  extras: {},
}

export const DEFAULT_THEME: ThemeSettings = {
  mode: 'dark',
  accent: '#9147ff',
  mint: '#a970ff',
  pink: '#bf94ff',
  surface: '#18181b',
  lightSurface: '#ffffff',
  radius: 10,
  density: 'compact',
  pattern: false,
}

const VALUE_HINTS: Record<string, string> = {
  '--angle': 'degrees', '--audio-bit-rate': 'value', '--audio-buffer': 'ms', '--audio-codec': 'name',
  '--audio-codec-options': 'key:type=value', '--audio-encoder': 'name', '--audio-output-buffer': 'ms', '--audio-source': 'source',
  '--background-color': 'hexcolor', '--camera-ar': 'ratio', '--camera-facing': 'facing', '--camera-fps': 'fps',
  '--camera-id': 'id', '--camera-size': 'widthxheight', '--camera-zoom': 'zoom', '--capture-orientation': 'value',
  '--crop': 'width:height:x:y', '--display-id': 'id', '--display-ime-policy': 'value', '--display-orientation': 'value',
  '--flex-display': 'value', '--gamepad': 'mode', '--keyboard': 'mode', '--max-fps': 'value', '--max-size': 'value',
  '--min-size-alignment': 'value', '--mouse': 'mode', '--mouse-bind': 'buttons', '--new-display': 'widthxheight/dpi',
  '--orientation': 'value', '--pause-on-exit': 'mode', '--port': 'port[:port]', '--push-target': 'path',
  '--record': 'file', '--record-format': 'format', '--record-orientation': 'value', '--render-driver': 'name',
  '--render-fit': 'mode', '--screen-off-timeout': 'seconds', '--serial': 'serial', '--shortcut-mod': 'key[+key]',
  '--start-app': 'name', '--tcpip': '[ip[:port]]', '--time-limit': 'seconds', '--tunnel-host': 'ip', '--tunnel-port': 'port',
  '--v4l2-buffer': 'ms', '--v4l2-sink': 'device', '--verbosity': 'level', '--video-bit-rate': 'value',
  '--video-buffer': 'ms', '--video-codec': 'name', '--video-codec-options': 'key:type=value', '--video-encoder': 'name',
  '--video-source': 'source', '--window-height': 'value', '--window-title': 'text', '--window-width': 'value',
  '--window-x': 'value', '--window-y': 'value',
}

const DESCRIPTIONS: Record<string, string> = {
  '--always-on-top': 'Keep the mirror above other windows.',
  '--max-size': 'Limit the video dimension while preserving aspect ratio.',
  '--max-fps': 'Limit the capture frame rate.',
  '--video-codec': 'Choose H.264, H.265, AV1, VP8, or VP9.',
  '--video-bit-rate': 'Set the encoded video bit rate.',
  '--audio-source': 'Choose device output, playback, microphone, or voice capture.',
  '--keyboard': 'Select SDK, UHID, AOA, or disabled keyboard injection.',
  '--mouse': 'Select SDK, UHID, AOA, or disabled mouse injection.',
  '--new-display': 'Create and mirror a new Android virtual display.',
  '--record': 'Record the mirrored stream to a local media file.',
  '--start-app': 'Start an Android app by package name or friendly name.',
  '--ignore-video-encoder-constraints': 'Ignore reported encoder size constraints (added in v4.1).',
}

export function categoryFor(name: string) {
  if (name.includes('audio')) return 'Audio'
  if (name.includes('camera')) return 'Camera'
  if (/window|fullscreen|screensaver|render|orientation|angle|mipmap|background/.test(name)) return 'Window'
  if (/record|v4l2|playback|time-limit/.test(name)) return 'Recording'
  if (/keyboard|mouse|gamepad|clipboard|paste|touch|control|key-repeat|shortcut/.test(name)) return 'Control'
  if (/display|vd-|flex-display/.test(name)) return 'Display'
  if (/tcpip|serial|select-|tunnel|port|adb|otg/.test(name)) return 'Connection'
  if (/video|fps|max-size|encoder|crop|codec|bit-rate|downsize|alignment/.test(name)) return 'Video'
  return 'General'
}

const OPTION_NAMES = `--always-on-top --angle --audio-bit-rate --audio-buffer --audio-codec --audio-codec-options --audio-dup --audio-encoder --audio-output-buffer --audio-source --background-color --camera-ar --camera-facing --camera-fps --camera-high-speed --camera-id --camera-size --camera-torch --camera-zoom --capture-orientation --crop --disable-screensaver --display-id --display-ime-policy --display-orientation --flex-display --force-adb-forward --fullscreen --gamepad --ignore-video-encoder-constraints --keep-active --keyboard --kill-adb-on-close --legacy-paste --list-apps --list-camera-sizes --list-cameras --list-displays --list-encoders --max-fps --max-size --min-size-alignment --mouse --mouse-bind --new-display --no-audio --no-audio-playback --no-cleanup --no-clipboard-autosync --no-control --no-downsize-on-error --no-key-repeat --no-mipmaps --no-mouse-hover --no-playback --no-power-on --no-terminal-title --no-vd-destroy-content --no-vd-system-decorations --no-video --no-video-playback --no-window --no-window-aspect-ratio-lock --orientation --otg --pause-on-exit --port --power-off-on-close --prefer-text --print-fps --push-target --raw-key-events --record --record-format --record-orientation --render-driver --render-fit --require-audio --screen-off-timeout --select-tcpip --select-usb --serial --shortcut-mod --show-touches --start-app --stay-awake --tcpip --time-limit --tunnel-host --tunnel-port --turn-screen-off --v4l2-buffer --v4l2-sink --verbosity --video-bit-rate --video-buffer --video-codec --video-codec-options --video-encoder --video-source --window-borderless --window-height --window-title --window-width --window-x --window-y`

export const FALLBACK_OPTIONS: CliOption[] = OPTION_NAMES.split(' ').map((name) => ({
  name,
  short: '',
  valueHint: VALUE_HINTS[name] || '',
  kind: VALUE_HINTS[name] ? 'value' : 'boolean',
  category: categoryFor(name),
  description: DESCRIPTIONS[name] || `Pass ${name} directly to Scrcpy.`,
}))

const handledOptions = new Set([
  '--serial', '--video-source', '--video-codec', '--video-encoder', '--video-bit-rate', '--max-size', '--max-fps', '--video-buffer', '--crop',
  '--no-audio', '--audio-codec', '--audio-source', '--audio-bit-rate', '--audio-buffer', '--audio-dup', '--no-control',
  '--audio-encoder', '--keyboard', '--mouse', '--gamepad', '--no-clipboard-autosync', '--show-touches', '--stay-awake', '--turn-screen-off',
  '--power-off-on-close', '--window-title', '--window-width', '--window-height', '--window-x', '--window-y', '--always-on-top', '--window-borderless', '--fullscreen', '--disable-screensaver',
  '--record', '--record-format', '--no-playback', '--time-limit', '--camera-id', '--camera-facing', '--camera-size', '--camera-fps',
  '--camera-torch', '--display-id', '--display-orientation', '--new-display', '--no-vd-destroy-content', '--no-vd-system-decorations',
])

export function buildArgs(config: StudioConfig): string[] {
  const args: string[] = []
  const value = (name: string, next: string) => { if (next.trim()) args.push(`${name}=${next.trim()}`) }
  const flag = (name: string, enabled: boolean) => { if (enabled) args.push(name) }

  value('--serial', config.serial)
  value('--video-source', config.videoSource)
  value('--video-codec', config.videoCodec)
  value('--video-encoder', config.videoEncoder)
  value('--video-bit-rate', config.videoBitRate)
  value('--max-size', config.maxSize)
  value('--max-fps', config.maxFps)
  if (config.videoBuffer !== '0') value('--video-buffer', config.videoBuffer)
  value('--crop', config.crop)

  if (!config.audioEnabled) flag('--no-audio', true)
  else {
    value('--audio-codec', config.audioCodec)
    value('--audio-encoder', config.audioEncoder)
    value('--audio-source', config.audioSource)
    value('--audio-bit-rate', config.audioBitRate)
    value('--audio-buffer', config.audioBuffer)
    flag('--audio-dup', config.audioDup && config.audioSource === 'playback')
  }

  if (!config.controlEnabled) flag('--no-control', true)
  else {
    value('--keyboard', config.keyboard)
    value('--mouse', config.mouse)
    value('--gamepad', config.gamepad)
    flag('--no-clipboard-autosync', !config.clipboardSync)
    flag('--show-touches', config.showTouches)
    flag('--stay-awake', config.stayAwake)
    flag('--turn-screen-off', config.turnScreenOff)
    flag('--power-off-on-close', config.powerOffOnClose)
  }

  value('--window-title', config.windowTitle)
  value('--window-width', config.windowWidth)
  value('--window-height', config.windowHeight)
  value('--window-x', config.windowX)
  value('--window-y', config.windowY)
  flag('--always-on-top', config.alwaysOnTop)
  flag('--window-borderless', config.borderless)
  flag('--fullscreen', config.fullscreen)
  flag('--disable-screensaver', config.disableScreensaver)

  if (config.recordingEnabled && config.recordPath) {
    value('--record', config.recordPath)
    value('--record-format', config.recordFormat)
  }
  flag('--no-playback', config.noPlayback)
  value('--time-limit', config.timeLimit)

  if (config.videoSource === 'camera') {
    value('--camera-id', config.cameraId)
    value('--camera-facing', config.cameraFacing)
    value('--camera-size', config.cameraSize)
    value('--camera-fps', config.cameraFps)
    flag('--camera-torch', config.cameraTorch)
  }

  if (config.newDisplay) {
    const display = [config.newDisplaySize, config.newDisplayDpi].filter(Boolean).join('/')
    value('--new-display', display)
    flag('--no-vd-destroy-content', !config.destroyDisplayContent)
    flag('--no-vd-system-decorations', !config.displayDecorations)
  } else {
    value('--display-id', config.displayId === '0' ? '' : config.displayId)
  }
  value('--display-orientation', config.displayOrientation === '0' ? '' : config.displayOrientation)

  for (const [name, extraValue] of Object.entries(config.extras)) {
    if (handledOptions.has(name)) continue
    if (extraValue === true) args.push(name)
    else if (typeof extraValue === 'string' && extraValue.trim()) args.push(`${name}=${extraValue.trim()}`)
  }
  return args
}

export function getGuidedOptionValue(config: StudioConfig, name: string): boolean | string | undefined {
  const values: Record<string, boolean | string> = {
    '--serial': config.serial, '--video-source': config.videoSource, '--video-codec': config.videoCodec,
    '--video-encoder': config.videoEncoder, '--video-bit-rate': config.videoBitRate, '--max-size': config.maxSize,
    '--max-fps': config.maxFps, '--video-buffer': config.videoBuffer, '--crop': config.crop,
    '--no-audio': !config.audioEnabled, '--audio-codec': config.audioCodec, '--audio-encoder': config.audioEncoder,
    '--audio-source': config.audioSource, '--audio-bit-rate': config.audioBitRate, '--audio-buffer': config.audioBuffer,
    '--audio-dup': config.audioDup, '--no-control': !config.controlEnabled, '--keyboard': config.keyboard,
    '--mouse': config.mouse, '--gamepad': config.gamepad, '--no-clipboard-autosync': !config.clipboardSync,
    '--show-touches': config.showTouches, '--stay-awake': config.stayAwake, '--turn-screen-off': config.turnScreenOff,
    '--power-off-on-close': config.powerOffOnClose, '--window-title': config.windowTitle, '--window-width': config.windowWidth,
    '--window-height': config.windowHeight, '--window-x': config.windowX, '--window-y': config.windowY,
    '--always-on-top': config.alwaysOnTop, '--window-borderless': config.borderless, '--fullscreen': config.fullscreen,
    '--disable-screensaver': config.disableScreensaver, '--record': config.recordPath, '--record-format': config.recordFormat,
    '--no-playback': config.noPlayback, '--time-limit': config.timeLimit, '--camera-id': config.cameraId,
    '--camera-facing': config.cameraFacing, '--camera-size': config.cameraSize, '--camera-fps': config.cameraFps,
    '--camera-torch': config.cameraTorch, '--display-id': config.displayId, '--display-orientation': config.displayOrientation,
    '--new-display': config.newDisplay ? [config.newDisplaySize, config.newDisplayDpi].filter(Boolean).join('/') : '',
    '--no-vd-destroy-content': !config.destroyDisplayContent, '--no-vd-system-decorations': !config.displayDecorations,
  }
  return handledOptions.has(name) ? values[name] : undefined
}

export function applyGuidedOptionValue(config: StudioConfig, name: string, next: boolean | string): StudioConfig | null {
  const text = typeof next === 'string' ? next : ''
  const bool = next === true
  const patch: Partial<StudioConfig> = {}
  switch (name) {
    case '--serial': patch.serial = text; break
    case '--video-source': patch.videoSource = text as StudioConfig['videoSource']; break
    case '--video-codec': patch.videoCodec = text as StudioConfig['videoCodec']; break
    case '--video-encoder': patch.videoEncoder = text; break
    case '--video-bit-rate': patch.videoBitRate = text; break
    case '--max-size': patch.maxSize = text; break
    case '--max-fps': patch.maxFps = text; break
    case '--video-buffer': patch.videoBuffer = text; break
    case '--crop': patch.crop = text; break
    case '--no-audio': patch.audioEnabled = !bool; break
    case '--audio-codec': patch.audioCodec = text as StudioConfig['audioCodec']; break
    case '--audio-encoder': patch.audioEncoder = text; break
    case '--audio-source': patch.audioSource = text; break
    case '--audio-bit-rate': patch.audioBitRate = text; break
    case '--audio-buffer': patch.audioBuffer = text; break
    case '--audio-dup': patch.audioDup = bool; break
    case '--no-control': patch.controlEnabled = !bool; break
    case '--keyboard': patch.keyboard = text as StudioConfig['keyboard']; break
    case '--mouse': patch.mouse = text as StudioConfig['mouse']; break
    case '--gamepad': patch.gamepad = text as StudioConfig['gamepad']; break
    case '--no-clipboard-autosync': patch.clipboardSync = !bool; break
    case '--show-touches': patch.showTouches = bool; break
    case '--stay-awake': patch.stayAwake = bool; break
    case '--turn-screen-off': patch.turnScreenOff = bool; break
    case '--power-off-on-close': patch.powerOffOnClose = bool; break
    case '--window-title': patch.windowTitle = text; break
    case '--window-width': patch.windowWidth = text; break
    case '--window-height': patch.windowHeight = text; break
    case '--window-x': patch.windowX = text; break
    case '--window-y': patch.windowY = text; break
    case '--always-on-top': patch.alwaysOnTop = bool; break
    case '--window-borderless': patch.borderless = bool; break
    case '--fullscreen': patch.fullscreen = bool; break
    case '--disable-screensaver': patch.disableScreensaver = bool; break
    case '--record': patch.recordPath = text; patch.recordingEnabled = Boolean(text); break
    case '--record-format': patch.recordFormat = text as StudioConfig['recordFormat']; break
    case '--no-playback': patch.noPlayback = bool; break
    case '--time-limit': patch.timeLimit = text; break
    case '--camera-id': patch.cameraId = text; break
    case '--camera-facing': patch.cameraFacing = text as StudioConfig['cameraFacing']; break
    case '--camera-size': patch.cameraSize = text; break
    case '--camera-fps': patch.cameraFps = text; break
    case '--camera-torch': patch.cameraTorch = bool; break
    case '--display-id': patch.displayId = text; break
    case '--display-orientation': patch.displayOrientation = text; break
    case '--new-display': {
      const [size, dpi = ''] = text.split('/')
      patch.newDisplay = Boolean(text); patch.newDisplaySize = size; patch.newDisplayDpi = dpi; break
    }
    case '--no-vd-destroy-content': patch.destroyDisplayContent = !bool; break
    case '--no-vd-system-decorations': patch.displayDecorations = !bool; break
    default: return null
  }
  return { ...config, ...patch }
}

export const LIVE_ADB_CONFIG_KEYS: Array<keyof StudioConfig> = ['showTouches', 'stayAwake', 'turnScreenOff']

export const QUICK_PRESETS: Array<{ name: string; label: string; description: string; patch: Partial<StudioConfig> }> = [
  { name: 'balanced', label: 'Balanced', description: '1080p · 60 fps · 8 Mbps', patch: { maxSize: '1920', maxFps: '60', videoBitRate: '8M', videoCodec: 'h264', videoBuffer: '0' } },
  { name: 'quality', label: 'Studio', description: '1440p · 60 fps · 16 Mbps', patch: { maxSize: '2560', maxFps: '60', videoBitRate: '16M', videoCodec: 'h265', videoBuffer: '20' } },
  { name: 'latency', label: 'Low latency', description: '720p · 90 fps · 6 Mbps', patch: { maxSize: '1280', maxFps: '90', videoBitRate: '6M', videoCodec: 'h264', videoBuffer: '0', audioBuffer: '20' } },
  { name: 'wireless', label: 'Wireless', description: '720p · 45 fps · 4 Mbps', patch: { maxSize: '1280', maxFps: '45', videoBitRate: '4M', videoCodec: 'h264', videoBuffer: '50' } },
]
