/* Project media normalization, detail loading, folder discovery, and view lifecycle. */
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


/* ---------- Static media manifest discovery ---------- */
function discoverFiles(folder,regex,pid,onFiles){
 const names=window.MEDIA_MANIFEST?.[folder];
 if(!Array.isArray(names))return;
 const files=names.filter(name=>typeof name==="string"&&regex.test(name)).sort();
 if(activeProj.id===pid)onFiles(files);
}

/* ---------- Keep-Alive View Cache & Project Switcher ---------- */

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
