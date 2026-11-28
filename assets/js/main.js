/* UI event bindings, project picker, and hash-based startup. */
import { GALLERY } from "../../data/projects.js";
import {
  $, state, body, topBar, stage, canvas, pm,
  reduceMotion, scheduleIdle
} from "./state.js";
import { syncCardVideos } from "./media.js";
import { layout, scheduleLayout, par } from "./renderers.js";
import {
  fetchProjectDetail, prefetchProjects, loadProject, projectStore
} from "./loader.js";

const PROJECTS = GALLERY.projects || [];

$("#layoutBtn").onclick = () => {
  if ((state.activeProj?.type || "gallery") !== "gallery") return;
  const tok = ++state.flipTok;
  const vh = innerHeight;
  const first = state.cards.map((c) => c.getBoundingClientRect());
  state.cards.forEach((c) => {
    c.getAnimations?.().forEach((a) => a.cancel());
    c.classList.remove("flipping");
    c.style.transformOrigin = "";
  });
  state.grid = !state.grid;
  state.tx = state.ty = state.cx = state.cy = 0;
  body.dataset.layout = state.grid ? "grid" : "scatter";
  state.cards.forEach((c) => {
    c.classList.add("settled");
    c.style.translate = "";
    if (state.grid) c.style.zIndex = "";
  });
  if (state.grid) canvas.style.height = "";
  else layout(true);
  if (stage.scrollTop) stage.scrollTop = 0;
  const last = state.cards.map((c) => c.getBoundingClientRect());
  if (!reduceMotion()) {
    state.cards.forEach((c, i) => {
      const f = first[i];
      const l = last[i];
      if (!f || !l || !f.width || !l.width) return;
      if ((f.bottom < -120 && l.bottom < -120) || (f.top > vh + 120 && l.top > vh + 120)) return;
      const dx = f.left - l.left;
      const dy = f.top - l.top;
      const s = f.width / l.width;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(s - 1) < 0.002) return;
      c.classList.add("flipping");
      c.style.transformOrigin = "0 0";
      const anim = c.animate(
        [
          { transform: `translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0) scale(${s.toFixed(4)})` },
          { transform: "translate3d(0,0,0) scale(1)" }
        ],
        {
          duration: 360,
          delay: Math.min(i * 14, 84),
          easing: "cubic-bezier(.22,1,.36,1)",
          fill: "backwards"
        }
      );
      anim.onfinish = () => {
        if (tok === state.flipTok) {
          c.style.transformOrigin = "";
          c.classList.remove("flipping");
        }
      };
    });
  }
};

addEventListener(
  "pointermove",
  (e) => {
    if (
      e.pointerType !== "mouse" ||
      state.modal ||
      state.pmOpen ||
      state.grid ||
      (state.activeProj?.type || "gallery") !== "gallery"
    ) {
      return;
    }
    state.tx = ((e.clientX / innerWidth) * 2 - 1) * 12;
    state.ty = ((e.clientY / innerHeight) * 2 - 1) * 9;
    state.pr || (state.pr = requestAnimationFrame(par));
  },
  { passive: true }
);

new ResizeObserver(() => layout(true)).observe(stage);
addEventListener(
  "resize",
  () => {
    state.lastLayoutW = 0;
    scheduleLayout();
  },
  { passive: true }
);
window.visualViewport?.addEventListener(
  "resize",
  () => {
    state.lastLayoutW = 0;
    scheduleLayout();
  },
  { passive: true }
);

/* Project picker view and controls */
export function renderProjectList() {
  const list = $("#pmList");
  const search = $("#pmSearch");
  list.replaceChildren();
  search.value = "";
  $("#pmEmpty").hidden = true;
  PROJECTS.forEach((p) => {
    const isAct = p.id === state.activeProj?.id;
    const cachedDetail = projectStore.get(p.id);
    const merged = { ...p, ...(cachedDetail || {}) };
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pm-project";
    btn.setAttribute("aria-current", isAct ? "page" : "false");
    const name = document.createElement("span");
    const sub = document.createElement("span");
    name.className = "pm-project-name";
    name.textContent = merged.title || "Project";
    sub.className = "pm-project-sub";
    sub.textContent = merged.sub || "";
    sub.hidden = !sub.textContent;
    btn.append(name, sub);
    btn.dataset.search = [merged.title, merged.sub, merged.year, merged.code]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    btn.addEventListener(
      "pointerenter",
      () => {
        if (p.data) fetchProjectDetail(p);
      },
      { passive: true }
    );
    btn.addEventListener(
      "touchstart",
      () => {
        if (p.data) fetchProjectDetail(p);
      },
      { passive: true }
    );
    btn.onclick = () => {
      closePm();
      if (!isAct) loadProject(p, true);
    };
    list.append(btn);
  });
  filterProjectList();
}

export function filterProjectList() {
  const query = $("#pmSearch").value.trim().toLocaleLowerCase();
  let visible = 0;
  Array.from($("#pmList").children).forEach((item) => {
    const match = !query || item.dataset.search.includes(query);
    item.hidden = !match;
    if (match) visible++;
  });
  $("#pmEmpty").hidden = visible > 0;
}

export function openPm() {
  if (state.modal || state.pmOpen) return;
  renderProjectList();
  state.pmOpen = true;
  topBar.inert = true;
  stage.inert = true;
  syncCardVideos(true);
  $("#projBtn").setAttribute("aria-expanded", "true");
  body.classList.add("modal-active");
  requestAnimationFrame(() => {
    if (!state.pmOpen) return;
    pm.classList.add("open");
    $("#pmX").focus({ preventScroll: true });
    scheduleIdle(prefetchProjects);
  });
}

export function closePm() {
  if (!state.pmOpen) return;
  state.pmOpen = false;
  topBar.inert = false;
  stage.inert = false;
  const trigger = $("#projBtn");
  trigger.setAttribute("aria-expanded", "false");
  body.classList.remove("modal-active");
  pm.classList.remove("open");
  syncCardVideos(false);
  trigger.focus({ preventScroll: true });
}

$("#pmSearch").addEventListener("input", filterProjectList);
$("#projBtn").onclick = openPm;
$("#pmX").onclick = (e) => {
  e.stopPropagation();
  closePm();
};
pm.onclick = (e) => {
  if (e.target === pm) closePm();
};

const initHash = decodeURIComponent(location.hash.replace(/^#/, ""));
const startProj = PROJECTS.find((p) => p.id === initHash) || PROJECTS[0];
loadProject(startProj, false);
addEventListener("hashchange", () => {
  const h = decodeURIComponent(location.hash.replace(/^#/, ""));
  const found = PROJECTS.find((p) => p.id === h);
  if (found && found.id !== state.activeProj?.id) loadProject(found, false);
});
