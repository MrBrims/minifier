/**
 * =============================================================================
 * WHAT THIS FILE DOES (read this first)
 * =============================================================================
 *
 * This is a Gulp config file. Gulp is a tool that runs small jobs ("tasks")
 * in a fixed order. You start a task from the terminal, for example:
 *
 *   npx gulp img      → process images
 *   npx gulp fonts    → convert fonts
 *   npx gulp          → process everything, then watch folders for new files
 *
 * Folders:
 *   app/images/src      — put original images here
 *   app/images/minific  — compressed copies in the original raster/ICO format
 *   app/images/dist     — files ready for the website (WebP, SVG, ICO)
 *   app/fonts           — put original .ttf fonts here
 *   app/fonts/dist      — converted .woff2 fonts
 *
 * Image routes:
 *   JPEG / PNG / GIF / WebP  → minify into minific → convert to .webp in dist
 *   SVG                      → minify into dist only (SVG is already a web format)
 *   ICO                      → minify, keep .ico, write to minific AND dist
 *                              (no WebP: browsers still need .ico for favicons,
 *                              and the sharp library cannot open ICO files)
 *
 * Font route:
 *   TTF → WOFF2 in app/fonts/dist
 *
 * "Minify" / "compress" means: make the file smaller, keep the same picture
 * (or a very similar one). Quality numbers below control how aggressive that is.
 */

import { Transform } from 'node:stream';
import path from 'node:path';
import { src, dest, series, watch } from 'gulp';
import changed from 'gulp-changed';
import { deleteAsync } from 'del';
import sharp from 'sharp';
import { decodeIco, encodeIco } from 'icojs';
import { optimize as svgoOptimize } from 'svgo';
import ttf2woff2 from 'ttf2woff2';

// -----------------------------------------------------------------------------
// Quality settings
// Change these numbers if files are too large or look too blurry.
// -----------------------------------------------------------------------------

// JPEG: 80 is a common web default (100 = almost no compression).
// progressive: the image loads in layers (better for slow networks).
// mozjpeg: a JPEG encoder that usually produces smaller files.
const jpegOptions = {
	quality: 80,
	progressive: true,
	mozjpeg: true,
};

// PNG: quality 70 + palette ≈ old pngquant range 60–80%.
// compressionLevel 9 = slowest but smallest lossless packing of the PNG data.
const pngOptions = {
	quality: 70,
	compressionLevel: 9,
	palette: true,
};

// WebP quality 80 matches the JPEG setting so photos look similar.
const webpOptions = {
	quality: 80,
};

// SVGO removes unused SVG markup. We keep viewBox and stroke/fill so icons
// still scale and still draw correctly in CSS/HTML.
const svgoConfig = {
	plugins: [
		{
			name: 'preset-default',
			params: {
				overrides: {
					removeUselessStrokeAndFill: false,
				},
			},
		},
		{
			name: 'removeViewBox',
			active: false,
		},
	],
};

// -----------------------------------------------------------------------------
// File patterns (globs)
// *  = any name in this folder
// ** = any nested folder
// {a,b} = match extension a OR b
// Uppercase extensions are listed so Windows files like .JPG are not skipped.
// -----------------------------------------------------------------------------

const rasterGlob = [
	'app/images/src/**/*.{jpg,jpeg,png,gif,webp,JPG,JPEG,PNG,GIF,WEBP}',
];

const minificRasterGlob = [
	'app/images/minific/**/*.{jpg,jpeg,png,gif,webp,JPG,JPEG,PNG,GIF,WEBP}',
];

const icoGlob = ['app/images/src/**/*.{ico,ICO}'];

const minificIcoGlob = ['app/images/minific/**/*.{ico,ICO}'];

// Gulp 5 reads files as text (UTF-8) by default. Images and fonts are binary:
// if we leave UTF-8 on, the files get corrupted. encoding: false = raw bytes.
// nodir: true = do not pass folder paths into the pipeline, only files.
const binarySrc = {
	encoding: false,
	nodir: true,
};

// -----------------------------------------------------------------------------
// Helper: turn a function that edits one file into a Gulp plugin
// -----------------------------------------------------------------------------
//
// Gulp works with a stream of "vinyl" objects (a file path + its contents).
// mapFile(fn) creates a stream step: for every file, run fn(file), then
// pass the same file further down the pipe.
//
function mapFile(fn) {
	return new Transform({
		objectMode: true,
		async transform(file, _enc, cb) {
			if (file.isNull()) {
				cb(null, file);
				return;
			}

			if (file.isStream()) {
				cb(new Error('Streaming is not supported'));
				return;
			}

			try {
				await fn(file);
				cb(null, file);
			} catch (error) {
				cb(error);
			}
		},
	});
}

// -----------------------------------------------------------------------------
// Per-file processors
// Each function returns a Gulp stream step used with .pipe(...)
// -----------------------------------------------------------------------------

/**
 * Compress a raster image but keep the same format
 * (photo.jpg stays photo.jpg, only smaller).
 */
function minifyRaster() {
	return mapFile(async (file) => {
		const ext = path.extname(file.path).toLowerCase();
		const image = sharp(file.contents, { animated: true, failOn: 'none' });

		if (ext === '.jpg' || ext === '.jpeg') {
			file.contents = await image.jpeg(jpegOptions).toBuffer();
			return;
		}

		if (ext === '.png') {
			file.contents = await image.png(pngOptions).toBuffer();
			return;
		}

		if (ext === '.gif') {
			file.contents = await image.gif().toBuffer();
			return;
		}

		if (ext === '.webp') {
			file.contents = await image.webp(webpOptions).toBuffer();
		}
	});
}

/**
 * Convert any raster buffer to WebP and rename the file (photo.jpg → photo.webp).
 * file.extname is a vinyl helper: it changes the extension on the output path.
 */
function convertWebp() {
	return mapFile(async (file) => {
		file.contents = await sharp(file.contents, {
			animated: true,
			failOn: 'none',
		})
			.webp(webpOptions)
			.toBuffer();
		file.extname = '.webp';
	});
}

/**
 * Minify SVG as text (SVG is XML, not pixels).
 * toString('utf8') turns the binary buffer into a string SVGO can parse.
 */
function minifySvg() {
	return mapFile(async (file) => {
		const result = svgoOptimize(file.contents.toString('utf8'), {
			path: file.path,
			...svgoConfig,
		});

		file.contents = Buffer.from(result.data);
	});
}

/** Convert a TrueType font buffer to WOFF2 and change the extension. */
function convertWoff2() {
	return mapFile(async (file) => {
		file.contents = Buffer.from(ttf2woff2(file.contents));
		file.extname = '.woff2';
	});
}

/**
 * ICO files are containers: one file can hold several sizes (16x16, 32x32, …).
 * Steps:
 *  1. Split the ICO into PNG frames (icojs).
 *  2. Compress each frame with sharp (same PNG settings as regular PNGs).
 *  3. Pack the frames back into one .ico file.
 * If the new file is larger, keep the original (compression must not grow files).
 * If anything throws, log the error and leave the original bytes — gulp img
 * must not stop because of one bad icon.
 */
function minifyIco() {
	return mapFile(async (file) => {
		try {
			const images = await decodeIco(file.contents, 'image/png');
			const frames = [];

			for (const image of images) {
				const png = await sharp(Buffer.from(image.buffer), {
					failOn: 'none',
				})
					.png(pngOptions)
					.toBuffer();
				frames.push({ buffer: png });
			}

			const encoded = Buffer.from(await encodeIco(frames));

			if (encoded.length < file.contents.length) {
				file.contents = encoded;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`ICO skip ${file.relative}: ${message}`);
		}
	});
}

// -----------------------------------------------------------------------------
// Gulp tasks
// Pattern: src(where to read) → pipe(step) → dest(where to write)
// gulp-changed skips files that already have a newer copy in the destination.
// -----------------------------------------------------------------------------

/** SVG: src → dist (minified .svg, no extra folder). */
function imagesSvg() {
	return src(
		['app/images/src/**/*.svg', '!app/images/src/**/.gitkeep'],
		binarySrc,
	)
		.pipe(changed('app/images/dist/'))
		.pipe(minifySvg())
		.pipe(dest('app/images/dist/'));
}

/** Raster: src → minific (same format, smaller file). */
function images() {
	return src(rasterGlob, binarySrc)
		.pipe(changed('app/images/minific'))
		.pipe(minifyRaster())
		.pipe(dest('app/images/minific'));
}

/** ICO: src → minific (still .ico). */
function imagesIco() {
	return src(icoGlob, binarySrc)
		.pipe(changed('app/images/minific'))
		.pipe(minifyIco())
		.pipe(dest('app/images/minific'));
}

/** Copy already-minified ICO from minific to dist (no format change). */
function imagesIcoDist() {
	return src(minificIcoGlob, binarySrc)
		.pipe(changed('app/images/dist/'))
		.pipe(dest('app/images/dist/'));
}

/**
 * Raster in minific → WebP in dist.
 * changed(..., { extension: '.webp' }) compares photo.jpg to photo.webp
 * so unchanged photos are not converted again.
 */
function imagesWebp() {
	return src(minificRasterGlob, binarySrc)
		.pipe(
			changed('app/images/dist/', {
				extension: '.webp',
			}),
		)
		.pipe(convertWebp())
		.pipe(dest('app/images/dist/'));
}

/** TTF in app/fonts (not in dist) → WOFF2 in app/fonts/dist. */
function fontWoff() {
	return src(
		['app/fonts/**/*.ttf', '!app/fonts/dist/**', '!app/fonts/**/.gitkeep'],
		binarySrc,
	)
		.pipe(changed('app/fonts/dist'))
		.pipe(convertWoff2())
		.pipe(dest('app/fonts/dist'));
}

/**
 * gulp delet — delete processed files only.
 * Globs starting with ! mean "do not delete this" (.gitkeep keeps empty folders in git).
 */
async function cleandist() {
	await deleteAsync([
		'app/images/minific/**/*',
		'!app/images/minific/**/.gitkeep',
		'app/images/dist/**/*',
		'!app/images/dist/**/.gitkeep',
		'app/fonts/dist/**/*',
		'!app/fonts/dist/**/.gitkeep',
	]);
}

/**
 * gulp deletall — also deletes originals in src and fonts.
 * Irreversible. force: true lets del remove files even in some edge cases.
 */
async function cleanall() {
	await deleteAsync(
		[
			'app/fonts/**/*',
			'!app/fonts/**/.gitkeep',
			'app/images/src/**/*',
			'!app/images/src/**/.gitkeep',
			'app/images/minific/**/*',
			'!app/images/minific/**/.gitkeep',
			'app/images/dist/**/*',
			'!app/images/dist/**/.gitkeep',
		],
		{
			force: true,
		},
	);
}

/**
 * Watch mode (npx gulp / npm start).
 * usePolling: true is more reliable on Windows (file events can be missed).
 * ICO and raster watch minific so dist updates after the first step finishes.
 */
function startwatch() {
	watch('app/images/src/**/*.svg', { usePolling: true }, imagesSvg);
	watch(icoGlob, { usePolling: true }, imagesIco);
	watch(rasterGlob, { usePolling: true }, images);
	watch(minificIcoGlob, { usePolling: true }, imagesIcoDist);
	watch(minificRasterGlob, { usePolling: true }, imagesWebp);
	watch(
		['app/fonts/**/*.ttf', '!app/fonts/dist/**'],
		{ usePolling: true },
		fontWoff,
	);
}

// -----------------------------------------------------------------------------
// Public tasks (names you type after `gulp`)
// series() runs functions one after another, left to right.
// ICO copy to dist runs before WebP so one broken raster does not block icons.
// -----------------------------------------------------------------------------

export const img = series(imagesSvg, imagesIco, images, imagesIcoDist, imagesWebp);
export const fonts = series(fontWoff);
export const delet = series(cleandist);
export const deletall = series(cleanall);

export default series(
	imagesSvg,
	imagesIco,
	images,
	imagesIcoDist,
	imagesWebp,
	fontWoff,
	startwatch,
);
