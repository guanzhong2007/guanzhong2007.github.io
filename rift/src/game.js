import { manhattan, ORGANS, BALANCE, TERRAINS } from './data.js';
import { generateMap, spawnPoints, tileAt, refreshResources } from './map.js';
import { stats, pathTo, relocate, reachable, canEnter, crossingInfo } from './rules.js';
import { evolve } from './evolution.js';
import { spawnNPCs, actNPCs } from './npc.js';
import { attack, damage } from './combat.js';
import { updateDisasters } from './disasters.js';
export function createGame(seed=Date.now()>>>0) {
  const state={version:2,mode:'infinite',seed,rng:seed,turn:1,phase:'player',log:['新生命在裂谷岛苏醒。每回合 3 次行动，觅食、探索、长出器官。这里没有固定胜利回合，直到生命结束。'],disasters:[],nextDisaster:6,seenSpecies:[],visited:[],firstRebuild:true,npcs:[]};
  generateMap(state);
  const spawn=spawnPoints(state)[0];if(!spawn)throw Error('没有合法出生点');
  state.player={id:'player',name:'原始细胞',x:spawn.x,y:spawn.y,level:0,hp:10,baseHp:10,actions:BALANCE.actions,baseAttack:2,baseDefense:0,bio:3,ep:BALANCE.startEP,organs:[],unlocked:[],poison:0,kills:0,dead:false};
  spawn.occupant='player';
  // Guarantee a nearby, genuinely reachable exploration reward, without adding crystals.
  const nearby=[...reachable(state,state.player,6).values()].filter(r=>r.path.length>=2&&r.path.length<=3&&r.tile.terrain!=='shallow');
  if(nearby.length&&!nearby.some(r=>r.tile.specialResource)){
    const source=state.tiles.find(t=>t.specialResource?.value===3);
    if(source){nearby[0].tile.specialResource=source.specialResource;source.specialResource=null;}
  }
  spawnNPCs(state);
  const open=[...reachable(state,state.player,3).values()];
  if(!open.some(r=>r.tile.specialResource)){
    const target=open.find(r=>r.path.length>=1&&!r.tile.occupant)?.tile||spawn;
    const source=state.tiles.find(t=>t.specialResource?.value===3);
    if(source){target.specialResource=source.specialResource;source.specialResource=null;}
  }
  state.visited=[spawn.baseTerrain];return state;
}
export function interactionInfo(state,action,target) {
  const p=state.player;
  if(state.phase!=='player'||p.dead)return {ok:false,reason:'当前无法行动'};
  const tile=target?.terrain?target:target?tileAt(state,target.x,target.y):null;
  if(!tile)return {ok:false,reason:'请先选择目标'};
  if(manhattan(p,tile)>1)return {ok:false,reason:action==='attack'?'目标不在攻击范围内':'需要移动到目标同格或相邻格'};
  if(manhattan(p,tile)===1&&!crossingInfo(p,tileAt(state,p.x,p.y),tile).ok)return {ok:false,reason:'目标隔着水域或陡壁，请先寻找可通行路线'};
  if(action!=='attack'&&tile.occupant&&tile.occupant!==p.id)return {ok:false,reason:'此处被其他生物占据'};
  const cost={eat:1,crystal:1,attack:1,loot:1}[action];
  if(cost===undefined)return {ok:false,reason:'未知操作'};
  if(p.actions<cost)return {ok:false,reason:`需要 ${cost} 次行动`};
  if(action==='eat'&&tile.food<1)return {ok:false,reason:'此处没有食物；灾区不会再生食物'};
  if(action==='crystal'&&!tile.specialResource)return {ok:false,reason:'此处没有结晶'};
  if(action==='loot'&&!tile.loot.length)return {ok:false,reason:'此处没有掉落物'};
  if(action==='attack'&&(!target.id||target.id==='player'||target.dead))return {ok:false,reason:'无有效攻击目标'};
  return {ok:true,cost,tile,yield:action==='eat'?Math.min(tile.food,stats(p).food):action==='crystal'?tile.specialResource.value:0};
}
export function command(state,input) {
  if(state.phase!=='player'||state.player.dead)return {ok:false,message:'当前无法行动',events:[]};
  const p=state.player,events=[];let message='';
  const fail=message=>({ok:false,message,events:[]});
  if(input.type==='move'||input.type==='dash') {
    const tile=tileAt(state,input.x,input.y);if(!tile)return fail('地图之外无法移动');
    const dash=input.type==='dash';
    if(dash&&(!p.organs.some(o=>['limbs','legs'].includes(o))||p.actions<1))return fail('疾行需要肢体和 1 次行动');
    const route=pathTo(state,p,tile,dash?2:p.actions);if(!route||!route.path.length)return fail('无法到达：检查次行动、地形或占位');
    if(dash)route.cost=1;
    relocate(state,p,route,events);
    const region=tile.baseTerrain;
    if(!state.visited.includes(region)){state.visited.push(region);p.ep++;state.log.unshift('首次探索'+TERRAINS[region].name+'：+1 进化点。');}message=`移动 ${route.path.length} 格，消耗 ${route.cost} 次行动。`;
  } else if(['eat','crystal','loot','attack'].includes(input.type)) {
    const target=input.type==='attack'?state.npcs.find(n=>n.id===input.id):tileAt(state,input.x??p.x,input.y??p.y);
    const info=interactionInfo(state,input.type,target);if(!info.ok)return fail(info.reason);
    if(input.type==='attack') {attack(state,p,target,events);message='攻击完成。';}
    else {
      p.actions-=info.cost;
      if(input.type==='eat'){info.tile.food-=info.yield;p.bio+=info.yield;message=`进食获得 ${info.yield} 生物质。`;}
      if(input.type==='crystal'){p.ep+=info.yield;info.tile.specialResource=null;message=`吸收结晶，获得 ${info.yield} 进化点。`;}
      if(input.type==='loot') {
        for(const loot of info.tile.loot){if(loot.kind==='bio')p.bio+=loot.value;else if(!p.unlocked.includes(loot.id)){p.unlocked.push(loot.id);message+='解锁器官标本。';}else p.ep++;}
        info.tile.loot=[];message='已拾取生物质并吸收标本；重复标本转化为 1 进化点。';
      }
      events.push({type:'gain',x:p.x,y:p.y,text:input.type==='loot'?'已拾取':`+${info.yield} ${input.type==='eat'?'生物质':'进化点'}`});
    }
  } else if(input.type==='evolve') {
    if(p.actions<1)return fail('需要 1 次行动');
    const result=evolve(p,input.id);if(!result.ok)return fail(result.message);p.actions--;message=result.message;
    events.push({type:'gain',x:p.x,y:p.y,text:'进化成功'});
   } else if(input.type==='remove') {
    if(p.actions<1)return fail('需要 1 次行动');
    if(tileAt(state,p.x,p.y).barren)return fail('请在健康区域重组器官');
    const organ=ORGANS.find(o=>o.id===input.id);
    if(!organ||!p.organs.includes(input.id))return fail('没有此器官');
    if(p.organs.some(id=>{const req=ORGANS.find(o=>o.id===id)?.requires||[];return req.includes(input.id)||(input.id==='stomach'&&req.includes('mouth'));}))return fail('其他器官依赖此器官');
    const cost=state.firstRebuild?0:1;if(p.bio<cost)return fail('重组需要 1 生物质');
    const proposed={...p,organs:p.organs.filter(id=>id!==input.id)};
    if(!canEnter(proposed,tileAt(state,p.x,p.y)))return fail('不能拆除维持当前地形通行的器官');
    p.organs=proposed.organs;p.bio+=Math.floor(organ.bio/2)-cost;p.actions--;state.firstRebuild=false;message='重组完成，返还部分生物质。';
  } else if(input.type==='heal') {
    if(p.hp>=stats(p).maxHp)return fail('生命已经满了');
    if(p.bio<2||p.actions<1)return fail('恢复需要 2 生物质和 1 次行动');
    const healed=Math.min(4,stats(p).maxHp-p.hp);p.bio-=2;p.actions--;p.hp+=healed;message=`消耗 2 生物质和 1 次行动，恢复 ${healed} 生命。`;
  } else if(input.type==='endTurn') {
    state.phase='resolving';actNPCs(state,events);
    if(!p.dead) {
      state.turn++;updateDisasters(state,events);refreshResources(state);
      for(const c of [p,...state.npcs]) if(!c.dead&&c.poison>0) {
        c.poison--;damage(state,c,1,[p,...state.npcs].find(n=>n.id===c.poisonSource),events,'中毒');
      }
      if(!p.dead) {
        p.actions=BALANCE.actions;
        if(p.organs.includes('regen')&&p.hp<stats(p).maxHp&&p.bio>0){p.bio--;p.hp=Math.min(stats(p).maxHp,p.hp+2);}
        state.phase='player';message=`第 ${state.turn} 回合：3 次行动已恢复。`;
      }
    }
  } else return fail('未知指令');
  if(message)state.log.unshift(message);state.log=state.log.slice(0,60);
  return {ok:true,message,events};
}
