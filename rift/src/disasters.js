import { DISASTERS, pick, random } from './data.js';
import { damage } from './combat.js';
import { tileAt } from './map.js';
export const PROTECTION={fire:'heat',flood:'gills',drought:'lungs'};
export function scheduleDisaster(state,forced) {
  const kind=forced||pick(state,Object.keys(DISASTERS));
  // High ground can burn or dry out; flooding remains constrained by height.
  const candidates=state.tiles.filter(t=>!t.ramp&&(
    kind==='fire'?['forest','grass','highland'].includes(t.baseTerrain):
    kind==='flood'?t.baseHeight<2&&['grass','coast','shallow'].includes(t.baseTerrain):
    ['grass','forest','coast','highland','lake','shallow'].includes(t.baseTerrain)
  ));
  if(!candidates.length)return;
  const center=pick(state,candidates),reserved=new Set(state.tiles.filter(t=>t.barren).map(t=>t.id));
  for(const d of state.disasters)for(const id of d.tiles)reserved.add(id);
  let allowance=Math.max(0,Math.floor(state.tiles.length*.55)-reserved.size);
  const ids=candidates.filter(t=>Math.hypot(t.x-center.x,t.y-center.y)<=3.5&&(reserved.has(t.id)||allowance-->0)).map(t=>t.id);
  if(!ids.length)return;
  state.disasters.push({id:state.turn+'-'+state.disasters.length,kind,tiles:ids,startsAt:state.turn+3,endsAt:state.turn+6,status:'warning'});
  state.log.unshift(DISASTERS[kind].name+'：3 回合后发生，留下持续灾区。');
}
export function composedHazards(state,tile,turn=state.turn) {
  const result={...tile.hazards};
  for(const d of state.disasters)if(d.status==='warning'&&d.startsAt<=turn&&d.tiles.includes(tile.id))result[d.kind]=Math.min(3,(result[d.kind]||0)+1);
  if(result.flood)delete result.fire;
  return result;
}
export function hazardInfo(state,creature,tile,turn=state.turn) {
  const details=Object.entries(composedHazards(state,tile,turn)).map(([kind,intensity])=>({kind,intensity,blocked:creature.organs.includes(PROTECTION[kind]),damage:creature.organs.includes(PROTECTION[kind])?0:intensity*(kind==='fire'?2:1)}));
  return {details,total:Math.min(6,details.reduce((n,d)=>n+d.damage,0))};
}
export function updateDisasters(state,events) {
  for(const d of state.disasters){
    if(d.status==='warning'&&state.turn>=d.startsAt){
      d.status='active';state.log.unshift(DISASTERS[d.kind].name+'发生：灾区不再生长食物。');
      for(const t of state.tiles)if(d.tiles.includes(t.id)){
        t.hazards[d.kind]=Math.min(3,(t.hazards[d.kind]||0)+1);t.barren=true;t.food=0;
        if(t.hazards.flood){delete t.hazards.fire;t.terrain=t.baseTerrain==='shallow'?'deep':'shallow';t.height=0;}
        else if(t.hazards.drought&&['lake','shallow'].includes(t.baseTerrain)){t.terrain='coast';t.height=.5;}
      }
    }
    if(d.status==='active'&&state.turn>=d.endsAt)d.status='scar';
  }
  if(state.turn>=state.nextDisaster){scheduleDisaster(state);state.nextDisaster=state.turn+2+Math.floor(random(state)*3);}
  for(const c of [state.player,...state.npcs])if(!c.dead){const h=hazardInfo(state,c,tileAt(state,c.x,c.y));if(h.total)damage(state,c,h.total,null,events,'环境');}
}
