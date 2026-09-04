# scrcpy command constraints

The All Commands metadata deliberately separates two facts:

- **scrcpy CLI constraints** are values accepted by scrcpy's local argument parser.
- **Device capability** is what the connected Android device, camera, display, or
  encoder can actually support. It may be narrower.

`electron/command-constraints.mjs` is the single source used by both command-card
validation and Electron IPC validation. It currently describes **scrcpy 4.1** only.
The installed version comes from `scrcpy --version`; an unreviewed future version
does not receive 4.1 range claims. Runtime command names, descriptions, and defaults
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

Sources: [scrcpy 4.1 `cli.c`](https://github.com/Genymobile/scrcpy/blob/v4.1/app/src/cli.c),
[`str.c`](https://github.com/Genymobile/scrcpy/blob/v4.1/app/src/util/str.c), and
[`options.c`](https://github.com/Genymobile/scrcpy/blob/v4.1/app/src/options.c).

## Updating

For a new scrcpy version, audit its tagged parser source, add a version-specific
metadata selection, and extend `scripts/test-command-constraints.cjs`. Never infer a
range from help prose and never label a parser maximum as an encoder or device maximum.
