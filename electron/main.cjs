const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const { spawn } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const https = require('node:https')
const os = require('node:os')
const path = require('node:path')
const AdmZip = require('adm-zip')

const APP_NAME = "Pepperon's GUI"
// Keep the existing runtime, preferences, and Chromium profile across the rebrand.
const settingsDirectory = path.join(app.getPath('appData'), 'scrcpy-studio')
fs.mkdirSync(settingsDirectory, { recursive: true })
app.setName(APP_NAME)
app.setPath('userData', settingsDirectory)

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
let mainWindow
let activeSession = null
let cachedRuntime = null
let desiredArgs = []
let appliedArgs = []
let desiredGeneration = 0
let sessionIntent = false
let reconnectEnabled = true
let applyTimer = null
let lifecycleQueue = Promise.resolve()
let sessionState = { running: false, status: 'offline', generation: 0, desiredArgs: [], appliedArgs: [] }
const capabilityCache = new Map()
const capabilityRequests = new Map()
const APPLY_DEBOUNCE_MS = 250

const safeSend = (channel, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function runCapture(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs || 12000
    const spawnOptions = { ...options }
    delete spawnOptions.timeoutMs
    const child = spawn(command, args, {
      windowsHide: true,
      shell: false,
      ...spawnOptions,
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`${path.basename(command)} timed out`))
    }, timeoutMs)
    child.stdout?.on('data', (data) => (stdout += data.toString()))
    child.stderr?.on('data', (data) => (stderr += data.toString()))
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout, stderr, output: `${stdout}${stderr}`.trim() })
    })
  })
}

async function exists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function commandAvailable(command) {
  try {
    const probe = process.platform === 'win32'
      ? await runCapture('where.exe', [command])
      : await runCapture('which', [command])
    return probe.code === 0
  } catch {
    return false
  }
}

async function readPreferences() {
  try { return JSON.parse(await fsp.readFile(path.join(app.getPath('userData'), 'preferences.json'), 'utf8')) } catch { return {} }
}

async function writePreferences(patch) {
  const target = path.join(app.getPath('userData'), 'preferences.json')
  const current = await readPreferences()
  await fsp.mkdir(path.dirname(target), { recursive: true })
  await fsp.writeFile(target, JSON.stringify({ ...current, ...patch }, null, 2), 'utf8')
}

async function findRuntime(force = false) {
  if (cachedRuntime && !force) return cachedRuntime
  const exe = process.platform === 'win32' ? 'scrcpy.exe' : 'scrcpy'
  const preferences = await readPreferences()
  const configured = process.env.SCRCPY_PATH || preferences.scrcpyPath
  const candidates = [
    configured,
    path.join(app.getPath('userData'), 'runtime', exe),
    path.join(process.resourcesPath, 'scrcpy', exe),
    path.join(process.cwd(), 'scrcpy', exe),
  ].filter(Boolean)

  let scrcpyPath = null
  let source = 'missing'
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      scrcpyPath = candidate
      source = candidate === configured ? 'environment' : 'managed'
      break
    }
  }
  if (!scrcpyPath && await commandAvailable('scrcpy')) {
    scrcpyPath = 'scrcpy'
    source = 'system'
  }

  let adbPath = 'adb'
  if (scrcpyPath && scrcpyPath !== 'scrcpy') {
    const adjacent = path.join(path.dirname(scrcpyPath), process.platform === 'win32' ? 'adb.exe' : 'adb')
    if (await exists(adjacent)) adbPath = adjacent
  }

  cachedRuntime = { scrcpyPath, adbPath, source }
  return cachedRuntime
}

function categoryFor(name) {
  if (/audio/.test(name)) return 'Audio'
  if (/camera/.test(name)) return 'Camera'
  if (/window|fullscreen|screensaver|render|orientation|angle|mipmap|background/.test(name)) return 'Window'
  if (/record|v4l2|playback|time-limit/.test(name)) return 'Recording'
  if (/keyboard|mouse|gamepad|clipboard|paste|touch|control|key-repeat|shortcut/.test(name)) return 'Control'
  if (/display|new-display|vd-|flex-display/.test(name)) return 'Display'
  if (/tcpip|serial|select-|tunnel|port|adb|otg/.test(name)) return 'Connection'
  if (/video|fps|max-size|encoder|crop|codec|bit-rate|downsize|alignment/.test(name)) return 'Video'
  return 'General'
}

function parseHelp(raw) {
  const lines = raw.replace(/\r/g, '').split('\n')
  const options = []
  let current = null
  for (const line of lines) {
    // Option declarations in scrcpy help are indented by four spaces. Requiring
    // that exact level avoids treating indented usage examples as new options.
    const match = line.match(/^ {4}(?:(-[A-Za-z0-9]),\s*)?(--[a-z0-9][a-z0-9-]*)(.*)$/)
    if (match) {
      if (current) options.push(current)
      const suffix = (match[3] || '').trim()
      const hint = (suffix.startsWith('[=') && suffix.endsWith(']')
        ? suffix.slice(2, -1)
        : suffix.startsWith('=') ? suffix.slice(1) : suffix).replace(/^<|>$/g, '')
      current = {
        name: match[2],
        short: match[1] || '',
        valueHint: hint,
        kind: hint ? 'value' : 'boolean',
        optionalValue: suffix.startsWith('[='),
        category: categoryFor(match[2]),
        description: '',
      }
    } else if (current && (/^\S/.test(line) || /^ {4}-[A-Za-z0-9](?:\s|$)/.test(line))) {
      options.push(current)
      current = null
    } else if (current && line.trim()) {
      current.description += `${current.description ? ' ' : ''}${line.trim()}`
    }
  }
  if (current) options.push(current)
  return [...new Map(options.map((option) => [option.name, option])).values()]
}

async function latestRelease() {
  const json = await requestJson('https://api.github.com/repos/Genymobile/scrcpy/releases/latest')
  return {
    version: String(json.tag_name || '').replace(/^v/, ''),
    url: json.html_url,
    assets: json.assets || [],
  }
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: { 'User-Agent': 'Scrcpy-Studio', Accept: 'application/vnd.github+json' },
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        requestJson(response.headers.location).then(resolve, reject)
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`GitHub returned ${response.statusCode}`))
        return
      }
      let data = ''
      response.on('data', (chunk) => (data += chunk))
      response.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (error) { reject(error) }
      })
    })
    request.on('error', reject)
  })
}

function download(url, destination, onProgress) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'Scrcpy-Studio' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        download(response.headers.location, destination, onProgress).then(resolve, reject)
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Download returned ${response.statusCode}`))
        return
      }
      const total = Number(response.headers['content-length'] || 0)
      let received = 0
      const file = fs.createWriteStream(destination)
      response.on('data', (chunk) => {
        received += chunk.length
        if (total) onProgress(Math.round((received / total) * 100))
      })
      response.pipe(file)
      file.on('finish', () => file.close(resolve))
      file.on('error', reject)
    })
    request.on('error', reject)
  })
}

async function runtimeStatus() {
  const runtime = await findRuntime()
  let installedVersion = ''
  let options = []
  if (runtime.scrcpyPath) {
    try {
      const version = await runCapture(runtime.scrcpyPath, ['--version'])
      installedVersion = version.output.match(/scrcpy\s+([\w.-]+)/i)?.[1] || version.output.split('\n')[0]
      const help = await runCapture(runtime.scrcpyPath, ['--help'])
      options = parseHelp(help.output)
    } catch {}
  }
  let release = { version: '4.1', url: 'https://github.com/Genymobile/scrcpy/releases/latest' }
  try { release = await latestRelease() } catch {}
  return {
    installed: Boolean(runtime.scrcpyPath),
    installedVersion,
    latestVersion: release.version,
    releaseUrl: release.url,
    source: runtime.source,
    path: runtime.scrcpyPath || '',
    options,
  }
}

async function listDevices() {
  const runtime = await findRuntime()
  try {
    const result = await runCapture(runtime.adbPath, ['devices', '-l'])
    return result.output.split(/\r?\n/).slice(1).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [serial, state, ...details] = line.split(/\s+/)
      const props = Object.fromEntries(details.filter((part) => part.includes(':')).map((part) => {
        const index = part.indexOf(':')
        return [part.slice(0, index), part.slice(index + 1)]
      }))
      return {
        serial,
        state,
        model: (props.model || props.device || 'Android device').replace(/_/g, ' '),
        product: props.product || '',
        transportId: props.transport_id || '',
        connection: serial.includes(':') ? 'Wi-Fi' : 'USB',
        usable: state === 'device',
      }
    })
  } catch {
    return []
  }
}

function validateArgs(args) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string' || arg.length > 2048 || /[\0\r\n]/.test(arg))) {
    throw new Error('Invalid Scrcpy arguments.')
  }
  if (args.join('').length > 32768) throw new Error('The generated command is too long.')
  const entries = args.map((arg) => {
    const separator = arg.indexOf('=')
    return { arg, name: separator < 0 ? arg : arg.slice(0, separator), value: separator < 0 ? undefined : arg.slice(separator + 1) }
  })
  if (entries.some(({ name }) => !/^--[a-z0-9][a-z0-9-]*$/.test(name))) throw new Error('Only long-form Scrcpy options are accepted.')
  const duplicate = entries.find((entry, index) => entries.findIndex((candidate) => candidate.name === entry.name) !== index)
  if (duplicate) throw new Error(`${duplicate.name} was provided more than once.`)
  if (entries.some(({ value }) => value === '')) throw new Error('Empty option values are not valid. Clear the option or enable an optional-value flag without a value.')
  const valueOptions = new Set(`--angle --audio-bit-rate --audio-buffer --audio-codec --audio-codec-options --audio-encoder --audio-output-buffer --audio-source --background-color --camera-ar --camera-facing --camera-fps --camera-id --camera-size --camera-zoom --capture-orientation --crop --display-id --display-ime-policy --display-orientation --gamepad --keyboard --max-fps --max-size --min-size-alignment --mouse --mouse-bind --new-display --orientation --pause-on-exit --port --push-target --record --record-format --record-orientation --render-driver --render-fit --screen-off-timeout --serial --shortcut-mod --start-app --tcpip --time-limit --tunnel-host --tunnel-port --v4l2-buffer --v4l2-sink --verbosity --video-bit-rate --video-buffer --video-codec --video-codec-options --video-encoder --video-source --window-height --window-title --window-width --window-x --window-y`.split(' '))
  const optionalValueOptions = new Set(['--new-display', '--pause-on-exit', '--tcpip'])
  const knownBooleanOptions = new Set(`--always-on-top --audio-dup --camera-high-speed --camera-torch --disable-screensaver --flex-display --force-adb-forward --fullscreen --ignore-video-encoder-constraints --keep-active --kill-adb-on-close --legacy-paste --list-apps --list-camera-sizes --list-cameras --list-displays --list-encoders --no-audio --no-audio-playback --no-cleanup --no-clipboard-autosync --no-control --no-downsize-on-error --no-key-repeat --no-mipmaps --no-mouse-hover --no-playback --no-power-on --no-terminal-title --no-vd-destroy-content --no-vd-system-decorations --no-video --no-video-playback --no-window --no-window-aspect-ratio-lock --otg --power-off-on-close --prefer-text --print-fps --raw-key-events --require-audio --select-tcpip --select-usb --show-touches --stay-awake --turn-screen-off --window-borderless`.split(' '))
  const missingValue = entries.find(({ name, value }) => valueOptions.has(name) && value === undefined && !optionalValueOptions.has(name))
  if (missingValue) throw new Error(`${missingValue.name} requires a value.`)
  const booleanWithValue = entries.find(({ name, value }) => knownBooleanOptions.has(name) && value !== undefined)
  if (booleanWithValue) throw new Error(`${booleanWithValue.name} is a boolean flag and does not accept a value.`)
  const valueFor = (name) => entries.find((entry) => entry.name === name)?.value
  const has = (name) => entries.some((entry) => entry.name === name)
  const enums = {
    '--audio-codec': ['opus', 'aac', 'flac', 'raw'],
    '--audio-source': ['output', 'playback', 'mic', 'mic-unprocessed', 'mic-camcorder', 'mic-voice-recognition', 'mic-voice-communication', 'voice-call', 'voice-call-uplink', 'voice-call-downlink', 'voice-performance'],
    '--camera-facing': ['front', 'back', 'external'],
    '--display-ime-policy': ['local', 'fallback', 'hide'],
    '--display-orientation': ['0', '90', '180', '270', 'flip0', 'flip90', 'flip180', 'flip270'],
    '--gamepad': ['disabled', 'uhid', 'aoa'],
    '--keyboard': ['disabled', 'sdk', 'uhid', 'aoa'],
    '--mouse': ['disabled', 'sdk', 'uhid', 'aoa'],
    '--pause-on-exit': ['true', 'false', 'if-error'],
    '--record-format': ['mp4', 'mkv', 'm4a', 'mka', 'opus', 'aac', 'flac', 'wav'],
    '--record-orientation': ['0', '90', '180', '270'],
    '--render-driver': ['direct3d', 'opengl', 'opengles2', 'opengles', 'metal', 'software'],
    '--render-fit': ['letterbox', 'stretched', 'unscaled'],
    '--verbosity': ['verbose', 'debug', 'info', 'warn', 'error'],
    '--video-codec': ['h264', 'h265', 'av1', 'vp8', 'vp9'],
    '--video-source': ['display', 'camera'],
  }
  for (const [name, choices] of Object.entries(enums)) {
    const value = valueFor(name)
    if (value !== undefined && !choices.includes(value)) throw new Error(`${name} must be one of: ${choices.join(', ')}.`)
  }
  const numeric = {
    '--audio-buffer': { min: 0, max: 60000 }, '--audio-output-buffer': { min: 0, max: 60000 },
    '--angle': { min: -360000, max: 360000 }, '--camera-fps': { min: 1, max: 1000 }, '--camera-zoom': { min: 0, max: 1000 }, '--display-id': { min: 0, max: 2147483647, integer: true },
    '--max-fps': { min: 0.01, max: 1000 }, '--max-size': { min: 0, max: 65535, integer: true }, '--screen-off-timeout': { min: 0, max: 86400 },
    '--time-limit': { min: 0, max: 2147483647 }, '--tunnel-port': { min: 0, max: 65535, integer: true },
    '--v4l2-buffer': { min: 0, max: 60000 }, '--video-buffer': { min: 0, max: 60000 },
    '--window-height': { min: 0, max: 65535, integer: true }, '--window-width': { min: 0, max: 65535, integer: true },
    '--window-x': { min: -2147483648, max: 2147483647, integer: true }, '--window-y': { min: -2147483648, max: 2147483647, integer: true },
  }
  for (const [name, limits] of Object.entries(numeric)) {
    const value = valueFor(name)
    if (value === undefined) continue
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < limits.min || parsed > limits.max || (limits.integer && !Number.isInteger(parsed))) {
      throw new Error(`${name} has an invalid numeric value: ${value}.`)
    }
  }
  for (const name of ['--audio-bit-rate', '--video-bit-rate']) {
    const value = valueFor(name)
    if (value !== undefined && (!/^(?:\d+(?:\.\d+)?)[KMG]?$/i.test(value) || Number.parseFloat(value) <= 0)) throw new Error(`${name} must be a positive bitrate, optionally ending in K, M, or G.`)
  }
  const minAlignment = valueFor('--min-size-alignment')
  if (minAlignment !== undefined && !['1', '2', '4', '8', '16'].includes(minAlignment)) throw new Error('--min-size-alignment must be 1, 2, 4, 8, or 16.')
  const port = valueFor('--port')
  if (port !== undefined && (!/^\d+(?::\d+)?$/.test(port) || port.split(':').some((part) => Number(part) < 1 || Number(part) > 65535) || (port.includes(':') && Number(port.split(':')[0]) > Number(port.split(':')[1])))) throw new Error('--port must contain one port or an ascending port range between 1 and 65535.')
  const backgroundColor = valueFor('--background-color')
  if (backgroundColor !== undefined && !/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(backgroundColor)) throw new Error('--background-color must use #RGB or #RRGGBB.')
  const cameraAr = valueFor('--camera-ar')
  if (cameraAr !== undefined && cameraAr !== 'sensor' && (!/^(?:\d+(?:\.\d+)?|\d+:\d+)$/.test(cameraAr) || cameraAr.split(':').some((part) => Number(part) <= 0))) throw new Error('--camera-ar must be sensor, a positive decimal, or num:den.')
  const cameraSize = valueFor('--camera-size')
  if (cameraSize !== undefined && (!/^\d+x\d+$/.test(cameraSize) || cameraSize.split('x').some((part) => Number(part) <= 0))) throw new Error('--camera-size must use positive widthxheight values.')
  const crop = valueFor('--crop')
  if (crop !== undefined && (!/^\d+:\d+:\d+:\d+$/.test(crop) || crop.split(':').slice(0, 2).some((part) => Number(part) <= 0))) throw new Error('--crop must use positive width:height and non-negative x:y values.')
  const newDisplay = valueFor('--new-display')
  if (newDisplay !== undefined && (!/^(?:\d+x\d+)?(?:\/\d+)?$/.test(newDisplay) || newDisplay.split(/[x/]/).filter(Boolean).some((part) => Number(part) <= 0))) throw new Error('--new-display must use positive widthxheight, widthxheight/dpi, /dpi, or no value.')
  const mouseBind = valueFor('--mouse-bind')
  if (mouseBind !== undefined && !/^[+\-bhsn]{4}(?::[+\-bhsn]{4})?$/.test(mouseBind)) throw new Error('--mouse-bind requires one or two four-character button maps.')
  const shortcutMod = valueFor('--shortcut-mod')
  if (shortcutMod !== undefined && !/^(?:lctrl|rctrl|lalt|ralt|lsuper|rsuper)(?:\+(?:lctrl|rctrl|lalt|ralt|lsuper|rsuper))*(?:,(?:lctrl|rctrl|lalt|ralt|lsuper|rsuper)(?:\+(?:lctrl|rctrl|lalt|ralt|lsuper|rsuper))*)*$/.test(shortcutMod)) throw new Error('--shortcut-mod contains an unsupported modifier expression.')
  const tcpip = valueFor('--tcpip')
  if (tcpip !== undefined && (/\s/.test(tcpip) || tcpip === '+' || (/:(\d+)$/.test(tcpip) && (Number(tcpip.match(/:(\d+)$/)[1]) < 1 || Number(tcpip.match(/:(\d+)$/)[1]) > 65535)))) throw new Error('--tcpip must use [+]ip[:port] with a valid port.')
  const captureOrientation = valueFor('--capture-orientation')
  if (captureOrientation !== undefined && !/^@?(?:0|90|180|270|flip0|flip90|flip180|flip270)?$/.test(captureOrientation)) throw new Error('--capture-orientation has an invalid orientation.')
  const orientation = valueFor('--orientation')
  if (orientation !== undefined && !/^(?:0|90|180|270|flip0|flip90|flip180|flip270)$/.test(orientation)) throw new Error('--orientation has an invalid orientation.')
  if (args.includes('--no-control')) {
    const incompatible = ['--show-touches', '--stay-awake', '--turn-screen-off', '--power-off-on-close', '--keyboard', '--mouse', '--gamepad']
      .filter((flag) => entries.some((entry) => entry.name === flag))
    if (incompatible.length) throw new Error(`${incompatible.join(', ')} require Scrcpy device control. Use the in-session ADB controls instead.`)
  }
  const selectors = args.filter((arg) => arg === '--serial' || arg.startsWith('--serial=') || arg === '--select-usb' || arg === '--select-tcpip' || arg.startsWith('--tcpip='))
  if (selectors.length > 1) throw new Error(`Choose only one Scrcpy device selector: ${selectors.join(', ')}.`)
  if (has('--audio-dup') && valueFor('--audio-source') !== 'playback') throw new Error('--audio-dup requires --audio-source=playback.')
  const audioConfiguration = ['--audio-bit-rate', '--audio-buffer', '--audio-codec', '--audio-codec-options', '--audio-dup', '--audio-encoder', '--audio-output-buffer', '--audio-source', '--require-audio'].filter(has)
  if (has('--no-audio') && audioConfiguration.length) throw new Error(`${audioConfiguration.join(', ')} cannot be combined with --no-audio.`)
  const videoConfiguration = ['--video-bit-rate', '--video-buffer', '--video-codec', '--video-codec-options', '--video-encoder', '--video-source', '--max-fps', '--max-size', '--crop', '--camera-ar', '--camera-facing', '--camera-fps', '--camera-high-speed', '--camera-id', '--camera-size', '--camera-torch', '--camera-zoom', '--display-id', '--new-display'].filter(has)
  if (has('--no-video') && videoConfiguration.length) throw new Error(`${videoConfiguration.join(', ')} cannot be combined with --no-video.`)
  if (has('--camera-id') && has('--camera-facing')) throw new Error('Choose either --camera-id or --camera-facing, not both.')
  const cameraOnly = ['--camera-ar', '--camera-facing', '--camera-fps', '--camera-high-speed', '--camera-id', '--camera-size', '--camera-torch', '--camera-zoom'].filter(has)
  if (cameraOnly.length && valueFor('--video-source') !== 'camera') throw new Error(`${cameraOnly.join(', ')} require --video-source=camera.`)
  const displayOnly = ['--display-id', '--new-display'].filter(has)
  if (valueFor('--video-source') === 'camera' && displayOnly.length) throw new Error(`${displayOnly.join(', ')} cannot be combined with --video-source=camera.`)
  if (has('--display-id') && has('--new-display')) throw new Error('--display-id cannot be combined with --new-display.')
  if (has('--record-format') && !has('--record')) throw new Error('--record-format requires --record.')
  if (has('--no-playback') && !has('--record') && !has('--v4l2-sink')) throw new Error('--no-playback requires --record or --v4l2-sink so the captured media has an output.')
  return [...args]
}

function serialFromArgs(args) {
  const direct = args.find((arg) => arg.startsWith('--serial='))
  return direct ? direct.slice('--serial='.length) : ''
}

function comparableArgs(args) {
  const liveFlags = new Set(['--show-touches', '--stay-awake', '--turn-screen-off'])
  return args.filter((arg) => !liveFlags.has(arg)).slice().sort()
}

function argsEqual(left, right) {
  return JSON.stringify(comparableArgs(left)) === JSON.stringify(comparableArgs(right))
}

function emitLog(level, text) {
  if (text && String(text).trim()) safeSend('scrcpy:log', { level, text: String(text).trim() })
}

function updateSession(patch) {
  sessionState = {
    ...sessionState,
    ...patch,
    generation: desiredGeneration,
    desiredArgs: [...desiredArgs],
    appliedArgs: [...appliedArgs],
  }
  safeSend('scrcpy:state', sessionState)
  return sessionState
}

function enqueueLifecycle(task) {
  const operation = lifecycleQueue.then(task)
  lifecycleQueue = operation.catch((error) => {
    emitLog('error', error.message || String(error))
    updateSession({ running: false, status: 'error', error: error.message || String(error) })
  })
  return operation
}

function makeRecordingSegment(args, reason) {
  const recordIndex = args.findIndex((arg) => arg.startsWith('--record='))
  if (recordIndex < 0) return { args, recordingPath: '' }
  const requested = args[recordIndex].slice('--record='.length)
  if (!requested) return { args, recordingPath: '' }
  const shouldSegment = reason !== 'manual start' || fs.existsSync(requested)
  if (!shouldSegment) return { args, recordingPath: requested }
  const extension = path.extname(requested)
  const stem = requested.slice(0, requested.length - extension.length)
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace('.', '').replace('Z', '')
  const segmented = `${stem}-part-${stamp}${extension}`
  const next = [...args]
  next[recordIndex] = `--record=${segmented}`
  emitLog('info', `Recording continues in a new segment: ${segmented}`)
  return { args: next, recordingPath: segmented }
}

async function ensureSelectedDevice(args) {
  const devices = await listDevices()
  const usable = devices.filter((device) => device.usable)
  const serial = serialFromArgs(args)
  if (serial) {
    const selected = devices.find((device) => device.serial === serial)
    if (!selected) throw new Error(`Device ${serial} is not connected.`)
    if (!selected.usable) throw new Error(`Device ${serial} is ${selected.state}. Authorize or reconnect it before mirroring.`)
    return selected
  }
  if (usable.length > 1) throw new Error('Multiple usable devices are connected. Select a device explicitly.')
  if (!usable.length) throw new Error('No authorized Android device is connected.')
  return usable[0]
}

async function terminateActive(reason) {
  const record = activeSession
  if (!record) return
  record.intentional = true
  emitLog('info', `Stopping Scrcpy: ${reason}`)
  const pid = record.child.pid
  if (process.platform === 'win32' && pid) await requestWindowsConsoleStop(pid).catch(() => {})
  else record.child.kill('SIGTERM')
  const exited = await Promise.race([
    record.closePromise.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), record.recordingPath ? 5000 : 3000)),
  ])
  if (!exited && record.child.pid) {
    if (process.platform === 'win32') await runCapture('taskkill.exe', ['/pid', String(record.child.pid), '/t', '/f'], { timeoutMs: 4000 }).catch(() => record.child.kill())
    else record.child.kill('SIGKILL')
    await record.closePromise.catch(() => {})
  }
}

async function requestWindowsConsoleStop(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  // Electron has no interactive console from which to send Ctrl+C. Attach a
  // short-lived helper to Scrcpy's console and generate the same signal a user
  // would send in a terminal, allowing recorders to write their final index.
  const script = `
$source = @'
using System;
using System.Runtime.InteropServices;
public static class PepperonConsoleSignal {
  public delegate bool HandlerRoutine(uint ctrlType);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool FreeConsole();
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AttachConsole(uint processId);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetConsoleCtrlHandler(HandlerRoutine handler, bool add);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GenerateConsoleCtrlEvent(uint ctrlEvent, uint processGroupId);
}
'@
Add-Type -TypeDefinition $source -ErrorAction Stop
[PepperonConsoleSignal]::FreeConsole() | Out-Null
if (-not [PepperonConsoleSignal]::AttachConsole(${pid})) { exit 2 }
[PepperonConsoleSignal]::SetConsoleCtrlHandler($null, $true) | Out-Null
if (-not [PepperonConsoleSignal]::GenerateConsoleCtrlEvent(0, 0)) { exit 3 }
Start-Sleep -Milliseconds 250
[PepperonConsoleSignal]::FreeConsole() | Out-Null
`
  const result = await runCapture('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { timeoutMs: 4000 })
  return result.code === 0
}

async function launchDesired(reason) {
  const runtime = await findRuntime(true)
  if (!runtime.scrcpyPath) throw new Error('Scrcpy is not installed or configured.')
  const selected = await ensureSelectedDevice(desiredArgs)
  const prepared = makeRecordingSegment([...desiredArgs], reason)
  updateSession({
    running: false,
    status: reason === 'device reconnected' ? 'reconnecting' : 'starting',
    error: undefined,
    reason,
    activeSerial: selected.serial,
    recordingPath: prepared.recordingPath,
  })
  const child = spawn(runtime.scrcpyPath, prepared.args, {
    shell: false,
    windowsHide: false,
    cwd: runtime.scrcpyPath === 'scrcpy' ? undefined : path.dirname(runtime.scrcpyPath),
  })
  let resolveClose
  const closePromise = new Promise((resolve) => { resolveClose = resolve })
  const record = { child, args: prepared.args, desiredArgs: [...desiredArgs], closePromise, resolveClose, intentional: false, recordingPath: prepared.recordingPath }
  activeSession = record
  emitLog('command', `scrcpy ${prepared.args.join(' ')}`)
  const handleOutput = (data) => {
    const text = data.toString()
    emitLog('info', text)
    const errorLine = text.split(/\r?\n/).find((line) => /(?:^|\])\s*ERROR:|^ERROR:/i.test(line.trim()))
    if (errorLine) record.lastError = errorLine.trim().replace(/^\[[^\]]+\]\s*/, '')
  }
  child.stdout?.on('data', handleOutput)
  child.stderr?.on('data', handleOutput)
  child.on('spawn', () => {
    appliedArgs = [...record.desiredArgs]
    updateSession({ running: true, status: 'live', pid: child.pid, startedAt: Date.now(), code: undefined, error: undefined, activeSerial: selected.serial, recordingPath: prepared.recordingPath })
  })
  child.on('error', (error) => emitLog('error', error.message))
  child.on('close', async (code) => {
    record.resolveClose({ code })
    if (activeSession === record) activeSession = null
    if (record.intentional) return
    const unexpected = code !== 0
    let devicePresent = true
    try { devicePresent = (await listDevices()).some((device) => device.serial === selected.serial && device.usable) } catch {}
    if (sessionIntent && reconnectEnabled && !devicePresent) {
      updateSession({ running: false, status: 'disconnected', pid: undefined, code, stoppedAt: Date.now(), error: 'The selected Android device disconnected.' })
    } else {
      sessionIntent = false
      updateSession({ running: false, status: unexpected ? 'error' : 'offline', pid: undefined, code, stoppedAt: Date.now(), error: unexpected ? record.lastError || `Scrcpy exited with code ${code}.` : undefined })
    }
  })
  return sessionState
}

const pendingLiveChanges = new Map()

async function applyLiveSettings(changes) {
  if (!changes.length) return
  const runtime = await findRuntime()
  const serial = serialFromArgs(desiredArgs)
  if (!serial) return
  const prefix = ['-s', serial, 'shell']
  for (const change of changes) {
    let command
    if (change.key === 'showTouches') command = [...prefix, 'settings', 'put', 'system', 'show_touches', change.value ? '1' : '0']
    else if (change.key === 'stayAwake') command = [...prefix, 'svc', 'power', 'stayon', change.value ? 'true' : 'false']
    else if (change.key === 'screenPower') command = [...prefix, 'input', 'keyevent', change.value ? '223' : '224']
    if (!command) continue
    try {
      const result = await runCapture(runtime.adbPath, command)
      if (result.code !== 0) emitLog('error', `Live ${change.key} apply failed: ${result.output}`)
      else emitLog('info', `Applied ${change.key} directly through ADB.`)
    } catch (error) { emitLog('error', `Live ${change.key} apply failed: ${error.message}`) }
  }
}

async function reconcileDesired(reason) {
  const liveChanges = [...pendingLiveChanges.values()]
  pendingLiveChanges.clear()
  // Offline changes are desired startup settings only. Applying them through
  // ADB before launching would alter the phone outside a session and would
  // make scrcpy snapshot the already-modified values for cleanup.
  if (activeSession) await applyLiveSettings(liveChanges)
  if (!sessionIntent) {
    updateSession({ running: false, status: 'offline', reason })
    return sessionState
  }
  if (activeSession && argsEqual(desiredArgs, appliedArgs)) {
    appliedArgs = [...desiredArgs]
    updateSession({ running: true, status: 'live', pid: activeSession.child.pid, reason })
    return sessionState
  }
  if (activeSession) {
    const recording = appliedArgs.some((arg) => arg.startsWith('--record='))
    updateSession({ running: true, status: 'restarting', reason })
    emitLog('info', `Applying configuration${recording ? '; the current recording segment will be finalized first' : ''}.`)
    await terminateActive('automatic configuration apply')
  }
  if (!sessionIntent) return updateSession({ running: false, status: 'offline' })
  return launchDesired(reason)
}

function scheduleApply(reason) {
  if (applyTimer) clearTimeout(applyTimer)
  applyTimer = setTimeout(() => {
    applyTimer = null
    enqueueLifecycle(() => reconcileDesired(reason))
  }, APPLY_DEBOUNCE_MS)
}

function settledOutput(result) {
  return result.status === 'fulfilled' ? result.value.output : ''
}

function parseProperties(raw) {
  const properties = {}
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\[([^\]]+)\]:\s*\[(.*)\]$/)
    if (match) properties[match[1]] = match[2]
  }
  return properties
}

function parseResolution(raw, label) {
  const match = raw.match(new RegExp(`${label}\\s+(?:size:\\s*)?(\\d+)x(\\d+)`, 'i'))
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null
}

function parseEncoders(raw, media) {
  const matches = []
  const expression = new RegExp(`--${media}-codec=([a-z0-9]+)[^\\n]*--${media}-encoder=(?:'([^']+)'|"([^"]+)"|([^\\s]+))`, 'gi')
  let match
  while ((match = expression.exec(raw))) matches.push({ codec: match[1].toLowerCase(), name: match[2] || match[3] || match[4] })
  if (!matches.length) {
    const sectionLines = raw.split(/\r?\n/).filter((line) => line.toLowerCase().includes(media))
    for (const line of sectionLines) {
      const codec = line.match(/\b(h264|h265|av1|vp8|vp9|opus|aac|flac|raw)\b/i)?.[1]
      const encoder = line.match(/(?:encoder[:=]\s*|--\w+-encoder=)(['"]?)([\w.:-]+)\1/i)?.[2]
      if (codec && encoder) matches.push({ codec: codec.toLowerCase(), name: encoder })
    }
  }
  return [...new Map(matches.map((item) => [`${item.codec}|${item.name}`, item])).values()]
}

function parseDisplayCapabilities(wmSize, wmDensity, displayDump, displayList) {
  const physical = parseResolution(wmSize, 'Physical') || parseResolution(wmSize, '')
  const current = parseResolution(wmSize, 'Override') || physical
  const physicalDensity = wmDensity.match(/Physical density:\s*(\d+)/i)
  const overrideDensity = wmDensity.match(/Override density:\s*(\d+)/i)
  const density = Number((overrideDensity || physicalDensity || [])[1]) || undefined
  const modes = []
  const modeExpression = /(?:id|modeId)\s*[=:]\s*(\d+)[^\n]{0,100}?(?:width\s*[=:]\s*)?(\d{3,5})\s*(?:x|,\s*height\s*[=:]\s*)(\d{3,5})[^\n]{0,80}?(?:fps|refreshRate)\s*[=:]\s*(\d+(?:\.\d+)?)/gi
  let match
  while ((match = modeExpression.exec(displayDump))) modes.push({ id: Number(match[1]), width: Number(match[2]), height: Number(match[3]), refreshRate: Number(match[4]) })
  const rates = []
  const rateExpression = /(?:refreshRate|fps|mRefreshRate)\s*[=:]\s*(\d+(?:\.\d+)?)/gi
  while ((match = rateExpression.exec(displayDump))) {
    const rate = Number(match[1])
    if (rate >= 20 && rate <= 240) rates.push(Math.round(rate * 100) / 100)
  }
  const modeRates = modes.map((mode) => mode.refreshRate).filter(Boolean)
  const supportedRefreshRates = [...new Set(modeRates.length ? modeRates : rates)].sort((a, b) => a - b)
  const activeModeId = Number(displayDump.match(/(?:mActiveModeId|activeModeId)\s*[=:]\s*(\d+)/i)?.[1]) || undefined
  const activeMode = modes.find((mode) => mode.id === activeModeId)
  const directCurrent = Number(displayDump.match(/(?:mRefreshRate|refreshRate)\s*[=:]\s*(\d+(?:\.\d+)?)/i)?.[1]) || undefined
  const displayIds = [...new Set([...displayList.matchAll(/(?:--display-id=|Display\s+)(\d+)/gi)].map((item) => Number(item[1])))]
  if (!displayIds.length) displayIds.push(0)
  const orientation = displayDump.match(/(?:mCurrentOrientation|orientation)\s*[=:]\s*([A-Za-z0-9_-]+)/i)?.[1]
  return {
    physicalWidth: physical?.width,
    physicalHeight: physical?.height,
    currentWidth: current?.width,
    currentHeight: current?.height,
    densityDpi: density,
    currentRefreshRate: activeMode?.refreshRate || directCurrent,
    supportedRefreshRates,
    maxRefreshRate: supportedRefreshRates.length ? Math.max(...supportedRefreshRates) : undefined,
    orientation,
    displayIds,
    modes,
  }
}

function parseCameras(raw, sizeRaw) {
  const cameras = []
  const lines = `${raw}\n${sizeRaw}`.split(/\r?\n/)
  for (const line of lines) {
    const id = line.match(/--camera-id=(?:'([^']+)'|"([^"]+)"|([^\s,)]+))/i)?.slice(1).find(Boolean)
      || line.match(/camera(?:\s+id)?\s*[:=]\s*([\w.-]+)/i)?.[1]
    if (!id) continue
    let camera = cameras.find((item) => item.id === id)
    if (!camera) {
      const facingText = line.match(/\b(front|back|external)\b/i)?.[1]?.toLowerCase()
      camera = { id, facing: facingText || 'unknown', sizes: [], frameRates: [] }
      cameras.push(camera)
    }
    for (const size of line.matchAll(/\b(\d{3,5}x\d{3,5})\b/g)) camera.sizes.push(size[1])
    for (const fps of line.matchAll(/(?:fps|@)\s*[=:]?\s*(\d+(?:\.\d+)?)/gi)) camera.frameRates.push(Number(fps[1]))
    const fpsSet = line.match(/fps\s*=\s*\{([^}]+)\}/i)?.[1]
    if (fpsSet) for (const value of fpsSet.split(',')) { const parsed = Number(value.trim()); if (parsed) camera.frameRates.push(parsed) }
    if (/high.?speed/i.test(line)) camera.highSpeed = true
    if (/torch/i.test(line)) camera.torchSupported = !/(?:no|without|unsupported)\s+torch/i.test(line)
  }
  for (const camera of cameras) {
    camera.sizes = [...new Set(camera.sizes)]
    camera.frameRates = [...new Set(camera.frameRates)].sort((a, b) => a - b)
  }
  return cameras
}

async function getDeviceCapabilities(serial, force = false) {
  if (typeof serial !== 'string' || !serial || serial.length > 256 || serial.includes('\0')) throw new Error('A valid device serial is required.')
  const runtime = await findRuntime()
  let installedVersion = 'unknown'
  if (runtime.scrcpyPath) {
    try {
      const versionResult = await runCapture(runtime.scrcpyPath, ['--version'])
      installedVersion = versionResult.output.match(/scrcpy\s+([\w.-]+)/i)?.[1] || 'unknown'
    } catch {}
  }
  const cacheKey = `${serial}|${installedVersion}`
  if (!force && capabilityCache.has(cacheKey)) return capabilityCache.get(cacheKey)
  if (capabilityRequests.has(cacheKey)) return capabilityRequests.get(cacheKey)
  const capabilityRequest = (async () => {
  const devices = await listDevices()
  const device = devices.find((item) => item.serial === serial)
  if (!device) throw new Error(`Device ${serial} is no longer connected.`)
  if (!device.usable) throw new Error(`Device ${serial} is ${device.state}. Capability probing requires an authorized device.`)
  const adb = (shellArgs, timeoutMs = 15000) => runCapture(runtime.adbPath, ['-s', serial, 'shell', ...shellArgs], { timeoutMs })
  const scrcpy = (scrcpyArgs, timeoutMs = 20000) => runtime.scrcpyPath
    ? runCapture(runtime.scrcpyPath, [`--serial=${serial}`, ...scrcpyArgs], { cwd: runtime.scrcpyPath === 'scrcpy' ? undefined : path.dirname(runtime.scrcpyPath), timeoutMs })
    : Promise.reject(new Error('Scrcpy runtime is unavailable.'))
  const [propsResult, sizeResult, densityResult, displayResult] = await Promise.allSettled([
    adb(['getprop']),
    adb(['wm', 'size']),
    adb(['wm', 'density']),
    adb(['dumpsys', 'display'], 25000),
  ])
  const settle = (promise) => promise.then(
    (value) => ({ status: 'fulfilled', value }),
    (reason) => ({ status: 'rejected', reason }),
  )
  // Scrcpy discovery commands share a server/device transport. Running them
  // concurrently can race server pushes and block the next mirror launch.
  const displaysResult = await settle(scrcpy(['--list-displays']))
  const encodersResult = await settle(scrcpy(['--list-encoders']))
  const camerasResult = await settle(scrcpy(['--list-cameras'], 25000))
  const cameraSizesResult = await settle(scrcpy(['--list-camera-sizes'], 25000))
  const props = parseProperties(settledOutput(propsResult))
  const display = parseDisplayCapabilities(settledOutput(sizeResult), settledOutput(densityResult), settledOutput(displayResult), settledOutput(displaysResult))
  const encoderOutput = settledOutput(encodersResult)
  const videoEncoders = parseEncoders(encoderOutput, 'video')
  const audioEncoders = parseEncoders(encoderOutput, 'audio')
  const sdk = Number(props['ro.build.version.sdk']) || undefined
  const cameras = parseCameras(settledOutput(camerasResult), settledOutput(cameraSizesResult))
  const warnings = []
  for (const [name, result] of [['Android properties', propsResult], ['display state', displayResult], ['encoder list', encodersResult], ['camera list', camerasResult]]) {
    if (result.status === 'rejected') warnings.push(`${name}: ${result.reason?.message || 'not reported'}`)
  }
  const capabilities = {
    serial,
    capturedAt: Date.now(),
    cacheKey,
    hardware: {
      manufacturer: props['ro.product.manufacturer'] || undefined,
      model: props['ro.product.model'] || device.model || undefined,
      product: props['ro.product.name'] || device.product || undefined,
      device: props['ro.product.device'] || undefined,
      abi: props['ro.product.cpu.abi'] || undefined,
      androidVersion: props['ro.build.version.release'] || undefined,
      sdk,
      buildId: props['ro.build.id'] || props['ro.build.display.id'] || undefined,
    },
    display,
    video: {
      codecs: [...new Set(videoEncoders.map((item) => item.codec))],
      encoders: videoEncoders,
      reported: encodersResult.status === 'fulfilled' && Boolean(encoderOutput),
    },
    audio: {
      forwardingSupported: sdk ? sdk >= 30 : undefined,
      supportMessage: sdk ? sdk >= 30 ? 'Audio forwarding is supported by this Android version.' : 'Scrcpy audio forwarding requires Android 11 (API 30) or newer.' : 'Android API level was not reported.',
      codecs: [...new Set(audioEncoders.map((item) => item.codec))],
      encoders: audioEncoders,
      reported: encodersResult.status === 'fulfilled' && Boolean(encoderOutput),
    },
    camera: {
      reported: camerasResult.status === 'fulfilled' && Boolean(settledOutput(camerasResult)),
      cameras,
      message: cameras.length ? `${cameras.length} camera${cameras.length === 1 ? '' : 's'} reported by Scrcpy.` : 'Camera details were not reported by this device/runtime.',
    },
    warnings,
  }
  capabilityCache.set(cacheKey, capabilities)
  return capabilities
  })()
  capabilityRequests.set(cacheKey, capabilityRequest)
  try {
    return await capabilityRequest
  } finally {
    if (capabilityRequests.get(cacheKey) === capabilityRequest) capabilityRequests.delete(cacheKey)
  }
}

function registerIpc() {
  const senderWindow = (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || window !== mainWindow || window.isDestroyed()) throw new Error('Invalid window sender.')
    return window
  }
  ipcMain.handle('window:state', (event) => ({ maximized: senderWindow(event).isMaximized() }))
  ipcMain.handle('window:action', (event, action) => {
    const window = senderWindow(event)
    if (action === 'minimize') window.minimize()
    else if (action === 'toggle-maximize') window.isMaximized() ? window.unmaximize() : window.maximize()
    else if (action === 'close') window.close()
    else throw new Error('Invalid window action.')
  })
  ipcMain.handle('runtime:status', runtimeStatus)
  ipcMain.handle('device:list', listDevices)
  ipcMain.handle('device:capabilities', (_event, serial, force = false) => getDeviceCapabilities(serial, Boolean(force)))
  ipcMain.handle('runtime:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose the Scrcpy executable',
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Scrcpy', extensions: ['exe'] }] : [],
    })
    if (result.canceled || !result.filePaths[0]) return null
    process.env.SCRCPY_PATH = result.filePaths[0]
    await writePreferences({ scrcpyPath: result.filePaths[0] })
    cachedRuntime = null
    capabilityCache.clear()
    return runtimeStatus()
  })
  ipcMain.handle('runtime:install', async () => {
    if (process.platform !== 'win32') throw new Error('Managed installation currently supports Windows. Choose an existing binary on this platform.')
    const release = await latestRelease()
    const archName = process.arch === 'ia32' ? 'win32' : 'win64'
    const asset = release.assets.find((item) => item.name === `scrcpy-${archName}-v${release.version}.zip`)
    if (!asset) throw new Error(`No ${archName} package was found in the latest official release.`)
    const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'scrcpy-studio-'))
    const archivePath = path.join(tempRoot, asset.name)
    try {
      safeSend('runtime:install-progress', { progress: 1, message: `Downloading Scrcpy ${release.version}` })
      await download(asset.browser_download_url, archivePath, (progress) => {
        safeSend('runtime:install-progress', { progress, message: `Downloading Scrcpy ${release.version}` })
      })
      if (asset.digest?.startsWith('sha256:')) {
        const digest = createHash('sha256').update(await fsp.readFile(archivePath)).digest('hex')
        if (digest !== asset.digest.slice(7)) throw new Error('The downloaded package failed its SHA-256 verification.')
      }
      safeSend('runtime:install-progress', { progress: 96, message: 'Verifying and unpacking' })
      const extraction = path.join(tempRoot, 'extracted')
      new AdmZip(archivePath).extractAllTo(extraction, true)
      const roots = await fsp.readdir(extraction, { withFileTypes: true })
      const packageRoot = roots.length === 1 && roots[0].isDirectory() ? path.join(extraction, roots[0].name) : extraction
      const installRoot = path.join(app.getPath('userData'), 'runtime')
      await fsp.rm(installRoot, { recursive: true, force: true })
      await fsp.mkdir(path.dirname(installRoot), { recursive: true })
      await fsp.cp(packageRoot, installRoot, { recursive: true })
      cachedRuntime = null
      capabilityCache.clear()
      safeSend('runtime:install-progress', { progress: 100, message: 'Scrcpy is ready' })
      return runtimeStatus()
    } finally {
      await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {})
    }
  })
  ipcMain.handle('scrcpy:state', () => sessionState)
  ipcMain.handle('scrcpy:validate-args', (_event, args) => ({ valid: true, args: validateArgs(args) }))
  ipcMain.handle('scrcpy:start', async (_event, request = {}) => {
    desiredArgs = validateArgs(request.args)
    desiredGeneration += 1
    reconnectEnabled = request.autoReconnect !== false
    sessionIntent = true
    if (applyTimer) { clearTimeout(applyTimer); applyTimer = null }
    for (const change of request.liveChanges || []) if (change?.key) pendingLiveChanges.set(change.key, change)
    return enqueueLifecycle(() => reconcileDesired('manual start'))
  })
  ipcMain.handle('scrcpy:apply-config', async (_event, request = {}) => {
    desiredArgs = validateArgs(request.args)
    desiredGeneration += 1
    reconnectEnabled = request.autoReconnect !== false
    for (const change of request.liveChanges || []) if (change?.key) pendingLiveChanges.set(change.key, change)
    const restartScheduled = Boolean(sessionIntent || activeSession)
    if (restartScheduled) updateSession({ running: Boolean(activeSession), status: 'applying', reason: request.reason || 'configuration changed' })
    scheduleApply(request.reason || 'configuration changed')
    return { accepted: true, generation: desiredGeneration, restartScheduled, state: sessionState }
  })
  ipcMain.handle('scrcpy:retry', async () => {
    sessionIntent = true
    if (applyTimer) { clearTimeout(applyTimer); applyTimer = null }
    return enqueueLifecycle(() => reconcileDesired('retry'))
  })
  ipcMain.handle('scrcpy:stop', async () => {
    sessionIntent = false
    desiredGeneration += 1
    if (applyTimer) { clearTimeout(applyTimer); applyTimer = null }
    pendingLiveChanges.clear()
    return enqueueLifecycle(async () => {
      updateSession({ running: Boolean(activeSession), status: 'stopping', reason: 'manual stop' })
      await terminateActive('manual stop')
      appliedArgs = []
      return updateSession({ running: false, status: 'offline', pid: undefined, stoppedAt: Date.now(), recordingPath: '' })
    })
  })
  ipcMain.handle('scrcpy:device-presence', async (_event, serial, present) => {
    if (typeof serial !== 'string' || !serial || serial.length > 256) return sessionState
    const desiredSerial = serialFromArgs(desiredArgs)
    if (serial !== desiredSerial) return sessionState
    if (!present && (activeSession || sessionIntent)) {
      const shouldReconnect = reconnectEnabled
      sessionIntent = shouldReconnect
      return enqueueLifecycle(async () => {
        await terminateActive('active device disconnected')
        return updateSession({ running: false, status: 'disconnected', pid: undefined, error: 'The selected Android device disconnected.', activeSerial: serial })
      })
    }
    if (present && reconnectEnabled && sessionState.status === 'disconnected') {
      sessionIntent = true
      return enqueueLifecycle(() => reconcileDesired('device reconnected'))
    }
    return sessionState
  })
  ipcMain.handle('scrcpy:run-once', async (_event, suppliedArgs) => {
    const args = validateArgs(suppliedArgs)
    const runtime = await findRuntime(true)
    if (!runtime.scrcpyPath) throw new Error('Scrcpy is not installed or configured.')
    await ensureSelectedDevice(args)
    emitLog('command', `scrcpy ${args.join(' ')}`)
    const result = await runCapture(runtime.scrcpyPath, args, { cwd: runtime.scrcpyPath === 'scrcpy' ? undefined : path.dirname(runtime.scrcpyPath), timeoutMs: 30000 })
    emitLog(result.code === 0 ? 'info' : 'error', result.output)
    return result
  })
  ipcMain.handle('adb:action', async (_event, action, payload = {}) => {
    const runtime = await findRuntime()
    const safeValue = (value) => typeof value === 'string' && value.length < 256 && !value.includes('\0')
    const serialArgs = safeValue(payload.serial) && payload.serial ? ['-s', payload.serial] : []
    const actions = {
      connect: ['connect', safeValue(payload.address) ? payload.address : ''],
      disconnect: ['disconnect', ...(safeValue(payload.address) && payload.address ? [payload.address] : [])],
      pair: ['pair', safeValue(payload.address) ? payload.address : '', safeValue(payload.code) ? payload.code : ''],
      tcpip: [...serialArgs, 'tcpip', String(Number(payload.port) || 5555)],
      reboot: [...serialArgs, 'reboot'],
    }
    if (['tcpip', 'reboot'].includes(action) && !serialArgs.length) throw new Error('Select a device before running this ADB action.')
    if (!actions[action] || actions[action].some((arg) => arg === '')) throw new Error('Invalid ADB action.')
    const result = await runCapture(runtime.adbPath, actions[action])
    if (['connect', 'disconnect', 'tcpip', 'reboot'].includes(action)) capabilityCache.clear()
    safeSend('scrcpy:log', { level: result.code === 0 ? 'info' : 'error', text: result.output })
    return result
  })
  ipcMain.handle('dialog:save-recording', async (_event, format = 'mp4') => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Choose recording destination',
      defaultPath: `scrcpy-${new Date().toISOString().replace(/[:.]/g, '-')}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    })
    return result.canceled ? '' : result.filePath || ''
  })
  ipcMain.handle('shell:open-external', (_event, url) => {
    if (typeof url === 'string' && /^https:\/\/(github\.com|scrcpy\.org)\//.test(url)) return shell.openExternal(url)
    return false
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1480,
    height: 940,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: '#0e0e10',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const sendWindowState = () => safeSend('window:state-changed', { maximized: mainWindow.isMaximized() })
  mainWindow.on('maximize', sendWindowState)
  mainWindow.on('unmaximize', sendWindowState)
  if (isDev) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  sessionIntent = false
  activeSession?.child.kill()
})
