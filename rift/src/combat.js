import { ORGANS, SPECIES, random, pick } from './data.js';
import { tileAt } from './map.js';
import { stats } from './rules.js';
export function removeDead(state,target,killer,events) {
  if(target.hp>0||target.dead) return;
  target.hp=0;target.dead=true;
  const tile=tileAt(state,target.x,target.y);if(tile.occupant===target.id) tile.occupant=null;
  events.push({type:'death',id:target.id,x:target.x,y:target.y});
  if(target.id==='player') {state.phase='dead';state.log.unshift('生命归零。这条进化之路结束了。');return;}
  const biomass=target.drop+(killer?.organs.includes('teeth')?2:0);
  tile.loot.push({kind:'bio',value:biomass});
  const first=killer?.id==='player'&&!state.seenSpecies.includes(target.species);
  if(killer?.id==='player'){state.player.kills++;if(first){state.seenSpecies.push(target.species);state.player.ep++;}state.log.unshift('猎物留下 '+biomass+' 生物质，靠近后一次拾取。');}
  if(target.tissue&&(first||random(state)<.5)) {
    const tissue=first?target.tissue:pick(state,SPECIES[target.species]?.tissues||[target.tissue]);
    tile.loot.push({kind:'tissue',id:tissue});
    state.log.unshift(`${target.name}留下了${ORGANS.find(o=>o.id===tissue).name}组织。靠近后拾取。`);
  }
}
export function damage(state,target,amount,killer,events,label='') {
  if(target.dead) return;
  target.hp=Math.max(0,target.hp-amount);
  events.push({type:'damage',id:target.id,x:target.x,y:target.y,amount,label});
  removeDead(state,target,killer,events);
}
export function attack(state,attacker,target,events) {
  attacker.actions--;
  const amount=Math.max(1,stats(attacker).attack-stats(target).defense);
  events.push({type:'attack',from:{x:attacker.x,y:attacker.y},to:{x:target.x,y:target.y},id:attacker.id});
  damage(state,target,amount,attacker,events);
  state.log.unshift(`${attacker.name}攻击${target.name}，造成 ${amount} 伤害。`);
  target.alert=3;
  if(!target.dead&&(attacker.organs.includes('venom')||(attacker.species==='predator'&&random(state)<.25))) {target.poison=2;target.poisonSource=attacker.id;}
}
