# 🐾 Pepperon's GUI

> Your Android control room—minus the command-line scavenger hunt.

Pepperon's GUI turns scrcpy's enormous toolbox into a responsive desktop studio. Plug in a phone, pick your setup, press **Go live**, and start mirroring without memorizing a wall of flags.

```text
📱 Android device  →  🔌 ADB  →  🌶️ Pepperon's GUI  →  🖥️ scrcpy
```

## Why you might like it

- 🎛️ **Tweak without flag spelunking** — guided controls for video, audio, input, displays, recording, and more
- ⚡ **Change settings while you work** — eligible options apply live; startup-only changes restart cleanly
- 🎨 **Make it yours** — full dark/light themes, custom accents, Highlight color, surfaces, density, radius, and patterns
- 📡 **USB or wireless** — discover devices, pair ADB, enable TCP/IP, reconnect, and keep sessions moving
- 🧰 **Nothing hidden** — search every option reported by the installed scrcpy runtime
- 📐 **Big screen or tiny window** — the interface adapts from wide desktops down to 390 px

## Pick your flavor

| Preset | Personality | Good for |
| --- | --- | --- |
| **Balanced** | The sensible daily driver | Everyday mirroring |
| **Studio** | Crisp, polished, slightly fancy | Recording and presentation |
| **Low latency** | Fast fingers, fewer frills | Games and responsive control |
| **Wireless** | Cable-free and comfortable | Moving around without unplugging |

You can treat presets as a starting point and change absolutely everything afterward. Pepperon does not judge your bitrate choices.

## Launch sequence 🚀

```powershell
npm install
npm run dev
```

Then connect an Android device with USB debugging enabled. The app finds scrcpy on `PATH`, beside the app, through `SCRCPY_PATH`, or in its managed runtime folder.

On Windows, **Install Scrcpy** downloads the latest official package and verifies its GitHub-provided SHA-256 digest before unpacking it.

> **Does “Go live” broadcast me to the internet?** Nope. It starts a local scrcpy mirroring session on your PC. No surprise Twitch debut.

## Open the control-room doors

<details>
<summary><strong>🎥 Video and camera</strong></summary>

Choose display or camera capture, codec, encoder, bitrate, resolution, FPS, crop, camera facing, torch, and buffering. Device-reported capabilities help keep impossible combinations out of the way.

</details>

<details>
<summary><strong>🎧 Audio</strong></summary>

Control audio forwarding, source, codec, encoder, bitrate, buffer, and duplicate playback. Android-version support is detected and explained in the interface.

</details>

<details>
<summary><strong>🎮 Controls and display</strong></summary>

Configure keyboard, mouse, gamepad, clipboard, screen power, orientation, virtual displays, window geometry, and other interaction options. View-only sessions still route eligible controls through ADB.

</details>

<details>
<summary><strong>⏺️ Recording and sessions</strong></summary>

Pick the destination, format, playback behavior, and time limit. The dashboard shows process state, PID, generation, duration, reconnect progress, structured logs, and recording-safe restarts.

</details>

<details>
<summary><strong>⌨️ Every command</strong></summary>

Press **CTRL + K** and search the complete command catalog. The command preview shows the exact argument array Pepperon's GUI plans to run—no shell string tricks hiding behind the curtain.

</details>

## Build an installer

```powershell
npm run build
npm run dist
```

`npm run build` creates the renderer in `dist/`. `npm run dist` creates the Windows installer in `release/`.

## Verification lab 🧪

With the debug app running and mirroring stopped:

```powershell
npm run build
npm run start:debug
npm run test:ui
npm run test:guide
```

The interface suite checks branding, CTRL + K, custom dropdowns, both color modes, Highlight reactivity, responsive layouts, compact session controls, and equal-height card alignment.

For the real-device obstacle course:

```powershell
npm run test:device
```

That test requires one authorized Android device. It exercises capability discovery, a real mirror launch, automatic restart coalescing, direct ADB changes, clean shutdown, setting restoration, and the 390 px layout.

## Privacy and project status

Mirroring and device control stay local between your computer, ADB, scrcpy, and the connected Android device. Network access may be used to load interface fonts, check or download the latest official scrcpy release, and open links you choose.

Pepperon's GUI is an independent community project. It uses the official [Genymobile scrcpy](https://github.com/Genymobile/scrcpy) runtime but is not affiliated with or endorsed by Genymobile.

Found a bug, invented a wild setup, or have an idea that would make Pepperon purr? [Open an issue](https://github.com/PepperonGranma/Pepperons-GUI/issues).
