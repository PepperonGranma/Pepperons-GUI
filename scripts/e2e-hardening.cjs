const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')

const DEBUG_URL = process.env.SCRCPY_STUDIO_DEBUG_URL || 'http://127.0.0.1:9222'
const STORAGE_KEYS = ['scrcpy-studio:config', 'scrcpy-studio:profiles', 'scrcpy-studio:theme', 'scrcpy-studio:onboarding-v1']
const WAIT_MS = 45_000

function scrcpyProcessCount() {
  const output = execFileSync('tasklist.exe', ['/FI', 'IMAGENAME eq scrcpy.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true })
  return output.split(/\r?\n/).filter((line) => /^"scrcpy\.exe"/i.test(line.trim())).length
}

function taskkill(pid) {
  // Simulate scrcpy itself dying, without trying to terminate its Windows console host.
  execFileSync('taskkill.exe', ['/PID', String(pid), '/F'], { encoding: 'utf8', windowsHide: true })
}

function fileSummary(file) {
  const data = fs.readFileSync(file)
  return { size: data.length, head: data.subarray(0, 8).toString('hex') }
}

async function main() {
  const targets = await (await fetch(`${DEBUG_URL}/json`)).json()
  const target = targets.find((item) => item.type === 'page' && item.title.replace(/&#39;/g, "'") === "Pepperon's GUI")
  assert(target?.webSocketDebuggerUrl, "Start Pepperon's GUI with remote debugging first")
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', async (event) => {
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(await event.data.arrayBuffer()).toString()
    const message = JSON.parse(raw)
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timer)
    message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)) }, WAIT_MS)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Renderer evaluation failed')
    return result.result.value
  }
  const wait = async (expression, label, timeout = WAIT_MS) => {
    const started = Date.now()
    while (Date.now() - started < timeout) {
      try { if (await evaluate(expression)) return } catch {}
      await delay(100)
    }
    throw new Error(`Timed out waiting for ${label}`)
  }
  const state = () => evaluate(`window.scrcpyStudio.getSessionState()`)
  const waitLive = async (argsFragment = '') => {
    const suffix = argsFragment ? ` && s.appliedArgs?.includes(${JSON.stringify(argsFragment)})` : ''
    await wait(`(async()=>{const s=await window.scrcpyStudio.getSessionState();return s.running&&s.status==='live'&&s.pid${suffix}})()`, `active mirroring${argsFragment ? ` with ${argsFragment}` : ''}`)
    return state()
  }
  const waitStopped = () => wait(`(async()=>{const s=await window.scrcpyStudio.getSessionState();return !s.running&&!s.pid&&!['starting','applying','restarting','stopping'].includes(s.status)})()`, 'a stopped session')
  const nav = async (name) => {
    assert(await evaluate(`(() => { const button=[...document.querySelectorAll('nav button')].find(e=>e.querySelector('span')?.textContent===${JSON.stringify(name)}); button?.click(); return Boolean(button) })()`), `Missing navigation: ${name}`)
    await delay(100)
  }

  await send('Runtime.enable')
  const backup = await evaluate(`Object.fromEntries(${JSON.stringify(STORAGE_KEYS)}.map(key=>[key,localStorage.getItem(key)]))`)
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pepperon-gui-hardening-'))
  let adbPath = 'adb.exe'
  let serial = ''
  let originalShowTouches = ''
  let originalStayAwake = ''
  let completed = false
  const adb = (args) => execFileSync(adbPath, args, { encoding: 'utf8', windowsHide: true }).trim()
  try {
    await wait(`document.readyState==='complete' && !document.querySelector('.startup-loader')`, 'initial application')
    await evaluate(`window.scrcpyStudio.stop().catch(()=>undefined)`)
    await waitStopped()
    const environment = await evaluate(`(async()=>{
      const runtime=await window.scrcpyStudio.getRuntimeStatus();
      const devices=await window.scrcpyStudio.listDevices();
      const config=JSON.parse(localStorage.getItem('scrcpy-studio:config')||'{}');
      const device=devices.find(item=>item.state==='device'&&item.serial===config.serial) || devices.find(item=>item.state==='device');
      const capabilities=device ? await window.scrcpyStudio.getDeviceCapabilities(device.serial,true) : null;
      return {runtime,device,capabilities,config};
    })()`)
    assert(environment.device?.serial, 'No authorized Android device is connected')
    serial = environment.device.serial
    adbPath = environment.runtime.path && environment.runtime.path !== 'scrcpy'
      ? path.join(path.dirname(environment.runtime.path), 'adb.exe') : 'adb.exe'
    originalShowTouches = adb(['-s', serial, 'shell', 'settings', 'get', 'system', 'show_touches'])
    originalStayAwake = adb(['-s', serial, 'shell', 'settings', 'get', 'global', 'stay_on_while_plugged_in'])

    const base = {
      ...environment.config,
      serial,
      videoSource: 'display', videoCodec: 'h264', videoEncoder: '', videoBitRate: '8M', maxSize: '1920', maxFps: '60', videoBuffer: '0', crop: '',
      audioEnabled: true, audioCodec: 'opus', audioEncoder: '', audioSource: 'output', audioBitRate: '128K', audioBuffer: '50', audioDup: false,
      controlEnabled: true, keyboard: 'sdk', mouse: 'sdk', gamepad: 'disabled', clipboardSync: true, showTouches: false, stayAwake: false, turnScreenOff: false, powerOffOnClose: false,
      recordingEnabled: false, recordPath: '', noPlayback: false, timeLimit: '', newDisplay: false, displayId: '0', extras: {}, autoReconnect: true,
    }
    const profiles = [
      { id: 'stress-a', name: 'Stress A', description: 'H264 · 60 FPS', updatedAt: Date.now(), config: { ...base, serial: '', videoCodec: 'h264', maxFps: '60', videoBitRate: '8M', maxSize: '1920', audioCodec: 'opus', keyboard: 'sdk', mouse: 'sdk' } },
      { id: 'stress-b', name: 'Stress B', description: 'H265 · 45 FPS', updatedAt: Date.now(), config: { ...base, serial: '', videoCodec: 'h265', maxFps: '45', videoBitRate: '12M', maxSize: '1280', audioCodec: 'aac', keyboard: 'uhid', mouse: 'uhid' } },
      { id: 'stress-c', name: 'Stress C', description: 'H264 · 30 FPS', updatedAt: Date.now(), config: { ...base, serial: '', videoCodec: 'h264', maxFps: '30', videoBitRate: '6M', maxSize: '1024', audioCodec: 'opus', keyboard: 'sdk', mouse: 'sdk' } },
    ]
    await evaluate(`(() => {
      localStorage.setItem('scrcpy-studio:config',${JSON.stringify(JSON.stringify(base))});
      localStorage.setItem('scrcpy-studio:profiles',${JSON.stringify(JSON.stringify(profiles))});
      localStorage.setItem('scrcpy-studio:onboarding-v1','seen');
      location.reload();
    })()`)
    // Do not issue a CDP evaluation while Chromium is replacing the execution
    // context: that request may never receive a response on some Electron builds.
    await delay(3_500)
    console.log('FIXTURE_RELOAD_STATE', JSON.stringify(await evaluate(`({
      ready: document.readyState,
      loader: Boolean(document.querySelector('.startup-loader')),
      nav: Boolean(document.querySelector('nav')),
      text: document.body?.innerText?.slice(0,160) || ''
    })`)))
    await wait(`Boolean(document.readyState==='complete' && !document.querySelector('.startup-loader') && document.querySelector('nav'))`, 'stress fixture reload')
    await nav('Studio')
    assert(await evaluate(`(() => { const button=document.querySelector('.dashboard-header .session-button'); if(!button||button.disabled)return false; button.click(); return true })()`), 'Go live was unavailable')
    let current = await waitLive('--max-fps=60')
    assert.equal(scrcpyProcessCount(), 1, 'Initial start created more than one scrcpy process')

    const themeBeforeProfiles = await evaluate(`localStorage.getItem('scrcpy-studio:theme')`)
    const batches = [
      { order: ['Stress A', 'Stress B', 'Stress C'], expected: '--max-fps=30' },
      { order: ['Stress C', 'Stress B', 'Stress A'], expected: '--max-fps=60' },
      { order: ['Stress A', 'Stress C', 'Stress B'], expected: '--max-fps=45' },
    ]
    let maxProcesses = 0
    for (const batch of batches) {
      await nav('Profiles')
      const before = await state()
      assert(await evaluate(`(() => {
        const names=${JSON.stringify(batch.order)};
        for(const name of names){const card=[...document.querySelectorAll('.profile-card')].find(item=>item.querySelector('h3')?.textContent===name);const button=[...(card?.querySelectorAll('button')||[])].find(item=>item.textContent.trim()==='Load');if(!button)return false;button.click()}
        return true;
      })()`), `Could not rapidly load ${batch.order.join(' → ')}`)
      current = await waitLive(batch.expected)
      assert.equal(current.generation, before.generation + 1, 'Rapid profile load triggered more than one applied generation')
      assert(current.desiredArgs.includes(batch.expected) && current.appliedArgs.includes(batch.expected), 'Latest profile did not become desired and applied state')
      maxProcesses = Math.max(maxProcesses, scrcpyProcessCount())
      assert.equal(scrcpyProcessCount(), 1, 'Profile load left multiple scrcpy processes')
      assert.equal(await evaluate(`localStorage.getItem('scrcpy-studio:theme')`), themeBeforeProfiles, 'Loading a profile changed Appearance settings')
    }
    await nav('Studio')
    assert((await evaluate(`document.querySelector('.command-preview code')?.textContent || ''`)).includes('--max-fps=45'), 'Command preview did not show the final profile')
    assert.equal(await evaluate(`document.querySelector('.preset-compact .active')?.textContent || ''`), '', 'Custom profile incorrectly highlighted a preset')
    console.log('PROFILE_STRESS', JSON.stringify({ batches: batches.length, finalPid: current.pid, generation: current.generation, maxProcesses }))

    const rapidArgs = (codec, fps, bitrate, size, audioCodec, keyboard, encoder = '') => [
      `--serial=${serial}`, '--video-source=display', `--video-codec=${codec}`, ...(encoder ? [`--video-encoder=${encoder}`] : []),
      `--video-bit-rate=${bitrate}`, `--max-size=${size}`, `--max-fps=${fps}`, `--audio-codec=${audioCodec}`, '--audio-source=output',
      '--audio-bit-rate=128K', '--audio-buffer=50', `--keyboard=${keyboard}`, `--mouse=${keyboard}`, '--gamepad=disabled', '--disable-screensaver',
    ]
    const h264Encoder = environment.capabilities.video.encoders.find((item) => item.codec === 'h264')?.name || ''
    const rapidSets = [
      rapidArgs('h264', '55', '9M', '1600', 'opus', 'sdk', h264Encoder),
      rapidArgs('h265', '48', '11M', '1440', 'aac', 'uhid'),
      rapidArgs('h264', '36', '7M', '1200', 'opus', 'sdk', h264Encoder),
      rapidArgs('h265', '42', '10M', '1360', 'aac', 'uhid'),
      rapidArgs('h264', '50', '8M', '1500', 'opus', 'sdk', h264Encoder),
    ]
    for (let round = 0; round < 3; round++) {
      const ordered = round % 2 ? [...rapidSets].reverse() : rapidSets
      const finalArgs = ordered.at(-1)
      const before = await state()
      await evaluate(`Promise.all(${JSON.stringify(ordered)}.map((args,index)=>window.scrcpyStudio.applyConfig({args,autoReconnect:true,reason:'stress '+index})))`)
      await wait(`(async()=>{const s=await window.scrcpyStudio.getSessionState();return s.status==='live'&&s.running&&s.appliedArgs?.includes(${JSON.stringify(finalArgs.find((arg) => arg.startsWith('--max-fps=')))})&&s.generation>=${before.generation + ordered.length}})()`, `latest-wins stress round ${round + 1}`)
      current = await state()
      assert.equal(current.generation, before.generation + ordered.length, 'Rapid auto-apply processed an unexpected number of desired generations')
      assert.deepEqual([...current.appliedArgs].sort(), [...finalArgs].sort(), 'A stale configuration won the restart race')
      assert.equal(scrcpyProcessCount(), 1, 'Rapid auto-apply left multiple scrcpy processes')
      assert(current.pid && current.status === 'live', 'Rapid auto-apply left stale state')
    }
    console.log('AUTO_APPLY_STRESS', JSON.stringify({ rounds: 3, updatesPerRound: rapidSets.length, finalPid: current.pid, processCount: scrcpyProcessCount() }))

    const doubleStartPid = current.pid
    await evaluate(`Promise.all([window.scrcpyStudio.start({args:${JSON.stringify(rapidSets.at(-1))},autoReconnect:true}),window.scrcpyStudio.start({args:${JSON.stringify(rapidSets.at(-1))},autoReconnect:true})])`)
    await waitLive()
    current = await state()
    assert.equal(current.pid, doubleStartPid, 'Double start unnecessarily replaced the active process')
    assert.equal(scrcpyProcessCount(), 1, 'Double start created more than one scrcpy process')

    const killedPid = current.pid
    taskkill(killedPid)
    await wait(`(async()=>{const s=await window.scrcpyStudio.getSessionState();return !s.running&&!s.pid&&s.status!=='live'})()`, 'manual process-death state')
    assert.equal(scrcpyProcessCount(), 0, 'Killed scrcpy process survived')
    await evaluate(`window.scrcpyStudio.retry()`)
    current = await waitLive()
    assert.notEqual(current.pid, killedPid, 'Retry reused a dead PID')
    assert.equal(scrcpyProcessCount(), 1, 'Retry created an invalid process count')
    console.log('PROCESS_DEATH_RECOVERY', JSON.stringify({ killedPid, recoveredPid: current.pid }))

    const desiredBeforeDisconnect = [...current.desiredArgs]
    await evaluate(`window.scrcpyStudio.reportDevicePresence(${JSON.stringify(serial)},false)`)
    await wait(`(async()=>{const s=await window.scrcpyStudio.getSessionState();return s.status==='disconnected'&&!s.running&&!s.pid})()`, 'simulated disconnect')
    assert.equal(scrcpyProcessCount(), 0, 'Disconnect left scrcpy running')
    await evaluate(`window.scrcpyStudio.reportDevicePresence(${JSON.stringify(serial)},true)`)
    current = await waitLive()
    assert.deepEqual([...current.desiredArgs].sort(), [...desiredBeforeDisconnect].sort(), 'Reconnect lost desired configuration')
    assert.equal(scrcpyProcessCount(), 1, 'Reconnect created an invalid process count')
    await evaluate(`window.scrcpyStudio.stop()`)
    await waitStopped()
    await evaluate(`window.scrcpyStudio.start({args:${JSON.stringify(rapidSets[0])},autoReconnect:false})`)
    await waitLive()
    await evaluate(`window.scrcpyStudio.reportDevicePresence(${JSON.stringify(serial)},false)`)
    await wait(`(async()=>{const s=await window.scrcpyStudio.getSessionState();return s.status==='disconnected'&&!s.running})()`, 'disconnect with reconnect disabled')
    await evaluate(`window.scrcpyStudio.reportDevicePresence(${JSON.stringify(serial)},true)`)
    const disabledGeneration = (await state()).generation
    await delay(1_500)
    const disabledState = await state()
    assert.equal(disabledState.status, 'disconnected', 'Reconnect-disabled session restarted automatically')
    assert.equal(disabledState.generation, disabledGeneration, 'Reconnect-disabled session entered a retry loop')
    assert.equal(scrcpyProcessCount(), 0, 'Reconnect-disabled session left a process')
    await evaluate(`Promise.allSettled([
      window.scrcpyStudio.start({args:${JSON.stringify(rapidSets[0])},autoReconnect:true,reason:'disconnect during start'}),
      window.scrcpyStudio.reportDevicePresence(${JSON.stringify(serial)},false)
    ])`)
    await wait(`(async()=>{const s=await window.scrcpyStudio.getSessionState();return s.status==='disconnected'&&!s.running&&!s.pid})()`, 'disconnect during start')
    await evaluate(`window.scrcpyStudio.reportDevicePresence(${JSON.stringify(serial)},true)`)
    await waitLive('--max-fps=55')
    await evaluate(`window.scrcpyStudio.stop()`)
    await waitStopped()
    console.log('DISCONNECT_RECOVERY', JSON.stringify({ autoReconnect: 'recovered once', duringStart: 'recovered once', disabled: 'stayed disconnected without retry loop' }))

    const expectRuntimeFailure = async (label, args) => {
      await evaluate(`window.scrcpyStudio.start({args:${JSON.stringify(args)},autoReconnect:false,reason:${JSON.stringify(label)}})`)
      await wait(`(async()=>{const s=await window.scrcpyStudio.getSessionState();return s.status==='error'&&!s.running&&!s.pid&&Boolean(s.error)})()`, label)
      const failed = await state()
      assert.equal(scrcpyProcessCount(), 0, `${label} left a Scrcpy process running`)
      return failed.error
    }
    const failureBase = [`--serial=${serial}`, '--video-source=display', '--video-codec=h264', '--no-audio', '--max-size=1280', '--max-fps=30']
    const failureResults = {
      encoder: await expectRuntimeFailure('unavailable encoder', [...failureBase, '--video-encoder=pepperon.invalid.encoder']),
      display: await expectRuntimeFailure('unavailable display', failureBase.map((arg) => arg === '--video-source=display' ? '--display-id=2147483647' : arg).filter((arg) => !arg.startsWith('--video-source='))),
      camera: await expectRuntimeFailure('invalid camera', [`--serial=${serial}`, '--video-source=camera', '--camera-id=pepperon-missing-camera', '--no-audio']),
    }
    await evaluate(`window.scrcpyStudio.start({args:${JSON.stringify(rapidSets[0])},autoReconnect:false,reason:'post-failure recovery'})`)
    await waitLive('--max-fps=55')
    await evaluate(`window.scrcpyStudio.stop()`)
    await waitStopped()
    assert.equal(scrcpyProcessCount(), 0, 'Valid recovery after expected failures left a process')
    console.log('EXPECTED_FAILURE_RECOVERY', JSON.stringify(failureResults))

    const videoRecordArgs = [`--serial=${serial}`, '--video-source=display', '--video-codec=h264', '--video-bit-rate=6M', '--max-size=1280', '--max-fps=30']
    const audioRecordArgs = ['--audio-codec=opus', '--audio-source=output', '--audio-bit-rate=128K', '--audio-buffer=50']
    const timedRecording = async (file, format, mediaArgs) => {
      const args = [...mediaArgs, `--record=${file}`, `--record-format=${format}`, '--no-playback', '--time-limit=2']
      await evaluate(`window.scrcpyStudio.start({args:${JSON.stringify(args)},autoReconnect:false,reason:'recording validation'})`)
      const active = await waitLive(`--record=${file}`)
      await waitStopped()
      assert(fs.existsSync(active.recordingPath), `Recording was not created: ${active.recordingPath}`)
      const summary = fileSummary(active.recordingPath)
      assert(summary.size > 1024, `Recording is unexpectedly small: ${summary.size}`)
      return { requested: file, actual: active.recordingPath, ...summary }
    }
    const mp4 = await timedRecording(path.join(tempRoot, 'video-audio.mp4'), 'mp4', [...videoRecordArgs, ...audioRecordArgs])
    const mkv = await timedRecording(path.join(tempRoot, 'video-only.mkv'), 'mkv', [...videoRecordArgs, '--no-audio'])
    const m4a = await timedRecording(path.join(tempRoot, 'audio-only.m4a'), 'm4a', [`--serial=${serial}`, '--no-video', ...audioRecordArgs])
    assert(mp4.head.slice(8).startsWith('66747970'), 'MP4 recording does not contain an ftyp header')
    assert(mkv.head.startsWith('1a45dfa3'), 'MKV recording does not contain an EBML header')
    assert(m4a.head.slice(8).startsWith('66747970'), 'M4A recording does not contain an ftyp header')

    const existing = path.join(tempRoot, 'existing.mp4')
    const sentinel = Buffer.from('DO-NOT-OVERWRITE')
    fs.writeFileSync(existing, sentinel)
    const segmentedExisting = await timedRecording(existing, 'mp4', [...videoRecordArgs, '--no-audio'])
    assert.deepEqual(fs.readFileSync(existing), sentinel, 'Existing recording destination was overwritten')
    assert.notEqual(segmentedExisting.actual, existing, 'Existing recording was not redirected to a segment')

    const restartFile = path.join(tempRoot, 'restart.mp4')
    const restartArgs = [...videoRecordArgs, '--no-audio', `--record=${restartFile}`, '--record-format=mp4', '--no-playback']
    await evaluate(`window.scrcpyStudio.start({args:${JSON.stringify(restartArgs)},autoReconnect:false,reason:'recording restart validation'})`)
    const firstSegment = await waitLive(`--record=${restartFile}`)
    await delay(2_500)
    const restartChanged = restartArgs.map((arg) => arg === '--max-fps=30' ? '--max-fps=24' : arg)
    await evaluate(`window.scrcpyStudio.applyConfig({args:${JSON.stringify(restartChanged)},autoReconnect:false,reason:'recording FPS changed'})`)
    await wait(`(async()=>{const s=await window.scrcpyStudio.getSessionState();return s.status==='live'&&s.pid!==${firstSegment.pid}&&s.recordingPath&&s.recordingPath!==${JSON.stringify(restartFile)}})()`, 'segmented recording restart')
    const secondSegment = await state()
    await delay(2_500)
    await evaluate(`window.scrcpyStudio.stop()`)
    await waitStopped()
    const restartSummaries = [restartFile, secondSegment.recordingPath].map(fileSummary)
    console.log('RECORDING_RESTART_SEGMENTS', JSON.stringify({ paths: [restartFile, secondSegment.recordingPath], summaries: restartSummaries }))
    assert(restartSummaries.every((item) => item.size > 1024), 'A restarted recording segment was truncated')
    assert.equal(scrcpyProcessCount(), 0, 'Recording stop left scrcpy running')
    console.log('RECORDING_VALIDATION', JSON.stringify({ mp4, mkv, m4a, existing: segmentedExisting, restart: { paths: [restartFile, secondSegment.recordingPath], summaries: restartSummaries } }))
    completed = true
  } finally {
    await evaluate(`window.scrcpyStudio.stop().catch(()=>undefined)`).catch(() => undefined)
    await delay(500)
    if (serial) {
      try { adb(['-s', serial, 'shell', 'settings', 'put', 'system', 'show_touches', originalShowTouches || '0']) } catch {}
      try { adb(['-s', serial, 'shell', 'settings', 'put', 'global', 'stay_on_while_plugged_in', originalStayAwake || '0']) } catch {}
    }
    await evaluate(`(() => { const backup=${JSON.stringify(backup)}; for(const key of ${JSON.stringify(STORAGE_KEYS)}) backup[key]===null ? localStorage.removeItem(key) : localStorage.setItem(key,backup[key]); location.reload() })()`).catch(() => undefined)
    await delay(3500)
    if (tempRoot.startsWith(`${os.tmpdir()}${path.sep}`)) fs.rmSync(tempRoot, { recursive: true, force: true })
    socket.close()
  }
  if (completed) console.log('RESULT hardening tests passed; application and phone settings restored')
}

main().catch((error) => {
  console.error('RESULT failed')
  console.error(error.stack || error)
  process.exit(1)
})
