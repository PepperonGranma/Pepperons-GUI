const { app, BrowserWindow, dialog, ipcMain, Menu, shell, Tray } = require('electron')
const { spawn } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const https = require('node:https')
const os = require('node:os')
const path = require('node:path')
const AdmZip = require('adm-zip')

// A GUI process may outlive the terminal or test launcher that created it. Electron
// occasionally writes IPC diagnostics to those inherited streams; a closed pipe must
// not turn that diagnostic into a native uncaught-exception dialog.
for (const stream of [process.stdout, process.stderr]) {
  stream?.on?.('error', (error) => {
    if (error?.code !== 'EPIPE') setImmediate(() => { throw error })
  })
}

const APP_NAME = "Pepperon GUI"
// Keep the existing runtime, preferences, and Chromium profile across the rebrand.
const settingsDirectory = path.join(app.getPath('appData'), 'scrcpy-studio')
fs.mkdirSync(settingsDirectory, { recursive: true })
app.setName(APP_NAME)
app.setPath('userData', settingsDirectory)
if (process.platform === 'win32') app.setAppUserModelId('studio.scrcpy.desktop')

// Acquire the shared profile lock before registering IPC or creating a renderer.
// A duplicate launch must never open a competing Chromium profile/settings store.
if (!app.requestSingleInstanceLock()) {
  app.quit()
  return
}

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
const { withConstraints } = require('./command-constraints.mjs')
const { argsEqual, formatCommand, platformIssue, serialFromArgs, validateArgs: validateArgsFor } = require('./scrcpy-args.mjs')
const { createLineSplitter, isScrcpyError, parseCameras, parseDeviceList, parseDisplayCapabilities, parseEncoders, parseHelp, parseProperties } = require('./device-parsers.mjs')
let constraintRuntimeVersion = ''
let mainWindow
let mainWindowReady = false
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
let shutdownPromise = null
let shutdownPrepared = false
const capabilityCache = new Map()
const capabilityRequests = new Map()
const APPLY_DEBOUNCE_MS = 250
const PROFILE_FILE_LIMIT = 2 * 1024 * 1024
const ZOOM_STEP = 0.5
const ZOOM_LIMIT = 3

let tray = null
// Opt-in desktop behavior, persisted in preferences.json.
const appSettings = { minimizeToTray: false, closeToTray: false }
let trayHintShown = false
let quitRequested = false

function focusMainWindow() {
  // Repeated launches during startup must not reveal an unpainted window.
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindowReady || shutdownPromise) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

const appIconPath = () => app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.join(__dirname, '..', 'build', 'icon.ico')

function trayToolTip() {
  const status = { live: 'Mirroring', starting: 'Starting', applying: 'Applying changes', restarting: 'Restarting', reconnecting: 'Reconnecting', disconnected: 'Device disconnected', error: 'Session error' }[sessionState.status]
  return status ? `${APP_NAME} · ${status}` : APP_NAME
}

function refreshTray() {
  if (!tray) return
  const stoppable = Boolean(activeSession || sessionIntent)
  tray.setToolTip(trayToolTip())
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Show ${APP_NAME}`, click: focusMainWindow },
    { label: 'Stop Mirroring', enabled: stoppable, click: () => { stopSession().catch(() => {}) } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]))
}

// The tray icon exists only while a tray option is enabled, so the default
// experience stays a normal taskbar application.
function applyTraySetting() {
  if (!appSettings.minimizeToTray && !appSettings.closeToTray) {
    if (!tray) return
    tray.destroy()
    tray = null
    // Never strand a hidden window without a tray icon to bring it back.
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) focusMainWindow()
    return
  }
  if (tray) return
  tray = new Tray(appIconPath())
  tray.on('click', focusMainWindow)
  refreshTray()
}

function hideToTray() {
  if (!tray || shutdownPromise || !mainWindow || mainWindow.isDestroyed()) return
  mainWindow.hide()
  if (!trayHintShown && process.platform === 'win32') {
    trayHintShown = true
    tray.displayBalloon({ title: APP_NAME, content: 'Still running in the system tray. Click the icon to bring the window back.', iconType: 'info' })
  }
}

app.on('second-instance', focusMainWindow)

function isAllowedExternalUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && ['github.com', 'scrcpy.org'].includes(url.hostname)
  } catch {
    return false
  }
}

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

async function latestRelease() {
  const json = await requestJson('https://api.github.com/repos/Genymobile/scrcpy/releases/latest')
  return {
    version: String(json.tag_name || '').replace(/^v/, ''),
    url: json.html_url,
    assets: json.assets || [],
  }
}

const MAX_REDIRECTS = 5
// A stalled connection must not hold the startup loader or an install open.
const REQUEST_TIMEOUT_MS = 5000
const DOWNLOAD_IDLE_TIMEOUT_MS = 30000

function requestJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: { 'User-Agent': 'Scrcpy-Studio', Accept: 'application/vnd.github+json' },
      timeout: REQUEST_TIMEOUT_MS,
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        if (redirects >= MAX_REDIRECTS) reject(new Error('GitHub redirected too many times.'))
        else requestJson(response.headers.location, redirects + 1).then(resolve, reject)
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
      response.on('error', reject)
    })
    request.on('timeout', () => request.destroy(new Error('GitHub did not respond in time.')))
    request.on('error', reject)
  })
}

function download(url, destination, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'Scrcpy-Studio' }, timeout: DOWNLOAD_IDLE_TIMEOUT_MS }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        if (redirects >= MAX_REDIRECTS) reject(new Error('The download redirected too many times.'))
        else download(response.headers.location, destination, onProgress, redirects + 1).then(resolve, reject)
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
      response.on('error', (error) => file.destroy(error))
      file.on('finish', () => file.close(resolve))
      file.on('error', reject)
    })
    request.on('timeout', () => request.destroy(new Error('The download stalled. Check the connection and try again.')))
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
      options = parseHelp(help.output).map(option => withConstraints({ ...option, source: 'runtime' }, installedVersion))
    } catch {}
  }
  constraintRuntimeVersion = installedVersion
  // An empty version means "unknown": the interface then offers no update.
  let release = { version: '', url: 'https://github.com/Genymobile/scrcpy/releases/latest' }
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
    return parseDeviceList(result.output)
  } catch {
    return []
  }
}

// Numeric parser metadata is version-gated; validate against the inspected runtime.
const validateArgs = (args) => validateArgsFor(args, constraintRuntimeVersion)

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
  refreshTray()
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
  // short-lived helper to Scrcpy's console and send Ctrl+Break, which Scrcpy
  // handles as a clean quit and which cannot be inherited as ignored. This
  // gives recorders time to write their final index before the process exits.
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
if (-not [PepperonConsoleSignal]::GenerateConsoleCtrlEvent(1, 0)) { exit 3 }
Start-Sleep -Milliseconds 500
[PepperonConsoleSignal]::FreeConsole() | Out-Null
`
  const result = await runCapture('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { timeoutMs: 4000 })
  return result.code === 0
}

async function launchDesired(reason) {
  const runtime = await findRuntime(true)
  if (!runtime.scrcpyPath) throw new Error('Scrcpy is not installed or configured.')
  const blocked = platformIssue(desiredArgs, process.platform)
  if (blocked) throw new Error(blocked)
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
  emitLog('command', formatCommand(prepared.args))
  // Only whole lines are classified, so an ERROR line split across two chunks is
  // neither missed nor shown as two fragments.
  const report = (lines) => {
    const errors = lines.filter(isScrcpyError)
    emitLog('info', lines.filter((line) => !isScrcpyError(line)).join('\n'))
    if (errors.length) emitLog('error', errors.join('\n'))
    if (errors.length) record.lastError = errors[0].trim().replace(/^\[[^\]]+\]\s*/, '')
  }
  const splitters = [child.stdout, child.stderr].filter(Boolean).map((stream) => {
    const splitter = createLineSplitter()
    stream.on('data', (data) => report(splitter.push(data)))
    return splitter
  })
  child.on('spawn', () => {
    appliedArgs = [...record.desiredArgs]
    updateSession({ running: true, status: 'live', pid: child.pid, startedAt: Date.now(), code: undefined, error: undefined, activeSerial: selected.serial, recordingPath: prepared.recordingPath })
  })
  child.on('error', (error) => emitLog('error', error.message))
  child.on('close', async (code) => {
    for (const splitter of splitters) report(splitter.flush())
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

async function getDeviceCapabilities(serial, force = false) {
  if (typeof serial !== 'string' || !serial || serial.length > 256 || serial.includes('\0')) throw new Error('A valid device serial is required.')
  const runtime = await findRuntime()
  // runtimeStatus() already inspected this runtime; only probe again when it has not.
  let installedVersion = constraintRuntimeVersion || 'unknown'
  if (runtime.scrcpyPath && !constraintRuntimeVersion) {
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

function stopSession() {
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
}

// Windows can hold a just-stopped executable for a moment; retry briefly, then
// leave the folder for the next install or launch to collect.
async function removeStaleRuntime(directory) {
  for (let attempt = 0; attempt < 5 && fs.existsSync(directory); attempt += 1) {
    await fsp.rm(directory, { recursive: true, force: true }).catch(() => {})
    if (fs.existsSync(directory)) await new Promise((resolve) => setTimeout(resolve, 300))
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
  ipcMain.handle('app:settings', () => ({ ...appSettings }))
  ipcMain.handle('app:set-setting', async (event, key, value) => {
    senderWindow(event)
    if (!Object.hasOwn(appSettings, key) || typeof value !== 'boolean') throw new Error('Invalid application setting.')
    appSettings[key] = value
    await writePreferences({ [key]: value })
    applyTraySetting()
    return { ...appSettings }
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
    // A running scrcpy.exe locks the managed runtime; replacing it would fail halfway.
    if (activeSession || sessionIntent) throw new Error('Stop mirroring before installing or updating Scrcpy.')
    const release = await latestRelease()
    // Windows ARM64 archives are published from scrcpy 5.0 onward.
    const archName = process.arch === 'arm64' ? 'winarm64' : process.arch === 'ia32' ? 'win32' : 'win64'
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
      } else {
        emitLog('error', `GitHub did not publish a SHA-256 digest for ${asset.name}; the download was not verified.`)
      }
      safeSend('runtime:install-progress', { progress: 96, message: 'Verifying and unpacking' })
      const extraction = path.join(tempRoot, 'extracted')
      new AdmZip(archivePath).extractAllTo(extraction, true)
      const roots = await fsp.readdir(extraction, { withFileTypes: true })
      const packageRoot = roots.length === 1 && roots[0].isDirectory() ? path.join(extraction, roots[0].name) : extraction
      if (!await exists(path.join(packageRoot, 'scrcpy.exe'))) throw new Error('The downloaded package does not contain scrcpy.exe.')
      // Stage the new runtime beside the old one and swap by rename, so a failed
      // copy or a locked file never leaves the app without a working runtime.
      const installRoot = path.join(app.getPath('userData'), 'runtime')
      const stagedRoot = `${installRoot}.new`
      const previousRoot = `${installRoot}.old`
      await fsp.rm(stagedRoot, { recursive: true, force: true })
      await removeStaleRuntime(previousRoot)
      if (fs.existsSync(previousRoot)) throw new Error('A previous Scrcpy runtime is still in use. Close any running scrcpy or adb process and try again.')
      await fsp.mkdir(path.dirname(installRoot), { recursive: true })
      await fsp.cp(packageRoot, stagedRoot, { recursive: true })
      const hadPrevious = fs.existsSync(installRoot)
      try {
        if (hadPrevious) await fsp.rename(installRoot, previousRoot)
        await fsp.rename(stagedRoot, installRoot)
      } catch (error) {
        if (hadPrevious && !fs.existsSync(installRoot) && fs.existsSync(previousRoot)) await fsp.rename(previousRoot, installRoot).catch(() => {})
        await fsp.rm(stagedRoot, { recursive: true, force: true }).catch(() => {})
        throw new Error(`The existing Scrcpy runtime could not be replaced (${error.code || error.message}). Close any running scrcpy or adb process and try again.`)
      }
      // The adb server started from the old runtime keeps running and locks its
      // files. Stop it so the old folder can be deleted; the next device query
      // starts the server from the new runtime.
      const managedAdb = path.join(installRoot, 'adb.exe')
      if (hadPrevious && await exists(managedAdb)) await runCapture(managedAdb, ['kill-server'], { timeoutMs: 5000 }).catch(() => {})
      await removeStaleRuntime(previousRoot)
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
  ipcMain.handle('scrcpy:stop', stopSession)
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
    emitLog('command', formatCommand(args))
    const result = await runCapture(runtime.scrcpyPath, args, { cwd: runtime.scrcpyPath === 'scrcpy' ? undefined : path.dirname(runtime.scrcpyPath), timeoutMs: 30000 })
    emitLog(result.code === 0 ? 'info' : 'error', result.output)
    return result
  })
  ipcMain.handle('adb:action', async (_event, action, payload = {}) => {
    const runtime = await findRuntime()
    // A leading dash would be read by adb as an option rather than a value.
    const safeValue = (value) => typeof value === 'string' && value.length < 256 && !value.includes('\0') && !value.startsWith('-')
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
    if (!['mp4', 'mkv', 'm4a', 'mka', 'opus', 'aac', 'flac', 'wav'].includes(format)) throw new Error('Invalid recording format.')
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Choose recording destination',
      defaultPath: `scrcpy-${new Date().toISOString().replace(/[:.]/g, '-')}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    })
    return result.canceled ? '' : result.filePath || ''
  })
  ipcMain.handle('profiles:export', async (_event, contents) => {
    if (typeof contents !== 'string' || contents.length > PROFILE_FILE_LIMIT) throw new Error('Invalid profile export.')
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export profiles',
      defaultPath: 'pepperon-gui-profiles.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return ''
    await fsp.writeFile(result.filePath, contents, 'utf8')
    return result.filePath
  })
  ipcMain.handle('profiles:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import profiles',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const stats = await fsp.stat(result.filePaths[0])
    if (stats.size > PROFILE_FILE_LIMIT) throw new Error('That file is too large to be a profile export.')
    return fsp.readFile(result.filePaths[0], 'utf8')
  })
  ipcMain.handle('shell:open-external', (_event, url) => {
    if (typeof url === 'string' && isAllowedExternalUrl(url)) return shell.openExternal(url)
    return false
  })
}

function prepareForShutdown() {
  if (shutdownPromise) return shutdownPromise
  sessionIntent = false
  reconnectEnabled = false
  desiredGeneration += 1
  if (applyTimer) { clearTimeout(applyTimer); applyTimer = null }
  pendingLiveChanges.clear()
  shutdownPromise = enqueueLifecycle(async () => {
    if (activeSession) updateSession({ running: true, status: 'stopping', reason: 'application shutdown' })
    await terminateActive('application shutdown')
    appliedArgs = []
    updateSession({ running: false, status: 'offline', pid: undefined, stoppedAt: Date.now(), recordingPath: '' })
  }).finally(() => { shutdownPrepared = true })
  return shutdownPromise
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusMainWindow()
    return
  }
  mainWindowReady = false
  shutdownPromise = null
  shutdownPrepared = false
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    icon: appIconPath(),
    width: 1480,
    height: 940,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: '#0e0e10',
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.once('ready-to-show', () => {
    mainWindowReady = true
    focusMainWindow()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
    mainWindowReady = false
  })
  const sendWindowState = () => safeSend('window:state-changed', { maximized: mainWindow.isMaximized() })
  mainWindow.on('maximize', sendWindowState)
  mainWindow.on('unmaximize', sendWindowState)
  mainWindow.on('minimize', () => { if (appSettings.minimizeToTray) hideToTray() })
  mainWindow.on('close', (event) => {
    if (shutdownPrepared) return
    event.preventDefault()
    // Closing the window keeps the app (and any session) alive in the tray;
    // Quit from the tray menu, or any real quit request, still shuts down.
    if (appSettings.closeToTray && tray && !quitRequested && !shutdownPromise) { hideToTray(); return }
    prepareForShutdown().finally(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
    })
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  // Electron's default zoom-in accelerator is Ctrl+Plus, which needs Shift on most
  // keyboard layouts, so Ctrl+= never zoomed back in. Handle all three zoom keys
  // here, including the numeric keypad, and keep the level within a usable range.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return
    const step = ['=', '+'].includes(input.key) ? ZOOM_STEP : ['-', '_'].includes(input.key) ? -ZOOM_STEP : input.key === '0' ? 0 : null
    if (step === null) return
    event.preventDefault()
    const contents = mainWindow.webContents
    contents.setZoomLevel(step === 0 ? 0 : Math.min(ZOOM_LIMIT, Math.max(-ZOOM_LIMIT, contents.getZoomLevel() + step)))
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault()
  })
  if (isDev) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  // Collect a runtime folder that an earlier update could not delete while it was in use.
  removeStaleRuntime(path.join(app.getPath('userData'), 'runtime.old')).catch(() => {})
  readPreferences().then((preferences) => {
    for (const key of Object.keys(appSettings)) appSettings[key] = preferences[key] === true
    applyTraySetting()
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// A tray icon left behind lingers in the notification area until hovered.
app.on('quit', () => {
  tray?.destroy()
  tray = null
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  quitRequested = true
  if (shutdownPrepared) return
  event.preventDefault()
  prepareForShutdown().finally(() => app.quit())
})
