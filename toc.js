/* Local navigation only; no network or saved data. */
(()=>{'use strict';
const dialog=document.getElementById('reader-toc'),opener=document.getElementById('reader-toc-open');
if(!dialog||!opener||typeof dialog.showModal!=='function')return;
const root=document.documentElement,mobile=matchMedia('(max-width:900px)');
let previousOverflow='',destination=null,backdropPress=false;
const close=()=>{if(dialog.open)dialog.close();};
opener.hidden=false;
opener.addEventListener('click',()=>{if(dialog.open||!mobile.matches)return;destination=null;previousOverflow=root.style.overflow;dialog.showModal();root.style.overflow='hidden';opener.setAttribute('aria-expanded','true');});
document.getElementById('reader-toc-close').addEventListener('click',close);
dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
dialog.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const items=[...dialog.querySelectorAll('button,a[href]')],first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
dialog.addEventListener('close',()=>{root.style.overflow=previousOverflow;opener.setAttribute('aria-expanded','false');if(destination){const target=destination.querySelector('h2,h3,h4')||destination;target.setAttribute('tabindex','-1');target.focus({preventScroll:true});destination=null;}else if(mobile.matches)opener.focus({preventScroll:true});});
const outside=event=>{const r=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);};
dialog.addEventListener('pointerdown',event=>{backdropPress=outside(event);});
dialog.addEventListener('click',event=>{if(backdropPress&&outside(event))close();backdropPress=false;});
for(const link of dialog.querySelectorAll('a[href^="#"]'))link.addEventListener('click',event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;let id;try{id=decodeURIComponent(link.hash.slice(1));}catch{return;}const target=document.getElementById(id);if(!target)return;event.preventDefault();destination=target;close();if(location.hash!==link.hash)location.hash=link.hash;target.scrollIntoView({block:'start',behavior:'instant'});});
mobile.addEventListener('change',()=>{if(!mobile.matches)close();});
})();
