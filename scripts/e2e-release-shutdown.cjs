const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')

const DEBUG_URL = process.env.SCRCPY_STUDIO_DEBUG_URL || 'http://127.0.0.1:9444'
const MODE = process.argv[2]
let RECORDING_PATH = process.env.PEPPERON_RELEASE_RECORDING || ''
let ownedRecordingDirectory = ''
const BACKUP_KEY = 'scrcpy-studio:release-relaunch-backup'
const PROFILE_ID = 'pepperon-release-relaunch-proof'
const MODES = ['security', 'offline', 'idle', 'mirroring', 'applying', 'recording', 'persist-stage', 'persist-verify']

function processCount(image) {
  const output = execFileSync('tasklist.exe', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true })
  const escaped = image.replace('.', '\\.')
  return output.split(/\r?\n/).filter((line) => new RegExp(`^"${escaped}"`, 'i').test(line.trim())).length
}

async function waitFor(check, label, timeout = 30_000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try { if (await check()) return } catch {}
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function connect() {
  const targets = await (await fetch(`${DEBUG_URL}/json`, { signal: AbortSignal.timeout(5_000) })).json()
  const target = targets.find((item) => item.type === 'page' && item.title.replace(/&#39;/g, "'") === "Pepperon's GUI")
  assert(target?.webSocketDebuggerUrl, "Launch the packaged Pepperon's GUI with remote debugging first")
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let nextId = 0
  const pending = new Map()
  const resourceRequests = []
  socket.addEventListener('message', async (event) => {
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(await event.data.arrayBuffer()).toString()
    const message = JSON.parse(raw)
    if (message.method === 'Network.requestWillBeSent') resourceRequests.push(message.params.request.url)
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timer)
    message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)) }, 35_000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Renderer evaluation failed')
    return result.result.value
  }
  await send('Runtime.enable')
  return { socket, evaluate, send, resourceRequests }
}

async function waitForApplicationExit() {
  await waitFor(async () => {
    try { await fetch(`${DEBUG_URL}/json`, { signal: AbortSignal.timeout(2_000) }); return false } catch { return true }
  }, 'the packaged application to close', 20_000)
  await waitFor(() => processCount("Pepperon's GUI.exe") === 0, 'packaged application process cleanup', 20_000)
  await waitFor(() => processCount('scrcpy.exe') === 0, 'scrcpy cleanup', 20_000)
}

async function main() {
  assert(MODES.includes(MODE), `Use: node scripts/e2e-release-shutdown.cjs ${MODES.join('|')}`)
  if (MODE === 'recording' && !RECORDING_PATH) {
    ownedRecordingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pepperon-release-recording-'))
    RECORDING_PATH = path.join(ownedRecordingDirectory, 'shutdown.mp4')
  }
  const adbBefore = processCount('adb.exe')
  const { socket, evaluate, send, resourceRequests } = await connect()
  const waitState = (expression, label, timeout) => waitFor(
    () => evaluate(`(async()=>{const s=await window.scrcpyStudio.getSessionState();return ${expression}})()`),
    label,
    timeout,
  )
  const closeSoon = async () => {
    await evaluate(`(() => { setTimeout(() => window.scrcpyStudio.windowAction('close'), 40); return true })()`)
    socket.close()
    await waitForApplicationExit()
    await delay(750)
    assert(processCount('adb.exe') <= adbBefore, 'Application close left an extra adb subprocess')
  }

  await waitFor(() => evaluate(`document.readyState==='complete' && !document.querySelector('.startup-loader')`), 'the packaged renderer')
  const initialState = await evaluate(`window.scrcpyStudio.getSessionState()`)
  assert(!initialState.running && !initialState.pid, `Fresh launch contains stale session state: ${JSON.stringify(initialState)}`)

  if (MODE === 'offline') {
    await send('Network.enable')
    await send('Network.setCacheDisabled', { cacheDisabled: true })
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
    try {
      await send('Page.reload', { ignoreCache: true })
      await waitFor(() => evaluate(`document.readyState==='complete' && !!document.querySelector('.sidebar') && !document.querySelector('.startup-loader')`), 'the offline packaged renderer')
      const result = await evaluate(`(async () => ({
        localPage:location.protocol==='file:',
        stylesheet:[...document.styleSheets].some(sheet=>sheet.href?.startsWith('file:')),
        icons:document.querySelectorAll('.sidebar svg').length>0,
        preload:typeof window.scrcpyStudio?.start==='function',
        devices:(await window.scrcpyStudio.listDevices()).filter(device=>device.state==='device').map(device=>device.model),
      }))()`)
      assert(result.localPage && result.stylesheet && result.icons && result.preload, `Offline renderer failed: ${JSON.stringify(result)}`)
      assert(result.devices.length, 'Offline renderer could not discover the connected ADB devices')
      const remote = resourceRequests.filter(url => /^(?:https?|wss?):/i.test(url))
      assert.equal(remote.length, 0, `Renderer requested remote resources: ${JSON.stringify(remote)}`)
      assert(resourceRequests.some(url => url.endsWith('.css')) && resourceRequests.some(url => url.endsWith('.js')), 'Offline reload did not observe local JS and CSS loads')
      console.log('PASS packaged renderer offline (renderer network blocked; ADB left available)', JSON.stringify({ ...result, requests: resourceRequests }))
    } finally {
      await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
      await send('Network.setCacheDisabled', { cacheDisabled: false })
      await closeSoon()
    }
    return
  }

  if (MODE === 'security') {
    const security = await evaluate(`(async () => {
      const csp=document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content||'';
      const popup=window.open('https://example.com','_blank');
      const externalResults=await Promise.all([
        window.scrcpyStudio.openExternal('http://github.com/Genymobile/scrcpy'),
        window.scrcpyStudio.openExternal('https://github.com.evil.example/Genymobile/scrcpy'),
        window.scrcpyStudio.openExternal('file:///C:/Windows/System32/calc.exe'),
      ]);
      let badFormatRejected=false;
      try{await window.scrcpyStudio.chooseRecordingPath('exe')}catch{badFormatRejected=true}
      let badArgsRejected=false;
      try{await window.scrcpyStudio.validateArgs('not-an-array')}catch{badArgsRejected=true}
      return {
        requireUnavailable:typeof require==='undefined',
        nodeProcessUnavailable:typeof process==='undefined',
        preloadAvailable:typeof window.scrcpyStudio?.start==='function',
        cspSelfOnly:csp.includes("default-src 'self'")&&csp.includes("object-src 'none'")&&csp.includes("frame-src 'none'"),
        popupDenied:popup===null,
        externalRejected:externalResults.every(result=>result===false),
        badFormatRejected,
        badArgsRejected,
        href:location.href,
      };
    })()`)
    assert(Object.entries(security).filter(([key]) => key !== 'href').every(([, value]) => value === true), `Packaged security check failed: ${JSON.stringify(security)}`)
    const originalHref = security.href
    await evaluate(`(() => { location.assign('https://example.com/blocked-navigation'); return true })()`)
    await delay(500)
    assert.equal(await evaluate(`location.href`), originalHref, 'Unexpected renderer navigation was not blocked')
    console.log('PASS packaged isolation, preload, CSP, navigation, popup, external URL and IPC input security', JSON.stringify(security))
    await closeSoon()
    return
  }

  if (MODE === 'persist-stage') {
    const staged = await evaluate(`(() => {
      if(localStorage.getItem(${JSON.stringify(BACKUP_KEY)})!==null) throw new Error('A previous release persistence probe was not restored');
      const keys=['scrcpy-studio:config','scrcpy-studio:profiles','scrcpy-studio:theme','scrcpy-studio:onboarding-v1'];
      const backup=Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)]));
      localStorage.setItem(${JSON.stringify(BACKUP_KEY)},JSON.stringify(backup));
      const config=JSON.parse(backup['scrcpy-studio:config']||'{}');
      config.maxFps='37'; config.videoBitRate='7M';
      localStorage.setItem('scrcpy-studio:config',JSON.stringify(config));
      const theme=JSON.parse(backup['scrcpy-studio:theme']||'{}');
      theme.mode='light'; theme.accent='#127a6f'; theme.pink='#d44ab2'; theme.density='compact';
      localStorage.setItem('scrcpy-studio:theme',JSON.stringify(theme));
      let profiles=[]; try{profiles=JSON.parse(backup['scrcpy-studio:profiles']||'[]')}catch{}
      if(!Array.isArray(profiles))profiles=[];
      profiles=profiles.filter(item=>item?.id!==${JSON.stringify(PROFILE_ID)});
      profiles.push({id:${JSON.stringify(PROFILE_ID)},name:'Release Relaunch Proof',description:'Temporary packaged persistence probe',updatedAt:Date.now(),config:{...config,serial:''}});
      localStorage.setItem('scrcpy-studio:profiles',JSON.stringify(profiles));
      localStorage.setItem('scrcpy-studio:onboarding-v1','seen');
      return {fps:config.maxFps,bitRate:config.videoBitRate,theme:{mode:theme.mode,accent:theme.accent,pink:theme.pink,density:theme.density},profiles:profiles.length};
    })()`)
    console.log('STAGED packaged persistence', JSON.stringify(staged))
    await closeSoon()
    return
  }

  if (MODE === 'persist-verify') {
    const verified = await evaluate(`(() => {
      const backup=JSON.parse(localStorage.getItem(${JSON.stringify(BACKUP_KEY)})||'null');
      if(!backup) throw new Error('Release persistence backup is missing');
      const config=JSON.parse(localStorage.getItem('scrcpy-studio:config')||'{}');
      const theme=JSON.parse(localStorage.getItem('scrcpy-studio:theme')||'{}');
      const profiles=JSON.parse(localStorage.getItem('scrcpy-studio:profiles')||'[]');
      const result={
        config:config.maxFps==='37'&&config.videoBitRate==='7M',
        theme:theme.mode==='light'&&theme.accent==='#127a6f'&&theme.pink==='#d44ab2'&&theme.density==='compact',
        appearanceApplied:document.querySelector('.app')?.classList.contains('theme-light')&&document.querySelector('.app')?.classList.contains('density-compact')&&getComputedStyle(document.querySelector('.app')).getPropertyValue('--pink').trim()==='#d44ab2',
        profile:Array.isArray(profiles)&&profiles.some(item=>item?.id===${JSON.stringify(PROFILE_ID)}),
      };
      for(const [key,value] of Object.entries(backup)) value===null ? localStorage.removeItem(key) : localStorage.setItem(key,value);
      localStorage.removeItem(${JSON.stringify(BACKUP_KEY)});
      result.restored=Object.entries(backup).every(([key,value])=>localStorage.getItem(key)===value);
      return result;
    })()`)
    assert(Object.values(verified).every(Boolean), `Packaged persistence failed: ${JSON.stringify(verified)}`)
    console.log('PASS packaged config, theme, appearance and profile persistence with exact restoration', JSON.stringify(verified))
    await closeSoon()
    return
  }

  const environment = await evaluate(`(async()=>{const devices=await window.scrcpyStudio.listDevices();return {device:devices.find(item=>item.state==='device')||null}})()`)
  assert(environment.device?.serial, 'No authorized device is available for packaged shutdown testing')
  const serial = environment.device.serial
  const argsFor = (fps) => [`--serial=${serial}`, '--video-source=display', '--video-codec=h264', '--video-bit-rate=6M', '--max-size=1280', `--max-fps=${fps}`, '--no-audio']
  await evaluate(`window.scrcpyStudio.stop()`)

  if (MODE === 'idle') {
    await closeSoon()
    console.log('PASS packaged close while idle')
    return
  }

  if (MODE === 'recording') {
    const args = [...argsFor('30'), `--record=${RECORDING_PATH}`, '--record-format=mp4', '--no-playback']
    await evaluate(`window.scrcpyStudio.start({args:${JSON.stringify(args)},autoReconnect:false,reason:'release recording close'})`)
    await waitState(`s.running&&s.status==='live'&&s.recordingPath===${JSON.stringify(RECORDING_PATH)}`, 'recording session', 30_000)
    await delay(2_500)
    await closeSoon()
    assert(fs.existsSync(RECORDING_PATH), 'Recording file was not created before packaged close')
    const data = fs.readFileSync(RECORDING_PATH)
    assert(data.length > 1024 && data.subarray(4, 8).toString() === 'ftyp', 'Recording was not finalized as a valid MP4 during packaged close')
    const atoms = []
    for (let offset = 0; offset + 8 <= data.length;) {
      const shortSize = data.readUInt32BE(offset)
      const size = shortSize === 1 ? Number(data.readBigUInt64BE(offset + 8)) : shortSize || data.length - offset
      assert(size >= 8 && offset + size <= data.length, 'MP4 contains an incomplete atom')
      atoms.push(data.toString('ascii', offset + 4, offset + 8))
      offset += size
    }
    assert(atoms.includes('moov') && atoms.includes('mdat'), 'Recording did not finalize its MP4 index and media atoms')
    console.log('PASS packaged close while recording', JSON.stringify({ path: RECORDING_PATH, size: data.length, atoms }))
    return
  }

  const initialArgs = argsFor('30')
  await evaluate(`window.scrcpyStudio.start({args:${JSON.stringify(initialArgs)},autoReconnect:false,reason:'release shutdown test'})`)
  await waitState(`s.running&&s.status==='live'&&s.pid`, 'mirroring session', 30_000)
  if (MODE === 'applying') {
    const changedArgs = argsFor('24')
    await evaluate(`(() => { window.scrcpyStudio.applyConfig({args:${JSON.stringify(changedArgs)},autoReconnect:false,reason:'release close during apply'}); return true })()`)
    await waitState(`s.status==='applying'`, 'applying state')
  }
  await closeSoon()
  console.log(`PASS packaged close while ${MODE}`)
}

main().catch((error) => {
  console.error('RESULT failed')
  console.error(error.stack || error)
  process.exitCode = 1
}).finally(() => {
  if (ownedRecordingDirectory) {
    const target = fs.realpathSync(ownedRecordingDirectory)
    const tempRoot = fs.realpathSync(os.tmpdir())
    assert(target.startsWith(`${tempRoot}${path.sep}`) && path.basename(target).startsWith('pepperon-release-recording-'), 'Unexpected recording cleanup target')
    fs.rmSync(target, { recursive: true, force: true })
    console.log(`REMOVED temporary recording directory ${target}`)
  }
})
