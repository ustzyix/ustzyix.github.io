# System Architecture

This repository is a zero-backend, zero-bundler static media application built with vanilla HTML, CSS, and Native ES Modules. The browser loads a single HTML entry point, imports structured project modules on demand, and renders image, video, interactive, or audio collections without server-side rendering or runtime API calls.

## System model

```text
Browser
  |
  v
index.html
  |-- assets/css/               layered presentation styles
  +-- assets/js/main.js         ES module entry point
        |-- data/projects.js    project registry (export const GALLERY)
        |-- data/thumbs.js      thumbnail map & static media manifest
        |-- data/<project>.js   lazy-loaded project details (export default)
        |-- assets/js/state.js  shared state, helpers, & DOM references
        |-- assets/js/loader.js dynamic imports, normalization, & view cache
        |-- assets/js/media.js  video observer, poster capture, & image decode
        |-- assets/js/renderers.js gallery, interactive, & playlist renderers
        +-- assets/js/lightbox.js  progressive lightbox & metadata flip card

Media directories
  |-- images/                   full-resolution source images
  |-- thumbs/                   generated WebP previews
  |-- videos/                   video media
  +-- audio/                    optional playlist audio

GitHub Actions (.github/workflows/make-thumbs.yml)
  |-- images/ -> thumbs/<name>.webp + THUMBS_MAP
  +-- images/ + videos/ + audio/ -> MEDIA_MANIFEST in data/thumbs.js
```

## Core principles

* **Zero-build ES Modules:** Application logic and data files use native `import` and `export` syntax (`<script type="module">`) with no bundler or transpilation step.
* **Strict separation of concerns:** `index.html` contains only the document shell and enforces a strict Content Security Policy (`script-src 'self'`). No CSS or JavaScript is embedded inline.
* **Two-tier data loading:** Lightweight project summaries load upfront from `data/projects.js`; detailed project modules load lazily via dynamic `import()` only when selected or prefetched.
* **Static media discovery:** GitHub Actions generates `data/thumbs.js` on push. Runtime folder discovery reads `MEDIA_MANIFEST` locally and never calls the GitHub Contents API.
* **Preview vs. original media:** Galleries and initial lightbox frames use lightweight WebP thumbnails while full-resolution images decode asynchronously in the background.
* **Keep-alive view caching:** Rendered gallery views are retained in an in-memory LRU cache so switching back to a previously viewed project restores scroll position and DOM state immediately.

## Repository structure

```text
.
├── index.html
├── assets/
│   ├── css/
│   │   ├── tokens.css
│   │   ├── base.css
│   │   ├── gallery.css
│   │   └── lightbox.css
│   └── js/
│       ├── state.js
│       ├── loader.js
│       ├── media.js
│       ├── renderers.js
│       ├── lightbox.js
│       └── main.js
├── data/
│   ├── projects.js
│   ├── archive-01.js
│   ├── videos-01.js
│   └── thumbs.js
├── images/
├── thumbs/
├── videos/
├── audio/                    optional
├── .github/workflows/
│   └── make-thumbs.yml
├── LICENSE
└── README.md
```

## File responsibilities

### `index.html`
The application shell. It defines the Content Security Policy, preloads core ES modules (`rel="modulepreload"`), loads the four CSS layers in `tokens` → `base` → `gallery` → `lightbox` order, and boots the runtime through a single `<script type="module" src="assets/js/main.js"></script>` tag.

### `assets/css/`
* `tokens.css`: Design tokens for colors, typography, blur, radii, and z-index layers.
* `base.css`: Reset rules, viewport stage, top navigation bar, and full-screen project picker modal.
* `gallery.css`: Scatter and grid card layouts, entrance transitions, video badges, and hover states.
* `lightbox.css`: Lightbox frame, 3D metadata flip card, interactive iframe container, and audio playlist deck.

### `assets/js/`
* `state.js`: Imports `GALLERY`, exports path/formatting utilities, DOM element references, the LRU `viewCache` map, and the shared mutable `state` object.
* `loader.js`: Dynamically imports `data/<project>.js` modules, normalizes media entries, resolves thumbnail fallback chains, runs manifest discovery, and manages view lifecycle/eviction.
* `media.js`: Manages the viewport `IntersectionObserver` for deferred video loading, captures first-frame canvas posters (`vidPosterCache`), and maintains an async `Image.decode()` cache.
* `renderers.js`: Implements the balanced scatter layout engine, desktop pointer parallax, gallery card creation, sandboxed interactive iframe mounting, and HTML5 audio playlist controls.
* `lightbox.js`: Controls lightbox media transitions, progressive thumbnail-to-full-resolution upgrades, dynamic aspect-ratio framing, keyboard/touch handlers, and the metadata flip panel.
* `main.js`: Module entry point. Binds the scatter/grid FLIP layout toggle, resize observers, project picker search/prefetching, and URL hash routing.

### `data/projects.js`
The project registry. Exports `GALLERY` containing lightweight metadata used to populate the project switcher and locate each project's detail module.

```javascript
export const GALLERY = {
  projects: [
    {
      id: "project-id",
      type: "gallery",
      code: "AR",
      title: "Project title",
      sub: "Project description",
      year: "2024 — 2026",
      data: "data/project-id.js"
    }
  ]
};
```

Supported `type` values:
* `gallery`: Scatter/grid image and video cards with lightbox inspection.
* `interactive`: Embedded external document via `<iframe>` with fullscreen support.
* `playlist`: Audio deck with transport controls, scrubbing, and track list.

### `data/<project>.js`
Detailed configuration for an individual project, exported as the module's default object. Current project modules include `data/archive-01.js` and `data/videos-01.js`.

```javascript
export default {
  folder: "images",
  discover: true,
  photos: [
    {
      file: "example.jpg",
      title: "Example — 01",
      sub: "Series · 01",
      exif: {
        camera: "Camera name",
        captured: "12 Oct 2025 · 12:16",
        aperture: "f/1.8",
        shutter: "1/1500s",
        focal: "3.99 mm",
        iso: "ISO 20",
        app: "Adobe Lightroom",
        resolution: "2612 × 1470 (3.8 MP)"
      }
    }
  ]
};
```

### `data/thumbs.js`
Auto-generated by GitHub Actions. Exports two static lookup objects consumed by `loader.js`:

```javascript
export const THUMBS_MAP = {
  "example.jpg": "thumbs/example.webp"
};

export const MEDIA_MANIFEST = {
  "images": ["example.jpg"],
  "videos": ["example.mp4"],
  "audio": ["example.mp3"]
};
```

* `THUMBS_MAP` maps source image filenames in `images/` to generated WebP previews in `thumbs/`.
* `MEDIA_MANIFEST` maps top-level media directories (`images`, `videos`, `audio`) to sorted filename arrays.
* When `discover` is enabled (`discover !== false`), `discoverFiles()` filters `MEDIA_MANIFEST[folder]` by supported extensions and appends any files not already declared in the project module.
* Discovery scans direct children of each target directory only and does not recurse into subdirectories.

### Media directories
* `images/`: Full-resolution source images (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.avif`).
* `thumbs/`: Auto-generated WebP thumbnails (max width `800px`, quality `80`).
* `videos/`: Video files (`.mp4`, `.webm`, `.mov`, `.m4v`).
* `audio/`: Optional audio tracks (`.mp3`, `.m4a`, `.wav`, `.ogg`, `.flac`).

### `.github/workflows/make-thumbs.yml`
Runs on pushes to `main` affecting `images/**`, `videos/**`, `audio/**`, or the workflow file itself (as well as manual `workflow_dispatch`). Using Python 3.12 and Pillow, it:
1. Applies EXIF orientation, resizes new or updated images to a maximum width of `800px` with Lanczos resampling, and encodes them as WebP files in `thumbs/`.
2. Removes orphaned thumbnails from `thumbs/` when source images are deleted.
3. Scans `images/`, `videos/`, and `audio/` and writes updated `THUMBS_MAP` and `MEDIA_MANIFEST` exports to `data/thumbs.js`.
4. Commits updated previews and manifest changes back to `main` with `[skip ci]`.

## Runtime lifecycle

### 1. Bootstrap & routing
`index.html` loads `assets/js/main.js` as an ES module. `main.js` reads `location.hash` to select the initial project (defaulting to `PROJECTS[0]`) and listens for `hashchange` events to switch views without page reloads.

### 2. Project detail loading
`fetchProjectDetail()` dynamically imports `data/<project>.js` once, caches its default export in `projectStore`, and merges it with the base project registry entry. Hovering or touching items in the project picker triggers early prefetching.

### 3. Mode dispatch & view caching
`loadProject()` suspends the active view (pausing videos and stopping active audio) and checks `viewCache` (capped at 6 cached gallery views). On a cache hit, the existing DOM container is restored; otherwise, a new `.proj-view` is created and dispatched to `addCard()`, `mountInteractive()`, or `mountPlaylist()`.

### 4. Normalization & manifest discovery
`toEntry()` resolves source paths, thumbnail candidates, media types, and captions. If `discover` is enabled, `discoverFiles()` schedules an idle task (`requestIdleCallback`) to append undeclared files listed in `MEDIA_MANIFEST`.

### 5. Layout & progressive rendering
* **Scatter & FLIP grid:** `layout()` positions cards using responsive coordinate tables (`DP` / `MOBILE_DP`), balancing landscape widths against the median portrait card height. Toggling grid mode animates card positions via the Web Animations API.
* **Images:** Cards load `THUMBS_MAP` previews first with priority hints (`fetchPriority="high"` and eager loading for the first two items).
* **Videos:** Video elements store their URL in `data-src`. `IntersectionObserver` assigns `src` when a card enters the viewport (`threshold: 0.15`) and pauses playback when scrolled off-screen.

### 6. Lightbox inspection
Selecting a card opens the Lightbox immediately with its cached thumbnail while `predecode()` decodes the full-resolution source asynchronously. Once decoded, the full-resolution image swaps in seamlessly, and tapping or pressing Enter/Space flips the card to reveal authored EXIF or video stream metadata.

## Gallery data contract

### Project-level fields

| Field | Type | Purpose |
| :--- | :--- | :--- |
| `folder` | `string` | Source directory for media files (defaults to `"images"` or `"audio"`). |
| `discover` | `boolean` | When `true` (default), appends undeclared files from `MEDIA_MANIFEST[folder]`. |
| `thumbFolder` | `string \| boolean` | Optional custom preview directory override. |
| `thumbExt` | `string \| string[]` | Optional preview file extensions to probe. |
| `videoThumbs` | `boolean` | Enables probing preview images for video entries. |
| `photos` | `Array<string \| object>` | Media entries for `gallery` mode. |
| `tracks` | `Array<string \| object>` | Audio entries for `playlist` mode. |
| `src` | `string` | Embedded URL for `interactive` mode. |
| `controls` | `string` | Control hint text displayed in `interactive` mode. |

### Media-level fields (`photos`)

| Field | Type | Purpose |
| :--- | :--- | :--- |
| `file` | `string` | Filename relative to the project `folder`. |
| `src` | `string` | Explicit media path or external URL. |
| `type` | `string` | Optional explicit media type (e.g., `"video"`). |
| `title` | `string` | Primary display caption. |
| `sub` | `string` | Secondary subtitle label. |
| `ratio` | `number` | Optional aspect ratio (`width / height`) reserved before metadata loads. |
| `app` | `string` | Software or tool label displayed on the info card. |
| `poster` / `thumb` | `string` | Explicit preview or video poster path. |
| `exif` | `object` | Authored camera metadata (`camera`, `captured`, `aperture`, `shutter`, `focal`, `iso`, `app`, `resolution`). |

### Audio-level fields (`tracks`)

| Field | Type | Purpose |
| :--- | :--- | :--- |
| `file` | `string` | Audio filename relative to `folder`. |
| `src` | `string` | Explicit audio path or URL. |
| `title` | `string` | Track title. |
| `artist` | `string` | Artist or creator credit. |
| `cover` | `string` | Optional track artwork path or URL. |

## Local development

Because browsers enforce CORS restrictions on ES module imports (`<script type="module">`), serve the repository over HTTP rather than opening `index.html` directly via `file://`:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.
