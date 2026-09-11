import { isWater } from './data.js';
import { neighbors, tileAt } from './map.js';
export function stats(creature) {
  const has=id=>creature.organs.includes(id), level=creature.level||0;
  return { maxHp:creature.baseHp+level*5, capacity:3+level, attack:creature.baseAttack+((has('mouth')||has('stomach'))?1:0)+(has('teeth')?3:0), defense:creature.baseDefense+(has('shell')?2:0)+(has('armor')?2:0), move:1, food:has('stomach')?6:has('mouth')?4:3, perception:has('eyes')?9:5 };
}
export function canEnter(creature, tile) {
  if(!tile) return false;
  if(creature.species==='aquatic'&&!isWater(tile.terrain)) return false;
  if(creature.organs.includes('wings')) return true;
  if(['deep','lake'].includes(tile.terrain)) return creature.organs.includes('gills');
  return true;
}
export function moveCost() { return 1; }
export function crossingInfo(creature,from,to) {
  if(!canEnter(creature,to))return {ok:false,reason:'水域需要鳃或翅膀'};
  if(creature.organs.includes('wings'))return {ok:true,reason:'飞越'};
  const rise=Math.abs(to.height-from.height);
  if((isWater(from.terrain)||isWater(to.terrain))&&rise<=1.2)return {ok:true,reason:'沿岸出入'};
  if(rise>1.6&&!creature.organs.includes('climb'))return {ok:false,reason:'垂直崖壁：需要攀爬器官或沿坡道绕行'};
  if(rise>.65&&!creature.organs.some(o=>['legs','climb'].includes(o)))return {ok:false,reason:'陡坡：需要腿或攀爬器官'};
  return {ok:true,reason:rise>.65?'陡坡':rise>.25?'缓坡':'平地'};
}
// Dijkstra handles terrain-weighted reachability and optimal paths with one shared rule set.
export function reachable(state,creature,budget=creature.actions) {
  const start=tileAt(state,creature.x,creature.y);
  const result=new Map([[start.id,{tile:start,cost:0,path:[]}]]), pending=[start];
  while(pending.length) {
    pending.sort((a,b)=>result.get(b.id).cost-result.get(a.id).cost);
    const current=pending.pop(), base=result.get(current.id);
    for(const next of neighbors(state,current)) {
      if(!crossingInfo(creature,current,next).ok||(next.occupant&&next.occupant!==creature.id)) continue;
      const cost=base.cost+moveCost(creature,next);
      if(cost>budget||(result.has(next.id)&&result.get(next.id).cost<=cost)) continue;
      result.set(next.id,{tile:next,cost,path:[...base.path,{x:next.x,y:next.y}]});pending.push(next);
    }
  }
  return result;
}
export function pathTo(state,creature,destination,budget=creature.actions) { return reachable(state,creature,budget).get(destination.id)||null; }
export function relocate(state,creature,route,events) {
  if(!route.path.length) return;
  const from={x:creature.x,y:creature.y};
  tileAt(state,creature.x,creature.y).occupant=null;
  const last=route.path.at(-1);creature.x=last.x;creature.y=last.y;creature.actions-=route.cost;
  tileAt(state,last.x,last.y).occupant=creature.id;
  events.push({type:'move',id:creature.id,from,path:route.path,cost:route.cost});
}
