import { createGame, command, interactionInfo } from './game.js';
import { TERRAINS, ORGANS, SPECIES, DISASTERS, manhattan } from './data.js';
import { tileAt } from './map.js';
import { stats, reachable } from './rules.js';
import { evolutionInfo } from './evolution.js';
import { hazardInfo, PROTECTION } from './disasters.js';
import { intentFor } from './npc.js';
import { crossingInfo, pathTo } from './rules.js';
import { Renderer } from './renderer.js';

const $=id=>document.getElementById(id);
let state=null,selected=null,busy=false,speed=1,modalType=null,toastTimer;
const preview=createGame(7941);
const renderer=new Renderer($('map'),{click:onMapClick,hover:onHover});renderer.setState(preview,true);renderer.overview(true);
const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const organName=id=>ORGANS.find(o=>o.id===id)?.name||id;
const coord=t=>`${t.x+1} / ${t.y+1}`;
const disabled=condition=>condition?' disabled':'';
function toast(message){if(!message)return;$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3200);}
function closeModal(){$('dialog').close();modalType=null;}
function modal(html,type){onHover(null);$('dialog-content').innerHTML=html;modalType=type;if(!$('dialog').open)$('dialog').showModal();}
const head=(label,title,subtitle='')=>`<div class="modal-head"><div><div class="panel-label">${label}</div><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div><button data-action="close" aria-label="关闭面板">×</button></div>`;
function showGuide(start=false){
  const cards=[['三次行动','移动一格、进食、攻击、治疗、进化各用 1 次行动。下回合直接回到 3 次，不积攒。'],['两种资源','生物质用于进化和治疗；进化点来自结晶、首次探索和首次捕猎。原地等待不会获得进化点。'],['第一轮就能成长','开局 3 生物质、2 进化点。可以直接长嘴或肢体，也可先觅食再提升身体。'],['从猎物学习','击杀留下大量生物质；首次击败一种生物必掉代表标本。一次拾取全部收获，标本自动解锁器官，重复标本 +1 进化点。'],['坡道与崖壁','缓坡可步行，陡坡需要腿，垂直崖壁需要攀爬或飞行。↗ 标记是坡道，深色边线是崖壁。'],['灾害会留下痕迹','灾害提前 3 回合预警，可同时存在。灾区食物归零且不再生；环境伤害每回合结算一次，对应器官可抵御。']];
  modal(head('FIELD GUIDE / 生存手册','从细胞，长出自己的生存方式')+'<div class="modal-body"><div class="guide-grid">'+cards.map(([title,text],i)=>'<article class="guide-card"><span class="guide-icon">'+(i+1)+'</span><h3>'+title+'</h3><p>'+text+'</p></article>').join('')+'</div><div class="guide-flow">觅食 → 进化 → 探索 / 捕猎 → 适应灾区 → 寻找新栖息地</div><p>结束回合：NPC 行动 → 环境变化与伤害 → 中毒 → 行动恢复。治疗：1 行动 + 2 生物质，恢复最多 4 生命。</p><p>模式：无限生存。没有固定胜利条件；生命归零后本局结束。健康区域每 6 回合最多补充一只普通生物，活体数量上限为 12。</p></div><div class="modal-foot"><p>鼠标选择 · F 找到自己 · Enter 结束回合 · E 进化</p><button class="primary" data-action="'+(start?'new-game':'close')+'">'+(start?'开始进化 ↗':'明白了')+'</button></div>','guide');
}
function startGame(){
  closeModal();state=createGame();renderer.setState(state);renderer.focus();selected={kind:'unit',unit:state.player,tile:tileAt(state,state.player.x,state.player.y)};
  $('menu').hidden=true;$('hud').hidden=false;update();toast('每回合 3 次行动。可以直接长出嘴或肢体，也可以先觅食。');
}
function showMenu(){if(busy)return;closeModal();$('hud').hidden=true;$('menu').hidden=false;$('continue').hidden=!state||state.player.dead;renderer.menu=true;renderer.reachable.clear();renderer.overview(true);onHover(null);}
function continueGame(){if(!state||state.player.dead)return;$('menu').hidden=true;$('hud').hidden=false;renderer.menu=false;renderer.focus();update();}
function getSelection(){
  if(!selected)return null;
  if(selected.kind==='unit'){const unit=selected.unit;if(unit.dead){selected={kind:'tile',tile:tileAt(state,unit.x,unit.y)};}else selected.tile=tileAt(state,unit.x,unit.y);}
  return selected;
}
function update(){
  if(!state)return;getSelection();const p=state.player,st=stats(p);renderer.selected=selected;
  renderer.reachable=!busy&&!p.dead?reachable(state,p):new Map();
  renderer.pathPreview=selected?.kind==='tile'?renderer.reachable.get(selected.tile.id)?.path||[]:[];
  if(!renderer.pathPreview.length&&selected?.kind==='tile'&&p.actions>0&&p.organs.some(o=>['limbs','legs'].includes(o)))renderer.pathPreview=pathTo(state,p,selected.tile,2)?.path||[];
  $('turn').textContent=String(state.turn).padStart(2,'0');$('body-badge').textContent='Lv.'+p.level;
  $('player-name').innerHTML=(p.level?'进化生命':'原始细胞')+'<small>器官容量 '+p.organs.length+' / '+st.capacity+'</small>';
  $('vitals').innerHTML='<div class="vital-row"><span>生命</span><b>'+p.hp+' / '+st.maxHp+'</b></div><div class="bar"><i style="width:'+p.hp/st.maxHp*100+'%"></i></div><div class="vital-row"><span>本回合行动</span><b aria-label="剩余 '+p.actions+' 次行动">'+('● '.repeat(p.actions))+('○ '.repeat(3-p.actions))+'</b></div>';
  $('resources').innerHTML='<div class="resource">◈ 生物质<strong>'+p.bio+'</strong></div><div class="resource ep">✧ 进化点<strong>'+p.ep+'</strong></div>';
  $('evolve-hint').textContent=ORGANS.some(o=>evolutionInfo(p,o.id).ok)?'有可生长的器官 →':'查看身体与适应能力 →';
  const warnings=state.disasters.filter(d=>d.status==='warning'),active=state.disasters.filter(d=>d.status==='active'),barren=state.tiles.filter(t=>t.barren).length;
  $('warning').innerHTML='<strong>'+ (warnings.length?warnings.map(d=>DISASTERS[d.kind].icon+' '+(d.startsAt-state.turn)+' 回合后').join(' · '):'无限生态')+'</strong><span>'+active.length+' 场进行中 · '+barren+' / '+state.tiles.length+' 格灾区 · 查看全部</span>';
  $('logs').innerHTML=state.log.slice(0,8).map(line=>'<div class="log-line">'+esc(line)+'</div>').join('');
  const hazard=hazardInfo(state,p,tileAt(state,p.x,p.y),state.turn+1);
  $('end-turn').disabled=busy||p.dead;$('end-turn').textContent='结束回合 · 环境 −'+hazard.total+' HP';
  $('phase-label').textContent=busy?'生态正在变化…':p.dead?'生命已结束':'你的回合';
  $('action-hint').textContent=busy?'正在结算…':p.dead?'本次生命已结束':p.actions===0?'行动已用完，结束回合恢复 3 次行动':'剩余 '+p.actions+' 次行动 · 选择地图目标查看路线和结果';
  const eat=document.querySelector('[data-action="eat-self"]'),heal=document.querySelector('[data-action="heal"]');
  eat.disabled=busy||!interactionInfo(state,'eat',tileAt(state,p.x,p.y)).ok;
  heal.disabled=busy||p.dead||p.actions<1||p.bio<2||p.hp>=st.maxHp;
  heal.innerHTML='✚ 恢复 '+Math.min(4,st.maxHp-p.hp)+' 生命 <small>1 行动 / 2 生物质</small>';
  if(p.poison)$('action-hint').textContent+=' · 中毒下回合 −1 HP';
  renderDetails();
}
function environmentText(tile){
  const h=hazardInfo(state,state.player,tile,state.turn+1);
  const warnings=state.disasters.filter(d=>d.status==='warning'&&d.tiles.includes(tile.id)).map(d=>DISASTERS[d.kind].name+'将在 '+(d.startsAt-state.turn)+' 回合后发生').join('<br>');
  return (warnings?warnings+'<br>':'')+(tile.barren?'贫瘠灾区：天然生物质不再生。<br>':'')+h.details.map(d=>DISASTERS[d.kind].icon+' '+DISASTERS[d.kind].name+' ×'+d.intensity+'：'+(d.blocked?'你的器官已抵御':'−'+d.damage+' 生命')).join('<br>')+(h.details.length?'<br>你在此结束回合：环境总伤害 '+h.total+'（上限 6）':'');
}
function showEnvironment(){modal(head('ENVIRONMENT / 环境观察','无限生态 · 岛屿正在改变')+'<div class="modal-body"><p>这是无限生存模式：没有固定胜利回合，生命归零才结束本局。每种灾害提前 3 回合预警。灾区持续存在、没有天然食物；洪水扑灭灼热，但不会恢复食物。环境伤害按器官分别抵御，总伤害每回合最高 6。</p>'+state.disasters.map(d=>'<article class="guide-card"><h3>'+DISASTERS[d.kind].icon+' '+DISASTERS[d.kind].name+'</h3><p>'+ (d.status==='warning'?(d.startsAt-state.turn)+' 回合后发生':d.status==='active'?'正在发生':'留下持续灾区')+' · '+d.tiles.length+' 格 · 对应器官：'+organName(PROTECTION[d.kind])+'</p></article>').join('')+'<p>深色地块为灾区；同格多个符号代表叠加影响。↗ 是坡道。火灾、干旱可以影响高地；洪水受高度限制。健康区域每 6 回合最多补充一只普通生物，活体总数不超过 12。</p></div><div class="modal-foot"><button data-action="close">返回岛屿</button></div>','environment');}

const statGrid=items=>`<div class="stats-grid">${items.map(([label,value])=>`<span>${label}<b>${value}</b></span>`).join('')}</div>`;
function interactButton(type,label,target){const check=interactionInfo(state,type,target);return `<button data-action="interact" data-type="${type}"${disabled(!check.ok||busy)}>${label}<small>${check.ok?`${check.cost} 行动${type==='eat'?` → ${check.yield} 生物质`:type==='crystal'?` → ${check.yield} 进化点`:type==='attack'?` · 预计伤害 ${Math.max(1,stats(state.player).attack-stats(target).defense)} · 无即时反击，留意下回合意图`:''}`:check.reason}</small></button>`;}
function renderDetails(){
  const sel=getSelection(),p=state.player;if(!sel){$('detail').innerHTML='<h2>选择一个目标</h2><p>点击地块预览路线，点击生物观察意图。</p>';return;}
  const tile=sel.tile,u=sel.kind==='unit'?sel.unit:null;
  let content='<div class="panel-label">'+coord(tile)+'</div>';
  if(u){const own=u.id==='player',st=stats(u);content+='<h2>'+u.name+'</h2>'+statGrid([['生命',u.hp+' / '+st.maxHp],['攻击',st.attack],['防御',st.defense],['下一步',own?p.actions+' 次行动':intentFor(state,u).label]])+'<div class="chips">'+u.organs.map(id=>'<span class="chip">'+organName(id)+'</span>').join('')+'</div><p>'+environmentText(tile)+'</p><div class="detail-actions">'+(own?interactButton('eat','◒ 在当前位置进食',tile):interactButton('attack','⋀ 攻击',u))+(own?'<button data-action="evolution">✧ 生长或重组器官</button>':'<p>战利品：'+u.drop+' 生物质 + '+organName(u.tissue)+'标本。首次必掉；重复击杀有 50% 概率掉标本。</p><button data-action="target-tile">查看脚下地形</button>')+'</div>';}
  else {
    const route=pathTo(state,p,tile),dash=p.organs.some(o=>['limbs','legs'].includes(o))&&p.actions>0?pathTo(state,p,tile,2):null;
    const crossing=crossingInfo(p,tileAt(state,p.x,p.y),tile),reason=tile.occupant&&tile.occupant!==p.id?'目标被占据':route?.path.length?route.path.length+' 格 · '+route.cost+' 次行动':!crossing.ok&&manhattan(p,tile)===1?crossing.reason:'本回合行动不足或路径被阻挡；可从坡道绕行';
    content+='<h2>'+TERRAINS[tile.terrain].name+(tile.ramp?' · 坡道 ↗':'')+'</h2><p>'+TERRAINS[tile.terrain].info+'</p>'+statGrid([['食物',tile.barren?'0 · 不再生':tile.food+' / '+tile.maxFood],['高度',tile.height.toFixed(1)],['移动一格','1 行动'],['结晶',tile.specialResource?'+'+tile.specialResource.value+' 进化点':'—']])+'<p>'+environmentText(tile)+'</p><div class="detail-actions"><button class="primary" data-action="move"'+disabled(!route?.path.length||busy)+'>移动到这里<small>'+reason+'</small></button>'+(dash?.path.length>1?'<button data-action="dash">疾行 · '+dash.path.length+' 格 / 1 行动</button>':'')+(tile.food?interactButton('eat','◒ 进食',tile):'')+'</div>';
  }
  $('detail').innerHTML=content;const actions=$('detail').querySelector('.detail-actions');
  if(tile.specialResource)actions.insertAdjacentHTML('beforeend',interactButton('crystal','✧ 吸收结晶',tile));
  if(tile.loot.length)actions.insertAdjacentHTML('beforeend',interactButton('loot','◈ 拾取全部战利品',tile));
}

function showEvolution(){
  if(!state||busy)return;const p=state.player,body=evolutionInfo(p,'body');
  const card=o=>{const info=evolutionInfo(p,o.id),owned=p.organs.includes(o.id);return '<article class="organ-card'+(owned?' owned':'')+'"><h3>'+o.icon+' '+o.name+'</h3><p>'+o.effect+'</p><div class="organ-cost">'+o.bio+' 生物质 / '+o.ep+' 进化点 / 1 行动</div><p>'+ (owned?'已安装':info.reasons.join(' · ')||'可以生长')+'</p>'+(owned?'<button data-action="remove" data-id="'+o.id+'"'+disabled(p.actions<1)+'>拆除重组 · 返还 '+Math.floor(o.bio/2)+' 生物质</button>':'<button data-action="evolve" data-id="'+o.id+'"'+disabled(!info.ok||p.actions<1||p.dead)+'>生长器官</button>')+'</article>';};
  const available=ORGANS.filter(o=>!p.organs.includes(o.id)&&evolutionInfo(p,o.id).ok);
  const danger=new Set(hazardInfo(state,p,tileAt(state,p.x,p.y),state.turn+1).details.filter(d=>!d.blocked).map(d=>PROTECTION[d.kind]));
  available.sort((a,b)=>Number(danger.has(b.id))-Number(danger.has(a.id)));
  modal(head('EVOLUTION / 生长与适应','塑造你的身体','生物质 '+p.bio+' · 进化点 '+p.ep+' · 行动 '+p.actions+' · 容量 '+p.organs.length+'/'+stats(p).capacity)+'<div class="modal-body"><div class="evolution-body"><div><h3>身体 Lv.'+p.level+'</h3><p>每级 +5 生命上限、+1 器官容量，恢复 5 生命。'+(body.item?'需要 '+body.item.bio+' 生物质 / '+body.item.ep+' 进化点 / 1 行动。':'已达最高等级。')+body.reasons.join(' · ')+'</p></div><button data-action="evolve" data-id="body"'+disabled(!body.ok||p.actions<1||p.dead)+'>身体成长</button></div><h3>当前可以尝试</h3><div class="evolution-grid">'+(available.slice(0,3).map(card).join('')||'<p>探索结晶、觅食或捕猎，获得成长资源。</p>')+'</div><h3>当前器官</h3><p>在健康区域重组，返还一半生物质；首次免重组材料费，之后额外消耗 1 生物质。每次消耗 1 行动。</p><div class="evolution-grid">'+ORGANS.filter(o=>p.organs.includes(o.id)).map(card).join('')+'</div><details><summary>完整进化目录 · '+ORGANS.length+' 种器官</summary><div class="evolution-grid">'+ORGANS.filter(o=>!p.organs.includes(o.id)).map(card).join('')+'</div></details><p>已吸收标本：'+(p.unlocked.map(organName).join('、')||'暂无')+'。标本可提前解锁身体等级要求；仍需满足前置器官和资源。</p></div><div class="modal-foot"><button data-action="close">返回岛屿</button></div>','evolution');
}
function onMapClick(hit){if(!hit||busy||state?.player.dead)return;selected=hit;update();}
function onHover(hit,x=0,y=0){
  if(!hit||renderer.menu||busy||$('dialog').open){$('tooltip').hidden=true;return;}
  const tile=hit.tile,u=hit.unit;
  $('tooltip').innerHTML=u?'<strong>'+(u.id==='player'?'你的生物':u.name)+'</strong><p>生命 '+u.hp+'/'+stats(u).maxHp+' · 攻击 '+stats(u).attack+' · 防御 '+stats(u).defense+'</p><p>'+(u.id==='player'?'剩余 '+u.actions+' 次行动':intentFor(state,u).label+' · 每回合至多移动一格')+'</p>':'<strong>'+TERRAINS[tile.terrain].name+(tile.ramp?' ↗ 坡道':'')+'</strong><p>食物 '+tile.food+' · 移动一格 1 行动</p>';
  $('tooltip').innerHTML+='<p>'+environmentText(tile)+'</p>';$('tooltip').hidden=false;
  $('tooltip').style.left=Math.min(innerWidth-242,x+18)+'px';$('tooltip').style.top=Math.max(8,Math.min(innerHeight-$('tooltip').offsetHeight-12,y+18))+'px';
}
async function run(input){
  if(!state||busy||renderer.menu)return;
  onHover(null);busy=true;$('end-turn').disabled=true;renderer.reachable.clear();$('phase-label').textContent='生态正在变化…';$('action-hint').textContent='正在结算行动…';
  try{
    const result=command(state,input);
    if(result.ok)await renderer.animate(result.events,speed);
    if(!result.ok||input.type!=='endTurn')toast(result.message);
    busy=false;update();
    if(modalType==='evolution')showEvolution();
    if(state.player.dead)showDeath();
  }catch(error){busy=false;renderer.busy=false;console.error(error);update();toast('操作发生异常，请重开本局。详细信息已记录到控制台。');}
}
function showDeath(){const p=state.player;modal(`${head('LIFE RECORD / 本次生命记录','生命结束，进化留下了痕迹','岛屿仍在变化。下一次，试试另一种适应方式。')}<div class="modal-body"><div class="end-summary"><div><strong>${state.turn}</strong><span>生存回合</span></div><div><strong>${p.organs.length}</strong><span>进化器官</span></div><div><strong>${p.kills}</strong><span>击败生物</span></div></div><p class="about-text">${esc(state.log.slice(0,3).join(' '))}</p></div><div class="modal-foot"><button data-action="menu">返回主菜单</button><button class="primary" data-action="new-game">开启新的生命 ↗</button></div>`,'death');}
function showSettings(){modal(`${head('PREFERENCES / 设置','让观察更舒适')}<div class="modal-body"><label class="setting-row"><span>减少动画（即时移动、关闭呼吸效果）</span><input id="reduce-motion" type="checkbox"${renderer.reduced?' checked':''}></label><div class="setting-row"><span>行动动画速度</span><button data-action="speed">切换速度：${speed}×</button></div><p class="about-text" style="font-size:11px">设置仅对本次打开有效。鼠标滚轮缩放地图，F 可找回自己的生物。首版不包含音效和自动存档。</p></div><div class="modal-foot"><p>游戏可以离线运行。</p><button class="primary" data-action="close">完成</button></div>`,'settings');}
function showAbout(){modal(`${head('ABOUT / 关于','裂谷岛 · 生存与进化')}<div class="modal-body"><p class="about-text">一个本地运行的 2.5D 回合制生存原型。<br>探索一座岛，理解环境，用有限资源塑造生命。</p><p class="about-text">当前为无限生存模式：没有胜利回合，生命归零或玩家主动重开才结束；NPC 会在健康区域缓慢补充，活体数量有上限。地图与生物均使用原创程序化二维绘图；无需外部美术、账号或网络。<br>游戏规则与画面独立，未来可以扩展多人指令；当前只支持单人。本局状态保留到页面关闭或刷新。</p></div><div class="modal-foot"><p>RIFT ISLAND / v0.2.0</p><button data-action="close">返回</button></div>`,'about');}
document.addEventListener('click',event=>{
  const b=event.target.closest('button[data-action]');if(!b||b.disabled)return;const action=b.dataset.action;
  if(busy&& !['speed'].includes(action))return;
  const handlers={
    'guide-start':()=>{if(state&&!state.player.dead)modal(`${head('NEW LIFE / 新的生命','重新开始这段进化？','当前生命尚未结束。开始新游戏会清空本局进度。')}<div class="modal-foot"><button data-action="close">保留当前生命</button><button class="primary" data-action="restart-guide">重新开始</button></div>`,'restart');else showGuide(true);},
    'restart-guide':()=>showGuide(true),'guide':()=>showGuide(false),'new-game':startGame,'continue':continueGame,'menu':showMenu,'settings':showSettings,'about':showAbout,'close':closeModal,
    'speed':()=>{speed=speed===1?3:1;$('speed').textContent=`${speed}×`;if(modalType==='settings')showSettings();},
    'focus':()=>renderer.focus(),'overview':()=>renderer.overview(),'zoom-in':()=>renderer.zoom(1.2),'zoom-out':()=>renderer.zoom(1/1.2),
    'player':()=>{selected={kind:'unit',unit:state.player,tile:tileAt(state,state.player.x,state.player.y)};update();},
    'deselect':()=>{selected=null;update();},'evolution':showEvolution,'end':()=>run({type:'endTurn'}),'eat-self':()=>run({type:'eat'}),'heal':()=>run({type:'heal'}),
    'move':()=>{const t=getSelection()?.tile;if(t)run({type:'move',x:t.x,y:t.y}).then(()=>{if(!state.player.dead){selected={kind:'unit',unit:state.player,tile:tileAt(state,state.player.x,state.player.y)};update();}});},
    'interact':()=>{const sel=getSelection();if(sel)run({type:b.dataset.type,x:sel.tile.x,y:sel.tile.y,id:sel.unit?.id});},
    'evolve':()=>run({type:'evolve',id:b.dataset.id}),
    'environment':showEnvironment,'remove':()=>run({type:'remove',id:b.dataset.id}),'dash':()=>{const t=getSelection()?.tile;if(t)run({type:'dash',x:t.x,y:t.y});},
    'target-tile':()=>{selected={kind:'tile',tile:selected.tile};update();},
    'occupant':()=>{const unit=[state.player,...state.npcs].find(c=>c.id===selected.tile.occupant);if(unit){selected={kind:'unit',unit,tile:selected.tile};update();}}
  };handlers[action]?.();
});
document.addEventListener('change',e=>{if(e.target.id==='reduce-motion')renderer.reduced=e.target.checked;});
document.addEventListener('keydown',e=>{
  if($('dialog').open||renderer.menu||busy||!state||state.player.dead||e.target.closest('button,input,select'))return;
  if(e.key==='Enter'){e.preventDefault();run({type:'endTurn'});}if(e.key.toLowerCase()==='e')showEvolution();if(e.key.toLowerCase()==='f')renderer.focus();if(e.key==='Escape'){selected=null;update();onHover(null);}
});
$('dialog').addEventListener('close',()=>{modalType=null;});
// The QA page imports the same simulation modules; production UI exposes no mutable game globals.
