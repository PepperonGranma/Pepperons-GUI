const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { setTimeout: delay } = require('node:timers/promises')

const root = path.resolve(__dirname, '..')

async function checkMainLifecycle(acquired) {
  const windows = [], handlers = []
  const stdout = new EventEmitter(), stderr = new EventEmitter()
  const app = new EventEmitter()
  Object.assign(app, {
    getPath: () => path.join(root, 'unused-test-profile'),
    setName() {}, setPath() {}, setAppUserModelId() {},
    requestSingleInstanceLock: () => acquired,
    quits: 0, readyCalls: 0,
    quit() { this.quits++ },
    whenReady() { this.readyCalls++; return Promise.resolve() },
  })
  class FakeWindow extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.shows = 0; this.focuses = 0; this.restores = 0; this.loads = 0
      this.webContents = new EventEmitter()
      this.webContents.setWindowOpenHandler = () => {}
      this.webContents.send = () => {}
      windows.push(this)
    }
    isDestroyed() { return false }
    isMinimized() { return !!this.minimized }
    isMaximized() { return false }
    restore() { this.minimized = false; this.restores++ }
    show() { this.shows++ }
    focus() { this.focuses++ }
    loadFile() { this.loads++ }
    loadURL() { this.loads++ }
    static getAllWindows() { return windows }
  }
  const mockRequire = name => {
    if (name === 'electron') return { app, BrowserWindow: FakeWindow, dialog: {}, shell: {}, ipcMain: { handle: name => handlers.push(name) } }
    if (name === 'node:fs') return { ...fs, mkdirSync() {} }
    return createRequire(path.join(root, 'electron/main.cjs'))(name)
  }
  new Function('require', '__dirname', 'process', fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8'))(
    mockRequire, path.join(root, 'electron'), { platform: 'win32', env: {}, stdout, stderr },
  )
  assert.doesNotThrow(() => stdout.emit('error', { code: 'EPIPE' }), 'A closed stdout pipe escaped the main process guard')
  assert.doesNotThrow(() => stderr.emit('error', { code: 'EPIPE' }), 'A closed stderr pipe escaped the main process guard')
  await Promise.resolve()
  if (!acquired) {
    assert.equal(app.quits, 1)
    assert.equal(app.readyCalls, 0, 'Secondary instance initialized the application')
    assert.equal(windows.length, 0, 'Secondary instance created a window')
    assert.equal(handlers.length, 0, 'Secondary instance registered application IPC')
    return
  }
  assert.equal(windows.length, 1)
  const window = windows[0]
  assert.equal(window.options.show, false, 'Window was visible before its first paint')
  assert.deepEqual([window.options.webPreferences.contextIsolation, window.options.webPreferences.nodeIntegration, window.options.webPreferences.sandbox], [true, false, true])
  app.emit('second-instance')
  assert.equal(window.shows, 0, 'Duplicate launch revealed the window before ready-to-show')
  window.emit('ready-to-show')
  assert.equal(window.shows, 1)
  window.minimized = true
  app.emit('second-instance')
  assert.equal(window.restores, 1)
  assert.equal(window.focuses, 2)
  assert.equal(window.loads, 1, 'Duplicate launch reloaded the existing renderer')
  app.emit('activate')
  assert.equal(windows.length, 1)
}

async function main() {
  await checkMainLifecycle(false)
  await checkMainLifecycle(true)
  console.log('PASS primary/secondary lifecycle, early-launch guard, restore/focus, and hidden first paint')
  if (process.argv.includes('--unit-only')) return

  const debugUrl = process.env.SCRCPY_STUDIO_DEBUG_URL || 'http://127.0.0.1:9222'
  const pages = await (await fetch(`${debugUrl}/json`)).json()
  const page = pages.find(p => p.type === 'page' && p.title.replace(/&#39;/g, "'") === "Pepperon's GUI")
  assert(page, 'Launch the updated GUI with remote debugging before this test')
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let nextId = 0, injectedScript
  const pending = new Map()
  socket.addEventListener('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(new Error('GUI closed during startup verification'))
    }
    pending.clear()
  })
  socket.addEventListener('message', async event => {
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(await event.data.arrayBuffer()).toString()
    const message = JSON.parse(raw), request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id); clearTimeout(request.timer)
    message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) { reject(new Error('GUI debug connection is closed')); return }
    const id = ++nextId
    pending.set(id, { resolve, reject, timer: setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)) }, 15000) })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Renderer evaluation failed')
    return result.result.value
  }
  const wait = async (expression, label) => {
    for (let attempt = 0; attempt < 150; attempt++) { if (await evaluate(expression)) return; await delay(100) }
    throw new Error(`Timed out: ${label}`)
  }
  const duplicate = () => new Promise((resolve, reject) => {
    const executable = process.env.PEPPERON_TEST_EXE || require('electron')
    const args = process.env.PEPPERON_TEST_EXE ? [] : [root]
    const child = spawn(executable, args, { cwd: root, windowsHide: true, stdio: 'ignore', shell: false })
    const timer = setTimeout(() => { child.kill(); reject(new Error('Secondary process did not exit promptly')) }, 10000)
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Secondary process exited with ${code}`)) })
  })
  try {
    await send('Page.enable')
    injectedScript = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__pepperonStartupFrames = [];
      function sampleStartup() {
        const loader = document.querySelector('.startup-loader');
        if (loader) {
          const style = getComputedStyle(loader), rect = loader.getBoundingClientRect();
          window.__pepperonStartupFrames.push({opacity:Number(style.opacity), background:style.backgroundColor,
            rect:rect.toJSON(), viewport:[innerWidth,innerHeight],
            // innerWidth/Height are integers; rects retain fractional pixels at Windows display scaling.
            cover:rect.left<=0 && rect.top<=0 && Math.round(rect.right)>=innerWidth && Math.round(rect.bottom)>=innerHeight,
            topmost:[[8,8],[innerWidth-1,8],[8,innerHeight-1],[innerWidth-1,innerHeight-1]]
              .every(([x,y])=>!!document.elementFromPoint(x,y)?.closest('.startup-loader'))});
        } else if (document.querySelector('.sidebar') && !window.__pepperonStartupFrames.length) {
          window.__pepperonStartupFrames.push({flash:true});
        }
        if(window.__pepperonStartupFrames.length<12) requestAnimationFrame(sampleStartup);
      }
      requestAnimationFrame(sampleStartup);
    ` })).identifier
    await send('Page.reload', { ignoreCache: true })
    await wait('window.__pepperonStartupFrames?.length >= 12', 'first startup frames')
    const frames = await evaluate('window.__pepperonStartupFrames')
    assert(frames.every(f => !f.flash && f.opacity === 1 && f.cover && f.topmost && f.background !== 'rgba(0, 0, 0, 0)' && f.background !== 'transparent'), `Main UI leaked through startup: ${JSON.stringify(frames)}`)
    console.log('PASS first 12 rendered startup frames are fully opaque, full-screen, and topmost')
    await wait('!document.querySelector(".startup-loader")', 'startup completion')
    const snapshot = await evaluate(`(() => { window.__pepperonInstanceToken=crypto.randomUUID(); return {token:window.__pepperonInstanceToken,storage:JSON.stringify({...localStorage})} })()`)
    await Promise.all([duplicate(), duplicate(), duplicate()])
    assert.equal(await evaluate('window.__pepperonInstanceToken'), snapshot.token, 'Repeated launches replaced the renderer')
    assert.equal(await evaluate('JSON.stringify({...localStorage})'), snapshot.storage, 'Repeated launches changed saved settings')
    await evaluate(`window.scrcpyStudio.windowAction('minimize')`)
    await wait('document.hidden', 'window minimized')
    await duplicate()
    await wait('!document.hidden && document.hasFocus()', 'existing window restored and focused')
    assert.equal(await evaluate('window.__pepperonInstanceToken'), snapshot.token, 'Restore created another renderer')
    assert.equal(await evaluate('JSON.stringify({...localStorage})'), snapshot.storage, 'Restore changed saved settings')
    assert.equal((await (await fetch(`${debugUrl}/json`)).json()).filter(p => p.type === 'page').length, 1)
    console.log('PASS four actual duplicate launches exit, preserve the renderer/settings, and restore/focus the existing window')
  } finally {
    if (injectedScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injectedScript }).catch(() => {})
    await evaluate('delete window.__pepperonInstanceToken; delete window.__pepperonStartupFrames').catch(() => {})
    socket.close()
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1 })
