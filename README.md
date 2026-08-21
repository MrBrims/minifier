# Minifier

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Gulp](https://img.shields.io/badge/Gulp-5-blue.svg)](https://gulpjs.com/)
[![License](https://img.shields.io/badge/License-ISC-yellow.svg)](https://opensource.org/licenses/ISC)
[![Version](https://img.shields.io/badge/Version-1.0.1-green.svg)](#changelog)

A Gulp-based CLI tool for image optimization and font conversion: raster images are minified and converted to WebP, SVG and ICO files are minified in place, and TTF fonts are converted to WOFF2.

## Description

Place source files in `app/images/src` and `app/fonts`, then run Gulp. Raster files (JPEG, PNG, GIF) are written as optimized copies to `app/images/minific` and as WebP to `app/images/dist`. SVG files skip the raster pipeline and go to `app/images/dist` after SVGO. ICO files stay ICO: they are optimized and written to `minific` and `dist` (no WebP). TTF files become WOFF2 in `app/fonts/dist`. Watch mode re-runs the matching pipeline when files change.

## Requirements

- Node.js 20 or higher
- npm (bundled with Node.js)
- Gulp CLI globally (`npm install -g gulp-cli`) or `npx gulp`

## Installation

### Quick Start

1. Open a terminal in the project directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Optional: install Gulp CLI globally so you can run `gulp` without `npx`:
   ```bash
   npm install -g gulp-cli
   ```
4. Put images into `app/images/src/` and TTF fonts into `app/fonts/`.
5. Start processing and watch mode:
   ```bash
   npm start
   ```

If Node.js is not installed, download the LTS build from [nodejs.org](https://nodejs.org/) and confirm with `node --version` and `npm --version`.

## Usage

### Images

1. Copy JPG, JPEG, PNG, GIF, SVG, or ICO files into `app/images/src/` (subfolders are kept).
2. Run `gulp img` (or `npm run img`).
3. Results:
   - **SVG** — minified with SVGO → `app/images/dist/`
   - **ICO** — minified, format kept → `app/images/minific/` and `app/images/dist/`
   - **JPEG / PNG / GIF** — minified → `app/images/minific/`, then WebP → `app/images/dist/`

Use `app/images/dist/` (WebP, SVG, ICO) on modern sites. Keep `app/images/minific/` when you still need the original raster or ICO format. Leave originals in `src/` so you can re-run the pipeline.

### Fonts

1. Copy `.ttf` files into `app/fonts/` (not into `dist/`).
2. Run `gulp fonts` (or `npm run fonts`).
3. Output: `app/fonts/dist/<name>.woff2`.

Example CSS:

```css
@font-face {
	font-family: 'Roboto';
	src: url('fonts/dist/Roboto-Regular.woff2') format('woff2');
	font-weight: normal;
	font-style: normal;
}
```

WOFF2 is typically 30–50% smaller than TTF and is supported by current browsers.

### Watch mode

`npm start` or `gulp` processes existing files, then watches:

- `app/images/src/**/*.svg` → SVG minify
- `app/images/src/**/*.ico` → ICO minify → copy to `dist`
- other files in `app/images/src/` → raster minify → WebP
- `app/fonts/**/*.ttf` (except `dist`) → WOFF2

Stop with `Ctrl+C`.

### Windows batch scripts

In `app/`:

- `_gulp-img.bat` — images only
- `_gulp-fonts.bat` — fonts only
- `_gulp-delet.bat` — clean outputs (`minific` and `dist` only)
- `_gulp-deletall.bat` — full clean including `app/images/src` and source fonts

Double-click a script. It changes to the project root and runs `npx gulp`, so a global Gulp CLI is not required.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` / `gulp` | Process images and fonts, then watch for changes |
| `npm run img` / `gulp img` | SVG minify, ICO minify, raster minify, WebP conversion |
| `npm run fonts` / `gulp fonts` | Convert TTF to WOFF2 |
| `npm run clean` / `gulp delet` | Delete processed files in `minific` and `dist` (sources are kept) |
| `npm run clean:all` / `gulp deletall` | Delete sources and outputs: `app/images/src`, `minific`, `dist`, and `app/fonts` |

Without a global CLI, prefix Gulp tasks with `npx` (`npx gulp img`).

## Project Structure

```
minifier/
├── app/
│   ├── fonts/
│   │   ├── dist/          # Converted WOFF2 fonts
│   │   └── *.ttf          # Source TTF fonts
│   ├── images/
│   │   ├── src/           # Source images
│   │   ├── minific/       # Minified JPEG, PNG, GIF, ICO
│   │   └── dist/          # Minified SVG, ICO, and WebP
│   └── _gulp-*.bat        # Windows helpers
├── gulpfile.js
├── package.json
└── README.md
```

## Configuration

Edit constants at the top of `gulpfile.js`:

| Setting | Default | Notes |
|---------|---------|--------|
| JPEG | quality 80, progressive, mozjpeg | Raster minify |
| PNG | quality 70, palette | Lossy-style compression similar to pngquant 60–80% |
| WebP | quality 80 | From minified rasters |
| ICO | PNG quality 70, palette | Frames recompressed; file stays `.ico` |
| SVG | SVGO `preset-default` | `removeViewBox` and `removeUselessStrokeAndFill` stay off |

## Troubleshooting

- **`node` / `npm` not found** — install Node.js LTS and restart the terminal so PATH is updated.
- **`gulp` is not recognized** — use `npx gulp`, `npm start`, or install `gulp-cli` globally.
- **sharp install fails** — you need a supported OS/CPU; retry `npm install`. On restricted networks, allow downloads of libvips binaries.
- **Output images are corrupted** — Gulp 5 must read binaries with `encoding: false` (already set in this gulpfile). Do not pipe images as UTF-8 text.
- **Fonts in subfolders are ignored in watch** — watch uses `app/fonts/**/*.ttf` excluding `dist`. Run `gulp fonts` once if a file was added while watch was stopped.
- **`gulp delet` removed my originals** — `gulp delet` only deletes `app/images/minific`, `app/images/dist`, and `app/fonts/dist`. To wipe sources as well, use `gulp deletall` / `_gulp-deletall.bat` (irreversible).

## Changelog

### 1.0.1

- **NEW**: ICO pipeline — minify frames with sharp, keep `.ico`, write to `minific` and `dist` (no WebP)
- **TECHNICAL**: `icojs` for decode/encode; skip a file and log if ICO processing fails
- **TECHNICAL**: If the optimized ICO is larger than the source, the original buffer is kept

### 1.0.0

- **NEW**: Image pipeline — SVG minify to `dist`, raster minify to `minific`, WebP to `dist`
- **NEW**: TTF to WOFF2 conversion via `ttf2woff2`
- **NEW**: Watch mode and Windows batch scripts (`npx gulp` from project root)
- **NEW**: `gulp deletall` / `_gulp-deletall.bat` — full wipe including `app/images/src` and source fonts (same as original u-minifier `delet`)
- **IMPROVED**: Stack updated to Gulp 5, sharp, SVGO 4, `ttf2woff2` 8, `gulp-changed` 5, `del` 8
- **FIXED**: `gulp delet` no longer deletes source images or source fonts
- **FIXED**: Image watch exclude glob targets `app/images/src/**/*.svg`
- **FIXED**: Font watch covers nested `*.ttf` and ignores `app/fonts/dist`
- **TECHNICAL**: Binary `src()` uses `{ encoding: false }` for Gulp 5
- **TECHNICAL**: Dropped unused site-builder dependencies (webpack, Sass, BrowserSync, and related packages)

## License

ISC

## Support

Open an issue in this repository or contact the maintainer.
