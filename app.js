import {chartState} from './chart-model.js';
const accounts={github:'https://github.com/guanzhong2007',google:'mailto:li06314qq@gmail.com'};
const pages=[...document.querySelectorAll('.page')],names=['about','works','game'];
const frame=document.querySelector('#game-frame');let current=0,lastFlip=0,touchY=null,toastTimer;
function notice(text){const el=document.querySelector('#notice');el.textContent=text;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,4000);}
function showPage(){const found=names.indexOf(location.hash.slice(1)),index=found<0?0:found;
 if(current===2&&index!==2)frame.contentWindow?.postMessage({type:'portfolio-pause'},location.origin);
 if(pages[current].contains(document.activeElement))document.activeElement.blur();
 current=index;pages.forEach((p,i)=>{p.classList.toggle('active',i===index);p.inert=i!==index;p.setAttribute('aria-hidden',String(i!==index));});
 document.querySelectorAll('[data-page],[data-nav]').forEach(a=>{const active=Number(a.dataset.page??a.dataset.nav)===index;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 if(index===2&&!frame.getAttribute('src'))frame.src='game/index.html';
}
function flip(delta){if(current===2||Date.now()-lastFlip<900)return;const index=Math.max(0,Math.min(2,current+delta));if(index!==current){lastFlip=Date.now();location.hash=names[index];}}
window.addEventListener('hashchange',showPage);
window.addEventListener('wheel',e=>{if(current!==2&&Math.abs(e.deltaY)>30){e.preventDefault();flip(Math.sign(e.deltaY));}},{passive:false});
window.addEventListener('keydown',e=>{if(current===2||e.target.closest?.('button,a,input'))return;if(['ArrowDown','PageDown','ArrowUp','PageUp'].includes(e.key)){e.preventDefault();flip(['ArrowDown','PageDown'].includes(e.key)?1:-1);}});
window.addEventListener('touchstart',e=>touchY=e.touches[0]?.clientY,{passive:true});
window.addEventListener('touchend',e=>{if(touchY!==null){const delta=touchY-e.changedTouches[0].clientY;if(Math.abs(delta)>65)flip(Math.sign(delta));touchY=null;}},{passive:true});
document.querySelectorAll('[data-account]').forEach(b=>b.onclick=()=>{const url=accounts[b.dataset.account];if(url)window.open(url,'_blank','noopener,noreferrer');else notice('账号链接待补充。');});
frame.onload=()=>{const loading=document.querySelector('#game-loading');try{if(!frame.contentDocument?.querySelector('#game')){loading.textContent='游戏加载失败，请刷新页面重试。';return;}}catch{}loading.hidden=true;};
const fullButton=document.querySelector('#fullscreen');
function leaveExpanded(){document.body.classList.remove('game-expanded');fullButton.textContent='全屏游玩 ⛶';}
fullButton.onclick=async()=>{
 if(document.body.classList.contains('game-expanded')){if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});leaveExpanded();return;}
 document.body.classList.add('game-expanded');fullButton.textContent='退出全屏 ⛶';
 try{await document.querySelector('#game').requestFullscreen();}catch{/* Embedded browsers may deny native fullscreen; the in-page layout remains expanded. */}
};
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)leaveExpanded();});
window.addEventListener('hashchange',()=>{if(location.hash!=='#game'){leaveExpanded();if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}});
showPage();
document.querySelectorAll('[data-account]').forEach(b=>{const text=b.dataset.account==='github'?'GitHub · guanzhong2007':'发送邮件至 li06314qq@gmail.com';b.title=text;b.setAttribute('aria-label',text);});
const svg=document.querySelector('#chart'),marker=document.querySelector('#project-marker'),motion=document.querySelector('#motion-toggle');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');let paused=false,hovered=false,focused=false,time=reduced.matches?5.4:0,previous=0;
function el(tag,attrs){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));svg.append(e);return e;}
function set(e,attrs){Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));}
for(let i=0;i<=10;i++)el('line',{x1:i*120,y1:0,x2:i*120,y2:640,stroke:'#c8c1b6','stroke-opacity':'.3','stroke-dasharray':'2 5'});
for(let i=0;i<=6;i++)el('line',{x1:0,y1:i*100,x2:1200,y2:i*100,stroke:'#c8c1b6','stroke-opacity':'.3','stroke-dasharray':'2 5'});
const bars=Array.from({length:30},()=>({body:el('rect',{width:20,rx:1})}));
const guide=el('line',{stroke:'#ad5149','stroke-dasharray':'5 6',opacity:.5}),dot=el('circle',{r:4,fill:'#ad5149'}),node=el('circle',{r:6,fill:'#f7f4ee',stroke:'#ad5149','stroke-width':2});
function button(){motion.textContent=time>=5.4?'走势已展开':paused?'▶ 继续展开':'Ⅱ 暂停展开';motion.disabled=time>=5.4;motion.setAttribute('aria-pressed',String(paused));}button();motion.onclick=()=>{paused=!paused;button();};
reduced.addEventListener('change',e=>{paused=e.matches;button();});marker.onmouseenter=()=>hovered=true;marker.onmouseleave=()=>hovered=false;marker.onfocus=()=>focused=true;marker.onblur=()=>focused=false;
function animate(now){const dt=previous?Math.min(now-previous,100):0;previous=now;if(current===1&&!paused&&!document.hidden)time=Math.min(5.4,time+dt/1000);
 const state=chartState(time),y=state.y;
 bars.forEach((b,i)=>{const data=state.bars[i];b.body.style.display=data?'':'none';if(!data)return;const color=data.close>=data.open?'#b75b51':'#658e87';set(b.body,{x:data.x-10,y:y(Math.max(data.open,data.close)),height:Math.abs(data.close-data.open)*5.1,fill:color,opacity:.85});});
 const last=state.bars.at(-1);set(guide,{x1:last.x+14,x2:1200,y1:y(last.close),y2:y(last.close)});set(dot,{cx:last.x+14,cy:y(last.close)});set(node,{cx:state.marker.x,cy:state.marker.y});marker.style.left=`${state.marker.x/12}%`;marker.style.top=`${state.marker.y/6.4}%`;
 marker.hidden=!state.marker.visible;marker.style.display=state.marker.visible?'grid':'none';node.style.display=state.marker.visible?'':'none';button();
 if(!state.complete)requestAnimationFrame(animate);
}requestAnimationFrame(animate);
