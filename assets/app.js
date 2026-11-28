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

/* ---------- thumbnail directory & extension resolvers ---------- */
function resolveThumbDir(proj,fDir){
 const raw=proj.thumbFolder!==undefined?proj.thumbFolder:(proj.thumbs!==undefined?proj.thumbs:(G.thumbFolder!==undefined?G.thumbFolder:G.thumbs));
 if(raw===false||raw===null||raw==="")return"";
 if(raw===true)return`${fDir}/thumbs`;
 return cleanDir(raw);
}
function resolveThumbExts(proj){
 const raw=proj.thumbExt!==undefined?proj.thumbExt:G.thumbExt;
 if(!raw)return[];
 return(Array.isArray(raw)?raw:[raw]).map(e=>String(e).replace(/^\.+/,"").toLowerCase()).filter(Boolean);
}
function buildThumbCandidates(file,fDir,tDir,thumbExts,explicitThumb,isVid,allowVidThumb){
 const list=[];
 const push=u=>{if(u&&!list.includes(u))list.push(u)};
 if(explicitThumb){
  if(isDirectUrl(explicitThumb))push(explicitThumb);
  else if(String(explicitThumb).includes("/"))push(`./${encodePath(String(explicitThumb).replace(/^\.?\//,""))}`);
  else push(`./${encodePath(tDir||fDir)}/${encodePath(explicitThumb)}`);
 }
 if(tDir){
  const base=file.replace(/\.[^/.]+$/,"");
  const dirEnc=encodePath(tDir);
  if(!isVid){
   if(thumbExts&&thumbExts.length){
    thumbExts.forEach(te=>push(`./${dirEnc}/${encodePath(`${base}.${te}`)}`));
   }
   push(`./${dirEnc}/${encodePath(file)}`);
  }else if(allowVidThumb||(thumbExts&&thumbExts.length)){
   const vExts=(thumbExts&&thumbExts.length)?thumbExts:["webp","jpg"];
   vExts.forEach(te=>push(`./${dirEnc}/${encodePath(`${base}.${te}`)}`));
  }
 }
 return list;
}

function toEntry(p,i,folder,tfolder,thumbExts,allowVidThumb){
 if(typeof p==="string")p={file:p};
 const fDir=cleanDir(folder||"images");
 const tDir=tfolder===true?`${fDir}/thumbs`:cleanDir(tfolder||"");
 const rawRef=p.file||String(p.src||"").split("?")[0].split("/").pop();
 const file=safeDecode(rawRef);
 const isVid=p.type==="video"||VID_OK.test(file)||VID_OK.test(p.src||"");
 const declaredRatio=Number(p.ratio);
 const ratio=Number.isFinite(declaredRatio)&&declaredRatio>0?declaredRatio:0;
 const src=p.src||`./${encodePath(fDir)}/${encodePath(file)}`;
 const manifestThumb=window.THUMBS_MAP?.[file]||"";
 const explicitThumb=p.poster||p.thumb||manifestThumb;
 const thumbCandidates=buildThumbCandidates(file,fDir,tDir,thumbExts,explicitThumb,isVid,allowVidThumb);
 const thumb=thumbCandidates[0]||(isVid?"":src);
 return{
  file,src,thumb,resolvedThumb:thumb,thumbCandidates,
  isVid,ratio,poster:isVid?thumb:(p.poster||""),
  caption:p.title||capOf(file),sub:p.sub||`Archive · ${pad(i+1)}`,
  app:p.app||"",exif:p.exif||null,auto:!!p.auto
 };
}

const $=s=>document.querySelector(s);
const body=document.body;
const mobileLayout=matchMedia("(pointer:coarse)").matches||navigator.maxTouchPoints>0;
body.classList.toggle("mobile-layout",mobileLayout);
let activeProj=PROJECTS[0],entries=[],cards=[],cur=0,modal=false,pmOpen=false,grid=false;
let activeViewEl=null;
const canvas=$("#canvas"),stage=$("#stage"),topBar=$("#topBar"),lb=$("#lb"),pm=$("#pm"),flip=$("#flip"),lbImg=$("#lbImg"),lbVid=$("#lbVid");
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const reduceMotion=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- auto first-frame video poster cache ---------- */
const vidPosterCache=new Map();
const posterCanvas=document.createElement("canvas");
const posterCtx=posterCanvas.getContext("2d",{alpha:false});
function captureVideoPoster(videoEl,key){
 if(!videoEl||!key||vidPosterCache.has(key)||!videoEl.videoWidth||!videoEl.videoHeight)return vidPosterCache.get(key)||"";
 try{
  const w=160,h=Math.max(1,Math.round(w*(videoEl.videoHeight/videoEl.videoWidth)));
  posterCanvas.width=w;posterCanvas.height=h;
  posterCtx.drawImage(videoEl,0,0,w,h);
  const url=posterCanvas.toDataURL("image/jpeg",.72);
  if(url&&url.length>64){
   vidPosterCache.set(key,url);
   if(vidPosterCache.size>40)vidPosterCache.delete(vidPosterCache.keys().next().value);
   return url;
  }
 }catch(_){}
 return "";
}

/* ---------- viewport observer: play visible videos & track active video ---------- */
const visibleVideos=new Set();
function ensureVideoSource(videoEl){
 if(videoEl&&!videoEl.getAttribute("src")&&videoEl.dataset.src){
  videoEl.src=videoEl.dataset.src;
  videoEl.load();
 }
}
const vidObs=new IntersectionObserver(ents=>{
 ents.forEach(en=>{
  const v=en.target;
  if(en.isIntersecting){
   visibleVideos.add(v);
   // Load once on first visibility; pausing off-screen avoids repeated source resets.
   ensureVideoSource(v);
  }else{
   visibleVideos.delete(v);
   v.pause();
  }
  });
},{root:stage,threshold:.15});
function syncCardVideos(pauseAll){
 cards.forEach(c=>{const v=c.querySelector("video");if(v){if(pauseAll)v.pause();else if(visibleVideos.has(v))ensureVideoSource(v)}});
}

/* ---------- lazy loader & idle prefetcher for individual data/*.js files ---------- */
const loadedScripts=new Map();
function fetchProjectDetail(proj){
 if(!proj.data||window.PROJECT_STORE[proj.id])return Promise.resolve({ok:true,proj:{...proj,...(window.PROJECT_STORE[proj.id]||{})}});
 if(!loadedScripts.has(proj.data)){
  loadedScripts.set(proj.data,new Promise(res=>{
   const s=document.createElement("script");
   s.src=proj.data;
   let settled=false;
   const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);res(ok)};
   const timer=setTimeout(()=>finish(false),15000);
   s.onload=()=>finish(true);
   s.onerror=()=>finish(false);
   document.head.append(s);
  }));
 }
 return loadedScripts.get(proj.data).then(ok=>{
  const loaded=ok&&!!window.PROJECT_STORE[proj.id];
  if(!loaded)loadedScripts.delete(proj.data);
  return{ok:loaded,proj:{...proj,...(window.PROJECT_STORE[proj.id]||{})}};
 });
}
function prefetchProjects(){
 PROJECTS.forEach(p=>{if(p.data&&!window.PROJECT_STORE[p.id]&&!loadedScripts.has(p.data))fetchProjectDetail(p)});
}

/* ---------- FLIP layout switch ---------- */
let flipTok=0;
$("#layoutBtn").onclick=()=>{
 if((activeProj.type||"gallery")!=="gallery")return;
 const tok=++flipTok,vh=innerHeight;
 const first=cards.map(c=>c.getBoundingClientRect());
 cards.forEach(c=>{c.getAnimations?.().forEach(a=>a.cancel());c.classList.remove("flipping");c.style.transformOrigin=""});
 grid=!grid;tx=ty=cx=cy=0;
 body.dataset.layout=grid?"grid":"scatter";
 cards.forEach(c=>{c.classList.add("settled");c.style.translate="";if(grid)c.style.zIndex=""});
 if(grid)canvas.style.height="";else layout(true);
 if(stage.scrollTop)stage.scrollTop=0;
 const last=cards.map(c=>c.getBoundingClientRect());
 if(!reduceMotion()){
  cards.forEach((c,i)=>{
   const f=first[i],l=last[i];if(!f||!l||!f.width||!l.width)return;
   if((f.bottom<-120&&l.bottom<-120)||(f.top>vh+120&&l.top>vh+120))return;
   const dx=f.left-l.left,dy=f.top-l.top,s=f.width/l.width;
   if(Math.abs(dx)<.5&&Math.abs(dy)<.5&&Math.abs(s-1)<.002)return;
   c.classList.add("flipping");c.style.transformOrigin="0 0";
   const anim=c.animate([{transform:`translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0) scale(${s.toFixed(4)})`},{transform:"translate3d(0,0,0) scale(1)"}],{duration:360,delay:Math.min(i*14,84),easing:"cubic-bezier(.22,1,.36,1)",fill:"backwards"});
   anim.onfinish=()=>{if(tok===flipTok){c.style.transformOrigin="";c.classList.remove("flipping")}};
  });
 }
};

/* ---------- desktop-only mouse parallax ---------- */
let tx=0,ty=0,cx=0,cy=0,pr=0;
function par(){if(modal||pmOpen||grid||(activeProj.type||"gallery")!=="gallery"){pr=0;return}cx+=(tx-cx)*.08;cy+=(ty-cy)*.08;
 for(const c of cards)c.style.translate=`${(cx*c._d).toFixed(2)}px ${(cy*c._d).toFixed(2)}px`;
 pr=Math.abs(tx-cx)+Math.abs(ty-cy)>.02?requestAnimationFrame(par):0}
addEventListener("pointermove",e=>{if(e.pointerType!=="mouse"||modal||pmOpen||grid||(activeProj.type||"gallery")!=="gallery")return;tx=(e.clientX/innerWidth*2-1)*12;ty=(e.clientY/innerHeight*2-1)*9;pr||(pr=requestAnimationFrame(par))},{passive:true});

/* ---------- scatter layout ---------- */
const DP=[{x:.07,w:.3,g:-24,d:.45},{x:.6,w:.32,g:28,d:.75},{x:.24,w:.34,g:-12,d:.9},{x:.48,w:.31,g:-40,d:.6},{x:.07,w:.28,g:24,d:.5},{x:.65,w:.29,g:-30,d:.8}];
const MOBILE_DP=[{x:.02,w:.3,g:-24,d:.45},{x:.64,w:.32,g:28,d:.75},{x:.18,w:.34,g:-12,d:.9},{x:.53,w:.31,g:-40,d:.6},{x:.02,w:.28,g:24,d:.5},{x:.68,w:.29,g:-30,d:.8}];
let lt=0,lastLayoutW=0;
const scheduleLayout=()=>{lt||(lt=requestAnimationFrame(()=>{lt=0;layout(false)}))};
function layout(force){
 if(grid||!cards.length||(activeProj.type||"gallery")!=="gallery")return;
 const W=canvas.clientWidth;if(!W)return;
 const widthChanged=Math.abs(W-lastLayoutW)>1;
 if(widthChanged)lastLayoutW=W;
 const unit=mobileLayout?W/900:1;
 const P=mobileLayout?MOBILE_DP:DP,minH=mobileLayout?Math.max(300*unit,stage.clientHeight-110*unit):Math.max(300,stage.clientHeight-110);
 const portraitSizes=cards.map((el,i)=>{
  if(!el._mediaReady)return null;
  const media=el.querySelector("img,video");
  const nw=media?.naturalWidth||media?.videoWidth||0,nh=media?.naturalHeight||media?.videoHeight||0;
  const ratio=el._ratio||(nw&&nh?nw/nh:0),w=Math.round(W*P[i%P.length].w);
  return ratio>0&&ratio<1?{width:w,height:w/ratio}:null;
 }).filter(Boolean).sort((a,b)=>a.height-b.height);
 const balance=portraitSizes.length?portraitSizes[Math.floor(portraitSizes.length/2)]:null;
 const balanceTolerance=.10;
 cards.forEach((el,i)=>{const p=P[i%P.length];let w=Math.round(W*p.w);
  if(el._landscape&&balance&&el._ratio>0){
   // Preserve the photo's ratio while balancing its width against portrait height
   // and its height against portrait width (geometric mean is the compromise).
   const targetW=Math.min(Math.sqrt(balance.height*balance.width*el._ratio),W*.72);
   if(w<targetW){
    const delta=(targetW-w)/targetW;
    w=delta>balanceTolerance?Math.round(targetW):Math.round(w+(targetW-w)*.7);
   }
  }
  const l=Math.min(Math.round(W*p.x),Math.max(0,W-w));
  const sizeChanged=force||widthChanged||!el._sized||el._w!==w;
  el._d=p.d;el._l=l;el._w=w;
  if(sizeChanged){el.style.width=w+"px";el.style.left=l+"px";el.style.zIndex=Math.round(p.d*10);el._hLocked=false;el._sized=true}});
 const heights=cards.map(el=>{
  if(!force&&!widthChanged&&el._hLocked&&el._h)return el._h;
  const h=el.offsetHeight||el._w*.75+44;
  if(el._mediaReady){el._h=h;el._hLocked=true}
  return h;
 });
 let bottom=0;
 cards.forEach((el,i)=>{const p=P[i%P.length],h=heights[i];let top=mobileLayout?8*unit:8;
  const g=mobileLayout?p.g*unit:p.g;
  if(i){const q=cards[i-1],overlapX=mobileLayout?16*unit:16,ov=el._l<q._l+q._w+overlapX&&el._l+el._w+overlapX>q._l;
   const overlapY=mobileLayout?14*unit:20,offsetY=mobileLayout?16*unit:24,carryY=mobileLayout?26*unit:42;
   top=ov?bottom+Math.max(overlapY,g+offsetY):Math.max(bottom-Math.min(h,el._w*.85)*.52+g,q._t+carryY)}
  if(el._t!==top){el._t=top;el.style.top=Math.round(top)+"px"}
  bottom=Math.max(bottom,top+h)});
 const targetH=Math.max(bottom+(mobileLayout?56*unit:56),minH)+"px";
 if(canvas.style.height!==targetH)canvas.style.height=targetH;
}
new ResizeObserver(()=>layout(true)).observe(stage);
addEventListener("resize",()=>{lastLayoutW=0;scheduleLayout()},{passive:true});
window.visualViewport?.addEventListener("resize",()=>{lastLayoutW=0;scheduleLayout()},{passive:true});

/* ---------- EXIF / Media Metadata ---------- */
const exifCache=new Map();
function parseTiff(v,t){
 const L=v.getUint16(t)===0x4949,g16=o=>v.getUint16(t+o,L),g32=o=>v.getUint32(t+o,L),p={},
 str=(o,n)=>{let s="";for(let i=0;i<n-1&&v.getUint8(t+o+i);i++)s+=String.fromCharCode(v.getUint8(t+o+i));return s.trim()},
 rat=o=>[g32(o),g32(o+4)];
 const ifd=off=>{const n=g16(off);
  for(let i=0;i<n;i++){const e=off+2+i*12,tag=g16(e),c=g32(e+4),vo=g32(e+8);
   if(tag===0x10F)p.make=str(vo,c);else if(tag===0x110)p.model=str(vo,c);else if(tag===0x131)p.software=str(vo,c);
   else if(tag===0x9003||tag===0x132)p.date=p.date||str(vo,c);else if(tag===0x8769)ifd(vo);
   else if(tag===0x829A){const[a,b]=rat(vo);if(a&&b)p.shutter=a<b?`1/${Math.round(b/a)}s`:`${(a/b).toFixed(1)}s`}
   else if(tag===0x829D){const[a,b]=rat(vo);if(a&&b)p.aperture="f/"+(a/b).toFixed(1).replace(/\.0$/,"")}
   else if(tag===0x8827)p.iso="ISO "+g16(e+8);
   else if(tag===0x920A){const[a,b]=rat(vo);if(a&&b)p.focal=(a/b).toFixed(2).replace(/\.00$/,"")+" mm"}}};
 ifd(g32(4));return p}
async function readExif(src){
 if(exifCache.has(src))return exifCache.get(src);
 let out=null;
 try{let r=await fetch(src,{headers:{Range:"bytes=0-65535"}});const v=new DataView(await r.arrayBuffer());
  if(v.getUint16(0)===0xFFD8){let o=2;
   while(o<v.byteLength-4){const m=v.getUint16(o),len=v.getUint16(o+2);
    if(m===0xFFE1&&v.getUint32(o+4)===0x45786966){out=parseTiff(v,o+10);break}
    if((m&0xFF00)!==0xFF00)break;o+=2+len}}}catch(_){}
 exifCache.set(src,out);return out}
async function fillExif(it,mediaEl){
 const T=(id,v)=>$(id).textContent=v||"—";
 if(it.isVid){
  $("#mL1").textContent="Duration";$("#mL2").textContent="Format";$("#mL3").textContent="Ratio";$("#mL4").textContent="Audio";
  const ext=(it.file.split(".").pop()||"MP4").toUpperCase();
  const vw=lbVid.videoWidth||mediaEl?.videoWidth||0,vh=lbVid.videoHeight||mediaEl?.videoHeight||0;
  const dur=lbVid.duration||mediaEl?.duration||0;
  T("#xCam",it.sub||"Motion Sequence");T("#xDate",activeProj.year||"Video");
  T("#xAp",dur?fmtTime(dur):"Loop");T("#xSh",ext);
  T("#xFo",vw&&vh?`${(vw/vh).toFixed(2)}:1`:"—");T("#xIso","Stereo");
  T("#xApp",it.app||"—");T("#xFile",it.file);
  T("#xRes",vw&&vh?`${vw} × ${vh}`:"—");
  return;
 }
 $("#mL1").textContent="Aperture";$("#mL2").textContent="Shutter";$("#mL3").textContent="Focal";$("#mL4").textContent="ISO";
 const m=it.exif||{},full=m.camera&&m.captured&&m.aperture&&m.shutter&&m.focal&&m.iso;
 const a=full?{}:(await readExif(it.src))||{};
 T("#xCam",m.camera||`${a.make||""} ${a.model||""}`.trim());
 T("#xDate",m.captured||(a.date||"").replace(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}:\d{2}).*$/,"$3/$2/$1 · $4"));
 T("#xAp",m.aperture||a.aperture);T("#xSh",m.shutter||a.shutter);T("#xFo",m.focal||a.focal);T("#xIso",m.iso||a.iso);
 T("#xApp",m.app||it.app||a.software);T("#xFile",it.file);

 const fullReady=lbImg.dataset.fullSrc===it.src&&lbImg.naturalWidth>0;
 const fallbackOnly=it.resolvedThumb===it.src&&mediaEl?.naturalWidth>0;
 const w=fullReady?lbImg.naturalWidth:(fallbackOnly?mediaEl.naturalWidth:0);
 const h=fullReady?lbImg.naturalHeight:(fallbackOnly?mediaEl.naturalHeight:0);
 T("#xRes",m.resolution||(w&&h?`${w} × ${h} (${(w*h/1e6).toFixed(1)} MP)`:"Loading…"));
}

/* ---------- project navigation ---------- */
const TYPE_ICON={
 playlist:`<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`
};
function renderProjectList(){
 const list=$("#pmList"),search=$("#pmSearch");list.replaceChildren();search.value="";$("#pmEmpty").hidden=true;
 PROJECTS.forEach(p=>{
  const isAct=p.id===activeProj.id;
  const cachedDetail=window.PROJECT_STORE[p.id];
  const merged={...p,...(cachedDetail||{})};
  const btn=document.createElement("button");
  btn.type="button";btn.className="pm-project";btn.setAttribute("aria-current",isAct?"page":"false");
  const name=document.createElement("span"),sub=document.createElement("span");
  name.className="pm-project-name";name.textContent=merged.title||"Project";
  sub.className="pm-project-sub";sub.textContent=merged.sub||"";sub.hidden=!sub.textContent;
  btn.append(name,sub);
  btn.dataset.search=[merged.title,merged.sub,merged.year,merged.code].filter(Boolean).join(" ").toLocaleLowerCase();
  btn.addEventListener("pointerenter",()=>{if(p.data)fetchProjectDetail(p)},{passive:true});
  btn.addEventListener("touchstart",()=>{if(p.data)fetchProjectDetail(p)},{passive:true});
  btn.onclick=()=>{closePm();if(!isAct)loadProject(p,true)};
  list.append(btn);
 });
 filterProjectList();
}
function filterProjectList(){
 const query=$("#pmSearch").value.trim().toLocaleLowerCase();let visible=0;
 Array.from($("#pmList").children).forEach(item=>{const match=!query||item.dataset.search.includes(query);item.hidden=!match;if(match)visible++});
 $("#pmEmpty").hidden=visible>0;
}
function openPm(){
 if(modal||pmOpen)return;
 renderProjectList();
 pmOpen=true;
 topBar.inert=true;stage.inert=true;
 syncCardVideos(true);
 $("#projBtn").setAttribute("aria-expanded","true");
 body.classList.add("modal-active");
 requestAnimationFrame(()=>{
  if(!pmOpen)return;
  pm.classList.add("open");
  $("#pmX").focus({preventScroll:true});
  scheduleIdle(prefetchProjects);
 });
}
function closePm(){if(!pmOpen)return;pmOpen=false;topBar.inert=false;stage.inert=false;const trigger=$("#projBtn");trigger.setAttribute("aria-expanded","false");body.classList.remove("modal-active");pm.classList.remove("open");syncCardVideos(false);trigger.focus({preventScroll:true})}
$("#pmSearch").addEventListener("input",filterProjectList);
$("#projBtn").onclick=openPm;$("#pmX").onclick=e=>{e.stopPropagation();closePm()};pm.onclick=e=>{if(e.target===pm)closePm()};

/* ---------- lightbox (Progressive Thumbnail -> Full-Res) ---------- */
function openLb(){modal=true;topBar.inert=true;stage.inert=true;syncCardVideos(true);body.classList.add("modal-active");lb.classList.add("open");syncLightboxShape();$("#lbX").focus({preventScroll:true})}
function closeLb(){
 if(!modal)return;modal=false;topBar.inert=false;stage.inert=false;body.classList.remove("modal-active");lb.classList.remove("open");
 lbVid.pause();
 setTimeout(()=>{if(!modal){flip.classList.remove("on");$("#fbtnT").textContent="Media info";lbVid.removeAttribute("src");lbVid.load();syncCardVideos(false)}},340);
}
function syncLightboxShape(){
 const media=lbImg.style.display!=="none"?lbImg:lbVid;
 const rect=media.getBoundingClientRect(),w=rect.width||Math.min(innerWidth*.88,760);
 const nw=media.naturalWidth||media.videoWidth||0,nh=media.naturalHeight||media.videoHeight||0;
 lb.classList.toggle("lb-horizontal",!!(nw&&nh&&nw/nh>1.25));
 const radius=Math.max(1,Math.round(w*.035*100)/100);
 const gap=Math.max(1,Math.round(w*.008*100)/100);
 lb.style.setProperty("--lb-radius",`${radius}px`);
 lb.style.setProperty("--lb-media-radius",`${Math.max(1,radius-4)}px`);
 lb.style.setProperty("--lb-frame-gap",`${gap}px`);
}
const decoded=new Map();
function predecode(src){
 let rec=decoded.get(src);
 if(!rec){
  const im=new Image();im.decoding="async";im.src=src;
  const prom=(im.decode?im.decode().then(()=>im.naturalWidth>0):new Promise(r=>{im.onload=()=>r(im.naturalWidth>0);im.onerror=()=>r(false)})).catch(()=>false);
  rec={im,prom};
  decoded.set(src,rec);
  if(decoded.size>4)decoded.delete(decoded.keys().next().value);
 }
 return rec.prom;
}
let selTok=0;
async function select(i,open){
 if(!entries.length)return;
 cur=(i+entries.length)%entries.length;
 const it=entries[cur],mediaEl=cards[cur]?.querySelector("img,video"),tok=++selTok;
 if(!open)return;

 const activeThumb=it.resolvedThumb||it.thumb;
 flip.classList.remove("on");
 $("#fbtnT").textContent="Media info";
 $("#cap").textContent=it.caption;

 if(it.isVid){
  lbImg.style.display="none";lbImg.dataset.fullSrc="";
  lbVid.style.display="block";
  lbVid.crossOrigin="anonymous";
  const posterUrl=it.poster||vidPosterCache.get(it.src)||"";
  if(posterUrl)lbVid.poster=posterUrl;else lbVid.removeAttribute("poster");
  lbVid.src=it.src;
  lbVid.onloadedmetadata=()=>{fillExif(it,mediaEl);syncLightboxShape()};
  lbVid.onerror=()=>{if(lbVid.hasAttribute("crossorigin")){lbVid.removeAttribute("crossorigin");lbVid.load()}};
  lbVid.play().catch(()=>{});
  fillExif(it,mediaEl);
  if(!modal)openLb();else syncLightboxShape();
  return;
 }

 lbVid.pause();lbVid.style.display="none";
 lbImg.style.display="block";
 lbImg.dataset.fullSrc="";

 const hasDistinctThumb=activeThumb&&activeThumb!==it.src;
 if(hasDistinctThumb){
  // Open immediately with cached thumbnail, then upgrade to full-res once decoded
  lbImg.src=activeThumb;
  lbImg.onload=syncLightboxShape;
  fillExif(it,mediaEl);
  if(!modal)openLb();
  const ok=await predecode(it.src);
  if(tok!==selTok||!modal)return;
  if(ok){
   lbImg.src=it.src;
   lbImg.dataset.fullSrc=it.src;
   syncLightboxShape();
   fillExif(it,lbImg);
  }
 }else{
  await Promise.race([predecode(it.src),new Promise(r=>setTimeout(r,450))]);
  if(tok!==selTok)return;
  lbImg.src=it.src;
  lbImg.onload=()=>{if(tok===selTok){lbImg.dataset.fullSrc=it.src;syncLightboxShape();fillExif(it,lbImg)}};
  if(lbImg.complete&&lbImg.naturalWidth>0)lbImg.dataset.fullSrc=it.src;
  fillExif(it,mediaEl);
  if(!modal)openLb();else syncLightboxShape();
 }
}
function toggleFlip(){const on=flip.classList.toggle("on");if(on&&!lbVid.paused)lbVid.pause();$("#fbtnT").textContent=on?"View media":"Media info";navigator.vibrate?.(10)}
$("#fbtn").onclick=e=>{e.stopPropagation();toggleFlip()};
$("#scene").onclick=e=>{if(e.target===lbVid)return;toggleFlip()};
$("#scene").onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleFlip()}};
$("#lbX").onclick=e=>{e.stopPropagation();closeLb()};
lb.onclick=e=>{if(e.target===lb||e.target.classList.contains("lb-in"))closeLb()};
addEventListener("keydown",e=>{
 if(pmOpen&&e.key==="Escape"){closePm();return}
 if(!modal)return;
 if(e.key==="Escape")closeLb();
});
addEventListener("resize",()=>{if(modal)syncLightboxShape()},{passive:true});
window.visualViewport?.addEventListener("resize",()=>{if(modal)syncLightboxShape()},{passive:true});

/* ---------- mode 1: gallery ---------- */
function addCard(it,i,tok=loadTok,targetContainer=activeViewEl||canvas){
 const el=document.createElement("button");el.type="button";el.className="card in";el.style.setProperty("--d",Math.min(i*55,330)+"ms");
 el.setAttribute("aria-label","Inspect "+it.caption);
 el.addEventListener("animationend",()=>el.classList.add("settled"),{once:true});
 const initPoster=it.poster||vidPosterCache.get(it.src)||"";
 const mediaHtml=it.isVid
  ?`<video data-src="${esc(it.src)}" ${initPoster?`poster="${esc(initPoster)}"`:""} crossorigin="anonymous" muted loop playsinline preload="none"></video><span class="vbadge">▶ VIDEO</span>`
  :`<img alt="${esc(it.caption)}" decoding="async" draggable="false">`;
 el.innerHTML=`<div class="frame">${mediaHtml}</div><div class="meta"><div class="tw"><div class="ttl">${esc(it.caption)}</div><div class="sub">${esc(it.sub||"Stillness")}</div></div></div>`;
 const frame=el.querySelector(".frame"),mediaEl=el.querySelector("img,video");
 if(it.isVid&&it.ratio>0)frame.style.aspectRatio=`${it.ratio}`;
 const onReady=()=>{
  el._mediaReady=true;
  // Media dimensions replace the placeholder ratio; discard the cached card height.
  el._hLocked=false;
  const w=mediaEl.naturalWidth||mediaEl.videoWidth,h=mediaEl.naturalHeight||mediaEl.videoHeight;
  if(w&&h){el._ratio=w/h;frame.style.aspectRatio=`${w}/${h}`;el._landscape=el._ratio>1.25}
  else if(it.ratio>0){el._ratio=it.ratio;el._landscape=it.ratio>1.25}
  frame.classList.add("loaded");
  if(tok===loadTok)scheduleLayout();
  if(it.isVid){
   const captured=captureVideoPoster(mediaEl,it.src);
   if(captured&&!mediaEl.getAttribute("poster"))mediaEl.poster=captured;
   return;
  }
 };

 if(it.isVid){
  // Probe optional poster candidates from thumbFolder for videos if configured
  if(it.thumbCandidates&&it.thumbCandidates.length){
   let pIdx=0;
   const tryVidPoster=()=>{
    if(pIdx>=it.thumbCandidates.length)return;
    const url=it.thumbCandidates[pIdx++];
    const probe=new Image();probe.decoding="async";
    probe.onload=()=>{
     if(tok!==loadTok)return;
     it.poster=url;
     vidPosterCache.set(it.src,url);
     mediaEl.poster=url;
     if(!el._mediaReady&&probe.naturalWidth&&probe.naturalHeight){
      el._mediaReady=true;
      el._hLocked=false;
      el._ratio=probe.naturalWidth/probe.naturalHeight;
      el._landscape=el._ratio>1.25;
      frame.style.aspectRatio=`${probe.naturalWidth}/${probe.naturalHeight}`;
      frame.classList.add("loaded");
      scheduleLayout();
     }
    };
    probe.onerror=tryVidPoster;
    probe.src=url;
   };
   tryVidPoster();
  }
  mediaEl.onloadeddata=onReady;
  mediaEl.onerror=()=>{
   if(mediaEl.hasAttribute("crossorigin")){mediaEl.removeAttribute("crossorigin");mediaEl.load();return}
   el._mediaReady=true;frame.classList.add("loaded");if(tok===loadTok)scheduleLayout();
  };
  vidObs.observe(mediaEl);
 }else{
  const candidates=[...it.thumbCandidates];
  if(!candidates.includes(it.src))candidates.push(it.src);
  let candIdx=0;
  const saveData=!!navigator.connection?.saveData;
  mediaEl.fetchPriority=i<2&&!saveData?"high":"low";
  mediaEl.loading=i<2&&!saveData?"eager":"lazy";
  mediaEl.onload=()=>{
   it.resolvedThumb=candidates[candIdx]||it.src;
   onReady();
  };
  mediaEl.onerror=()=>{
   candIdx++;
   if(candIdx<candidates.length){
    mediaEl.src=candidates[candIdx];
    return;
   }
   if(it.auto){
    const k=entries.indexOf(it);
    if(k>-1){entries.splice(k,1);cards.splice(k,1)}
    el.remove();
    if(tok===loadTok){updateCount();scheduleLayout()}
    return;
   }
   el._mediaReady=true;frame.classList.add("loaded");if(tok===loadTok)scheduleLayout();
  };
  mediaEl.src=candidates[0];
 }
 el.onclick=()=>{if(!modal&&!pmOpen)select(entries.indexOf(it),true)};
 targetContainer.append(el);cards.push(el);
}
function updateCount(msg){
 $("#count").textContent=`${entries.length} item${entries.length==1?"":"s"}`;
 canvas.dataset.emptyMsg=msg||"No items found in this collection yet.";
 canvas.toggleAttribute("data-empty",!entries.length);
}

/* ---------- mode 2 & 3 (interactive & playlist) ---------- */
function mountInteractive(proj,targetContainer=activeViewEl||canvas){
 $("#count").textContent="Interactive";canvas.removeAttribute("data-empty");
 const wrap=document.createElement("div");wrap.className="ix-wrap";
 wrap.innerHTML=`<div class="ix-frame"><iframe src="${esc(proj.src||"")}" title="${esc(proj.title||"Interactive Work")}" allow="autoplay; fullscreen" loading="eager"></iframe></div><div class="ix-bar"><div class="ix-info"><div class="ttl">${esc(proj.title||"Interactive")}</div><div class="ix-ctl">${esc(proj.controls||"Touch / Keyboard Controls")}</div></div><button class="ix-fs" id="ixFsBtn" type="button"><svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg><span>Fullscreen</span></button></div>`;
 targetContainer.append(wrap);
 wrap.querySelector("#ixFsBtn").onclick=()=>{if(document.fullscreenElement){document.exitFullscreen().catch(()=>{});return}if(wrap.requestFullscreen){wrap.requestFullscreen().catch(()=>wrap.classList.toggle("fs-fallback"))}else wrap.classList.toggle("fs-fallback")};
}
let activeAudio=null;
function stopAudio(){if(activeAudio){activeAudio.pause();activeAudio.src="";activeAudio=null}}
function mountPlaylist(proj,targetContainer=activeViewEl||canvas){
 const fDir=cleanDir(proj.folder||"audio");
 let tracks=(proj.tracks||[]).map(t=>{if(typeof t==="string")t={file:t};const file=t.file||String(t.src).split("/").pop();return{file,src:t.src||`./${encodePath(fDir)}/${encodePath(file)}`,title:t.title||capOf(file),artist:t.artist||proj.title||"ustzyix",cover:t.cover?(isDirectUrl(t.cover)?t.cover:`./${encodePath(fDir)}/${encodePath(t.cover)}`):""}});
 let idx=0;const aud=new Audio();aud.preload="metadata";activeAudio=aud;
 const wrap=document.createElement("div");wrap.className="pl-wrap";
 wrap.innerHTML=`<div class="pl-deck"><div class="pl-top"><div class="pl-art" id="plArt">${TYPE_ICON.playlist}</div><div class="pl-meta"><div class="pl-now">Now Playing</div><div class="pl-title" id="plTitle">—</div><div class="pl-artist" id="plArtist">${esc(proj.sub||"Audio Archive")}</div></div></div><div class="pl-prog"><div class="pl-bar" id="plBar"><div class="pl-fill" id="plFill"></div></div><div class="pl-times"><span id="plCur">0:00</span><span id="plDur">0:00</span></div></div><div class="pl-btns"><button class="pl-cbtn" id="plPrev" type="button"><svg viewBox="0 0 24 24"><path d="M19 20 9 12l10-8v16zM5 19V5"/></svg></button><button class="pl-cbtn pl-play" id="plPlay" type="button"><svg id="plIco" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button><button class="pl-cbtn" id="plNext" type="button"><svg viewBox="0 0 24 24"><path d="M5 4l10 8-10 8V4zM19 5v14"/></svg></button></div></div><div class="pl-tracks" id="plList"></div>`;
 targetContainer.append(wrap);
 const listEl=wrap.querySelector("#plList"),artEl=wrap.querySelector("#plArt"),icoEl=wrap.querySelector("#plIco");
 const setPlayIcon=on=>{icoEl.innerHTML=on?`<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>`:`<path d="M8 5v14l11-7z"/>`};
 function loadTrack(i,autoPlay){if(!tracks.length)return;idx=(i+tracks.length)%tracks.length;const tr=tracks[idx];aud.src=tr.src;wrap.querySelector("#plTitle").textContent=tr.title;wrap.querySelector("#plArtist").textContent=tr.artist;wrap.querySelector("#plCur").textContent="0:00";wrap.querySelector("#plDur").textContent="0:00";wrap.querySelector("#plFill").style.width="0%";if(tr.cover){artEl.innerHTML=`<img src="${esc(tr.cover)}" alt=""/>`}else{artEl.innerHTML=TYPE_ICON.playlist}[...listEl.children].forEach((r,k)=>r.classList.toggle("on",k===idx));if(autoPlay)aud.play().then(()=>setPlayIcon(true)).catch(()=>setPlayIcon(false))}
 function renderTracks(){$("#count").textContent=`${tracks.length} track${tracks.length==1?"":"s"}`;canvas.dataset.emptyMsg="No audio tracks found in this folder yet.";canvas.toggleAttribute("data-empty",!tracks.length);listEl.innerHTML="";tracks.forEach((tr,k)=>{const row=document.createElement("button");row.type="button";row.className="trow"+(k===idx?" on":"");row.innerHTML=`<span class="tnum">${pad(k+1)}</span><div class="tinfo"><div class="tttl">${esc(tr.title)}</div><div class="tart">${esc(tr.artist)}</div></div><span class="tdur">▶</span>`;row.onclick=()=>loadTrack(k,true);listEl.append(row)});if(tracks.length&&!aud.src)loadTrack(0,false)}
 wrap.querySelector("#plPlay").onclick=()=>{if(!tracks.length)return;if(aud.paused)aud.play().then(()=>setPlayIcon(true)).catch(()=>{});else{aud.pause();setPlayIcon(false)}};
 wrap.querySelector("#plPrev").onclick=()=>loadTrack(idx-1,true);wrap.querySelector("#plNext").onclick=()=>loadTrack(idx+1,true);
 wrap.querySelector("#plBar").onclick=e=>{if(!aud.duration)return;const r=e.currentTarget.getBoundingClientRect();aud.currentTime=((e.clientX-r.left)/r.width)*aud.duration};
 aud.ontimeupdate=()=>{if(!aud.duration)return;wrap.querySelector("#plFill").style.width=`${(aud.currentTime/aud.duration*100).toFixed(1)}%`;wrap.querySelector("#plCur").textContent=fmtTime(aud.currentTime)};
 aud.onloadedmetadata=()=>{wrap.querySelector("#plDur").textContent=fmtTime(aud.duration)};aud.onended=()=>loadTrack(idx+1,true);
 renderTracks();
 if(proj.discover!==false)scheduleIdle(()=>discoverFiles(fDir,AUD_OK,proj.id,files=>{const have=new Set(tracks.map(x=>x.file));files.filter(f=>!have.has(f)).forEach(f=>tracks.push({file:f,src:`./${encodePath(fDir)}/${encodePath(f)}`,title:capOf(f),artist:proj.title||"ustzyix",cover:""}));renderTracks()}));
}

/* ---------- GitHub folder auto-discovery ---------- */
const DTTL=15*60*1000;
function repoInfo(){
 if(G.repo){const[o,r]=G.repo.split("/");return{o,r}}
 const h=location.hostname,seg=location.pathname.split("/")[1];
 return h.endsWith(".github.io")?{o:h.split(".")[0],r:seg&&!/\./.test(seg)?seg:h}:null}
async function discoverFiles(folder,regex,pid,onFiles){
 const r=repoInfo();if(!r)return;
 const dk=`gallery_dir_v4_${folder}`;
 let cached=null;
 try{cached=JSON.parse(localStorage.getItem(dk)||"null")}catch(_){}
 if(cached?.files?.length){if(activeProj.id===pid)onFiles(cached.files);if(Date.now()-cached.t<DTTL)return}
 try{const res=await fetch(`https://api.github.com/repos/${r.o}/${r.r}/contents/${folder}`);if(!res.ok)return;
  const files=(await res.json()).filter(f=>f.type==="file"&&regex.test(f.name)).map(f=>f.name).sort();
  try{localStorage.setItem(dk,JSON.stringify({t:Date.now(),files}))}catch(_){}
  if(activeProj.id===pid)onFiles(files)}catch(_){}
}

/* ---------- Keep-Alive View Cache & Project Switcher ---------- */
const viewCache=new Map();
const MAX_CACHED_VIEWS=6;

function suspendCurrentView(){
 stopAudio();
 visibleVideos.clear();
 if(activeProj?.id&&viewCache.has(activeProj.id)){
  viewCache.get(activeProj.id).scrollTop=stage.scrollTop||0;
 }
 cards.forEach(c=>{
  const v=c.querySelector("video");
  if(v){
   vidObs.unobserve(v);
   v.pause();
   if(v.getAttribute("src")){
    v.removeAttribute("src");
    v.load();
   }
  }
 });
 if(activeViewEl)activeViewEl.hidden=true;
}

function evictOldestView(){
 if(viewCache.size<MAX_CACHED_VIEWS)return;
 const oldestKey=viewCache.keys().next().value;
 const old=viewCache.get(oldestKey);
 if(old){
  old.cards.forEach(c=>{const v=c.querySelector("video");if(v){vidObs.unobserve(v);v.pause();v.removeAttribute("src");v.load()}});
  old.el.remove();
 }
 viewCache.delete(oldestKey);
}

let loadTok=0;
async function loadProject(baseProj,pushHash){
 suspendCurrentView();
 const tok=++loadTok;
 activeProj=baseProj;selTok++;cur=0;tx=ty=cx=cy=0;
 const mode=baseProj.type||"gallery";
 body.dataset.mode=mode;
 $("#projName").textContent=baseProj.title||"Archive";
 document.title=`ustzyix — ${baseProj.title||"Visual Studio"}`;
 if(pushHash&&baseProj.id)history.replaceState(null,"","#"+encodeURIComponent(baseProj.id));

 if(mode==="gallery"&&baseProj.id&&viewCache.has(baseProj.id)){
  const cached=viewCache.get(baseProj.id);
  viewCache.delete(baseProj.id);
  viewCache.set(baseProj.id,cached);
  activeProj=cached.proj;
  activeViewEl=cached.el;
  entries=cached.entries;
  cards=cached.cards;
  activeViewEl.hidden=false;
  updateCount();
  if(grid){
   cards.forEach(c=>{c.classList.add("settled");c.style.translate="";c.style.zIndex=""});
   canvas.style.height="";
  }else{
   cards.forEach(c=>c.classList.add("settled"));
   layout(false);
  }
  stage.scrollTop=cached.scrollTop||0;
  cards.forEach(c=>{const v=c.querySelector("video");if(v)vidObs.observe(v)});
  return;
 }

 $("#count").textContent="Loading…";
 canvas.style.height="";canvas.removeAttribute("data-empty");
 if(stage.scrollTop)stage.scrollTop=0;
 const viewEl=document.createElement("div");
 viewEl.className="proj-view";
 canvas.append(viewEl);
 activeViewEl=viewEl;
 cards=[];entries=[];

 const{ok,proj}=await fetchProjectDetail(baseProj);
 if(tok!==loadTok){viewEl.remove();return}
 activeProj=proj;
 if(!ok&&proj.data){
  updateCount(`Could not load ${proj.data} — check file syntax.`);
  return;
 }

 if(mode==="interactive"){mountInteractive(proj,viewEl);return}
 if(mode==="playlist"){mountPlaylist(proj,viewEl);return}

 const fDir=cleanDir(proj.folder||"images");
 const tDir=resolveThumbDir(proj,fDir);
 const tExts=resolveThumbExts(proj);
 const allowVidThumb=!!(proj.videoThumbs??G.videoThumbs);

 entries=(proj.photos||[])
  .filter(p=>p&&(typeof p==="string"||p.file||p.src))
  .map((p,i)=>toEntry(p,i,fDir,tDir,tExts,allowVidThumb));
 entries.forEach((e,i)=>addCard(e,i,tok,viewEl));
 updateCount();
 if(!grid)layout(true);

 if(proj.id){
  evictOldestView();
  viewCache.set(proj.id,{el:viewEl,proj,entries,cards,scrollTop:0});
 }

 if(proj.discover!==false){
  scheduleIdle(()=>{
   if(tok!==loadTok)return;
   discoverFiles(fDir,MEDIA_OK,proj.id,files=>{
    if(tok!==loadTok)return;
    const have=new Set(entries.map(p=>p.file));
    const added=files.filter(f=>!have.has(f));
    if(!added.length)return;
    added.forEach(f=>{
     const e=toEntry({file:f,auto:true},entries.length,fDir,tDir,tExts,allowVidThumb);
     entries.push(e);
     addCard(e,entries.length-1,tok,viewEl);
    });
    updateCount();scheduleLayout();
   });
  });
 }
}

const initHash=decodeURIComponent(location.hash.replace(/^#/,""));
const startProj=PROJECTS.find(p=>p.id===initHash)||PROJECTS[0];
loadProject(startProj,false);
addEventListener("hashchange",()=>{
 const h=decodeURIComponent(location.hash.replace(/^#/,""));
 const found=PROJECTS.find(p=>p.id===h);
 if(found&&found.id!==activeProj.id)loadProject(found,false);
});
