const assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')

async function main() {
  const debugUrl = process.env.SCRCPY_STUDIO_DEBUG_URL || 'http://127.0.0.1:9222'
  const targets = await (await fetch(`${debugUrl}/json`)).json()
  const target = targets.find(item => item.type === 'page' && item.title.replace(/&#39;/g, "'") === "Pepperon's GUI")
  assert(target?.webSocketDebuggerUrl, "Launch Pepperon's GUI with remote debugging first")
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', async event => {
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(await event.data.arrayBuffer()).toString()
    const message = JSON.parse(raw), request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id); clearTimeout(request.timer)
    message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
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
  const setCommand = async (name, value) => {
    assert(await evaluate(`(() => {
      const row=document.querySelector('[data-command="${name}"]'), input=row?.querySelector('.option-editor input');
      if(!input)return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});
      input.dispatchEvent(new Event('input',{bubbles:true})); return true;
    })()`), `Missing ${name} editor`)
    await delay(150)
  }
  const config = () => evaluate(`JSON.parse(localStorage.getItem('scrcpy-studio:config'))`)
  const backup = await evaluate(`localStorage.getItem('scrcpy-studio:config')`)
  try {
    await wait('!document.querySelector(".startup-loader")', 'startup loader')
    const runtime = await evaluate(`window.scrcpyStudio.getRuntimeStatus()`)
    assert.equal(runtime.installedVersion, '4.1')
    assert.deepEqual(runtime.options.find(option => option.name === '--max-size').constraints, {
      integer: true, min: 0, max: 65535, unit: 'px', defaultValue: '0 (unlimited)', zeroMeaning: 'unlimited', deviceDependent: true,
      note: 'Actual maximum resolution depends on the device encoder.', sourceVersion: '4.1', referenceOnly: false,
    })

    assert(await evaluate(`(() => { const button=[...document.querySelectorAll('nav button')].find(button=>button.textContent.includes('All commands')); button?.click(); return Boolean(button) })()`))
    await wait(`Boolean(document.querySelector('[data-command="--max-size"]'))`, 'All Commands cards')
    const audit = await evaluate(`(() => ({
      constrained:document.querySelectorAll('.command-constraints').length,
      maxSize:document.querySelector('[data-command="--max-size"] .command-constraints')?.innerText,
      bitrate:document.querySelector('[data-command="--video-bit-rate"] .command-constraints')?.innerText,
      maxFps:Boolean(document.querySelector('[data-command="--max-fps"] .command-constraints')),
    }))()`)
    assert.equal(audit.constrained, runtime.options.filter(option => option.constraints).length, 'Rendered constraint count differs from installed runtime metadata')
    assert(audit.constrained >= 21, `Only ${audit.constrained} constrained cards rendered`)
    assert.match(audit.maxSize, /Allowed:\s*0 – 65,535 px/)
    assert.match(audit.maxSize, /Actual maximum resolution depends on the device encoder/)
    assert.match(audit.bitrate, /K = ×1,000 · M = ×1,000,000/)
    assert.match(audit.bitrate, /Device encoder limits may be lower/)
    assert.equal(audit.maxFps, false, 'Invented parser range rendered for --max-fps')

    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
    await delay(150)
    assert(await evaluate(`(() => {
      const row=document.querySelector('[data-command="--max-size"]'), rect=row.getBoundingClientRect();
      return Boolean(document.documentElement.scrollWidth<=innerWidth && rect.left>=0 && rect.right<=innerWidth
        && row.querySelector('.command-constraints') && row.querySelector('.option-editor input'));
    })()`), 'Constrained command card overflows at 390px')
    await send('Emulation.clearDeviceMetricsOverride')
    await delay(100)

    const original = await config()
    await setCommand('--max-size', '65536')
    assert.equal((await config()).maxSize, original.maxSize, 'Invalid max-size reached persisted config')
    assert.equal(await evaluate(`document.querySelector('[data-command="--max-size"] input').value`), '65536', 'Invalid draft formatting changed')
    assert.match(await evaluate(`document.querySelector('[data-command="--max-size"] .command-validation-error').textContent`), /0 – 65,535 px/)
    await setCommand('--max-size', '0')
    assert.equal((await config()).maxSize, '0', 'Legitimate zero was rejected')
    await setCommand('--max-size', '00010')
    assert.equal((await config()).maxSize, '00010', 'Valid formatting was normalized')

    const bitrateBefore = (await config()).videoBitRate
    await setCommand('--video-bit-rate', '2148M')
    assert.equal((await config()).videoBitRate, bitrateBefore, 'Out-of-range bitrate reached persisted config')
    assert.equal(await evaluate(`document.querySelector('[data-command="--video-bit-rate"] input').value`), '2148M')
    await setCommand('--video-bit-rate', '0')
    assert.equal((await config()).videoBitRate, '0', 'Zero bitrate was rejected')
    await setCommand('--min-size-alignment', '3')
    assert.equal((await config()).extras['--min-size-alignment'], undefined)
    assert.match(await evaluate(`document.querySelector('[data-command="--min-size-alignment"] .command-validation-error').textContent`), /1, 2, 4, 8, 16/)
    await setCommand('--min-size-alignment', '16')
    assert.equal((await config()).extras['--min-size-alignment'], '16')

    const ipc = await evaluate(`(async()=>{
      const valid=[]; for(const args of [['--video-bit-rate=0'],['--video-source=camera','--camera-fps=0'],['--window-x=auto'],['--port=27199:27183']]) {
        try{await window.scrcpyStudio.validateArgs(args); valid.push(true)}catch{valid.push(false)}
      }
      const invalid=[]; for(const args of [['--video-bit-rate=2148M'],['--max-size=65536'],['--audio-buffer=3600001'],['--min-size-alignment=3']]) {
        try{await window.scrcpyStudio.validateArgs(args); invalid.push(false)}catch(error){invalid.push(error.message)}
      }
      return {valid,invalid}
    })()`)
    assert(ipc.valid.every(Boolean), `Valid IPC values rejected: ${JSON.stringify(ipc)}`)
    assert(ipc.invalid.every(Boolean), `Invalid IPC values accepted: ${JSON.stringify(ipc)}`)
    console.log('PASS runtime metadata, subtle card details, non-persisting inline errors, zeroes, formatting, suffixes, discrete values, and IPC enforcement')
  } finally {
    await send('Emulation.clearDeviceMetricsOverride').catch(() => undefined)
    await evaluate(`localStorage.setItem('scrcpy-studio:config',${JSON.stringify(backup)}); location.reload()`).catch(() => undefined)
    socket.close()
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1 })
