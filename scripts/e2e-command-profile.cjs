const assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')

const DEBUG_URL = process.env.SCRCPY_STUDIO_DEBUG_URL || 'http://127.0.0.1:9222'
const STORAGE_KEYS = ['scrcpy-studio:config', 'scrcpy-studio:profiles', 'scrcpy-studio:onboarding-v1']

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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)) }, 35_000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Renderer evaluation failed')
    return result.result.value
  }
  const wait = async (expression, description, timeout = 15_000) => {
    const started = Date.now()
    while (Date.now() - started < timeout) {
      try { if (await evaluate(expression)) return } catch {}
      await delay(100)
    }
    throw new Error(`Timed out waiting for ${description}`)
  }
  const nav = async (name) => {
    assert(await evaluate(`(() => { const button=[...document.querySelectorAll('nav button')].find(e=>e.querySelector('span')?.textContent===${JSON.stringify(name)}); button?.click(); return Boolean(button) })()`), `Missing navigation: ${name}`)
    await delay(120)
  }
  const clickText = async (text, root = 'document') => {
    assert(await evaluate(`(() => { const root=${root}; const button=[...root.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}); if(!button||button.disabled)return false; button.click(); return true })()`), `Missing enabled button: ${text}`)
    await delay(120)
  }
  const setField = async (label, value) => {
    assert(await evaluate(`(() => { const field=[...document.querySelectorAll('label.field')].find(e=>e.querySelector(':scope > span')?.textContent.trim()===${JSON.stringify(label)}); const input=field?.querySelector('input'); if(!input)return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); return true })()`), `Missing field: ${label}`)
    await delay(350)
  }
  const clickProfileAction = async (name, action) => {
    assert(await evaluate(`(() => { const card=[...document.querySelectorAll('.profile-card')].find(e=>e.querySelector('h3')?.textContent===${JSON.stringify(name)}); const button=[...(card?.querySelectorAll('button')||[])].find(e=>e.textContent.trim()===${JSON.stringify(action)} || e.getAttribute('aria-label')===${JSON.stringify(action)}); if(!button)return false; button.click(); return true })()`), `Missing ${action} for ${name}`)
    await delay(150)
  }

  await send('Runtime.enable')
  const backup = await evaluate(`Object.fromEntries(${JSON.stringify(STORAGE_KEYS)}.map(key=>[key,localStorage.getItem(key)]))`)
  try {
    await wait(`!document.querySelector('.startup-loader')`, 'startup loader', 10_000)
    await evaluate(`window.scrcpyStudio.stop().catch(()=>undefined)`)

    await nav('All commands')
    const audit = await evaluate(`(async () => {
      const runtime=await window.scrcpyStudio.getRuntimeStatus();
      const runtimeNames=[...new Set(runtime.options.map(item=>item.name))].filter(name=>!['--help','--version'].includes(name));
      const rows=[...document.querySelectorAll('.option-row')].map(row=>({
        name:row.querySelector('code')?.textContent,
        description:row.querySelector('.option-copy p')?.textContent.trim(),
        unavailable:row.classList.contains('unavailable'),
        input:Boolean(row.querySelector('.option-editor input')),
        checkbox:Boolean(row.querySelector('.option-editor input[type="checkbox"]')),
        button:Boolean(row.querySelector('.option-editor button')),
      }));
      const kinds=runtime.options.reduce((counts,item)=>{counts[item.kind]=(counts[item.kind]||0)+1;return counts},{});
      return {runtimeVersion:runtime.installedVersion,runtimeCount:runtimeNames.length,runtimeNames,runtimeOptions:runtime.options,kinds,optionalValues:runtime.options.filter(item=>item.optionalValue).map(item=>item.name),rows};
    })()`)
    assert.equal(audit.runtimeVersion, '4.1', 'Real-device audit expected the installed scrcpy 4.1 runtime')
    assert(audit.runtimeCount >= 100, `Only ${audit.runtimeCount} runtime commands were parsed`)
    assert.equal(new Set(audit.rows.map((row) => row.name)).size, audit.rows.length, 'Duplicate commands were rendered')
    assert.deepEqual(audit.runtimeNames.filter((name) => !audit.rows.some((row) => row.name === name)), [], 'Installed runtime commands are missing from the GUI')
    const incompleteRows = audit.rows.filter((row) => !row.name || !row.description || (!row.button && !row.checkbox))
    assert.deepEqual(incompleteRows, [], `Command rows are incomplete: ${JSON.stringify(incompleteRows)}`)
    assert(audit.rows.filter((row) => audit.runtimeNames.includes(row.name)).every((row) => !row.unavailable), 'An installed command is incorrectly disabled')
    assert(!audit.rows.find((row) => row.name === '--flex-display')?.description.includes('Environment variables:'), 'The last command absorbed unrelated help sections')
    for (const name of ['--new-display', '--pause-on-exit', '--tcpip']) {
      const row = audit.rows.find((item) => item.name === name)
      assert(row?.input && !row.checkbox && !row.unavailable, `${name} optional-value syntax was parsed incorrectly`)
    }
    assert.deepEqual(audit.optionalValues.sort(), ['--new-display','--pause-on-exit','--tcpip'], 'Optional-value command classification changed')
    console.log('PASS command catalog', JSON.stringify({ runtime: audit.runtimeVersion, installed: audit.runtimeCount, rendered: audit.rows.length, kinds: audit.kinds, optionalValues: audit.optionalValues.length }))

    const editorAudit = await evaluate(`(async () => {
      const names=[...document.querySelectorAll('.option-row code')].map(code=>code.textContent);
      const failures=[];
      let tested=0;
      const pause=()=>new Promise(resolve=>setTimeout(resolve,12));
      const rowFor=name=>[...document.querySelectorAll('.option-row')].find(row=>row.querySelector('code')?.textContent===name);
      const setInput=(input,value)=>{ Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value); input.dispatchEvent(new Event('input',{bubbles:true})) };
      const samples={
        '--angle':'-15.5','--audio-bit-rate':'96K','--audio-buffer':'40','--audio-codec':'aac','--audio-codec-options':'bitrate-mode:int=1','--audio-output-buffer':'12','--audio-source':'playback',
        '--background-color':'#123','--camera-ar':'sensor','--camera-facing':'front','--camera-fps':'30','--camera-id':'0','--camera-size':'1280x720','--camera-zoom':'1',
        '--capture-orientation':'@90','--crop':'640:480:0:0','--display-id':'0','--display-ime-policy':'local','--display-orientation':'90','--gamepad':'uhid','--keyboard':'uhid',
        '--max-fps':'30','--max-size':'1280','--min-size-alignment':'2','--mouse':'uhid','--mouse-bind':'bhsn:++++','--new-display':'/240','--orientation':'90','--pause-on-exit':'if-error',
        '--port':'27183:27199','--push-target':'/sdcard/Download/','--record':'C:\\Pepperon Tests\\sample.mp4','--record-format':'mp4','--record-orientation':'90','--render-driver':'direct3d',
        '--render-fit':'letterbox','--screen-off-timeout':'30','--shortcut-mod':'lctrl,lsuper','--start-app':'com.android.settings','--tcpip':'127.0.0.1:5555','--time-limit':'2',
        '--tunnel-host':'127.0.0.1','--tunnel-port':'0','--v4l2-buffer':'0','--v4l2-sink':'/dev/video0','--verbosity':'info','--video-bit-rate':'6M','--video-buffer':'10',
        '--video-codec':'h264','--video-codec-options':'profile:int=1','--video-source':'display','--window-height':'0','--window-title':'Pepperon test','--window-width':'0','--window-x':'-120','--window-y':'0'
      };
      for (const name of names) {
        let row=rowFor(name);
        if (!row || row.querySelector('.run-action') || name==='--serial') continue;
        const checkbox=row.querySelector('input[type="checkbox"]');
        if (checkbox) {
          const original=checkbox.checked;
          checkbox.click(); await pause();
          if (rowFor(name)?.querySelector('input[type="checkbox"]')?.checked===original) failures.push(name+': toggle did not change');
          rowFor(name)?.querySelector('input[type="checkbox"]')?.click(); await pause();
          if (rowFor(name)?.querySelector('input[type="checkbox"]')?.checked!==original) failures.push(name+': toggle did not restore');
          tested+=1;
          continue;
        }
        const input=row.querySelector('.option-editor input');
        if (!input) { failures.push(name+': editor missing'); continue }
        const original=input.value;
        const sample=samples[name];
        if (sample===undefined) { input.focus(); if(document.activeElement!==input) failures.push(name+': input could not be focused'); tested+=1; continue }
        setInput(input,sample); await pause();
        if (rowFor(name)?.querySelector('.option-editor input')?.value!==sample) failures.push(name+': value did not change');
        const current=rowFor(name)?.querySelector('.option-editor input');
        if (current) setInput(current,original);
        await pause();
        if (rowFor(name)?.querySelector('.option-editor input')?.value!==original) failures.push(name+': value did not restore');
        tested+=1;
      }
      return {tested,failures};
    })()`)
    assert.deepEqual(editorAudit.failures, [], `Command editors failed round-trip: ${editorAudit.failures.join(', ')}`)
    assert(editorAudit.tested >= 95, `Only ${editorAudit.tested} command editors were exercised`)
    console.log('PASS command editor round-trips', editorAudit.tested)

    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75 })
    assert(await evaluate(`document.activeElement?.getAttribute('aria-label')==='Search commands'`), 'CTRL + K did not focus command search')
    await evaluate(`(() => { const input=document.activeElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'--new-display'); input.dispatchEvent(new Event('input',{bubbles:true})) })()`)
    await wait(`[...document.querySelectorAll('.option-row code')].some(code=>code.textContent==='--new-display')`, 'command search result')
    assert(await evaluate(`(() => { const row=[...document.querySelectorAll('.option-row')].find(item=>item.querySelector('code')?.textContent==='--new-display'); const button=row?.querySelector('button[aria-label^="Enable"]'); button?.click(); return Boolean(button) })()`), 'Optional flag enable control was not found')
    await delay(250)
    assert(await evaluate(`JSON.parse(localStorage.getItem('scrcpy-studio:config')).newDisplay===true`), 'Bare --new-display did not update the guided configuration')
    assert(await evaluate(`(() => { const row=[...document.querySelectorAll('.option-row')].find(item=>item.querySelector('code')?.textContent==='--new-display'); const button=row?.querySelector('button[aria-label^="Clear"]'); button?.click(); return Boolean(button) })()`), 'Optional flag clear control was not found')
    await delay(250)
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('scrcpy-studio:config')).newDisplay`), false)

    assert(await evaluate(`(() => { const row=[...document.querySelectorAll('.option-row')].find(item=>item.querySelector('code')?.textContent==='--new-display'); const input=row?.querySelector('.option-editor input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'/240'); input.dispatchEvent(new Event('input',{bubbles:true})); return Boolean(input) })()`), 'New-display DPI-only value field was not found')
    await delay(250)
    assert.deepEqual(await evaluate(`(() => { const c=JSON.parse(localStorage.getItem('scrcpy-studio:config')); return {enabled:c.newDisplay,size:c.newDisplaySize,dpi:c.newDisplayDpi} })()`), { enabled: true, size: '', dpi: '240' }, 'DPI-only new-display value was split incorrectly')
    await nav('Studio')
    assert((await evaluate(`document.querySelector('.command-preview code')?.textContent`)).includes('--new-display=/240'), 'DPI-only new-display command lost its leading slash')
    await nav('All commands')
    await evaluate(`(() => { const input=document.querySelector('[aria-label="Search commands"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'--new-display'); input.dispatchEvent(new Event('input',{bubbles:true})) })()`)
    await wait(`[...document.querySelectorAll('.option-row code')].some(code=>code.textContent==='--new-display')`, 'new-display clear result')
    assert(await evaluate(`(() => { const row=[...document.querySelectorAll('.option-row')].find(item=>item.querySelector('code')?.textContent==='--new-display'); const button=row?.querySelector('button[aria-label^="Clear"]'); button?.click(); return Boolean(button) })()`))
    await delay(250)

    await evaluate(`(() => { const input=document.querySelector('[aria-label="Search commands"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'--select-usb'); input.dispatchEvent(new Event('input',{bubbles:true})) })()`)
    await wait(`[...document.querySelectorAll('.option-row code')].some(code=>code.textContent==='--select-usb')`, 'USB selector result')
    assert(await evaluate(`(() => { const row=[...document.querySelectorAll('.option-row')].find(item=>item.querySelector('code')?.textContent==='--select-usb'); const input=row?.querySelector('input[type="checkbox"]'); input?.click(); return Boolean(input) })()`), 'USB selector switch was not found')
    await delay(250)
    await nav('Studio')
    const selectorCommand = await evaluate(`document.querySelector('.command-preview code')?.textContent || ''`)
    assert(selectorCommand.includes('--select-usb') && !selectorCommand.includes('--serial='), 'The GUI generated two conflicting device selectors')
    await nav('All commands')
    await wait(`[...document.querySelectorAll('.option-row code')].some(code=>code.textContent==='--select-usb')`, 'USB selector cleanup result')
    await evaluate(`(() => { const row=[...document.querySelectorAll('.option-row')].find(item=>item.querySelector('code')?.textContent==='--select-usb'); row?.querySelector('input[type="checkbox"]')?.click() })()`)
    await delay(250)

    await evaluate(`(() => { const input=document.querySelector('[aria-label="Search commands"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'--window-title'); input.dispatchEvent(new Event('input',{bubbles:true})) })()`)
    await wait(`[...document.querySelectorAll('.option-row code')].some(code=>code.textContent==='--window-title')`, 'value-command result')
    assert(await evaluate(`(() => { const row=[...document.querySelectorAll('.option-row')].find(item=>item.querySelector('code')?.textContent==='--window-title'); const button=row.querySelector('button[aria-label^="Focus"]'); button.click(); return document.activeElement===row.querySelector('input') && row.querySelector('input').value==='' })()`), 'Empty value action inserted a placeholder instead of focusing the field')
    console.log('PASS command search, CTRL + K, optional values, device-selector exclusivity and safe empty-value editing')

    const validationMatrix = await evaluate(`(async () => {
      const validCases=[
        ['--window-title=Pepperon "quoted" title'],
        ['--record=C:\\\\Pepperon recordings\\clip one.mp4','--record-format=mp4','--no-playback'],
        ['--video-codec-options=profile:1=high,level:1=4.2'],
        ['--crop=640:480:10:20'],
        ['--window-x=-120','--window-y=0'],
        ['--video-buffer=0','--time-limit=0','--window-width=0','--window-height=0','--tunnel-port=0'],
        ['--pause-on-exit=false'],['--pause-on-exit'],['--new-display'],['--new-display=/240'],['--tcpip'],
        ['--video-source=camera','--camera-id=0','--camera-size=1920x1080','--camera-fps=30'],
        ['--audio-source=playback','--audio-dup'],['--no-control'],
        ['--show-touches','--stay-awake','--turn-screen-off','--power-off-on-close'],
        ['--keyboard=sdk','--mouse=sdk','--gamepad=disabled'],
        ['--keyboard=uhid','--mouse=uhid','--gamepad=uhid'],
        ['--keyboard=aoa','--mouse=aoa','--gamepad=aoa'],
        ['--video-source=display','--no-audio'],
        ['--no-video','--audio-codec=opus','--audio-source=output'],
        ['--audio-source=mic'],['--audio-source=mic-unprocessed'],['--audio-source=mic-camcorder'],
        ['--video-source=display','--display-id=0'],['--video-source=display','--new-display=1920x1080/240'],
        ['--record=C:\\\\Pepperon recordings\\video.mkv','--record-format=mkv','--no-audio','--no-playback'],
        ['--record=C:\\\\Pepperon recordings\\audio.m4a','--record-format=m4a','--no-video','--audio-codec=aac','--no-playback'],
        ['--serial=device-01'],['--select-usb'],['--select-tcpip'],['--tcpip=+192.168.1.10:5555'],
        ['--background-color=#1a2b3c','--angle=-22.5','--video-source=camera','--camera-ar=4:3','--mouse-bind=bhsn:++++','--shortcut-mod=lctrl,lsuper'],
      ];
      const invalidCases=[
        ['--max-fps='],['--max-fps=0'],['--video-buffer=-1'],['--video-codec=unknown'],['--video-bit-rate=fast'],
        ['--port=70000'],['--crop=bad'],['--new-display=wide'],['--audio-source=output','--audio-dup'],
        ['--video-source=display','--camera-id=0'],['--display-id=0','--new-display'],['--no-playback'],
        ['--serial=one','--select-usb'],['--no-control','--keyboard=sdk'],['--no-audio','--audio-codec=opus'],
        ['--record-format=mp4'],['--max-fps=60','--max-fps=30'],['--window-title=line\\nbreak'],
        ['--max-fps'],['--fullscreen=false'],['--angle=sideways'],['--background-color=purple'],['--camera-ar=0'],
        ['--mouse-bind=bad'],['--shortcut-mod=ctrl'],['--port=27199:27183'],['--camera-size=0x1080'],['--crop=0:480:0:0'],
        ['--new-display=/0'],['--tcpip=127.0.0.1:70000'],['--no-video','--video-codec=h264'],
        ['--video-source=camera','--display-id=0'],['--no-control','--show-touches','--stay-awake','--turn-screen-off','--power-off-on-close'],
      ];
      const valid=[]; const invalid=[];
      for (const args of validCases) { try { const result=await window.scrcpyStudio.validateArgs(args); valid.push(JSON.stringify(result.args)===JSON.stringify(args)) } catch(error) { valid.push(error.message) } }
      for (const args of invalidCases) { try { await window.scrcpyStudio.validateArgs(args); invalid.push('accepted') } catch(error) { invalid.push(error.message) } }
      return {valid,invalid};
    })()`)
    assert(validationMatrix.valid.every((result) => result === true), `Valid edge values were changed or rejected: ${JSON.stringify(validationMatrix.valid)}`)
    assert(validationMatrix.invalid.every((result) => result !== 'accepted'), `Malformed/conflicting values were accepted: ${JSON.stringify(validationMatrix.invalid)}`)
    console.log('PASS argument validation matrix', JSON.stringify({ valid: validationMatrix.valid.length, invalid: validationMatrix.invalid.length }))

    const invalid = await evaluate(`(async () => {
      const errors=[];
      for (const args of [['x'.repeat(2049)],['--serial=e6455cd3','--select-usb'],['--serial=e6455cd3','--no-control','--show-touches']]) {
        try { await window.scrcpyStudio.runScrcpyAction(args); errors.push('accepted') } catch(error) { errors.push(error.message) }
      }
      return errors;
    })()`)
    assert(invalid.every((message) => message !== 'accepted'), 'Unsafe or conflicting arguments were accepted')
    assert(invalid[1].includes('one Scrcpy device selector'), 'Selector conflict did not return a clear error')
    assert(invalid[2].includes('require Scrcpy device control'), 'View-only conflict did not return a clear error')

    const oneShots = await evaluate(`(async () => {
      const serial=(await window.scrcpyStudio.listDevices()).find(device=>device.state==='device')?.serial;
      const output={};
      for (const flag of ['--list-apps','--list-cameras','--list-camera-sizes','--list-displays','--list-encoders']) {
        const result=await window.scrcpyStudio.runScrcpyAction(['--serial='+serial,flag]);
        output[flag]={code:result.code,length:result.output.length};
      }
      return output;
    })()`)
    assert(Object.values(oneShots).every((result) => result.code === 0 && result.length > 0), `One-shot command failed: ${JSON.stringify(oneShots)}`)
    console.log('PASS safe one-shot commands', JSON.stringify(oneShots))

    const current = await evaluate(`JSON.parse(localStorage.getItem('scrcpy-studio:config'))`)
    const legacy = { id: 'legacy-profile', name: 'Legacy', config: { serial: 'unavailable-old-device', videoCodec: 'h264', extras: { '--video-codec': 'vp9', '--future-option': 'future:value' }, sessionStatus: 'live', pid: 1234 }, capabilityCache: { stale: true } }
    await evaluate(`(() => { localStorage.setItem('scrcpy-studio:profiles',${JSON.stringify(JSON.stringify([null, legacy, { ...legacy, name: 'Duplicate id' }, { id: '', name: '' }]))}); localStorage.setItem('scrcpy-studio:onboarding-v1','seen'); location.reload() })()`)
    await wait(`document.readyState==='complete' && Boolean(document.querySelector('nav'))`, 'profile fixture document', 20_000)
    await wait(`!document.querySelector('.startup-loader')`, 'profile fixture loader', 10_000)
    await nav('Profiles')
    assert.equal(await evaluate(`document.querySelectorAll('.profile-card').length`), 1, 'Invalid or duplicate saved profiles were not repaired')
    assert(await evaluate(`document.querySelector('.profile-card')?.innerText.includes('1920p · 60 fps · H264')`), 'Legacy profile defaults were not restored')
    const migrated = await evaluate(`JSON.parse(localStorage.getItem('scrcpy-studio:profiles'))[0]`)
    assert.equal(migrated.config.serial, '', 'Legacy profile retained a device serial')
    assert.equal(migrated.config.extras['--video-codec'], undefined, 'Duplicate guided setting remained in advanced profile data')
    assert.equal(migrated.config.extras['--future-option'], 'future:value', 'Unknown older-runtime option was not preserved')
    assert.equal(migrated.config.sessionStatus, undefined, 'Transient session state leaked into profile config')
    const selectedBeforeLoad = await evaluate(`JSON.parse(localStorage.getItem('scrcpy-studio:config')).serial`)
    await clickProfileAction('Legacy', 'Load')
    await delay(300)
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('scrcpy-studio:config')).serial`), selectedBeforeLoad, 'Loading a profile changed the selected device')
    assert((await evaluate(`JSON.parse(localStorage.getItem('scrcpy-studio:config')).extras['--future-option']`)) === 'future:value')

    await evaluate(`window.confirm=()=>true`)
    await clickProfileAction('Legacy', 'Delete Legacy')
    await wait(`document.querySelectorAll('.profile-card').length===0`, 'legacy profile deletion')
    await nav('Studio')
    await clickText('Balanced')
    assert.equal(await evaluate(`document.querySelector('.preset-compact .active')?.textContent`), 'Balanced')
    await nav('All commands')
    await evaluate(`(() => { const input=document.querySelector('[aria-label="Search commands"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'--no-video'); input.dispatchEvent(new Event('input',{bubbles:true})) })()`)
    await wait(`[...document.querySelectorAll('.option-row code')].some(code=>code.textContent==='--no-video')`, 'no-video result')
    assert(await evaluate(`(() => { const row=[...document.querySelectorAll('.option-row')].find(item=>item.querySelector('code')?.textContent==='--no-video'); const input=row?.querySelector('input[type="checkbox"]'); input?.click(); return Boolean(input) })()`), 'No-video switch was not found')
    await delay(250)
    await nav('Studio')
    assert.equal(await evaluate(`document.querySelector('.preset-compact .active')?.textContent || ''`), '', 'Video-disabled configuration incorrectly highlighted a video preset')
    assert((await evaluate(`document.querySelector('.command-preview code')?.textContent || ''`)).includes('--no-video'), 'Audio-only command did not generate --no-video')
    await clickText('Balanced')
    assert.equal(await evaluate(`document.querySelector('.preset-compact .active')?.textContent`), 'Balanced', 'Selecting a video preset did not re-enable video')
    assert(!(await evaluate(`(document.querySelector('.command-preview code')?.textContent || '').includes('--no-video')`)), 'Video preset retained --no-video')
    await nav('Profiles')
    await clickText('Save as new profile')
    await wait(`document.querySelectorAll('.profile-card').length===1`, 'first saved profile')
    assert(await evaluate(`[...document.querySelectorAll('.profile-card h3')].some(e=>e.textContent==='Profile 1')`))
    const savedProfileConfig = await evaluate(`JSON.parse(localStorage.getItem('scrcpy-studio:profiles'))[0].config`)
    assert.equal(savedProfileConfig.serial, '', 'New profile stored the selected device serial')
    for (const transient of ['pid','status','sessionStatus','duration','capabilities','errors']) assert.equal(savedProfileConfig[transient], undefined, `Profile stored transient ${transient}`)

    await nav('Video')
    await setField('Maximum FPS', '61')
    await nav('Studio')
    assert.equal(await evaluate(`document.querySelector('.preset-compact .active')?.textContent || ''`), '', 'Manual settings left a misleading preset highlighted')
    await nav('Profiles')
    await clickProfileAction('Profile 1', 'Load')
    await nav('Studio')
    assert.equal(await evaluate(`document.querySelector('.preset-compact .active')?.textContent`), 'Balanced', 'Loading a profile did not restore its preset highlight')
    await nav('Profiles')
    await clickText('Save as new profile')
    await wait(`document.querySelectorAll('.profile-card').length===2`, 'second saved profile')

    await evaluate(`window.prompt=()=> '   '`)
    await clickProfileAction('Profile 2', 'Rename')
    assert(await evaluate(`document.body.innerText.includes('Profile name cannot be empty')`), 'Whitespace-only profile name did not show validation')
    await evaluate(`window.prompt=()=> 'x'.repeat(65)`)
    await clickProfileAction('Profile 2', 'Rename')
    assert(await evaluate(`document.body.innerText.includes('Profile names are limited to 64 characters')`), 'Overlong profile name did not show validation')

    await evaluate(`window.prompt=()=> 'Road Rig'`)
    await clickProfileAction('Profile 1', 'Rename')
    await wait(`[...document.querySelectorAll('.profile-card h3')].some(e=>e.textContent==='Road Rig')`, 'profile rename')
    const renamedAt = await evaluate(`JSON.parse(localStorage.getItem('scrcpy-studio:profiles')).find(p=>p.name==='Road Rig')?.updatedAt`)
    assert(Number.isFinite(renamedAt), 'Rename did not update profile metadata')
    await clickProfileAction('Profile 2', 'Rename')
    assert(await evaluate(`document.body.innerText.includes('That profile name already exists')`), 'Duplicate profile name was accepted without feedback')
    assert(await evaluate(`[...document.querySelectorAll('.profile-card h3')].some(e=>e.textContent==='Profile 2')`))

    await evaluate(`window.confirm=()=>false`)
    await clickProfileAction('Road Rig', 'Delete Road Rig')
    assert.equal(await evaluate(`document.querySelectorAll('.profile-card').length`), 2, 'Cancelled profile deletion still deleted data')
    await evaluate(`window.confirm=()=>true`)
    await clickProfileAction('Road Rig', 'Delete Road Rig')
    await wait(`document.querySelectorAll('.profile-card').length===1`, 'confirmed profile deletion')
    await clickText('Save as new profile')
    await wait(`document.querySelectorAll('.profile-card').length===2`, 'replacement profile save')
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.profile-card h3')].map(e=>e.textContent).sort()`), ['Profile 1', 'Profile 2'], 'Profile naming collided after deletion')

    await evaluate(`location.reload()`)
    await wait(`document.readyState==='complete' && Boolean(document.querySelector('nav'))`, 'profile persistence document', 20_000)
    await wait(`!document.querySelector('.startup-loader')`, 'profile persistence loader', 10_000)
    await nav('Profiles')
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.profile-card h3')].map(e=>e.textContent).sort()`), ['Profile 1', 'Profile 2'], 'Profiles did not persist across relaunch')
    console.log('PASS profile repair, save, load, preset sync, rename, duplicate guard, cancel/delete, naming and persistence')
  } finally {
    await evaluate(`(() => { const backup=${JSON.stringify(backup)}; for (const key of ${JSON.stringify(STORAGE_KEYS)}) backup[key]===null ? localStorage.removeItem(key) : localStorage.setItem(key,backup[key]); location.reload() })()`).catch(() => undefined)
    await delay(3500)
    socket.close()
  }
}

main().catch((error) => {
  console.error('RESULT failed')
  console.error(error.stack || error)
  process.exit(1)
})
