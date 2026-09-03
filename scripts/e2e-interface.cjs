const assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')

// Run against npm run start:debug. No extra browser-testing dependency required.
async function main() {
  const targets = await (await fetch(`${process.env.SCRCPY_STUDIO_DEBUG_URL || 'http://127.0.0.1:9222'}/json`)).json()
  const target = targets.find((item) => item.type === 'page' && item.title.replace(/&#39;/g, "'") === "Pepperon's GUI")
  assert(target, "Start Pepperon's GUI with npm run start:debug first")
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
    if (!pending.has(message.id)) return
    const request = pending.get(message.id)
    pending.delete(message.id)
    clearTimeout(request.timer)
    message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)) }, 15000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Renderer error')
    return result.result.value
  }
  const wait = async (expression, description) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return
      await delay(100)
    }
    throw new Error(`Timed out: ${description}`)
  }
  const click = async (selector) => {
    assert(await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element || element.disabled) return false; element.focus(); element.click(); return true })()`), `Missing enabled control: ${selector}`)
    await delay(50)
  }
  const nav = async (name) => {
    assert(await evaluate(`(() => { const button = [...document.querySelectorAll('nav button')].find(e => e.querySelector('span')?.textContent === ${JSON.stringify(name)}); button?.click(); return Boolean(button) })()`))
    await delay(100)
  }
  const key = async (key, code, virtualKey, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey, modifiers })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey, modifiers: 0 })
    await delay(50)
  }
  const combo = (label) => `[role="combobox"][aria-label="${label}"]`
  const checkGuide = async (width, exerciseLinks = false) => {
    if (await evaluate(`Boolean(document.querySelector('.starter-guide'))`)) await nav('Studio')
    if (width <= 920) {
      await click('.mobile-menu')
      await delay(250)
    }
    assert(await evaluate(`(() => {
      const sidebar=document.querySelector('.sidebar').getBoundingClientRect();
      const footer=document.querySelector('.sidebar-guide').getBoundingClientRect();
      const button=document.querySelector('.sidebar-guide button').getBoundingClientRect();
      return Math.abs(footer.bottom-sidebar.bottom)<1 && button.left>=0 && button.right<=innerWidth && button.bottom<=innerHeight;
    })()`), 'Starter Guide must be visible at the bottom of the sidebar')
    await click('.sidebar-guide button')
    await wait(`document.querySelector('.starter-guide') && document.activeElement?.id==='starter-guide-title'`, 'Starter Guide focus')
    assert.equal(await evaluate(`document.querySelector('.sidebar-guide button').getAttribute('aria-current')`), 'page')
    assert(await evaluate(`Boolean(document.querySelector('.sidebar-guide .lucide-github'))`), 'Requested guide icon is missing')
    assert.equal(await evaluate(`document.querySelectorAll('.guide-steps > li').length`), 6)
    assert.equal(await evaluate(`document.querySelectorAll('.guide-help details').length`), 3)
    assert(await evaluate(`document.querySelector('.starter-guide').innerText.includes('Stop Stream')`))
    assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('.guide-step,.guide-shortcuts button')].every(e=>e.scrollWidth<=e.clientWidth)`), `Guide overflows at ${width}px`)
    if (width <= 920) assert(!(await evaluate(`document.querySelector('.sidebar').classList.contains('is-open')`)), 'Guide must close mobile navigation')
    await click('.guide-help summary')
    assert(await evaluate(`document.querySelector('.guide-help details').open`), 'Troubleshooting accordion did not open')
    await click('.guide-help summary')
    if (exerciseLinks) {
      const destinations = { studio:"Pepperon's GUI", video:'Video studio', audio:'Audio room', recording:'Recording booth', profiles:'Profiles', appearance:'Appearance', control:'Control deck', display:'Display & window', options:'Every command' }
      assert.equal(await evaluate(`new Set([...document.querySelectorAll('[data-guide-destination]')].map(e=>e.dataset.guideDestination)).size`), Object.keys(destinations).length)
      for (const [page, title] of Object.entries(destinations)) {
        await click(`[data-guide-destination="${page}"]`)
        assert.equal(await evaluate(`document.querySelector('main h1').textContent`), title)
        await click('.sidebar-guide button')
      }
    }
    console.log(`PASS Starter Guide footer, content, shortcuts and layout ${width}px`)
  }
  const dashboardLayout = () => evaluate(`(() => {
    const bounds = (element) => {
      const r = element.getBoundingClientRect();
      return { top:r.top, bottom:r.bottom, left:r.left, right:r.right, height:r.height };
    };
    return {
      overview: [...document.querySelectorAll('.overview-grid > .section-card')].map(bounds),
      controls: [...document.querySelectorAll('.control-grid > .section-card')].map(bounds),
      stage: bounds(document.querySelector('.connection-stage')),
      linkContent: bounds(document.querySelector('.connection-visual-card .card-content')),
      goLive: bounds(document.querySelector('.connection-go-live')),
      caption: bounds(document.querySelector('.connection-caption')),
      decorativeBars: ['::before','::after'].map(pseudo => getComputedStyle(document.querySelector('.connection-stage'), pseudo).content),
      gap: parseFloat(getComputedStyle(document.querySelector('.overview-grid')).rowGap),
      width:innerWidth, scrollWidth:document.documentElement.scrollWidth,
    };
  })()`)
  const same = (actual, expected, description) => assert(Math.abs(actual - expected) < 1, `${description}: ${actual} != ${expected}`)
  const checkDashboard = async (width) => {
    const layout = await dashboardLayout()
    const [link, hardware, session, display, video, audio, recording] = layout.overview
    assert.equal(layout.overview.length, 7, 'Expected Device Link and six overview cards')
    assert(layout.scrollWidth <= width, `Dashboard overflows at ${width}px`)
    same(layout.stage.height, layout.linkContent.height, 'Artwork fills the tall card')
    assert(layout.goLive.top >= layout.caption.bottom && layout.goLive.bottom < link.bottom, 'Go live sits below the device caption inside Device Link')
    assert(layout.goLive.left >= link.left && layout.goLive.right <= link.right, 'Go live fits Device Link')
    assert(layout.goLive.height <= 32 && layout.goLive.right - layout.goLive.left <= 160, 'Device Link Go live stays compact')
    assert(layout.goLive.right - layout.goLive.left < (link.right - link.left) * .8, 'Device Link Go live must not be full-width')
    assert(layout.decorativeBars.every(content => content === 'none' || content === 'normal'), 'Device Link decorative bars remain')
    const buttons = await evaluate(`[...document.querySelectorAll('.session-button')].map(button => ({label:button.textContent.trim(),disabled:button.disabled}))`)
    assert.equal(buttons.length, 2, 'Expected header and Device Link session buttons')
    assert.equal(buttons[0].label, 'Go live', 'Idle session action is Go live')
    assert.deepEqual(buttons[0], buttons[1], 'Both session buttons must share label and availability')
    if (width > 1180) {
      same(link.top, hardware.top, 'Device Link top aligns with row one')
      same(link.bottom, recording.bottom, 'Device Link bottom aligns with row two')
      same(link.height, hardware.height + video.height + layout.gap, 'Device Link spans both rows')
      for (const card of [hardware, session, display]) same(card.top, hardware.top, 'First overview row')
      for (const card of [video, audio, recording]) same(card.top, video.top, 'Second overview row')
      for (const [upper, lower] of [[hardware, video], [session, audio], [display, recording]]) same(upper.left, lower.left, 'Overview column alignment')
      assert(layout.overview.slice(1).every(card => card.left > link.right), 'Six cards must be beside Device Link')
    } else {
      assert(hardware.top >= link.bottom, 'Device Link stacks above the other cards on narrow screens')
    }
    if (width > 920) {
      for (const [left, right] of [[layout.controls[0], layout.controls[1]], [layout.controls[2], layout.controls[3]]]) {
        same(left.top, right.top, 'Paired control-card top edges')
        same(left.height, right.height, 'Paired control-card heights')
      }
    }
    console.log(`PASS dashboard layout ${width}px`, JSON.stringify({ linkHeight:link.height, rowHeights:[hardware.height,video.height], controlHeights:layout.controls.map(card=>card.height) }))
  }
  const checkSettings = async (page) => {
    const layout = await evaluate(`(() => ({
      cards:[...document.querySelectorAll('.settings-grid > .section-card')].map(e => {const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}}),
      columns:getComputedStyle(document.querySelector('.settings-grid')).gridTemplateColumns.split(' ').length,
      width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      badge:document.querySelector('.page-header .page-badge')?.textContent,
    }))()`)
    assert.equal(layout.cards.length, page === 'Video' ? 4 : 3)
    assert(layout.scrollWidth <= layout.width, `${page} overflows at ${layout.width}px`)
    if (page === 'Video') assert(!layout.badge, 'Video version badge remains')
    if (layout.columns === 2) {
      for (let i = 0; i + 1 < layout.cards.length; i += 2) {
        same(layout.cards[i].top, layout.cards[i + 1].top, `${page} paired top edges`)
        same(layout.cards[i].height, layout.cards[i + 1].height, `${page} paired heights`)
      }
    } else {
      for (let i = 1; i < layout.cards.length; i++) assert(layout.cards[i].top >= layout.cards[i - 1].bottom, `${page} narrow cards overlap`)
    }
    console.log(`PASS ${page} card alignment ${layout.width}px`)
  }
  const checkHighlight = async (mode) => {
    const snapshots = []
    for (const color of ['#ff5f9e', '#ffd166']) {
      await nav('Appearance')
      await evaluate(`(() => {
        const input = [...document.querySelectorAll('.color-field')].find(e => e.querySelector('strong').textContent === 'Highlight').querySelector('input');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(color)});
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
      })()`)
      await wait(`getComputedStyle(document.querySelector('.app')).getPropertyValue('--pink').trim() === ${JSON.stringify(color)}`, 'Highlight color update')
      const styles = await evaluate(`({preview:getComputedStyle(document.querySelector('.preview-controls i')).backgroundColor,range:getComputedStyle(document.querySelector('.range-field input')).accentColor})`)
      await nav('Studio')
      Object.assign(styles, await evaluate(`({label:getComputedStyle(document.querySelector('.card-header .kicker')).color,preset:getComputedStyle(document.querySelector('.preset-compact .active')).backgroundColor,primary:getComputedStyle(document.querySelector('.connection-go-live')).backgroundColor})`))
      await nav('Video')
      await click(combo('Video codec'))
      Object.assign(styles, await evaluate(`({selection:getComputedStyle(document.querySelector('.dropdown-option[aria-selected="true"]')).backgroundColor,focus:getComputedStyle(document.querySelector('[aria-label="Video codec"]')).borderColor,pageIcon:getComputedStyle(document.querySelector('.page-icon')).backgroundColor})`))
      await key('Escape', 'Escape', 27)
      await nav('Audio')
      styles.note = await evaluate(`getComputedStyle(document.querySelector('.accent-note')).backgroundImage`)
      snapshots.push(styles)
    }
    for (const key of ['preview','range','label','preset','selection','focus','pageIcon','note']) assert.notEqual(snapshots[0][key], snapshots[1][key], `${mode} Highlight did not affect ${key}`)
    assert.equal(snapshots[0].primary, snapshots[1].primary, 'Highlight must not replace Primary Accent')
    console.log(`PASS ${mode} Highlight updates eight interface details independently of Primary Accent`)
  }
  if (process.argv.includes('--guide-only')) {
    const original = await evaluate(`({config:localStorage.getItem('scrcpy-studio:config'),theme:localStorage.getItem('scrcpy-studio:theme')})`)
    try {
      for (const width of [1536, 1024, 390]) {
        await send('Emulation.setDeviceMetricsOverride', {width,height:844,deviceScaleFactor:1,mobile:false})
        await delay(150)
        await checkGuide(width, width === 1536)
      }
      assert.deepEqual(await evaluate(`({config:localStorage.getItem('scrcpy-studio:config'),theme:localStorage.getItem('scrcpy-studio:theme')})`), original, 'Guide navigation must not change settings')
      console.log('RESULT Starter Guide tests passed without changing session settings')
    } finally {
      await send('Emulation.clearDeviceMetricsOverride').catch(() => undefined)
      socket.close()
    }
    return
  }
  if (await evaluate(`(async () => (await window.scrcpyStudio.getSessionState()).running)()`)) {
    socket.close()
    throw new Error('Use Stop Stream before UI tests; the live session was left untouched')
  }
  const saved = await evaluate(`({ theme: localStorage.getItem('scrcpy-studio:theme'), config: localStorage.getItem('scrcpy-studio:config') })`)
  try {
    await nav('Studio')
    assert.equal(await evaluate('document.title'), "Pepperon's GUI")
    assert.equal(await evaluate(`document.querySelector('.dashboard-header h1').textContent`), "Pepperon's GUI")
    assert.equal(await evaluate(`document.querySelector('.sidebar-brand strong').textContent`), "Pepperon's")
    for (const width of [1536, 1280, 1024, 390]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height:950, deviceScaleFactor:1, mobile:false })
      await delay(150)
      await nav('Studio')
      await checkDashboard(width)
      await nav('Video')
      for (const source of [1, 2]) {
        await click(`.settings-grid .segmented button:nth-child(${source})`)
        await checkSettings('Video')
      }
      await nav('Audio')
      await checkSettings('Audio')
      await checkGuide(width, width === 1536)
    }
    await send('Emulation.clearDeviceMetricsOverride')
    await nav('Studio')
    assert(await evaluate(`!document.querySelector('.titlebar, .sidebar-footer, .runtime-pill, .top-actions')`), 'Obsolete chrome remains')
    assert.equal(await evaluate(`document.querySelector('.global-search kbd').textContent`), 'CTRL + K')
    assert.equal(await evaluate(`document.querySelectorAll('.window-controls button').length`), 3)
    assert.equal(await evaluate(`document.querySelectorAll('select').length`), 0, 'Native dropdown remains')
    await key('k', 'KeyK', 75, 2)
    await wait(`document.activeElement?.getAttribute('aria-label') === 'Search commands'`, 'CTRL + K focus')
    await send('Input.insertText', { text: '--max-fps' })
    await wait(`document.querySelector('.option-row')?.innerText.includes('--max-fps')`, 'command search results')
    await key('k', 'KeyK', 75, 2)
    assert.equal(await evaluate(`document.activeElement.selectionEnd - document.activeElement.selectionStart`), 9)
    await key('Backspace', 'Backspace', 8)
    console.log('PASS header cleanup and CTRL + K search')

    await nav('Video')
    const codec = combo('Video codec')
    await click(codec)
    await wait(`Boolean(document.querySelector('[role="listbox"]'))`, 'codec popup')
    assert(await evaluate(`document.querySelector('[role="listbox"]').parentElement.classList.contains('app')`), 'Popup does not escape clipped cards')
    await key('End', 'End', 35)
    assert(await evaluate(`document.querySelector('[data-active="true"]').getAttribute('aria-disabled') === 'false'`), 'Keyboard focused a disabled option')
    await key('Home', 'Home', 36)
    await key('Enter', 'Enter', 13)
    assert.equal(await evaluate(`document.querySelector('${codec}').dataset.value`), 'h264')
    assert(!(await evaluate(`Boolean(document.querySelector('[role="listbox"]'))`)))
    await click(codec)
    const disabledValue = await evaluate(`document.querySelector('[role="option"][aria-disabled="true"]')?.dataset.value`)
    if (disabledValue) {
      await evaluate(`document.querySelector('[role="option"][data-value="${disabledValue}"]').click()`)
      assert.equal(await evaluate(`document.querySelector('${codec}').dataset.value`), 'h264')
    }
    await key('Escape', 'Escape', 27)
    await click(codec)
    await key('k', 'KeyK', 75, 2)
    await wait(`!document.querySelector('[role="listbox"]') && document.activeElement.getAttribute('aria-label') === 'Search commands'`, 'shortcut closes dropdown')
    await click(codec)
    await key('Tab', 'Tab', 9)
    assert(!(await evaluate(`Boolean(document.querySelector('[role="listbox"]'))`)))
    console.log('PASS dropdown selection, disabled options, Escape, Tab and keyboard navigation')

    for (const mode of ['light', 'dark']) {
      await nav('Appearance')
      await click(`.appearance-mode-label button:nth-child(${mode === 'light' ? 2 : 1})`)
      await wait(`document.querySelector('.app').classList.contains('theme-${mode}')`, `${mode} mode`)
      await checkHighlight(mode)
      await nav('Studio')
      await checkDashboard(await evaluate('innerWidth'))
      await nav('Video')
      await checkSettings('Video')
      await click(codec)
      const popup = await evaluate(`(() => { const e = document.querySelector('[role="listbox"]'); const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return { color:s.color,background:s.backgroundColor,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight } })()`)
      assert.notEqual(popup.color, popup.background)
      assert(popup.left >= 0 && popup.right <= popup.width && popup.top >= 0 && popup.bottom <= popup.height, 'Popup overflows viewport')
      console.log(`PASS ${mode} popup`, JSON.stringify(popup))
      await key('Escape', 'Escape', 27)
    }

    await send('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:false })
    await delay(150)
    assert(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), '390px horizontal overflow')
    assert(await evaluate(`getComputedStyle(document.querySelector('.mobile-menu')).display !== 'none'`))
    assert(await evaluate(`[...document.querySelectorAll('.window-controls button')].every(e => { const r=e.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth })`), 'Window controls hidden on narrow viewport')
    await click(codec)
    assert(await evaluate(`(() => { const r=document.querySelector('[role="listbox"]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight })()`))
    await key('Escape', 'Escape', 27)
    console.log('PASS 390px header and popup layout')
    console.log('RESULT interface tests passed')
  } finally {
    await send('Emulation.clearDeviceMetricsOverride').catch(() => undefined)
    await evaluate(`(() => { const saved=${JSON.stringify(saved)}; for (const key of ['theme','config']) { saved[key] === null ? localStorage.removeItem('scrcpy-studio:'+key) : localStorage.setItem('scrcpy-studio:'+key, saved[key]) } location.reload() })()`).catch(() => undefined)
    socket.close()
  }
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1 })
