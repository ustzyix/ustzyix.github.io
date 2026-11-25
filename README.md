# System Architecture

This repository is a static, client-side media application. The browser loads one HTML entry point, reads project definitions from JavaScript data files, and renders the selected project without a backend service or server-side rendering.

## System model

```text
Browser
  |
  v
index.html
  |-- data/projects.js     project registry
  |-- data/thumbs.js       generated thumbnail manifest
  |-- data/<project>.js    lazy project data
  |-- images/              original image media
  |-- thumbs/              optimized image previews
  |-- videos/              video media
  |
  +-- Gallery renderer
  +-- Interactive renderer
  +-- Playlist renderer
  +-- Lightbox and media metadata

GitHub Actions
  |
  +-- images/ -> thumbs/ + data/thumbs.js
```

## Core principles

- The application has a single runtime entry point: `index.html`.
- Static project summaries are loaded first; detailed project data is loaded only when needed.
- Media metadata is separated from media files.
- Rendering is selected by the project `type`.
- Original media and preview media have separate responsibilities.
- Browser APIs handle lazy loading, media decoding, navigation, and fullscreen behavior.
- Generated files are kept separate from manually maintained source files.

## Repository structure

```text
.
├── index.html
├── data/
│   ├── projects.js
│   ├── archive-01.js
│   ├── videos-01.js
│   └── thumbs.js
├── images/
├── thumbs/
├── videos/
├── .github/workflows/
│   └── make-thumbs.yml
└── README.md
```

## File responsibilities

### `index.html`

The application runtime and presentation layer. It contains:

- HTML structure for the application shell.
- CSS for layout, responsive behavior, controls, cards, and dialogs.
- Project loading and routing logic.
- Gallery, Interactive, and Playlist renderers.
- Lightbox navigation and media information.
- Thumbnail selection and fallback handling.
- Lazy loading for images and videos.
- EXIF parsing for image metadata.
- Project view caching.

The runtime is organized as a set of browser-side modules inside the page rather than separate bundled files.

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
      tag: "Category",
      exif: {
        camera: "Camera name",
        captured: "Capture date"
      }
    }
  ]
});
```

The current repository includes `data/archive-01.js` and `data/videos-01.js` as project-specific data files. Their role is the same as any future `data/<project>.js` file.

### `data/thumbs.js`

The generated thumbnail manifest. It maps original filenames to preview files.

```js
window.THUMBS_MAP = {
  "example.jpg": "thumbs/example.webp"
};
```

This file is an output of the thumbnail pipeline and should not be treated as the primary media index.

### `images/`

Stores original image files. These files are used for full-resolution viewing and thumbnail generation.

### `thumbs/`

Stores generated preview images. The runtime uses these files for the initial gallery view when a matching entry exists in `data/thumbs.js`.

### `videos/`

Stores video files. A media entry is recognized as a video when its `type` is `video` or its filename has a supported video extension.

### `.github/workflows/make-thumbs.yml`

The media preprocessing pipeline. It reads supported files from `images/`, creates preview images, removes stale previews, and regenerates `data/thumbs.js`.

The workflow is independent from the browser runtime: the website only consumes the generated files.

## Runtime lifecycle

### 1. Bootstrap

The page creates the application shell and initializes the global data containers:

- `window.GALLERY` stores the project registry.
- `window.PROJECT_STORE` stores loaded project details.
- `window.THUMBS_MAP` stores preview paths.

### 2. Project selection

The initial project is selected from the URL hash. The project switcher can select another registered project and update the hash without a full page reload.

### 3. Detail loading

`fetchProjectDetail()` loads the project’s `data` file only once. Loaded files are tracked in a map so the same script is not requested repeatedly.

### 4. Mode dispatch

`loadProject()` checks the project `type` and calls one renderer:

```text
type === "gallery"      -> create media cards
type === "interactive"  -> mount an iframe view
type === "playlist"     -> mount an audio view
```

### 5. Gallery normalization

`toEntry()` converts different input forms into one internal media-entry shape. It resolves:

- Original source path.
- Preview candidates.
- Media type.
- Caption and labels.
- Optional metadata.

This normalized shape allows images and videos to use the same card, navigation, and Lightbox logic.

### 6. Media rendering

`addCard()` creates a card and attaches the appropriate media element. Images use preview candidates first. Videos use a deferred `data-src` value so the original video source is not assigned before the card is visible.

### 7. Visibility management

`IntersectionObserver` tracks video cards in the viewport. Visible videos may load their source; videos that leave the viewport are paused and their source is released.

### 8. Lightbox loading

The Lightbox opens the selected media item. When a preview is available, it can display immediately while the original image is decoded asynchronously. The original source replaces the preview after decoding completes.

### 9. View caching

Project views can be kept in an in-memory cache. Returning to a cached project restores its view state instead of rebuilding the entire project from the beginning.

## Gallery data contract

### Project-level fields

| Field | Purpose |
| --- | --- |
| `folder` | Source directory for media files. |
| `discover` | Enables optional directory discovery through the GitHub Contents API. |
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
| `tag` | Optional category label. |
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

## Thumbnail pipeline

```text
Original image
    |
    v
GitHub Actions + Pillow
    |
    +--> thumbs/<filename>.webp
    +--> data/thumbs.js
    |
    v
Browser thumbnail lookup
    |
    v
Full-resolution source when requested
```

The manifest prevents the browser from guessing preview filenames. If a manifest entry or preview candidate is unavailable, the runtime falls back to the original source.

## Extension points

The system can be extended by:

- Adding a new project summary to `data/projects.js`.
- Adding a matching detail file in `data/`.
- Adding a new renderer branch in `loadProject()` for a new `type`.
- Extending the media extension matchers when a new file format is supported.
- Adding new metadata fields to the detail schema and rendering them in the Lightbox.

The separation between project registry, project detail, media files, generated previews, and renderers allows each area to evolve independently.
