const assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')

const DEBUG_URL = process.env.SCRCPY_STUDIO_DEBUG_URL || 'http://127.0.0.1:9222'
const MODE = process.argv[2]
const BACKUP_KEY = 'scrcpy-studio:test-profile-relaunch-backup'
const MARKER_ID = 'pepperon-full-relaunch-proof'

async function main() {
  assert(['stage', 'verify'].includes(MODE), 'Use: node scripts/e2e-profile-relaunch.cjs stage|verify')
  const targets = await (await fetch(`${DEBUG_URL}/json`)).json()
  const target = targets.find((item) => item.type === 'page' && item.title.replace(/&#39;/g, "'") === "Pepperon's GUI")
  assert(target?.webSocketDebuggerUrl, "Start Pepperon's GUI with remote debugging first")
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let id = 0
  const pending = new Map()
  socket.addEventListener('message', async (event) => {
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(await event.data.arrayBuffer()).toString()
    const message = JSON.parse(raw)
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result)
  })
  const evaluate = (expression) => new Promise((resolve, reject) => {
    const requestId = ++id
    pending.set(requestId, {
      resolve: (result) => result.exceptionDetails ? reject(new Error(result.exceptionDetails.exception?.description || 'Renderer evaluation failed')) : resolve(result.result.value),
      reject,
    })
    socket.send(JSON.stringify({ id: requestId, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
  })
  if (MODE === 'stage') {
    const staged = await evaluate(`(() => {
      const original=localStorage.getItem('scrcpy-studio:profiles');
      if(localStorage.getItem(${JSON.stringify(BACKUP_KEY)})!==null) throw new Error('A previous relaunch probe was not restored');
      localStorage.setItem(${JSON.stringify(BACKUP_KEY)},JSON.stringify({original}));
      let profiles=[]; try { profiles=JSON.parse(original||'[]') } catch {}
      profiles=Array.isArray(profiles)?profiles.filter(item=>item?.id!==${JSON.stringify(MARKER_ID)}):[];
      profiles.push({id:${JSON.stringify(MARKER_ID)},name:'Full Relaunch Proof',description:'Temporary persistence probe',updatedAt:Date.now(),config:{}});
      localStorage.setItem('scrcpy-studio:profiles',JSON.stringify(profiles));
      return {marker:${JSON.stringify(MARKER_ID)},count:profiles.length};
    })()`)
    console.log('STAGED profile relaunch probe', JSON.stringify(staged))
  } else {
    const verified = await evaluate(`(() => {
      const backup=JSON.parse(localStorage.getItem(${JSON.stringify(BACKUP_KEY)})||'null');
      if(!backup) throw new Error('Relaunch probe backup is missing');
      const profiles=JSON.parse(localStorage.getItem('scrcpy-studio:profiles')||'[]');
      const found=Array.isArray(profiles)&&profiles.some(item=>item?.id===${JSON.stringify(MARKER_ID)});
      if(backup.original===null)localStorage.removeItem('scrcpy-studio:profiles');else localStorage.setItem('scrcpy-studio:profiles',backup.original);
      localStorage.removeItem(${JSON.stringify(BACKUP_KEY)});
      return {found,restored:localStorage.getItem('scrcpy-studio:profiles')===backup.original};
    })()`)
    assert(verified.found, 'Staged profile did not survive a full Electron restart')
    assert(verified.restored, 'Original profile payload was not restored exactly')
    console.log('PASS full Electron profile persistence and exact restoration', JSON.stringify(verified))
  }
  await delay(1_500)
  await evaluate(`(() => { const close=document.querySelector('.window-controls button[aria-label="Close"]'); if(!close)return false; setTimeout(()=>close.click(),100); return true })()`)
  socket.close()
}

main().catch((error) => {
  console.error('RESULT failed')
  console.error(error.stack || error)
  process.exit(1)
})
