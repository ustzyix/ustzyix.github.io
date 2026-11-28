/* Shared state and project manifest bootstrap. */
import { GALLERY } from "../../data/projects.js";

const G = GALLERY || {};
export const PROJECTS =
  Array.isArray(G.projects) && G.projects.length
    ? G.projects
    : [
        {
          id: "default",
          type: "gallery",
          code: "AR",
          title: "Archive",
          sub: "Color Grading",
          year: "",
          folder: G.folder || "images",
          thumbFolder:
            G.thumbFolder !== undefined
              ? G.thumbFolder
              : G.thumbs !== undefined
              ? G.thumbs
              : "",
          thumbExt: G.thumbExt || "",
          discover: G.discover !== false,
          photos: G.photos || []
        }
      ];

export const cleanDir = (d) => String(d || "").replace(/^\.?\/+|\/+$/g, "");
export const safeDecode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch (_) {
    return s;
  }
};
export const encodePath = (p) =>
  String(p || "")
    .split("/")
    .map((seg) => encodeURIComponent(safeDecode(seg)))
    .join("/");
export const isDirectUrl = (u) => /^(https?:|data:|blob:|\/|\.\.?\/)/i.test(String(u || ""));

export const VID_OK = /\.(mp4|webm|mov|m4v)$/i;
export const AUD_OK = /\.(mp3|m4a|wav|ogg|flac)$/i;
export const MEDIA_OK = /\.(jpe?g|png|webp|gif|avif|mp4|webm|mov|m4v)$/i;
export const pad = (n) => String(n).padStart(2, "0");
export const capOf = (f) =>
  safeDecode(f)
    .replace(/\.[^/.]+$/, "")
    .replace(/\(\d+\)/g, "")
    .replace(/^(IMG|VID|AUD)[-_]?/i, "")
    .replace(/[-_]+/g, " ")
    .trim() || "Untitled";
export const fmtTime = (s) =>
  !isFinite(s) || s < 0 ? "0:00" : `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
export const scheduleIdle = (fn) =>
  window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 60);

/* DOM references and device flags */
export const $ = (s) => document.querySelector(s);
export const body = document.body;
export const mobileLayout = matchMedia("(pointer:coarse)").matches || navigator.maxTouchPoints > 0;
body.classList.toggle("mobile-layout", mobileLayout);

export const canvas = $("#canvas");
export const stage = $("#stage");
export const topBar = $("#topBar");
export const lb = $("#lb");
export const pm = $("#pm");
export const flip = $("#flip");
export const lbImg = $("#lbImg");
export const lbVid = $("#lbVid");

export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': '&quot;' }[c]));
export const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Cross-module mutable state, async tokens, and keep-alive cache */
export const viewCache = new Map();
export const MAX_CACHED_VIEWS = 6;

export const state = {
  activeProj: PROJECTS[0],
  entries: [],
  cards: [],
  cur: 0,
  modal: false,
  pmOpen: false,
  grid: false,
  activeViewEl: null,
  loadTok: 0,
  selTok: 0,
  flipTok: 0,
  tx: 0,
  ty: 0,
  cx: 0,
  cy: 0,
  pr: 0,
  lastLayoutW: 0
};
