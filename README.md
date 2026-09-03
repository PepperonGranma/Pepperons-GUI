# Pepperon's GUI

A responsive, capability-aware Electron desktop GUI for controlling scrcpy mirroring, recording, audio, display, input, and ADB workflows from one interface.

Pepperon's GUI is an independent community project. It uses the official [Genymobile scrcpy](https://github.com/Genymobile/scrcpy) runtime but is not affiliated with or endorsed by Genymobile.

Appearance includes complete light and dark modes, customizable primary and secondary accents, an independent Highlight color, panel surfaces, density, corner radius, and background-pattern controls. Existing settings and profiles are retained under the original internal storage identifier.

## Highlights

- Full guided controls plus a searchable registry of every option reported by the installed scrcpy runtime
- USB and wireless ADB discovery, pairing, TCP/IP mode, reconnect handling, and device capability probing
- Video, camera, audio, display, input, recording, and live-session configuration
- Reactive command previews, automatic live-setting application, profiles, logs, and responsive layouts
- Fully customizable dark and light themes with accessible, keyboard-friendly custom dropdowns

## Requirements

- Node.js and npm for development
- An Android device with USB debugging enabled, or a device reachable over wireless ADB
- scrcpy on `PATH`, a manually selected executable, or the managed Windows runtime installed by the app

## Run locally

```powershell
npm install
npm run dev
```

The app detects Scrcpy on `PATH`, beside the app, from `SCRCPY_PATH`, or from its managed runtime folder. On Windows, **Install Scrcpy** downloads the latest official win64/win32 release and verifies the GitHub-provided SHA-256 digest before unpacking it.

## Build

```powershell
npm run build
npm run dist
```

`npm run build` creates the renderer in `dist/`. `npm run dist` also creates a Windows installer in `release/`.

## Included controls

- USB and Wi-Fi device discovery, authorization state, pairing, TCP/IP mode, and reconnect handling
- Cached hardware, Android, display, refresh-rate, density, encoder, audio, and camera capability probing
- Video, audio, camera, display, window, input, recording, and session controls
- A searchable registry sourced from the installed runtime, with a Scrcpy 4.1 fallback catalog
- Automatic apply: direct ADB changes for eligible live settings and a debounced, serialized restart for startup-only arguments
- Valid view-only sessions: show-touches, keep-awake, and screen-power preferences are routed through ADB when `--no-control` is active, avoiding invalid Scrcpy flag combinations
- Recording-safe restarted segments, explicit applying/restarting/reconnecting states, retry, and stale-process protection
- Auto-start when a device appears and optional reconnection when the selected device returns
- Live argument preview, process PID/generation/duration, structured logs, profiles, and fully customizable theme tokens
- Wide desktop, tablet, and 390 px narrow layouts without horizontal overflow
- An animated Device Link card spanning both desktop overview rows, with six status cards alongside and equal-height lower card pairs
- Synchronized Go live / stop controls in the dashboard header and a compact button inside Device Link, retaining the phone artwork and live-session animation
- Equal-height settings cards across Video, Audio, and other two-column settings pages
- A single draggable header with native minimize, maximize/restore, and close controls
- CTRL + K focuses and selects command search; typing searches across every command category
- Theme-aware custom dropdowns with keyboard navigation, type-ahead, disabled-option handling, and viewport-aware popup placement
- A Quick Starter Guide anchored at the bottom of the sidebar, with setup steps, page shortcuts, and connection troubleshooting

The Electron bridge uses context isolation and passes Scrcpy options as an argument array without a shell.

## Privacy

Mirroring and device control happen locally between the computer, ADB, scrcpy, and the connected Android device. Network access may be used to load the interface fonts, check or download the latest official scrcpy release, and open explicitly selected project links.

## Connected-device verification

Build the renderer, start Electron with its local debugging endpoint, and run the deterministic device test from a second terminal:

```powershell
npm run build
npm run start:debug
npm run test:device
```

The test requires one authorized Android device. It verifies capability data, a real mirror launch, one coalesced automatic restart after rapid codec/FPS/bitrate changes, direct ADB apply without a restart, clean stop, setting restoration, and the 390 px responsive breakpoint.

## Interface verification

With the debug app running and mirroring stopped, run `npm run test:ui` to check branding, CTRL + K, custom dropdowns, both color modes, Highlight reactivity, compact Go live buttons, and dashboard/settings-card alignment at desktop and narrow widths. The UI test restores the saved theme and configuration afterward.

Run `npm run test:guide` to verify the Starter Guide, its pinned sidebar button, all page shortcuts, troubleshooting accordions, and responsive layouts without changing stream settings.
