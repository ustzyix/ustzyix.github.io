/* Layout behavior and renderers for gallery, interactive work, and playlist views. */
import {
  $, state, stage, canvas, mobileLayout,
  esc, cleanDir, encodePath, capOf, isDirectUrl, pad, fmtTime, scheduleIdle, AUD_OK
} from "./state.js";
import { vidPosterCache, captureVideoPoster, vidObs } from "./media.js";
import { select } from "./lightbox.js";
import { discoverFiles } from "./loader.js";

/* ---------- Desktop-Only Mouse Parallax ---------- */
export function par() {
  if (state.modal || state.pmOpen || state.grid || (state.activeProj?.type || "gallery") !== "gallery") {
    state.pr = 0;
    return;
  }
  state.cx += (state.tx - state.cx) * 0.08;
  state.cy += (state.ty - state.cy) * 0.08;
  for (const c of state.cards) {
    c.style.translate = `${(state.cx * c._d).toFixed(2)}px ${(state.cy * c._d).toFixed(2)}px`;
  }
  state.pr =
    Math.abs(state.tx - state.cx) + Math.abs(state.ty - state.cy) > 0.02
      ? requestAnimationFrame(par)
      : 0;
}

/* ---------- Scatter Layout ---------- */
const DP = [
  { x: 0.07, w: 0.3, g: -24, d: 0.45 },
  { x: 0.6, w: 0.32, g: 28, d: 0.75 },
  { x: 0.24, w: 0.34, g: -12, d: 0.9 },
  { x: 0.48, w: 0.31, g: -40, d: 0.6 },
  { x: 0.07, w: 0.28, g: 24, d: 0.5 },
  { x: 0.65, w: 0.29, g: -30, d: 0.8 }
];
const MOBILE_DP = [
  { x: 0.02, w: 0.3, g: -24, d: 0.45 },
  { x: 0.64, w: 0.32, g: 28, d: 0.75 },
  { x: 0.18, w: 0.34, g: -12, d: 0.9 },
  { x: 0.53, w: 0.31, g: -40, d: 0.6 },
  { x: 0.02, w: 0.28, g: 24, d: 0.5 },
  { x: 0.68, w: 0.29, g: -30, d: 0.8 }
];

let lt = 0;
export const scheduleLayout = () => {
  lt ||
    (lt = requestAnimationFrame(() => {
      lt = 0;
      layout(false);
    }));
};

export function layout(force) {
  if (state.grid || !state.cards.length || (state.activeProj?.type || "gallery") !== "gallery") return;
  const W = canvas.clientWidth;
  if (!W) return;
  const widthChanged = Math.abs(W - state.lastLayoutW) > 1;
  if (widthChanged) state.lastLayoutW = W;
  const unit = mobileLayout ? W / 900 : 1;
  const P = mobileLayout ? MOBILE_DP : DP;
  const minH = mobileLayout
    ? Math.max(300 * unit, stage.clientHeight - 110 * unit)
    : Math.max(300, stage.clientHeight - 110);

  const portraitSizes = state.cards
    .map((el, i) => {
      if (!el._mediaReady) return null;
      const media = el.querySelector("img,video");
      const nw = media?.naturalWidth || media?.videoWidth || 0;
      const nh = media?.naturalHeight || media?.videoHeight || 0;
      const ratio = el._ratio || (nw && nh ? nw / nh : 0);
      const w = Math.round(W * P[i % P.length].w);
      return ratio > 0 && ratio < 1 ? { width: w, height: w / ratio } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.height - b.height);

  const balance = portraitSizes.length ? portraitSizes[Math.floor(portraitSizes.length / 2)] : null;
  const balanceTolerance = 0.1;

  state.cards.forEach((el, i) => {
    const p = P[i % P.length];
    let w = Math.round(W * p.w);
    if (el._landscape && balance && el._ratio > 0) {
      // Preserve the photo's ratio while balancing its width against portrait height
      // and its height against portrait width (geometric mean is the compromise).
      const targetW = Math.min(Math.sqrt(balance.height * balance.width * el._ratio), W * 0.72);
      if (w < targetW) {
        const delta = (targetW - w) / targetW;
        w = delta > balanceTolerance ? Math.round(targetW) : Math.round(w + (targetW - w) * 0.7);
      }
    }
    const l = Math.min(Math.round(W * p.x), Math.max(0, W - w));
    const sizeChanged = force || widthChanged || !el._sized || el._w !== w;
    el._d = p.d;
    el._l = l;
    el._w = w;
    if (sizeChanged) {
      el.style.width = w + "px";
      el.style.left = l + "px";
      el.style.zIndex = Math.round(p.d * 10);
      el._hLocked = false;
      el._sized = true;
    }
  });

  const heights = state.cards.map((el) => {
    if (!force && !widthChanged && el._hLocked && el._h) return el._h;
    const h = el.offsetHeight || el._w * 0.75 + 44;
    if (el._mediaReady) {
      el._h = h;
      el._hLocked = true;
    }
    return h;
  });

  let bottom = 0;
  state.cards.forEach((el, i) => {
    const p = P[i % P.length];
    const h = heights[i];
    let top = mobileLayout ? 8 * unit : 8;
    const g = mobileLayout ? p.g * unit : p.g;
    if (i) {
      const q = state.cards[i - 1];
      const overlapX = mobileLayout ? 16 * unit : 16;
      const ov = el._l < q._l + q._w + overlapX && el._l + el._w + overlapX > q._l;
      const overlapY = mobileLayout ? 14 * unit : 20;
      const offsetY = mobileLayout ? 16 * unit : 24;
      const carryY = mobileLayout ? 26 * unit : 42;
      top = ov
        ? bottom + Math.max(overlapY, g + offsetY)
        : Math.max(bottom - Math.min(h, el._w * 0.85) * 0.52 + g, q._t + carryY);
    }
    if (el._t !== top) {
      el._t = top;
      el.style.top = Math.round(top) + "px";
    }
    bottom = Math.max(bottom, top + h);
  });

  const targetH = Math.max(bottom + (mobileLayout ? 56 * unit : 56), minH) + "px";
  if (canvas.style.height !== targetH) canvas.style.height = targetH;
}

/* Playlist media icon */
const TYPE_ICON = {
  playlist: `<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`
};

/* ---------- Mode 1: Gallery ---------- */
export function addCard(it, i, tok = state.loadTok, targetContainer = state.activeViewEl || canvas) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "card in";
  el.style.setProperty("--d", Math.min(i * 55, 330) + "ms");
  el.setAttribute("aria-label", "Inspect " + it.caption);
  el.addEventListener("animationend", () => el.classList.add("settled"), { once: true });

  const initPoster = it.poster || vidPosterCache.get(it.src) || "";
  const mediaHtml = it.isVid
    ? `<video data-src="${esc(it.src)}" ${initPoster ? `poster="${esc(initPoster)}"` : ""} crossorigin="anonymous" muted loop playsinline preload="none"></video><span class="vbadge">▶ VIDEO</span>`
    : `<img alt="${esc(it.caption)}" decoding="async" draggable="false">`;
  el.innerHTML = `<div class="frame">${mediaHtml}</div><div class="meta"><div class="tw"><div class="ttl">${esc(it.caption)}</div><div class="sub">${esc(it.sub || "Stillness")}</div></div></div>`;

  const frame = el.querySelector(".frame");
  const mediaEl = el.querySelector("img,video");
  if (it.isVid && it.ratio > 0) frame.style.aspectRatio = `${it.ratio}`;

  const onReady = () => {
    el._mediaReady = true;
    // Media dimensions replace the placeholder ratio; discard the cached card height.
    el._hLocked = false;
    const w = mediaEl.naturalWidth || mediaEl.videoWidth;
    const h = mediaEl.naturalHeight || mediaEl.videoHeight;
    if (w && h) {
      el._ratio = w / h;
      frame.style.aspectRatio = `${w}/${h}`;
      el._landscape = el._ratio > 1.25;
    } else if (it.ratio > 0) {
      el._ratio = it.ratio;
      el._landscape = it.ratio > 1.25;
    }
    frame.classList.add("loaded");
    if (tok === state.loadTok) scheduleLayout();
    if (it.isVid) {
      const captured = captureVideoPoster(mediaEl, it.src);
      if (captured && !mediaEl.getAttribute("poster")) mediaEl.poster = captured;
      return;
    }
  };

  if (it.isVid) {
    // Probe optional poster candidates from thumbFolder for videos if configured
    if (it.thumbCandidates && it.thumbCandidates.length) {
      let pIdx = 0;
      const tryVidPoster = () => {
        if (pIdx >= it.thumbCandidates.length) return;
        const url = it.thumbCandidates[pIdx++];
        const probe = new Image();
        probe.decoding = "async";
        probe.onload = () => {
          if (tok !== state.loadTok) return;
          it.poster = url;
          vidPosterCache.set(it.src, url);
          mediaEl.poster = url;
          if (!el._mediaReady && probe.naturalWidth && probe.naturalHeight) {
            el._mediaReady = true;
            el._hLocked = false;
            el._ratio = probe.naturalWidth / probe.naturalHeight;
            el._landscape = el._ratio > 1.25;
            frame.style.aspectRatio = `${probe.naturalWidth}/${probe.naturalHeight}`;
            frame.classList.add("loaded");
            scheduleLayout();
          }
        };
        probe.onerror = tryVidPoster;
        probe.src = url;
      };
      tryVidPoster();
    }
    mediaEl.onloadeddata = onReady;
    mediaEl.onerror = () => {
      if (mediaEl.hasAttribute("crossorigin")) {
        mediaEl.removeAttribute("crossorigin");
        mediaEl.load();
        return;
      }
      el._mediaReady = true;
      frame.classList.add("loaded");
      if (tok === state.loadTok) scheduleLayout();
    };
    vidObs.observe(mediaEl);
  } else {
    const candidates = [...it.thumbCandidates];
    if (!candidates.includes(it.src)) candidates.push(it.src);
    let candIdx = 0;
    const saveData = !!navigator.connection?.saveData;
    mediaEl.fetchPriority = i < 2 && !saveData ? "high" : "low";
    mediaEl.loading = i < 2 && !saveData ? "eager" : "lazy";
    mediaEl.onload = () => {
      it.resolvedThumb = candidates[candIdx] || it.src;
      onReady();
    };
    mediaEl.onerror = () => {
      candIdx++;
      if (candIdx < candidates.length) {
        mediaEl.src = candidates[candIdx];
        return;
      }
      if (it.auto) {
        const k = state.entries.indexOf(it);
        if (k > -1) {
          state.entries.splice(k, 1);
          state.cards.splice(k, 1);
        }
        el.remove();
        if (tok === state.loadTok) {
          updateCount();
          scheduleLayout();
        }
        return;
      }
      el._mediaReady = true;
      frame.classList.add("loaded");
      if (tok === state.loadTok) scheduleLayout();
    };
    mediaEl.src = candidates[0];
  }

  el.onclick = () => {
    if (!state.modal && !state.pmOpen) select(state.entries.indexOf(it), true);
  };
  targetContainer.append(el);
  state.cards.push(el);
}

export function updateCount(msg) {
  $("#count").textContent = `${state.entries.length} item${state.entries.length == 1 ? "" : "s"}`;
  canvas.dataset.emptyMsg = msg || "No items found in this collection yet.";
  canvas.toggleAttribute("data-empty", !state.entries.length);
}

/* ---------- Mode 2 & 3 (Interactive & Playlist) ---------- */
export function mountInteractive(proj, targetContainer = state.activeViewEl || canvas) {
  $("#count").textContent = "Interactive";
  canvas.removeAttribute("data-empty");
  const wrap = document.createElement("div");
  wrap.className = "ix-wrap";
  wrap.innerHTML = `<div class="ix-frame"><iframe src="${esc(proj.src || "")}" title="${esc(proj.title || "Interactive Work")}" allow="autoplay; fullscreen" loading="eager"></iframe></div><div class="ix-bar"><div class="ix-info"><div class="ttl">${esc(proj.title || "Interactive")}</div><div class="ix-ctl">${esc(proj.controls || "Touch / Keyboard Controls")}</div></div><button class="ix-fs" id="ixFsBtn" type="button"><svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg><span>Fullscreen</span></button></div>`;
  targetContainer.append(wrap);
  wrap.querySelector("#ixFsBtn").onclick = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (wrap.requestFullscreen) {
      wrap.requestFullscreen().catch(() => wrap.classList.toggle("fs-fallback"));
    } else {
      wrap.classList.toggle("fs-fallback");
    }
  };
}

let activeAudio = null;
export function stopAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }
}

export function mountPlaylist(proj, targetContainer = state.activeViewEl || canvas) {
  const fDir = cleanDir(proj.folder || "audio");
  let tracks = (proj.tracks || []).map((t) => {
    if (typeof t === "string") t = { file: t };
    const file = t.file || String(t.src).split("/").pop();
    return {
      file,
      src: t.src || `./${encodePath(fDir)}/${encodePath(file)}`,
      title: t.title || capOf(file),
      artist: t.artist || proj.title || "ustzyix",
      cover: t.cover ? (isDirectUrl(t.cover) ? t.cover : `./${encodePath(fDir)}/${encodePath(t.cover)}`) : ""
    };
  });
  let idx = 0;
  const aud = new Audio();
  aud.preload = "metadata";
  activeAudio = aud;

  const wrap = document.createElement("div");
  wrap.className = "pl-wrap";
  wrap.innerHTML = `<div class="pl-deck"><div class="pl-top"><div class="pl-art" id="plArt">${TYPE_ICON.playlist}</div><div class="pl-meta"><div class="pl-now">Now Playing</div><div class="pl-title" id="plTitle">—</div><div class="pl-artist" id="plArtist">${esc(proj.sub || "Audio Archive")}</div></div></div><div class="pl-prog"><div class="pl-bar" id="plBar"><div class="pl-fill" id="plFill"></div></div><div class="pl-times"><span id="plCur">0:00</span><span id="plDur">0:00</span></div></div><div class="pl-btns"><button class="pl-cbtn" id="plPrev" type="button"><svg viewBox="0 0 24 24"><path d="M19 20 9 12l10-8v16zM5 19V5"/></svg></button><button class="pl-cbtn pl-play" id="plPlay" type="button"><svg id="plIco" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button><button class="pl-cbtn" id="plNext" type="button"><svg viewBox="0 0 24 24"><path d="M5 4l10 8-10 8V4zM19 5v14"/></svg></button></div></div><div class="pl-tracks" id="plList"></div>`;
  targetContainer.append(wrap);

  const listEl = wrap.querySelector("#plList");
  const artEl = wrap.querySelector("#plArt");
  const icoEl = wrap.querySelector("#plIco");
  const setPlayIcon = (on) => {
    icoEl.innerHTML = on
      ? `<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>`
      : `<path d="M8 5v14l11-7z"/>`;
  };

  function loadTrack(i, autoPlay) {
    if (!tracks.length) return;
    idx = (i + tracks.length) % tracks.length;
    const tr = tracks[idx];
    aud.src = tr.src;
    wrap.querySelector("#plTitle").textContent = tr.title;
    wrap.querySelector("#plArtist").textContent = tr.artist;
    wrap.querySelector("#plCur").textContent = "0:00";
    wrap.querySelector("#plDur").textContent = "0:00";
    wrap.querySelector("#plFill").style.width = "0%";
    if (tr.cover) {
      artEl.innerHTML = `<img src="${esc(tr.cover)}" alt=""/>`;
    } else {
      artEl.innerHTML = TYPE_ICON.playlist;
    }
    [...listEl.children].forEach((r, k) => r.classList.toggle("on", k === idx));
    if (autoPlay) {
      aud
        .play()
        .then(() => setPlayIcon(true))
        .catch(() => setPlayIcon(false));
    }
  }

  function renderTracks() {
    $("#count").textContent = `${tracks.length} track${tracks.length == 1 ? "" : "s"}`;
    canvas.dataset.emptyMsg = "No audio tracks found in this folder yet.";
    canvas.toggleAttribute("data-empty", !tracks.length);
    listEl.innerHTML = "";
    tracks.forEach((tr, k) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "trow" + (k === idx ? " on" : "");
      row.innerHTML = `<span class="tnum">${pad(k + 1)}</span><div class="tinfo"><div class="tttl">${esc(tr.title)}</div><div class="tart">${esc(tr.artist)}</div></div><span class="tdur">▶</span>`;
      row.onclick = () => loadTrack(k, true);
      listEl.append(row);
    });
    if (tracks.length && !aud.src) loadTrack(0, false);
  }

  wrap.querySelector("#plPlay").onclick = () => {
    if (!tracks.length) return;
    if (aud.paused) {
      aud
        .play()
        .then(() => setPlayIcon(true))
        .catch(() => {});
    } else {
      aud.pause();
      setPlayIcon(false);
    }
  };
  wrap.querySelector("#plPrev").onclick = () => loadTrack(idx - 1, true);
  wrap.querySelector("#plNext").onclick = () => loadTrack(idx + 1, true);
  wrap.querySelector("#plBar").onclick = (e) => {
    if (!aud.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    aud.currentTime = ((e.clientX - r.left) / r.width) * aud.duration;
  };
  aud.ontimeupdate = () => {
    if (!aud.duration) return;
    wrap.querySelector("#plFill").style.width = `${((aud.currentTime / aud.duration) * 100).toFixed(1)}%`;
    wrap.querySelector("#plCur").textContent = fmtTime(aud.currentTime);
  };
  aud.onloadedmetadata = () => {
    wrap.querySelector("#plDur").textContent = fmtTime(aud.duration);
  };
  aud.onended = () => loadTrack(idx + 1, true);

  renderTracks();
  if (proj.discover !== false) {
    scheduleIdle(() =>
      discoverFiles(fDir, AUD_OK, proj.id, (files) => {
        const have = new Set(tracks.map((x) => x.file));
        files
          .filter((f) => !have.has(f))
          .forEach((f) =>
            tracks.push({
              file: f,
              src: `./${encodePath(fDir)}/${encodePath(f)}`,
              title: capOf(f),
              artist: proj.title || "ustzyix",
              cover: ""
            })
          );
        renderTracks();
      })
    );
  }
}
