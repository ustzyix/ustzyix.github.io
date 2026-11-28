/* Deferred media loading, video observation/posters, and async image decode cache. EXIF parsing is intentionally omitted; data-authored metadata remains supported. */
import { state, stage } from "./state.js";

/* ---------- Auto First-Frame Video Poster Cache ---------- */
export const vidPosterCache = new Map();
const posterCanvas = document.createElement("canvas");
const posterCtx = posterCanvas.getContext("2d", { alpha: false });

export function captureVideoPoster(videoEl, key) {
  if (!videoEl || !key || vidPosterCache.has(key) || !videoEl.videoWidth || !videoEl.videoHeight) {
    return vidPosterCache.get(key) || "";
  }
  try {
    const w = 160;
    const h = Math.max(1, Math.round(w * (videoEl.videoHeight / videoEl.videoWidth)));
    posterCanvas.width = w;
    posterCanvas.height = h;
    posterCtx.drawImage(videoEl, 0, 0, w, h);
    const url = posterCanvas.toDataURL("image/jpeg", 0.72);
    if (url && url.length > 64) {
      vidPosterCache.set(key, url);
      if (vidPosterCache.size > 40) vidPosterCache.delete(vidPosterCache.keys().next().value);
      return url;
    }
  } catch (_) {}
  return "";
}

/* ---------- Viewport Observer: Play Visible Videos & Track Active Video ---------- */
export const visibleVideos = new Set();

export function ensureVideoSource(videoEl) {
  if (videoEl && !videoEl.getAttribute("src") && videoEl.dataset.src) {
    videoEl.src = videoEl.dataset.src;
    videoEl.load();
  }
}

export const vidObs = new IntersectionObserver(
  (ents) => {
    ents.forEach((en) => {
      const v = en.target;
      if (en.isIntersecting) {
        visibleVideos.add(v);
        // Load once on first visibility; pausing off-screen avoids repeated source resets.
        ensureVideoSource(v);
      } else {
        visibleVideos.delete(v);
        v.pause();
      }
    });
  },
  { root: stage, threshold: 0.15 }
);

export function syncCardVideos(pauseAll) {
  state.cards.forEach((c) => {
    const v = c.querySelector("video");
    if (v) {
      if (pauseAll) v.pause();
      else if (visibleVideos.has(v)) ensureVideoSource(v);
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
        : new Promise((r) => {
            im.onload = () => r(im.naturalWidth > 0);
            im.onerror = () => r(false);
          })
    ).catch(() => false);
    rec = { im, prom };
    decoded.set(src, rec);
    if (decoded.size > 4) decoded.delete(decoded.keys().next().value);
  }
  return rec.prom;
}
