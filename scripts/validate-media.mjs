#!/usr/bin/env node
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const strictGenerated = process.argv.includes("--strict-generated");
const errors = [];
const warnings = [];

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov", ".m4v"]);
const AUDIO_EXTS = new Set([".mp3", ".m4a", ".wav", ".ogg", ".flac"]);

function reportGeneratedIssue(message) {
  (strictGenerated ? errors : warnings).push(message);
}

async function exists(relativePath) {
  try {
    await access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function listMedia(folder, extensions) {
  try {
    const entries = await readdir(path.join(ROOT, folder), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function validateNames(label, values) {
  if (!Array.isArray(values)) {
    errors.push(`MEDIA_MANIFEST.${label} must be an array.`);
    return [];
  }

  const valid = [];
  const seen = new Set();

  for (const value of values) {
    if (typeof value !== "string" || !value || path.basename(value) !== value) {
      errors.push(`Invalid filename in MEDIA_MANIFEST.${label}: ${String(value)}`);
      continue;
    }

    if (seen.has(value)) {
      errors.push(`Duplicate filename in MEDIA_MANIFEST.${label}: ${value}`);
      continue;
    }

    seen.add(value);
    valid.push(value);
  }
  return valid;
}

function compareFileLists(label, manifestFiles, actualFiles) {
  const declared = new Set(manifestFiles);
  const actual = new Set(actualFiles);

  for (const file of actual) {
    if (!declared.has(file)) errors.push(`${label}/${file} exists but is missing from MEDIA_MANIFEST.`);
  }
  for (const file of declared) {
    if (!actual.has(file)) errors.push(`MEDIA_MANIFEST declares missing file: ${label}/${file}`);
  }
}

const source = await readFile(path.join(ROOT, "data/thumbs.js"), "utf8");
const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { THUMBS_MAP, MEDIA_MANIFEST } = await import(dataUrl);

if (!THUMBS_MAP || typeof THUMBS_MAP !== "object" || Array.isArray(THUMBS_MAP)) {
  errors.push("THUMBS_MAP must be an object.");
}
if (!MEDIA_MANIFEST || typeof MEDIA_MANIFEST !== "object") {
  errors.push("MEDIA_MANIFEST must be an object.");
}

const images = validateNames("images", MEDIA_MANIFEST?.images);
const videos = validateNames("videos", MEDIA_MANIFEST?.videos);
const audio = validateNames("audio", MEDIA_MANIFEST?.audio);

compareFileLists("images", images, await listMedia("images", IMAGE_EXTS));
compareFileLists("videos", videos, await listMedia("videos", VIDEO_EXTS));
compareFileLists("audio", audio, await listMedia("audio", AUDIO_EXTS));

const thumbnailTargets = new Map();

for (const [sourceName, target] of Object.entries(THUMBS_MAP || {})) {
  if (!images.includes(sourceName)) {
    errors.push(`THUMBS_MAP contains an unknown source image: ${sourceName}`);
  }

  if (typeof target !== "string" || !target) {
    errors.push(`Invalid thumbnail target for ${sourceName}.`);
    continue;
  }

  const resolved = path.resolve(ROOT, target);
  const relative = path.relative(ROOT, resolved);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    errors.push(`Thumbnail path escapes the repository: ${target}`);
    continue;
  }

  const previousSource = thumbnailTargets.get(target);
  if (previousSource) {
    errors.push(`Thumbnail collision: ${previousSource} and ${sourceName} both map to ${target}`);
  } else {
    thumbnailTargets.set(target, sourceName);
  }

  if (!(await exists(target))) {
    errors.push(`Missing thumbnail for ${sourceName}: ${target}`);
  }
}

for (const image of images) {
  if (!Object.hasOwn(THUMBS_MAP || {}, image)) {
    errors.push(`Image has no THUMBS_MAP entry: ${image}`);
  }
}

const expectedPreviews = new Set();
const expectedPosters = new Set();

for (const video of videos.filter((name) => path.extname(name).toLowerCase() === ".mp4")) {
  const stem = path.basename(video, path.extname(video));
  const preview = `videos/preview/${stem}.preview.mp4`;
  const poster = `videos/posters/${stem}.webp`;

  expectedPreviews.add(path.basename(preview));
  expectedPosters.add(path.basename(poster));

  if (!(await exists(preview))) reportGeneratedIssue(`Missing generated video preview: ${preview}`);
  if (!(await exists(poster))) reportGeneratedIssue(`Missing generated video poster: ${poster}`);
}

for (const [folder, expected, pattern] of [
  ["videos/preview", expectedPreviews, (name) => name.endsWith(".preview.mp4")],
  ["videos/posters", expectedPosters, (name) => name.toLowerCase().endsWith(".webp")]
]) {
  const files = await listMedia(folder, new Set(
    folder.endsWith("preview") ? [".mp4"] : [".webp"]
  ));

  for (const file of files) {
    if (pattern(file) && !expected.has(file)) {
      reportGeneratedIssue(`Orphaned generated asset: ${folder}/${file}`);
    }
  }
}

console.log(`Media validation: ${errors.length} error(s), ${warnings.length} warning(s).`);
for (const warning of warnings) console.warn(`WARN: ${warning}`);
for (const error of errors) console.error(`ERROR: ${error}`);

if (errors.length) process.exitCode = 1;
