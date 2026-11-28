/* Project media normalization, detail loading, folder discovery, and view lifecycle. */
import { GALLERY as G } from "../../data/projects.js";
import { THUMBS_MAP, MEDIA_MANIFEST } from "../../data/thumbs.js";

import {
  $, state, body, stage, canvas,
  viewCache, MAX_CACHED_VIEWS,
  cleanDir, isDirectUrl, encodePath, safeDecode,
  VID_OK, MEDIA_OK, capOf, pad, scheduleIdle
} from "./state.js";

import {
  vidObs,
  visibleVideos
} from "./media.js";

import {
  stopAudio, updateCount, layout, scheduleLayout,
  mountInteractive, mountPlaylist, addCard
} from "./renderers.js";

const PROJECTS = G.projects || [];

/* ---------- Thumbnail Directory & Extension Resolvers ---------- */

export function resolveThumbDir(proj, fDir) {
  const raw =
    proj.thumbFolder !== undefined
      ? proj.thumbFolder
      : proj.thumbs !== undefined
      ? proj.thumbs
      : G.thumbFolder !== undefined
      ? G.thumbFolder
      : G.thumbs;

  if (raw === false || raw === null || raw === "") {
    return "";
  }

  if (raw === true) {
    return `${fDir}/thumbs`;
  }

  return cleanDir(raw);
}

export function resolveThumbExts(proj) {
  const raw =
    proj.thumbExt !== undefined
      ? proj.thumbExt
      : G.thumbExt;

  if (!raw) return [];

  return (Array.isArray(raw) ? raw : [raw])
    .map((e) =>
      String(e).replace(/^\.+/, "").toLowerCase()
    )
    .filter(Boolean);
}

export function buildThumbCandidates(
  file,
  fDir,
  tDir,
  thumbExts,
  explicitThumb,
  isVid,
  allowVidThumb
) {
  const list = [];

  const push = (u) => {
    if (u && !list.includes(u)) {
      list.push(u);
    }
  };

  if (explicitThumb) {
    if (isDirectUrl(explicitThumb)) {
      push(explicitThumb);
    } else if (
      String(explicitThumb).includes("/")
    ) {
      push(
        `./${encodePath(
          String(explicitThumb).replace(/^\.?\//, "")
        )}`
      );
    } else {
      push(
        `./${encodePath(tDir || fDir)}/${encodePath(explicitThumb)}`
      );
    }
  }

  if (tDir) {
    const base = file.replace(/\.[^/.]+$/, "");
    const dirEnc = encodePath(tDir);

    if (!isVid) {
      if (thumbExts && thumbExts.length) {
        thumbExts.forEach((te) => {
          push(
            `./${dirEnc}/${encodePath(`${base}.${te}`)}`
          );
        });
      }

      push(
        `./${dirEnc}/${encodePath(file)}`
      );
    } else if (
      allowVidThumb ||
      (thumbExts && thumbExts.length)
    ) {
      const vExts =
        thumbExts && thumbExts.length
          ? thumbExts
          : ["webp", "jpg"];

      vExts.forEach((te) => {
        push(
          `./${dirEnc}/${encodePath(`${base}.${te}`)}`
        );
      });
    }
  }

  return list;
}

/* ---------- Video Source Resolver ---------- */

function resolveMediaSource(value, folder) {
  if (!value) return "";

  if (isDirectUrl(value)) {
    return value;
  }

  return `./${encodePath(folder)}/${encodePath(
    String(value).replace(/^\.?\//, "")
  )}`;
}

/* ---------- Normalize Media Entry ---------- */

export function toEntry(
  p,
  i,
  folder,
  tfolder,
  thumbExts,
  allowVidThumb
) {
  if (typeof p === "string") {
    p = { file: p };
  }

  const fDir = cleanDir(folder || "images");

  const tDir = tfolder === true
    ? `${fDir}/thumbs`
    : cleanDir(tfolder || "");

  const rawRef =
    p.file ||
    String(p.src || "").split("?")[0].split("/").pop();

  const file = safeDecode(rawRef);

  const isVid =
    p.type === "video" ||
    VID_OK.test(file) ||
    VID_OK.test(p.src || "");

  const declaredRatio = Number(p.ratio);

  const ratio =
    Number.isFinite(declaredRatio) &&
    declaredRatio > 0
      ? declaredRatio
      : 0;

  // Original source remains the canonical source.
  const src =
    p.src ||
    `./${encodePath(fDir)}/${encodePath(file)}`;

  // Preview may be explicitly declared in project data.
  // MP4 files use the GitHub Actions naming convention.
  const rawPreview =
    p.previewSrc ||
    p.preview ||
    "";

  let previewSrc = "";

  if (isVid) {
    if (rawPreview) {
      previewSrc = resolveMediaSource(
        rawPreview,
        fDir
      );
    } else if (/\.mp4$/i.test(file)) {
      const previewFile =
        `${file.replace(/\.[^/.]+$/, "")}.preview.mp4`;

      previewSrc =
        `./${encodePath(fDir)}/preview/${encodePath(previewFile)}`;
    } else {
      previewSrc = src;
    }
  }

  const manifestThumb =
    THUMBS_MAP?.[file] || "";

  // Generated video Poster convention:
  // videos/posters/<original-name>.webp
  const generatedVideoPoster =
    isVid && /\.mp4$/i.test(file)
      ? `${fDir}/posters/${file.replace(/\.[^/.]+$/, "")}.webp`
      : "";

  const explicitThumb =
    p.poster ||
    p.thumb ||
    manifestThumb ||
    generatedVideoPoster;

  const thumbCandidates = buildThumbCandidates(
    file,
    fDir,
    tDir,
    thumbExts,
    explicitThumb,
    isVid,
    allowVidThumb
  );

  const thumb =
    thumbCandidates[0] ||
    (isVid ? "" : src);

  return {
    file,

    // Original media source.
    src,
    originalSrc: src,

    // Gallery preview source.
    previewSrc,

    thumb,
    resolvedThumb: thumb,
    thumbCandidates,

    isVid,
    ratio,

    poster: isVid
      ? thumb
      : p.poster || "",

    caption: p.title || capOf(file),
    sub: p.sub || `Archive · ${pad(i + 1)}`,
    app: p.app || "",
    exif: p.exif || null,
    auto: !!p.auto
  };
}

/* ---------- Lazy Loader & Idle Prefetcher for data/*.js Modules ---------- */

export const projectStore = new Map();

const loadedModules = new Map();

export async function fetchProjectDetail(proj) {
  const storeKey = proj.id || proj.data;

  if (!proj.data || projectStore.has(storeKey)) {
    return {
      ok: true,
      proj: {
        ...proj,
        ...(projectStore.get(storeKey) || {})
      }
    };
  }

  if (!loadedModules.has(proj.data)) {
    const modulePath =
      `../../${proj.data.replace(/^\.?\//, "")}`;

    loadedModules.set(
      proj.data,
      import(modulePath)
        .then((mod) => {
          const detail = mod.default || mod;

          if (
            detail &&
            typeof detail === "object"
          ) {
            projectStore.set(storeKey, detail);
            return true;
          }

          return false;
        })
        .catch(() => false)
    );
  }

  const ok = await loadedModules.get(proj.data);

  const loaded =
    ok && projectStore.has(storeKey);

  if (!loaded) {
    loadedModules.delete(proj.data);
  }

  return {
    ok: loaded,
    proj: {
      ...proj,
      ...(projectStore.get(storeKey) || {})
    }
  };
}

export function prefetchProjects() {
  PROJECTS.forEach((p) => {
    const storeKey = p.id || p.data;

    if (
      p.data &&
      !projectStore.has(storeKey) &&
      !loadedModules.has(p.data)
    ) {
      fetchProjectDetail(p);
    }
  });
}

/* ---------- Static Media Manifest Discovery ---------- */

export function discoverFiles(
  folder,
  regex,
  pid,
  onFiles
) {
  const names = MEDIA_MANIFEST?.[folder];

  if (!Array.isArray(names)) return;

  const files = names
    .filter(
      (name) =>
        typeof name === "string" &&
        regex.test(name)
    )
    .sort();

  if (state.activeProj?.id === pid) {
    onFiles(files);
  }
}

/* ---------- Keep-Alive View Cache & Project Switcher ---------- */

export function suspendCurrentView() {
  stopAudio();
  visibleVideos.clear();

  if (
    state.activeProj?.id &&
    viewCache.has(state.activeProj.id)
  ) {
    viewCache.get(state.activeProj.id).scrollTop =
      stage.scrollTop || 0;
  }

  state.cards.forEach((c) => {
    const v = c.querySelector("video");

    if (v) {
      vidObs.unobserve(v);
      v.pause();

      if (v.getAttribute("src")) {
        v.removeAttribute("src");
        v.load();
      }

      // A failed preview should be eligible for a fresh attempt
      // when this cached view is activated again.
      delete v.dataset.failed;
      c.removeAttribute("data-video-error");
    }
  });

  if (state.activeViewEl) {
    state.activeViewEl.hidden = true;
  }
}

export function evictOldestView() {
  if (viewCache.size < MAX_CACHED_VIEWS) {
    return;
  }

  const oldestKey =
    viewCache.keys().next().value;

  const old = viewCache.get(oldestKey);

  if (old) {
    old.cards.forEach((c) => {
      const v = c.querySelector("video");

      if (v) {
        vidObs.unobserve(v);
        v.pause();
        v.removeAttribute("src");
        v.load();
      }
    });

    old.el.remove();
  }

  viewCache.delete(oldestKey);
}

/* ---------- Project Loader ---------- */

export async function loadProject(baseProj, pushHash) {
  suspendCurrentView();

  const tok = ++state.loadTok;

  state.activeProj = baseProj;
  state.selTok++;
  state.cur = 0;

  state.tx = state.ty = state.cx = state.cy = 0;

  const mode = baseProj.type || "gallery";

  body.dataset.mode = mode;

  $("#projName").textContent =
    baseProj.title || "Archive";

  document.title =
    `ustzyix — ${baseProj.title || "Visual Studio"}`;

  if (pushHash && baseProj.id) {
    history.replaceState(
      null,
      "",
      "#" + encodeURIComponent(baseProj.id)
    );
  }

  /* ---------- Restore Cached Gallery ---------- */

  if (
    mode === "gallery" &&
    baseProj.id &&
    viewCache.has(baseProj.id)
  ) {
    const cached = viewCache.get(baseProj.id);

    viewCache.delete(baseProj.id);
    viewCache.set(baseProj.id, cached);

    state.activeProj = cached.proj;
    state.activeViewEl = cached.el;
    state.entries = cached.entries;
    state.cards = cached.cards;

    state.activeViewEl.hidden = false;

    updateCount();

    if (state.grid) {
      state.cards.forEach((c) => {
        c.classList.add("settled");
        c.style.translate = "";
        c.style.zIndex = "";
      });

      canvas.style.height = "";
    } else {
      state.cards.forEach((c) => {
        c.classList.add("settled");
      });

      layout(false);
    }

    stage.scrollTop = cached.scrollTop || 0;

    state.cards.forEach((c) => {
      const v = c.querySelector("video");

      if (v) {
        vidObs.observe(v);
      }
    });

    return;
  }

  /* ---------- Create New View ---------- */

  $("#count").textContent = "Loading…";

  canvas.style.height = "";
  canvas.removeAttribute("data-empty");

  if (stage.scrollTop) {
    stage.scrollTop = 0;
  }

  const viewEl = document.createElement("div");

  viewEl.className = "proj-view";
  canvas.append(viewEl);

  state.activeViewEl = viewEl;
  state.cards = [];
  state.entries = [];

  const { ok, proj } =
    await fetchProjectDetail(baseProj);

  if (tok !== state.loadTok) {
    viewEl.remove();
    return;
  }

  state.activeProj = proj;

  if (!ok && proj.data) {
    updateCount(
      `Could not load ${proj.data} — check file syntax.`
    );

    return;
  }

  if (mode === "interactive") {
    mountInteractive(proj, viewEl);
    return;
  }

  if (mode === "playlist") {
    mountPlaylist(proj, viewEl);
    return;
  }

  /* ---------- Build Gallery Entries ---------- */

  const fDir = cleanDir(proj.folder || "images");

  const tDir = resolveThumbDir(proj, fDir);
  const tExts = resolveThumbExts(proj);

  const allowVidThumb =
    !!(proj.videoThumbs ?? G.videoThumbs);

  state.entries = (proj.photos || [])
    .filter((p) =>
      p && (
        typeof p === "string" ||
        p.file ||
        p.src
      )
    )
    .map((p, i) =>
      toEntry(
        p,
        i,
        fDir,
        tDir,
        tExts,
        allowVidThumb
      )
    );

  state.entries.forEach((e, i) => {
    addCard(e, i, tok, viewEl);
  });

  updateCount();

  if (!state.grid) {
    layout(true);
  }

  if (proj.id) {
    evictOldestView();

    viewCache.set(proj.id, {
      el: viewEl,
      proj,
      entries: state.entries,
      cards: state.cards,
      scrollTop: 0
    });
  }

  /* ---------- Discover Additional Media ---------- */

  if (proj.discover !== false) {
    scheduleIdle(() => {
      if (tok !== state.loadTok) return;

      discoverFiles(
        fDir,
        MEDIA_OK,
        proj.id,
        (files) => {
          if (tok !== state.loadTok) return;

          const have = new Set(
            state.entries.map((p) => p.file)
          );

          const added = files.filter(
            (f) => !have.has(f)
          );

          if (!added.length) return;

          added.forEach((f) => {
            const e = toEntry(
              {
                file: f,
                auto: true
              },
              state.entries.length,
              fDir,
              tDir,
              tExts,
              allowVidThumb
            );

            state.entries.push(e);

            addCard(
              e,
              state.entries.length - 1,
              tok,
              viewEl
            );
          });

          updateCount();
          scheduleLayout();
        }
      );
    });
  }
}
