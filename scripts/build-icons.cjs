// Export the existing CSS CatMark, rather than redraw or replace its visual identity.
// Run with npm run build:icons. The committed assets let normal builds stay offline.
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'build')
// Deterministic software rasterization also works on headless Windows build hosts.
app.disableHardwareAcceleration()
// The exporter must never open or modify the user's GUI profile.
app.setPath('userData', path.join(root, '.cache', 'icon-export'))

app.whenReady().then(async () => {
  const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8')
  const appSource = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  const themeSource = fs.readFileSync(path.join(root, 'src/options.ts'), 'utf8')
  const catCss = css.slice(css.indexOf('.cat-mark {'), css.indexOf('\n.sidebar {'))
  assert(catCss.startsWith('.cat-mark {') && catCss.includes('.cat-face b'), 'CatMark styles were not found')
  const markup = appSource.match(/return <div className=\{`cat-mark[^\n]+?(<span className="cat-ear[^\n]+?)<\/div>/)?.[1]
  assert(markup, 'CatMark markup was not found')
  const defaultTheme = themeSource.slice(themeSource.indexOf('export const DEFAULT_THEME'))
  const accent = defaultTheme.match(/accent: '(#[a-f\d]{6})'/i)?.[1]
  const mint = defaultTheme.match(/mint: '(#[a-f\d]{6})'/i)?.[1]
  assert(accent && mint, 'Default brand colors were not found')
  const htmlMarkup = markup.replace(/className=/g, 'class=').replace(/<(span|i|b)([^>]*?)\s*\/>/g, '<$1$2></$1>')
  const window = new BrowserWindow({
    width: 512, height: 512, useContentSize: true, show: false, frame: false,
    transparent: true, backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>
    *{box-sizing:border-box} html,body{margin:0;width:512px;height:512px;background:transparent;overflow:hidden}
    body{display:grid;place-items:center;--accent:${accent};--mint:${mint}}
    ${catCss}
    .cat-mark{transform:scale(8);transform-origin:center}
  </style></head><body><div class="cat-mark">${htmlMarkup}</div></body></html>`)}`)
  await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  const captured = await window.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 }, { stayHidden: true, stayAwake: true })
  assert(!captured.isEmpty(), 'Icon export produced an empty image')
  const master = captured.resize({ width: 512, height: 512, quality: 'best' })
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const images = sizes.map(size => master.resize({ width: size, height: size, quality: 'best' }).toPNG())
  const header = Buffer.alloc(6 + 16 * sizes.length)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  let offset = header.length
  images.forEach((image, index) => {
    const entry = 6 + 16 * index
    header[entry] = sizes[index] === 256 ? 0 : sizes[index]
    header[entry + 1] = header[entry]
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(image.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += image.length
  })
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(path.join(output, 'icon.png'), master.toPNG())
  fs.writeFileSync(path.join(output, 'icon.ico'), Buffer.concat([header, ...images]))
  console.log(`Exported existing CatMark: 512px PNG and ICO sizes ${sizes.join(', ')}`)
  window.destroy()
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
