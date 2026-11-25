# ustzyix — Visual Studio Archive

`ustzyix.github.io` is a static portfolio and media archive for visual work. The site is designed to run directly on GitHub Pages without a build step, backend server, framework, or runtime dependency.

The current interface focuses on a dark, minimal visual archive with image, video, interactive, and audio project modes. Dynamic atmosphere backgrounds, image-based background color extraction, palette analysis, canvas particles, and realtime video color analysis are intentionally not part of the current runtime.

## Architecture overview

```text
GitHub Pages
    |
    v
index.html
    |-- loads data/projects.js       -> project registry
    |-- loads data/thumbs.js         -> generated image thumbnail manifest
    |-- lazy-loads data/*.js         -> project-specific metadata
    |-- reads images/, thumbs/, videos/
    |-- renders Gallery / Interactive / Playlist modes
    |
    +--> GitHub API (optional discovery when discover: true)

GitHub Actions
    |
    +--> images/* -> resized WebP thumbnails -> thumbs/* + data/thumbs.js
```

The application is a single-page interface. `index.html` contains the HTML shell, CSS system, and the client-side JavaScript runtime. Project metadata is separated into small JavaScript files so the initial page can load quickly and each project can be fetched only when needed.

## Runtime flow

1. The browser loads `index.html`.
2. `data/projects.js` registers the available projects in `window.GALLERY.projects`.
3. `data/thumbs.js` provides the generated thumbnail map in `window.THUMBS_MAP`.
4. The inline runtime reads the URL hash. For example, `#archive-01` opens the Archive project.
5. `loadProject()` loads the selected project metadata from its `data` file when required.
6. The project `type` selects the renderer:
   - `gallery` uses image and video cards.
   - `interactive` embeds an external interactive work in an iframe.
   - `playlist` creates an audio player and track list.
7. Gallery media is rendered progressively. A thumbnail is shown first when available, and the original file is decoded when the Lightbox opens.
8. Additional files can be discovered from the configured folder through the GitHub Contents API when `discover: true`.

## Main runtime components

### Gallery

Gallery projects are converted into normalized entries by `toEntry()`. Each entry contains its source path, thumbnail candidates, caption, metadata, and media type.

The gallery supports:

- Scatter and grid layouts.
- Responsive card positioning.
- Lazy image loading.
- Lazy video source loading with `IntersectionObserver`.
- Video poster capture from the first available frame.
- Project switching with cached views.
- URL hash navigation.

### Lightbox

The Lightbox opens the selected image or video and provides:

- Previous and next navigation.
- Touch swipe navigation.
- Keyboard navigation with Arrow keys and Escape.
- Progressive thumbnail-to-full-resolution loading.
- A flip panel for media information.
- EXIF reading for images when metadata is not supplied manually.

### Interactive mode

`mountInteractive()` creates an iframe-based interactive project with a fullscreen control. This mode is retained for future projects and is not required by the current Archive and Motion entries.

### Playlist mode

`mountPlaylist()` creates an audio player with:

- Previous, play/pause, and next controls.
- Progress bar and time labels.
- Track list rendering.
- Optional cover images.
- Optional folder discovery for audio files.

This mode is retained for future use.

## File structure

```text
.
├── index.html
├── data/
│   ├── projects.js
│   ├── archive-01.js
│   ├── videos-01.js
│   └── thumbs.js
├── images/
│   ├── .gitkeep
│   └── original image files
├── thumbs/
│   ├── .gitkeep
│   └── generated WebP thumbnails
├── videos/
│   ├── .gitkeep
│   └── video files
├── .github/workflows/
│   └── make-thumbs.yml
└── README.md
```

### `index.html`

The main application file. It contains:

- The page shell and accessibility attributes.
- The header and project switcher.
- The gallery canvas.
- The Lightbox and media information panel.
- The responsive CSS design system.
- Project loading and view caching.
- Thumbnail resolution and fallback logic.
- Lazy loading for images and videos.
- EXIF parsing and media metadata rendering.
- Gallery, Interactive, and Playlist renderers.
- Hash-based project navigation.

The file intentionally does not contain the removed atmosphere, palette-analysis, canvas-particle, or realtime color-analysis systems.

### `data/projects.js`

The project registry. It is loaded during the initial page load and should contain only lightweight project summaries.

Example:

```js
{
  id: "archive-01",
  type: "gallery",
  code: "AR",
  title: "Archive",
  sub: "Color Grading",
  year: "2024 — 2026",
  data: "data/archive-01.js"
}
```

Supported `type` values are `gallery`, `interactive`, and `playlist`.

### `data/archive-01.js`

Contains the detailed metadata for the still-image Archive project:

- `folder`: source media directory.
- `discover`: whether additional files may be discovered remotely.
- `photos`: image entries and their captions, tags, application names, and EXIF metadata.

The `exif` object can provide metadata directly. If some values are missing, the runtime attempts to read image metadata in the browser.

### `data/videos-01.js`

Contains the detailed metadata for the Motion project. The current project uses the same `photos` collection schema because the runtime detects video files from their extension or an explicit `type: "video"` field.

Supported video extensions include `.mp4`, `.webm`, `.mov`, and `.m4v`.

### `data/thumbs.js`

An automatically generated manifest that maps original image filenames to optimized WebP thumbnails.

```js
window.THUMBS_MAP = {
  "IMG_0018.jpg": "thumbs/IMG_0018.webp"
};
```

Do not edit this file manually. It is regenerated by GitHub Actions.

### `images/`

Stores original still images. These files are used for full-resolution Lightbox viewing and as the source for thumbnail generation.

### `thumbs/`

Stores generated WebP thumbnails. Thumbnails reduce the amount of data required during the initial gallery render while preserving the original files for full-resolution viewing.

### `videos/`

Stores video media used by Motion projects. Videos are not loaded until their cards become visible, and they are not downloaded for hidden cards.

### `.github/workflows/make-thumbs.yml`

Runs on pushes to `main` that modify `images/`, or when manually started from GitHub Actions.

The workflow:

1. Installs Python and Pillow.
2. Reads supported image files from `images/`.
3. Corrects EXIF orientation.
4. Resizes images to a maximum width of 800 pixels.
5. Encodes thumbnails as WebP with quality 80.
6. Removes thumbnails whose source images no longer exist.
7. Rebuilds `data/thumbs.js`.
8. Commits and pushes changed thumbnails back to the repository.

## Adding a new gallery project

1. Add a project summary to `data/projects.js`.
2. Create a detail file such as `data/new-project.js`.
3. Register the detail file with `window.setProjectData("project-id", {...})`.
4. Put the media files in the configured folder.
5. Set `type: "gallery"`.
6. Add `exif`, `title`, `sub`, and `tag` values when custom metadata is desired.
7. Open the site with `#project-id` to test the project directly.

Example detail file:

```js
window.setProjectData("new-project", {
  folder: "images",
  discover: true,
  photos: [
    {
      file: "example.jpg",
      title: "Example — 01",
      sub: "Study · 01",
      tag: "still"
    }
  ]
});
```

## Adding future Interactive or Playlist projects

Interactive project:

```js
{
  id: "interactive-01",
  type: "interactive",
  title: "Interactive Work",
  sub: "Web Experiment",
  src: "https://example.com/interactive"
}
```

Playlist project:

```js
{
  id: "audio-01",
  type: "playlist",
  title: "Audio Archive",
  sub: "Selected Works",
  folder: "audio",
  tracks: [
    {
      file: "track-01.mp3",
      title: "Track 01",
      artist: "ustzyix"
    }
  ]
}
```

The corresponding detail object can be placed in a lazy-loaded `data/*.js` file, just like gallery projects.

## Local development

Because the application loads local files and project data dynamically, use a local HTTP server instead of opening `index.html` directly with `file://`.

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

There is currently no `package.json`, build command, or dependency installation step.

## Performance principles

- Use generated thumbnails for the initial gallery view.
- Load original media only when it is needed.
- Use `IntersectionObserver` for video source loading.
- Avoid autoplay for hidden media.
- Cache loaded project views and decoded images.
- Keep project summaries small and lazy-load detailed metadata.
- Keep dynamic visual effects out of the main rendering path.
- Preserve the original files for high-resolution Lightbox viewing.

## Deployment

The repository is compatible with GitHub Pages. The site is served from the repository root, so changes to `index.html`, `data/`, `images/`, `thumbs/`, and `videos/` become available after GitHub Pages finishes deploying.

The thumbnail workflow may create a follow-up commit after an image is added or changed. Wait for the `Generate Thumbnails` workflow to finish before checking the generated thumbnail map.

## Important maintenance notes

- Keep filenames URL-safe when possible. The runtime encodes path segments, but simple filenames are easier to maintain.
- Do not manually edit `data/thumbs.js` unless repairing a generated file.
- When adding a new media format, update the corresponding extension matcher in `index.html`.
- `discover: true` uses the GitHub Contents API and can be affected by API rate limits.
- External Interactive projects must allow iframe embedding through their server headers.
- The current runtime intentionally has no image palette extraction or background color synchronization.
