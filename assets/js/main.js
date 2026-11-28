/* UI event bindings, project picker, and hash-based startup. Loaded last. */
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

addEventListener("pointermove",e=>{if(e.pointerType!=="mouse"||modal||pmOpen||grid||(activeProj.type||"gallery")!=="gallery")return;tx=(e.clientX/innerWidth*2-1)*12;ty=(e.clientY/innerHeight*2-1)*9;pr||(pr=requestAnimationFrame(par))},{passive:true});

new ResizeObserver(()=>layout(true)).observe(stage);
addEventListener("resize",()=>{lastLayoutW=0;scheduleLayout()},{passive:true});
window.visualViewport?.addEventListener("resize",()=>{lastLayoutW=0;scheduleLayout()},{passive:true});

/* Project picker view and controls (TYPE_ICON lives with renderers). */
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


const initHash=decodeURIComponent(location.hash.replace(/^#/,""));
const startProj=PROJECTS.find(p=>p.id===initHash)||PROJECTS[0];
loadProject(startProj,false);
addEventListener("hashchange",()=>{
 const h=decodeURIComponent(location.hash.replace(/^#/,""));
 const found=PROJECTS.find(p=>p.id===h);
 if(found&&found.id!==activeProj.id)loadProject(found,false);
});
