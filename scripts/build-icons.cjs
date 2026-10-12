// Export the project mark (src/assets/pepperon.webp) to the Windows icon formats.
// The drawing is used as is: scaled to fit, never redrawn, recoloured or cropped.
// Run with npm run build:icons. The committed assets let normal builds stay offline.
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'build')
const source = path.join(root, 'src', 'assets', 'pepperon.webp')
// Deterministic software rasterization also works on headless Windows build hosts.
app.disableHardwareAcceleration()
// The exporter must never open or modify the user's GUI profile.
app.setPath('userData', path.join(root, '.cache', 'icon-export'))

app.whenReady().then(async () => {
  const image = fs.readFileSync(source)
  assert(image.subarray(0, 4).toString('latin1') === 'RIFF' && image.subarray(8, 12).toString('latin1') === 'WEBP', 'The project mark is not a WebP image')
  const window = new BrowserWindow({
    width: 512, height: 512, useContentSize: true, show: false, frame: false,
    transparent: true, backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>
    html,body{margin:0;width:512px;height:512px;background:transparent;overflow:hidden}
    img{display:block;width:512px;height:512px;object-fit:contain;image-rendering:auto}
  </style></head><body><img id="mark" src="data:image/webp;base64,${image.toString('base64')}"></body></html>`)}`)
  const natural = await window.webContents.executeJavaScript(`(async () => { const mark = document.getElementById('mark'); await mark.decode(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return [mark.naturalWidth, mark.naturalHeight] })()`)
  assert(natural[0] > 0 && natural[1] > 0, 'The project mark could not be decoded')
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
  console.log(`Exported the project mark (${natural.join('x')} source): 512px PNG and ICO sizes ${sizes.join(', ')}`)
  window.destroy()
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
