/* Shared state and project manifest bootstrap. Load after data/projects.js. */
window.PROJECT_STORE={};
window.setProjectData=(id,payload)=>{if(id&&payload)window.PROJECT_STORE[id]=payload};

const G=window.GALLERY||{};
const PROJECTS=(Array.isArray(G.projects)&&G.projects.length)?G.projects:[{
 id:"default",type:"gallery",code:"AR",title:"Archive",sub:"Color Grading",year:"",
 folder:G.folder||"images",
 thumbFolder:G.thumbFolder!==undefined?G.thumbFolder:(G.thumbs!==undefined?G.thumbs:""),
 thumbExt:G.thumbExt||"",
 discover:G.discover!==false,photos:G.photos||[]
}];
const cleanDir=d=>String(d||"").replace(/^\.?\/+|\/+$/g,"");
const safeDecode=s=>{try{return decodeURIComponent(s)}catch(_){return s}};
const encodePath=p=>String(p||"").split("/").map(seg=>encodeURIComponent(safeDecode(seg))).join("/");
const isDirectUrl=u=>/^(https?:|data:|blob:|\/|\.\.?\/)/i.test(String(u||""));

const VID_OK=/\.(mp4|webm|mov|m4v)$/i;
const AUD_OK=/\.(mp3|m4a|wav|ogg|flac)$/i;
const MEDIA_OK=/\.(jpe?g|png|webp|gif|avif|mp4|webm|mov|m4v)$/i;
const pad=n=>String(n).padStart(2,"0");
const capOf=f=>safeDecode(f).replace(/\.[^/.]+$/,"").replace(/\(\d+\)/g,"").replace(/^(IMG|VID|AUD)[-_]?/i,"").replace(/[-_]+/g," ").trim()||"Untitled";
const fmtTime=s=>!isFinite(s)||s<0?"0:00":`${Math.floor(s/60)}:${pad(Math.floor(s%60))}`;
const scheduleIdle=fn=>window.requestIdleCallback?requestIdleCallback(fn,{timeout:600}):setTimeout(fn,60);

/* DOM references and app-wide state */
const $=s=>document.querySelector(s);
const body=document.body;
const mobileLayout=matchMedia("(pointer:coarse)").matches||navigator.maxTouchPoints>0;
body.classList.toggle("mobile-layout",mobileLayout);
let activeProj=PROJECTS[0],entries=[],cards=[],cur=0,modal=false,pmOpen=false,grid=false;
let activeViewEl=null;
const canvas=$("#canvas"),stage=$("#stage"),topBar=$("#topBar"),lb=$("#lb"),pm=$("#pm"),flip=$("#flip"),lbImg=$("#lbImg"),lbVid=$("#lbVid");
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const reduceMotion=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Cross-module async tokens and keep-alive cache */
const viewCache=new Map();
const MAX_CACHED_VIEWS=6;
let loadTok=0;
let selTok=0;
