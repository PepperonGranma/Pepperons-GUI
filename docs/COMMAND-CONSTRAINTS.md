# scrcpy command constraints

The All Commands metadata deliberately separates two facts:

- **scrcpy CLI constraints** are values accepted by scrcpy's local argument parser.
- **Device capability** is what the connected Android device, camera, display, or
  encoder can actually support. It may be narrower.

`electron/command-constraints.mjs` is the single source used by both command-card
validation and Electron IPC validation. It currently describes **scrcpy 4.1, 5.0 and
5.0.1** (`AUDITED_VERSIONS`). The installed version comes from `scrcpy --version`; an
unreviewed version does not receive these range claims. Runtime command names, descriptions, and defaults
continue to come from that installation's `scrcpy --help` output where available.

## 4.1 parser audit

Every explicit numeric bound in the 4.1 desktop CLI parser is represented:

| Arguments | Parser rule |
| --- | --- |
| `--video-bit-rate`, `--audio-bit-rate` | 0–2,147,483,647 bit/s; K/M decimal multipliers |
| `--max-size`, `--window-width`, `--window-height` | 0–65,535 |
| `--min-size-alignment` | powers of two from 1–16: 1, 2, 4, 8, 16 |
| `--video-buffer`, `--audio-buffer`, `--v4l2-buffer` | 0–3,600,000 ms |
| `--audio-output-buffer` | 0–1,000 ms |
| `--window-x`, `--window-y` | -32,767–32,767, or `auto` |
| `--port`, `--tunnel-port` | 0–65,535 per port |
| `--display-id` | 0–2,147,483,647 |
| `--camera-fps` | 0–65,535 |
| `--time-limit` | 0–2,147,483,647 seconds |
| `--screen-off-timeout` | 0–2,147,483 seconds |

Discrete orientation values are also stored in this schema so their cards and IPC
share one rule. The audit intentionally adds no min/max for `--max-fps`, `--angle`,
`--camera-zoom`, `--camera-size`, `--crop`, or `--new-display`: scrcpy 4.1 does not
apply an explicit numeric bound to those values in its desktop CLI parser.

## 5.0 and 5.0.1 parser audit

Between the `v4.1` and `v5.0.1` tags, `cli.c`, `util/str.c`, `options.c` and `options.h`
change only to add `--hwdec` (plus two `const` qualifiers), so every numeric rule in
the table above carries over unchanged. `--hwdec` is an enumeration, not a range:

| Argument | Parser rule |
| --- | --- |
| `--hwdec` | `auto` (default), `disabled`, `vaapi` (Linux builds), `d3d11va` (Windows builds), `videotoolbox` (macOS builds) |

A decoder other than `auto` or `disabled` is rejected together with `--no-video`,
`--no-playback`, `--no-video-playback`, `--no-window` ("Hardware decoding requires video
playback") or `--v4l2-sink` ("not compatible with V4L2"). `electron/scrcpy-args.mjs`
mirrors both rules, and `platformIssue()` refuses a decoder that the current operating
system's build does not include.

Sources: [`cli.c` at v5.0.1](https://github.com/Genymobile/scrcpy/blob/v5.0.1/app/src/cli.c),
[the v4.1…v5.0.1 comparison](https://github.com/Genymobile/scrcpy/compare/v4.1...v5.0.1), and
[`doc/video.md`](https://github.com/Genymobile/scrcpy/blob/v5.0.1/doc/video.md#hardware-decoding).

## 4.1 sources

Sources: [scrcpy 4.1 `cli.c`](https://github.com/Genymobile/scrcpy/blob/v4.1/app/src/cli.c),
[`str.c`](https://github.com/Genymobile/scrcpy/blob/v4.1/app/src/util/str.c), and
[`options.c`](https://github.com/Genymobile/scrcpy/blob/v4.1/app/src/options.c).

## Updating

For a new scrcpy version, diff its tagged parser source against the last audited tag.
If the numeric rules are unchanged, add the version to `AUDITED_VERSIONS`; otherwise
add a version-specific metadata selection. Extend `test/scrcpy-args.test.mjs` and
`scripts/test-command-constraints.cjs` either way. Never infer a
range from help prose and never label a parser maximum as an encoder or device maximum.
