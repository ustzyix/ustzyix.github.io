
/* Manually authored media metadata and lightbox controls. */
import {
  $, state, body, topBar, stage, lb, flip,
  lbImg, lbVid, fmtTime
} from "./state.js";

import {
  predecode,
  syncCardVideos,
  vidPosterCache
} from "./media.js";

import { closePm } from "./main.js";

/* ---------- Stored Media Metadata ---------- */
export function fillExif(it, mediaEl) {
  const T = (id, v) => ($(id).textContent = v || "—");

  if (it.isVid) {
    $("#mL1").textContent = "Duration";
    $("#mL2").textContent = "Format";
    $("#mL3").textContent = "Ratio";
    $("#mL4").textContent = "Audio";

    const ext = (it.file.split(".").pop() || "MP4").toUpperCase();

    const vw = lbVid.videoWidth || mediaEl?.videoWidth || 0;
    const vh = lbVid.videoHeight || mediaEl?.videoHeight || 0;
    const dur = lbVid.duration || mediaEl?.duration || 0;

    T("#xCam", it.sub || "Motion Sequence");
    T("#xDate", state.activeProj?.year || "Video");
    T("#xAp", dur ? fmtTime(dur) : "Loop");
    T("#xSh", ext);
    T("#xFo", vw && vh ? `${(vw / vh).toFixed(2)}:1` : "—");
    T("#xIso", "Stereo");
    T("#xApp", it.app || "—");
    T("#xFile", it.file);
    T("#xRes", vw && vh ? `${vw} × ${vh}` : "—");

    return;
  }

  $("#mL1").textContent = "Aperture";
  $("#mL2").textContent = "Shutter";
  $("#mL3").textContent = "Focal";
  $("#mL4").textContent = "ISO";

  const m = it.exif || {};

  T("#xCam", m.camera);
  T("#xDate", m.captured);
  T("#xAp", m.aperture);
  T("#xSh", m.shutter);
  T("#xFo", m.focal);
  T("#xIso", m.iso);
  T("#xApp", m.app || it.app);
  T("#xFile", it.file);

  const fullReady =
    lbImg.dataset.fullSrc === it.src &&
    lbImg.naturalWidth > 0;

  const fallbackOnly =
    it.resolvedThumb === it.src &&
    mediaEl?.naturalWidth > 0;

  const w = fullReady
    ? lbImg.naturalWidth
    : fallbackOnly
      ? mediaEl.naturalWidth
      : 0;

  const h = fullReady
    ? lbImg.naturalHeight
    : fallbackOnly
      ? mediaEl.naturalHeight
      : 0;

  T(
    "#xRes",
    m.resolution ||
      (
        w && h
          ? `${w} × ${h} (${((w * h) / 1e6).toFixed(1)} MP)`
          : "Loading…"
      )
  );
}

/* ---------- Lightbox ---------- */
export function openLb() {
  state.modal = true;

  topBar.inert = true;
  stage.inert = true;

  // Stop Gallery Preview playback while Lightbox is open.
  syncCardVideos(true);

  body.classList.add("modal-active");
  lb.classList.add("open");

  syncLightboxShape();

  $("#lbX").focus({ preventScroll: true });
}

export function closeLb() {
  if (!state.modal) return;

  state.modal = false;

  topBar.inert = false;
  stage.inert = false;

  body.classList.remove("modal-active");
  lb.classList.remove("open");

  // Stop Original immediately.
  lbVid.pause();

  setTimeout(() => {
    if (!state.modal) {
      flip.classList.remove("on");
      $("#fbtnT").textContent = "Media info";

      // Release Original source and associated media resources.
      lbVid.removeAttribute("src");
      lbVid.load();

      // Resume only visible Gallery Preview videos.
      syncCardVideos(false);
    }
  }, 340);
}

export function syncLightboxShape() {
  const media =
    lbImg.style.display !== "none"
      ? lbImg
      : lbVid;

  const rect = media.getBoundingClientRect();

  const w =
    rect.width ||
    Math.min(innerWidth * 0.88, 760);

  const nw = media.naturalWidth || media.videoWidth || 0;
  const nh = media.naturalHeight || media.videoHeight || 0;

  lb.classList.toggle(
    "lb-horizontal",
    !!(nw && nh && nw / nh > 1.25)
  );

  const radius =
    Math.max(1, Math.round(w * 0.035 * 100) / 100);

  const gap =
    Math.max(1, Math.round(w * 0.008 * 100) / 100);

  lb.style.setProperty("--lb-radius", `${radius}px`);
  lb.style.setProperty("--lb-media-radius", `${Math.max(1, radius - 4)}px`);
  lb.style.setProperty("--lb-frame-gap", `${gap}px`);
}

/* ---------- Media Selection ---------- */
export async function select(i, open) {
  if (!state.entries.length) return;

  state.cur =
    (i + state.entries.length) % state.entries.length;

  const it = state.entries[state.cur];
  const mediaEl =
    state.cards[state.cur]?.querySelector("img,video");

  const tok = ++state.selTok;

  if (!open) return;

  const activeThumb =
    it.resolvedThumb || it.thumb;

  flip.classList.remove("on");
  $("#fbtnT").textContent = "Media info";
  $("#cap").textContent = it.caption;

  /* ---------- Video: Original Source ---------- */
  if (it.isVid) {
    lbImg.style.display = "none";
    lbImg.dataset.fullSrc = "";

    lbVid.style.display = "block";

    // Always use Original in Lightbox.
    const originalSrc =
      it.originalSrc || it.src;

    // Poster can come from Preview or a generated thumbnail.
    const posterUrl =
      it.poster ||
      vidPosterCache.get(it.previewSrc || it.src) ||
      "";

    if (posterUrl) {
      lbVid.poster = posterUrl;
    } else {
      lbVid.removeAttribute("poster");
    }

    // Reset any previous media source before assigning Original.
    lbVid.pause();
    lbVid.removeAttribute("src");
    lbVid.load();

    lbVid.crossOrigin = "anonymous";
    lbVid.src = originalSrc;

    lbVid.onloadedmetadata = () => {
      if (tok !== state.selTok) return;

      fillExif(it, mediaEl);
      syncLightboxShape();
    };

    lbVid.onerror = () => {
      if (tok !== state.selTok) return;

      // Retry without crossorigin if needed.
      if (lbVid.hasAttribute("crossorigin")) {
        lbVid.removeAttribute("crossorigin");
        lbVid.load();
      }
    };

    if (!state.modal) {
      openLb();
    } else {
      syncLightboxShape();
    }

    lbVid.play().catch(() => {});

    fillExif(it, mediaEl);

    return;
  }

  /* ---------- Image ---------- */
  lbVid.pause();
  lbVid.removeAttribute("src");
  lbVid.load();

  lbVid.style.display = "none";
  lbImg.style.display = "block";
  lbImg.dataset.fullSrc = "";

  const hasDistinctThumb =
    activeThumb && activeThumb !== it.src;

  if (hasDistinctThumb) {
    // Open immediately with cached thumbnail.
    lbImg.src = activeThumb;
    lbImg.onload = syncLightboxShape;

    fillExif(it, mediaEl);

    if (!state.modal) openLb();

    const ok = await predecode(it.src);

    if (tok !== state.selTok || !state.modal) return;

    if (ok) {
      lbImg.src = it.src;
      lbImg.dataset.fullSrc = it.src;

      syncLightboxShape();
      fillExif(it, lbImg);
    }
  } else {
    await Promise.race([
      predecode(it.src),
      new Promise((r) => setTimeout(r, 450))
    ]);

    if (tok !== state.selTok) return;

    lbImg.src = it.src;

    lbImg.onload = () => {
      if (tok === state.selTok) {
        lbImg.dataset.fullSrc = it.src;
        syncLightboxShape();
        fillExif(it, lbImg);
      }
    };

    if (lbImg.complete && lbImg.naturalWidth > 0) {
      lbImg.dataset.fullSrc = it.src;
    }

    fillExif(it, mediaEl);

    if (!state.modal) {
      openLb();
    } else {
      syncLightboxShape();
    }
  }
}

/* ---------- Media Info Flip ---------- */
export function toggleFlip() {
  const on = flip.classList.toggle("on");

  if (on && !lbVid.paused) {
    lbVid.pause();
  }

  $("#fbtnT").textContent =
    on ? "View media" : "Media info";

  navigator.vibrate?.(10);
}

/* ---------- Event Listeners ---------- */
$("#fbtn").onclick = (e) => {
  e.stopPropagation();
  toggleFlip();
};

$("#scene").onclick = (e) => {
  if (e.target === lbVid) return;
  toggleFlip();
};

$("#scene").onkeydown = (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleFlip();
  }
};

$("#lbX").onclick = (e) => {
  e.stopPropagation();
  closeLb();
};

lb.onclick = (e) => {
  if (
    e.target === lb ||
    e.target.classList.contains("lb-in")
  ) {
    closeLb();
  }
};

addEventListener("keydown", (e) => {
  if (state.pmOpen && e.key === "Escape") {
    closePm();
    return;
  }

  if (!state.modal) return;

  if (e.key === "Escape") {
    closeLb();
  }
});

addEventListener(
  "resize",
  () => {
    if (state.modal) syncLightboxShape();
  },
  { passive: true }
);

window.visualViewport?.addEventListener(
  "resize",
  () => {
    if (state.modal) syncLightboxShape();
  },
  { passive: true }
);
