import { SPECIES, pick, manhattan, isWater, BALANCE } from './data.js';
import { tileAt } from './map.js';
import { reachable, relocate, stats, canEnter, crossingInfo } from './rules.js';
import { hazardInfo } from './disasters.js';
import { attack } from './combat.js';
function spawn(state,species,near=false){
  const s=SPECIES[species],c={id:'npc-'+state.npcs.length,species,name:s.name,x:0,y:0,hp:s.hp,baseHp:s.hp,actions:1,baseAttack:s.attack,baseDefense:s.defense-(s.organs.includes('shell')?2:0),organs:[...s.organs],level:0,drop:s.drop,tissue:s.tissue,poison:0,alert:0,dead:false};
  let tiles=state.tiles.filter(t=>!t.barren&&!t.occupant&&!t.specialResource&&canEnter(c,t)&&manhattan(t,state.player)>(species==='predator'?7:3)&&(species==='aquatic'?isWater(t.terrain):!isWater(t.terrain)));
  if(near){const nearby=[...reachable(state,state.player,3).values()].filter(r=>r.path.length>=2&&!r.tile.occupant&&!r.tile.specialResource&&!isWater(r.tile.terrain));if(nearby.length)tiles=nearby.map(r=>r.tile);}
  if(!tiles.length)return;const t=pick(state,tiles);c.x=t.x;c.y=t.y;t.occupant=c.id;state.npcs.push(c);
}
export function spawnNPCs(state){state.npcs=[];['bug','bug','bug','grazer','grazer','grazer','predator','predator','aquatic','aquatic','armored','armored'].forEach((s,i)=>spawn(state,s,i===0));}
export function intentFor(state,c){
  const distance=manhattan(c,state.player),weak=stats(state.player).attack<=stats(c).attack+1;
  if(hazardInfo(state,c,tileAt(state,c.x,c.y),state.turn+1).total)return {type:'evacuate',label:'撤离灾区'};
  if((c.species==='bug'&&distance<=2)||(c.species==='grazer'&&c.alert>0)||(c.species==='predator'&&!weak&&distance<4))return {type:'flee',label:'逃离'};
  const hostile=(c.species==='predator'&&weak&&distance<=5)||(['aquatic','armored'].includes(c.species)&&c.alert>0&&distance<=4);
  if(hostile){const adjacent=distance===1&&crossingInfo(c,tileAt(state,c.x,c.y),tileAt(state,state.player.x,state.player.y)).ok;return {type:adjacent?'attack':'chase',label:adjacent?'⚔ 将攻击':'追逐'};}
  return {type:'food',label:'觅食'};
}
export function actNPCs(state,events){
  for(const c of state.npcs){
    if(c.dead||state.player.dead)continue;c.actions=1;
    const intent=intentFor(state,c),distance=manhattan(c,state.player),current=tileAt(state,c.x,c.y);
    c.behavior=intent.label;
    const options=[...reachable(state,c,1).values()].filter(r=>r.path.length===BALANCE.npcSteps);
    if(intent.type==='attack')attack(state,c,state.player,events);
    else if(intent.type==='evacuate'){options.sort((a,b)=>hazardInfo(state,c,a.tile,state.turn+1).total-hazardInfo(state,c,b.tile,state.turn+1).total);if(options[0])relocate(state,c,options[0],events);}
    else if(intent.type==='flee'){options.sort((a,b)=>manhattan(b.tile,state.player)-manhattan(a.tile,state.player));if(options[0]&&manhattan(options[0].tile,state.player)>distance)relocate(state,c,options[0],events);}
    else if(intent.type==='chase'){options.sort((a,b)=>manhattan(a.tile,state.player)-manhattan(b.tile,state.player));if(options[0]&&manhattan(options[0].tile,state.player)<distance)relocate(state,c,options[0],events);}
    else if(current.food>0&&c.hp<stats(c).maxHp){current.food--;c.hp++;c.actions--;}
    else {const safe=options.filter(r=>!hazardInfo(state,c,r.tile,state.turn+1).total);if(safe.length)relocate(state,c,pick(state,safe),events);}
    c.alert=Math.max(0,c.alert-1);
  }
  if(state.turn%6===0&&state.npcs.filter(c=>!c.dead).length<12)spawn(state,pick(state,['bug','grazer','aquatic']));
}
