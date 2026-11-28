/* Manually authored media metadata and lightbox controls. */
/* ---------- Stored Media Metadata ---------- */
function fillExif(it,mediaEl){
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
 const m=it.exif||{};
 T("#xCam",m.camera);T("#xDate",m.captured);
 T("#xAp",m.aperture);T("#xSh",m.shutter);T("#xFo",m.focal);T("#xIso",m.iso);
 T("#xApp",m.app||it.app);T("#xFile",it.file);

 const fullReady=lbImg.dataset.fullSrc===it.src&&lbImg.naturalWidth>0;
 const fallbackOnly=it.resolvedThumb===it.src&&mediaEl?.naturalWidth>0;
 const w=fullReady?lbImg.naturalWidth:(fallbackOnly?mediaEl.naturalWidth:0);
 const h=fullReady?lbImg.naturalHeight:(fallbackOnly?mediaEl.naturalHeight:0);
 T("#xRes",m.resolution||(w&&h?`${w} × ${h} (${(w*h/1e6).toFixed(1)} MP)`:"Loading…"));
}

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
