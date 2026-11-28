# System Architecture

This repository is a static, client-side media application. The browser loads one HTML entry point, reads project definitions from JavaScript data files, and renders the selected project without a backend service or server-side rendering.

## System model

Browser
  |
  v
index.html
  |-- data/projects.js       project registry
  |-- data/thumbs.js         thumbnail map and static media manifest
  |-- data/<project>.js      lazy project details
  |-- assets/css/            presentation styles
  |-- assets/js/             application logic
  |-- images/                original images
  |-- thumbs/                optimized image previews
  |-- videos/                video media
  +-- audio/                 optional playlist media

GitHub Actions
  |-- images/ -> thumbs/ + THUMBS_MAP
  +-- images/videos/audio -> MEDIA_MANIFEST

## Core principles

- index.html contains the application shell and loads external CSS and JavaScript assets.
- Project summaries load first; detailed project data loads only when needed.
- Project metadata is maintained separately from media files.
- A generated static manifest lists discoverable files by folder.
- Runtime discovery reads the manifest and does not call the GitHub Contents API.
- Rendering is selected by the project type.
- Original media and preview media have separate responsibilities.
- Browser APIs handle lazy loading, media decoding, navigation, and fullscreen behavior.

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
└── README.md
```

## File responsibilities

### index.html

The HTML shell contains the page structure and loads the four CSS files in tokens, base, gallery, and lightbox order. At the end of the page it loads project data, the generated data/thumbs.js file, then the six JavaScript modules in dependency order. No application CSS or JavaScript is embedded in the HTML.

### assets/css/

- tokens.css contains shared colors, fonts, blur, and stacking order values.
- base.css contains reset styles, the page layout, header, and project picker.
- gallery.css contains gallery cards, grid layout, and hover states.
- lightbox.css contains the lightbox, card flip, interactive iframe, and playlist styles.

### assets/js/

- state.js defines shared state, project registry access, and DOM references.
- loader.js loads project details, normalizes media entries, reads the static manifest, and manages cached project views.
- media.js handles video visibility, poster capture, and asynchronous image decoding. It does not parse EXIF data.
- renderers.js contains the gallery, interactive, and playlist renderers.
- lightbox.js controls media information and the lightbox.
- main.js binds the project picker, hash routing, startup, and shared UI events.

### `data/projects.js`

The project registry. It contains lightweight summaries used to build the project switcher and locate each project’s detailed data file.

```js
window.GALLERY = {
  projects: [
    {
      id: "project-id",
      type: "gallery",
      title: "Project title",
      sub: "Project description",
      data: "data/project-id.js"
    }
  ]
};
```

Supported `type` values:

- `gallery`: image and video cards.
- `interactive`: an embedded interactive document.
- `playlist`: an audio player and track list.

### `data/<project>.js`

The detailed data source for one project. A detail file registers data through `window.setProjectData()`.

```js
window.setProjectData("project-id", {
  folder: "images",
  discover: true,
  photos: [
    {
      file: "example.jpg",
      title: "Example",
      sub: "Description",
      exif: {
        camera: "Camera name",
        captured: "Capture date"
      }
    }
  ]
});
```

The current repository includes `data/archive-01.js` and `data/videos-01.js` as project-specific data files. Their role is the same as any future `data/<project>.js` file.

### data/thumbs.js

GitHub Actions generates this file. It contains two static data objects:

```js
window.THUMBS_MAP = {
  "example.jpg": "thumbs/example.webp"
};

window.MEDIA_MANIFEST = {
  "images": ["example.jpg"],
  "videos": ["example.mp4"],
  "audio": ["example.mp3"]
};
```

- THUMBS_MAP maps original image filenames to preview paths.
- MEDIA_MANIFEST maps folder names to arrays of filename strings.
- When a project has discover enabled, discoverFiles filters its folder list and adds matching files that are not already declared in project data.
- Setting discover to false disables automatic additions for that project.
- A folder without a manifest entry has no automatic additions.

The manifest currently covers images, videos, and audio. Discovery reads direct children of each folder; it does not recurse into subfolders.

### `images/`

Stores original image files. These files are used for full-resolution viewing and thumbnail generation.

### `thumbs/`

Stores generated preview images. The runtime uses these files for the initial gallery view when a matching entry exists in `data/thumbs.js`.

### `videos/`

Stores video files. A media entry is recognized as a video when its `type` is `video` or its filename has a supported video extension.

### .github/workflows/make-thumbs.yml

The media pipeline runs when files change under images/, videos/, or audio/, and when the workflow itself changes. It creates or refreshes image previews, removes stale previews, and writes both THUMBS_MAP and MEDIA_MANIFEST to data/thumbs.js. Generated changes are committed back to the repository when needed.

The browser consumes the generated static data and does not request directory listings from GitHub's Contents API.

## Runtime lifecycle

### 1. Bootstrap

The page loads data/projects.js and data/thumbs.js before the application modules. The globals are:

- window.GALLERY for project summaries.
- window.PROJECT_STORE for loaded project details.
- window.THUMBS_MAP for preview paths.
- window.MEDIA_MANIFEST for discoverable filenames grouped by folder.

### 2. Project selection

The initial project is selected from the URL hash. The project picker can select another registered project and update the hash without a full page reload.

### 3. Detail loading

fetchProjectDetail() loads a project's detail script once and stores its payload. This is a static JavaScript file request from the site.

### 4. Mode dispatch

loadProject() checks the project type and calls one renderer:

```text
gallery      -> create media cards
interactive  -> mount an iframe view
playlist     -> mount an audio view
```

### 5. Media normalization and discovery

toEntry() converts media data into a common shape with source paths, preview candidates, media type, captions, labels, and optional manually supplied metadata.

When discover is enabled, discoverFiles() reads the filename strings from window.MEDIA_MANIFEST[folder], filters them by supported media type, and adds entries that are not already declared. This step does not make a GitHub API or directory-listing request. The browser still requests project data and media files when needed.

### 6. Media rendering

addCard() creates a card and attaches the appropriate media element. Images try preview candidates first. Videos use a deferred data-src value so their original source is assigned when a card becomes visible.

### 7. Visibility management

IntersectionObserver tracks video cards in the viewport. Visible videos may load their source; videos that leave the viewport are paused and their source is released.

### 8. Lightbox loading

The Lightbox opens the selected media item. When a preview is available, it can display immediately while the original image is decoded asynchronously. The original source replaces the preview after decoding completes.

### 9. View caching

Project views can be kept in an in-memory cache. Returning to a cached project restores its view state instead of rebuilding it.

## Gallery data contract

### Project-level fields

| Field | Purpose |
| --- | --- |
| `folder` | Source directory for media files. |
| `discover` | When true, adds matching filenames from the static manifest for the project folder; when false, only declared items are used. |
| `photos` | Collection of image or video entries. |
| `tracks` | Collection of audio entries for Playlist mode. |
| `src` | External source used by Interactive mode. |
| `controls` | Control description shown by Interactive mode. |

### Media-level fields

| Field | Purpose |
| --- | --- |
| `file` | Filename relative to the project folder. |
| `src` | Explicit media path or URL. |
| `type` | Optional explicit media type, such as `video`. |
| `title` | Primary display label. |
| `sub` | Secondary display label. |
| `ratio` | Optional media aspect ratio, used when dimensions are not yet available. |
| `app` | Optional application or tool label. |
| `poster` / `thumb` | Optional explicit preview path. |
| `exif` | Optional manually supplied image metadata. |

### Audio-level fields

| Field | Purpose |
| --- | --- |
| `file` | Audio filename. |
| `src` | Explicit audio path or URL. |
| `title` | Track title. |
| `artist` | Track artist or creator. |
| `cover` | Optional cover image. |

## Renderer responsibilities

### Gallery renderer

`addCard()` and `layout()` manage media cards and their positions. Gallery state includes the current entries, cards, layout mode, and selected media index.

### Interactive renderer

`mountInteractive()` creates an iframe container and a fullscreen control. The embedded document remains external to the main application runtime.

### Playlist renderer

`mountPlaylist()` creates the audio element, transport controls, progress display, and track list. `stopAudio()` releases the active audio source when the view changes.

### Lightbox controller

The Lightbox controller owns the selected media index, previous/next navigation, touch gestures, keyboard controls, media information, and flip-panel state.

## Media pipeline

```text
images/ -- GitHub Actions + Pillow --> thumbs/<filename>.webp
   |                                      |
   +------------------------------------> THUMBS_MAP

images/ + videos/ + audio/
   |
   +-- GitHub Actions --> MEDIA_MANIFEST in data/thumbs.js
   |
   v
Browser static filename lookup
   |
   v
Media files requested as needed
```

If a thumbnail is unavailable, the runtime tries the next preview candidate and then the original source.

## Extension points

The system can be extended by:

- Adding a new project summary to `data/projects.js`.
- Adding a matching detail file in `data/`.
- Adding a manifest key and workflow scan for a new media folder.
- Adding a new renderer branch in `loadProject()` for a new `type`.
- Extending the media extension matchers and workflow scan when a new file format is supported.
- Adding new metadata fields to the detail schema and rendering them in the Lightbox.

The separation between project registry, project detail, media files, generated previews, and renderers allows each area to evolve independently.
