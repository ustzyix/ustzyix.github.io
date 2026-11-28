
/* Deferred media loading, video observation/posters, and async image decode cache.
   EXIF parsing is intentionally omitted; data-authored metadata remains supported.
*/
import { state, stage } from "./state.js";

/* ---------- Auto First-Frame Video Poster Cache ---------- */
export const vidPosterCache = new Map();

const posterCanvas = document.createElement("canvas");
const posterCtx = posterCanvas.getContext("2d", { alpha: false });

export function captureVideoPoster(videoEl, key) {
  if (
    !videoEl ||
    !key ||
    vidPosterCache.has(key) ||
    !videoEl.videoWidth ||
    !videoEl.videoHeight
  ) {
    return vidPosterCache.get(key) || "";
  }

  try {
    const w = 160;
    const h = Math.max(
      1,
      Math.round(w * (videoEl.videoHeight / videoEl.videoWidth))
    );

    posterCanvas.width = w;
    posterCanvas.height = h;

    posterCtx.drawImage(videoEl, 0, 0, w, h);

    const url = posterCanvas.toDataURL("image/jpeg", 0.72);

    if (url && url.length > 64) {
      vidPosterCache.set(key, url);

      if (vidPosterCache.size > 40) {
        vidPosterCache.delete(
          vidPosterCache.keys().next().value
        );
      }

      return url;
    }
  } catch (_) {}

  return "";
}

/* ---------- Viewport Observer: Play Visible Videos ---------- */

export const visibleVideos = new Set();

/**
 * Load video source only once.
 */
export function ensureVideoSource(videoEl) {
  if (
    videoEl &&
    !videoEl.getAttribute("src") &&
    videoEl.dataset.src
  ) {
    videoEl.src = videoEl.dataset.src;
    videoEl.load();
  }
}

/**
 * Safely resume a preview video.
 */
function playPreview(videoEl) {
  if (
    !videoEl ||
    !videoEl.isConnected ||
    !visibleVideos.has(videoEl) ||
    !videoEl.paused
  ) {
    return;
  }

  ensureVideoSource(videoEl);

  const playPromise = videoEl.play();

  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch((err) => {
      // Ignore interruptions caused by pause, source changes, or DOM removal.
      if (err?.name !== "AbortError") {
        console.warn("Video preview playback failed:", err);
      }
    });
  }
}

/**
 * Observe video visibility inside the gallery stage.
 */
export const vidObs = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const videoEl = entry.target;

      if (entry.isIntersecting) {
        visibleVideos.add(videoEl);

        ensureVideoSource(videoEl);

        playPreview(videoEl);
      } else {
        visibleVideos.delete(videoEl);

        videoEl.pause();
      }
    });
  },
  {
    root: stage,
    threshold: 0.15
  }
);

/**
 * Synchronize gallery preview videos.
 *
 * pauseAll = true:
 *   Pause every gallery preview (Lightbox opened).
 *
 * pauseAll = false:
 *   Resume only videos currently marked visible.
 */
export function syncCardVideos(pauseAll = false) {
  state.cards.forEach((card) => {
    const videoEl = card.querySelector("video");

    if (!videoEl) return;

    if (pauseAll) {
      videoEl.pause();
      return;
    }

    if (visibleVideos.has(videoEl)) {
      playPreview(videoEl);
    }
  });
}

/* ---------- Async Image Decode Cache ---------- */

const decoded = new Map();

export function predecode(src) {
  let rec = decoded.get(src);

  if (!rec) {
    const im = new Image();

    im.decoding = "async";
    im.src = src;

    const prom = (
      im.decode
        ? im.decode().then(() => im.naturalWidth > 0)
        : new Promise((resolve) => {
            im.onload = () => resolve(im.naturalWidth > 0);
            im.onerror = () => resolve(false);
          })
    ).catch(() => false);

    rec = { im, prom };

    decoded.set(src, rec);

    if (decoded.size > 4) {
      decoded.delete(decoded.keys().next().value);
    }
  }

  return rec.prom;
}
