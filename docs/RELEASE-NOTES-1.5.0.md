# Pepperon GUI 1.5.0

Pepperon has a new face, a new name tag, and a much bigger bag of tricks.

## Highlights

- **New name and icon.** The app is now **Pepperon GUI**, and the icon and in-app
  mascot are the maintainer's own drawing.
- **scrcpy 5.0.1.** Hardware video decoding (`--hwdec`) with a setting under
  Video → Encoding, an in-app runtime update notice, and parser metadata audited for
  4.1, 5.0 and 5.0.1.
- **Suggested setups.** With a device connected, the Studio page offers six setups
  chosen from that device's display, encoders, Android version and connection: best
  match, lowest latency, highest quality, streaming, recording, and smooth-and-light.
- **Redesigned interface.** Readable type sizes, higher-contrast secondary text, a
  dashboard hero with at-a-glance chips, system fonts, and page shortcuts (Ctrl+1–9).
- **Motion you control.** Aurora backdrop, a 3D device that leans toward the pointer,
  card spotlights and press ripples — adjustable or off under Appearance → Motion &
  effects, and always off when Windows asks for reduced motion.
- **New startup screen and self-playing tour.** The loader shows real startup
  progress; the feature tour can play by itself and shows each page behind its card.
- **System tray.** Optional minimize-to-tray and close-to-tray, with Stop Mirroring
  and Quit in the tray menu.
- **Profiles.** In-place rename, plus export and import.
- **Safer everyday behavior.** Fields commit on blur, Enter or a typing pause instead
  of restarting a live session on every keystroke; inline validation on guided pages;
  copied commands quote values with spaces; Ctrl+= zooms back in.
- **Clearer failures.** AOA input and platform-only decoders are refused with an
  explanation before launch; scrcpy's own errors appear as errors in the activity log.
- **Runtime install hardening.** Network timeouts, a staged swap with rollback, and
  cleanup of the previous runtime.

## Upgrade notes

The application ID and the `scrcpy-studio` settings folder are unchanged, so saved
settings, profiles and the installed scrcpy runtime carry over. The Start menu and
desktop shortcuts are renamed from "Pepperon's GUI" to "Pepperon GUI".

## Release notes

This is an unsigned Windows x64 build. Windows may show a publisher or SmartScreen
warning; verify the installer SHA-256 published with this release before running it.
Mirroring and device control stay local. A GitHub request checks the latest official
scrcpy version; downloading a runtime or opening an external link requires a user
action.

## Windows installer

- File: `Pepperon GUI Setup 1.5.0.exe`
- Size: `121,573,559 bytes`
- SHA-256: `5ec5493f6407a24986d7a4272f349b02a6d9044ef2b0655e4cfcd46cefd20754`
