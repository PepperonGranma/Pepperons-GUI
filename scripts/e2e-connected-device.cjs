const { setTimeout: delay } = require('node:timers/promises');

const DEBUG_URL = process.env.SCRCPY_STUDIO_DEBUG_URL || 'http://127.0.0.1:9222';
const WAIT_MS = 30_000;
const SESSION_WAIT_MS = 90_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitFor(evaluate, expression, label, timeout = WAIT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await evaluate(expression);
    if (value) return value;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function main() {
  const targets = await (await fetch(`${DEBUG_URL}/json`)).json();
  const target = targets.find((item) => item.type === 'page' && item.title.replace(/&#39;/g, "'") === "Pepperon's GUI");
  assert(target?.webSocketDebuggerUrl, "The Pepperon's GUI renderer is not available");

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  console.log('CDP connected');

  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', async (event) => {
    const raw = typeof event.data === 'string'
      ? event.data
      : Buffer.from(await event.data.arrayBuffer()).toString('utf8');
    const message = JSON.parse(raw);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP request timed out: ${method}`));
    }, WAIT_MS);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || 'Renderer evaluation failed');
    }
    return response.result.value;
  };

  const bodyText = () => evaluate('document.body.innerText');
  const clickButton = (text) => evaluate(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((item) => item.innerText.trim() === ${JSON.stringify(text)});
    if (!button) return false;
    button.click();
    return true;
  })()`);
  const clickSessionButton = (insideDeviceLink = false) => evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(insideDeviceLink ? '.connection-go-live' : '.dashboard-header .session-button')});
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  const readPid = () => evaluate(`(() => {
    const match = document.body.innerText.match(/PID\\s+(\\d+)/i);
    return match ? Number(match[1]) : null;
  })()`);
  const selectOption = async (label, value) => {
    const opened = await evaluate(`(() => {
      const trigger = [...document.querySelectorAll('[role="combobox"]')].find((item) => item.getAttribute('aria-label') === ${JSON.stringify(label)});
      if (!trigger || trigger.disabled) return false;
      trigger.click();
      return true;
    })()`);
    assert(opened, `Missing dropdown: ${label}`);
    await waitFor(evaluate, `Boolean(document.querySelector('[role="listbox"]'))`, `${label} menu`);
    assert(await evaluate(`(() => {
      const option = [...document.querySelectorAll('[role="option"]')].find((item) => item.dataset.value === ${JSON.stringify(value)} && item.getAttribute('aria-disabled') !== 'true');
      if (!option) return false;
      option.click();
      return true;
    })()`), `Missing available option: ${label}=${value}`);
  };

  await send('Runtime.enable');
  const originalConfig = await evaluate(`localStorage.getItem('scrcpy-studio:config')`);
  try {
  const prepared = await evaluate(`(() => {
    const config = JSON.parse(localStorage.getItem('scrcpy-studio:config') || '{}');
    if (!config.recordingEnabled || config.recordPath) return false;
    config.recordingEnabled = false;
    localStorage.setItem('scrcpy-studio:config', JSON.stringify(config));
    location.reload();
    return true;
  })()`);
  if (prepared) {
    await waitFor(evaluate, `document.readyState === 'complete' && !document.querySelector('.startup-loader')`, 'the safe test-configuration reload');
  }
  assert(await clickButton('Studio'), 'Studio navigation button was not found');
  await waitFor(evaluate, `Boolean(document.querySelector('.session-button'))`, 'the Studio session controls');
  const initialText = await waitFor(
    evaluate,
    `document.body.innerText.includes('Connected device')`,
    'an authorized connected device',
    30_000,
  );
  assert(initialText, 'No authorized connected device was rendered');
  if (process.env.SCRCPY_TEST_SERIAL) {
    await selectOption('Android device', process.env.SCRCPY_TEST_SERIAL);
    await waitFor(evaluate, `document.querySelector('[role="combobox"][aria-label="Android device"]')?.dataset.value === ${JSON.stringify(process.env.SCRCPY_TEST_SERIAL)} && !document.body.innerText.includes('Inspecting device')`, 'the explicitly selected test device');
  }

  if ((await bodyText()).includes('Stop Stream')) {
    assert(await clickSessionButton(), 'Could not reset the pre-existing mirror session');
    await waitFor(evaluate, `document.body.innerText.includes('Go live')`, 'the initial stopped state');
  }

  const deviceSummary = await evaluate(`(async () => {
    const text = document.body.innerText;
    const runtime = await window.scrcpyStudio.getRuntimeStatus();
    return {
      title: document.title,
      runtime: runtime.installedVersion,
      android: text.match(/Android \\d+/)?.[0] || null,
      resolution: text.match(/\\d+ × \\d+/)?.[0] || null,
    };
  })()`);
  assert(deviceSummary.title === "Pepperon's GUI", 'Unexpected renderer title');
  assert(deviceSummary.runtime, 'The scrcpy runtime version was not available');
  assert(deviceSummary.android, 'Android capability metadata was not rendered');
  assert(deviceSummary.resolution, 'Display capability metadata was not rendered');
  console.log('CAPABILITIES', JSON.stringify(deviceSummary));

  if (process.env.SCRCPY_START_REGRESSION === '1') {
    assert(await clickButton('Controls'), 'Controls navigation button was not found');
    await waitFor(evaluate, `document.body.innerText.includes('Master control')`, 'the Controls page');
    await evaluate(`(() => {
      const setSwitch = (text, checked) => {
        const label = [...document.querySelectorAll('label')].find((item) => item.innerText.includes(text));
        const input = label?.querySelector('input[type="checkbox"]');
        if (!input) throw new Error('Missing switch: ' + text);
        if (input.checked !== checked) input.click();
      };
      setSwitch('Control the device', false);
      setSwitch('Show touches', true);
      setSwitch('Keep device awake', true);
      setSwitch('Turn screen off on start', true);
      setSwitch('Power off on close', false);
      return true;
    })()`);
    await delay(350);
    assert(await clickButton('Studio'), 'Studio navigation button was not found');
    await waitFor(evaluate, `document.body.innerText.includes('Latest desired config') || document.body.innerText.includes('LATEST DESIRED CONFIG')`, 'the Studio page');
    const desiredCommand = await bodyText();
    console.log('DESIRED_COMMAND', desiredCommand.match(/scrcpy --serial=[^\n]+/)?.[0] || 'not found');
    assert(desiredCommand.includes('--no-control'), 'The saved view-only configuration was not loaded');
    for (const incompatible of ['--show-touches', '--stay-awake', '--turn-screen-off', '--power-off-on-close']) {
      assert(!desiredCommand.includes(incompatible), `View-only command still contains incompatible ${incompatible}`);
    }
    assert(await clickSessionButton(true), 'Device Link Go live button was not found');
    await waitFor(evaluate, `document.body.innerText.includes('Stop Stream') && document.body.innerText.includes('Mirroring active')`, 'an active view-only session', SESSION_WAIT_MS);
    const regressionPid = await readPid();
    assert(regressionPid, 'The view-only session did not report a PID');
    console.log('VIEW_ONLY_START_FIXED', regressionPid);
    assert(await clickSessionButton(), 'Stop Stream button was not found');
    await waitFor(evaluate, `document.body.innerText.includes('Go live') && document.body.innerText.includes('No active mirror process')`, 'a clean regression-test stop');
    assert(await clickButton('Controls'), 'Controls navigation button was not found during cleanup');
    await waitFor(evaluate, `document.body.innerText.includes('Master control')`, 'the Controls page during cleanup');
    await evaluate(`(() => {
      const label = [...document.querySelectorAll('label')].find((item) => item.innerText.includes('Show touches'));
      const input = label?.querySelector('input[type="checkbox"]');
      if (input?.checked) input.click();
      return true;
    })()`);
    await delay(500);
    assert(await clickButton('Studio'), 'Studio navigation button was not found during cleanup');
    console.log('RESULT start-mirroring regression test passed');
    return;
  }

  const probedCapabilities = await evaluate(`(async () => {
    const serial = document.querySelector('[role="combobox"][aria-label="Android device"]')?.dataset.value;
    const details = await window.scrcpyStudio.getDeviceCapabilities(serial, true);
    return {
      videoCodecs: details.video.codecs,
      audioCodecs: details.audio.codecs,
      cameras: details.camera.cameras.length,
      warnings: details.warnings,
    };
  })()`);
  console.log('PROBED_DETAILS', JSON.stringify(probedCapabilities));

  const offlineLiveAudit = await evaluate(`(async () => {
    const count = () => (document.body.innerText.match(/Applied showTouches directly through ADB/g) || []).length;
    const label = [...document.querySelectorAll('label')].find((item) => item.innerText.includes('Show touches'));
    const input = label?.querySelector('input[type="checkbox"]');
    if (!input) throw new Error('Show touches control was not found for the offline audit');
    const original = input.checked;
    const before = count();
    input.click();
    await new Promise((resolve) => setTimeout(resolve, 700));
    const after = count();
    input.click();
    await new Promise((resolve) => setTimeout(resolve, 700));
    return { before, after, restored: input.checked === original };
  })()`);
  assert(offlineLiveAudit.after === offlineLiveAudit.before, 'An offline setting change was sent to the device through ADB');
  assert(offlineLiveAudit.restored, 'Offline setting audit did not restore the original GUI value');
  console.log('OFFLINE_SETTINGS_STAGED', JSON.stringify(offlineLiveAudit));

  await evaluate(`(() => {
    const setToggle = (text, checked) => {
      const label = [...document.querySelectorAll('label')].find((item) => item.innerText.includes(text));
      const input = label?.querySelector('input[type="checkbox"]');
      if (input && input.checked !== checked) input.click();
    };
    setToggle('Physical screen off', false);
    setToggle('Show touches', false);
    return true;
  })()`);
  await delay(500);

  assert(await clickSessionButton(true), 'Device Link Go live button was not found');
  await waitFor(evaluate, `document.body.innerText.includes('Stop Stream') && document.body.innerText.includes('Mirroring active')`, 'an active scrcpy session', SESSION_WAIT_MS);
  assert(await evaluate(`[...document.querySelectorAll('.session-button')].every(button => button.textContent.trim() === 'Stop Stream')`), 'Both session buttons must show the active action');
  const firstPid = await waitFor(evaluate, `(() => document.body.innerText.match(/PID\\s+(\\d+)/i)?.[1] || null)()`, 'the first scrcpy PID');
  console.log('STARTED', firstPid);

  const original = await evaluate(`(() => ({
    codec: document.querySelector('[role="combobox"][aria-label="Codec"]')?.dataset.value,
    fps: [...document.querySelectorAll('label.field')].find((item) => item.querySelector(':scope > span')?.innerText.trim() === 'Max FPS')?.querySelector('input')?.value,
    bitrate: [...document.querySelectorAll('label.field')].find((item) => item.querySelector(':scope > span')?.innerText.trim() === 'Bitrate')?.querySelector('input')?.value,
  }))()`);
  console.log('ORIGINAL_CONTROLS', JSON.stringify(original));
  assert(original.codec && original.fps && original.bitrate, 'Quick video controls were not found');

  await selectOption('Codec', 'h265');
  await evaluate(`(() => {
    const setInput = (label, value) => {
      const input = [...document.querySelectorAll('label.field')]
        .find((item) => item.querySelector(':scope > span')?.innerText.trim() === label)
        ?.querySelector('input');
      if (!input) throw new Error('Missing input: ' + label);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setInput('Max FPS', '90');
    setInput('Bitrate', '12M');
    return true;
  })()`);

  await waitFor(
    evaluate,
    `document.body.innerText.includes('--video-codec=h265') && document.body.innerText.includes('--max-fps=90') && document.body.innerText.includes('--video-bit-rate=12M')`,
    'the coalesced desired command',
  );
  const secondPid = await waitFor(
    evaluate,
    `(() => { const pid = Number(document.body.innerText.match(/PID\\s+(\\d+)/i)?.[1]); return pid && pid !== ${Number(firstPid)} ? pid : null; })()`,
    'the automatically restarted scrcpy process',
  );
  assert(Number(secondPid) !== Number(firstPid), 'Startup-only changes did not restart scrcpy');
  console.log('AUTO_APPLY_RESTART', `${firstPid} -> ${secondPid}`);

  const livePidBefore = await readPid();
  await evaluate(`(() => {
    const label = [...document.querySelectorAll('label')].find((item) => item.innerText.includes('Show touches'));
    const input = label?.querySelector('input[type="checkbox"]');
    if (!input) throw new Error('Show touches control was not found');
    if (!input.checked) input.click();
    return true;
  })()`);
  await waitFor(evaluate, `document.body.innerText.includes('Applied showTouches directly through ADB')`, 'direct ADB live-setting application');
  await delay(400);
  const livePidAfter = await readPid();
  assert(livePidAfter === livePidBefore, 'A direct ADB setting unexpectedly restarted scrcpy');
  console.log('LIVE_ADB_NO_RESTART', livePidAfter);

  await evaluate(`(() => {
    const label = [...document.querySelectorAll('label')].find((item) => item.innerText.includes('Show touches'));
    const input = label?.querySelector('input[type="checkbox"]');
    if (input?.checked) input.click();
    return true;
  })()`);
  await delay(500);

  await selectOption('Codec', original.codec);
  await evaluate(`(() => {
    const setInput = (label, value) => {
      const input = [...document.querySelectorAll('label.field')]
        .find((item) => item.querySelector(':scope > span')?.innerText.trim() === label)
        ?.querySelector('input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setInput('Max FPS', ${JSON.stringify('PLACEHOLDER_FPS')});
    setInput('Bitrate', ${JSON.stringify('PLACEHOLDER_BITRATE')});
    return true;
  })()`
    .replace('PLACEHOLDER_FPS', original.fps)
    .replace('PLACEHOLDER_BITRATE', original.bitrate));

  await waitFor(evaluate, `document.body.innerText.includes('--max-fps=${original.fps}') && document.body.innerText.includes('--video-bit-rate=${original.bitrate}')`, 'the restored command');
  await waitFor(evaluate, `document.body.innerText.includes('Stop Stream') && document.body.innerText.includes('Mirroring active')`, 'the restored active session');

  assert(await clickSessionButton(true), 'Device Link stop button was not found');
  await waitFor(evaluate, `document.body.innerText.includes('Go live') && document.body.innerText.includes('No active mirror process')`, 'a clean stopped state');
  console.log('STOPPED cleanly');

  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(250);
  const responsive = await evaluate(`(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    mobileMenu: getComputedStyle(document.querySelector('.mobile-menu')).display,
    sidebarPosition: getComputedStyle(document.querySelector('.sidebar')).position,
    appMargin: getComputedStyle(document.querySelector('.app-shell')).marginLeft,
  }))()`);
  assert(responsive.width === 390, 'Narrow viewport emulation did not apply');
  assert(responsive.mobileMenu !== 'none', 'Mobile navigation control is hidden at 390px');
  assert(responsive.sidebarPosition === 'fixed', 'Sidebar did not become a narrow-screen drawer');
  assert(responsive.scrollWidth <= 390, `Narrow layout overflows horizontally (${responsive.scrollWidth}px)`);
  console.log('RESPONSIVE_390PX', JSON.stringify(responsive));
  await send('Emulation.clearDeviceMetricsOverride');
  console.log('RESULT connected-device end-to-end test passed');
  } finally {
    await evaluate(`(async () => {
      await window.scrcpyStudio.stop().catch(() => undefined);
      const original = ${JSON.stringify('CONFIG_PLACEHOLDER')};
      if (original === null) localStorage.removeItem('scrcpy-studio:config');
      else localStorage.setItem('scrcpy-studio:config', original);
      location.reload();
    })()` .replace(JSON.stringify('CONFIG_PLACEHOLDER'), JSON.stringify(originalConfig))).catch(() => undefined);
    await delay(3500);
    socket.close();
  }
}

main().catch((error) => {
  console.error('RESULT failed');
  console.error(error.stack || error);
  process.exit(1);
});
