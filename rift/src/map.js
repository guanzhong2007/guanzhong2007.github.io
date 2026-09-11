import { SIZE, TERRAINS, key, random, pick, manhattan, isWater } from './data.js';
export const tileAt = (state, x, y) => state.tiles[y * state.size + x]?.x === x && x >= 0 && y >= 0 ? state.tiles[y * state.size + x] : null;
export const neighbors = (state, tile) => [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => tileAt(state,tile.x+dx,tile.y+dy)).filter(Boolean);
export function generateMap(state) {
  state.size = SIZE; state.tiles = [];
  const phase = random(state) * 6.28;
  for (let y=0;y<SIZE;y++) for (let x=0;x<SIZE;x++) {
    const coast = Math.min(x,y,SIZE-1-x,SIZE-1-y);
    const ridge = x - 14 + Math.sin(y*.55+phase)*1.5;
    const lake = ((x-8)/3.7)**2 + ((y-10)/3.1)**2;
    let terrain='grass', height=1;
    if (coast < 1) {terrain='deep';height=0;}
    else if (coast < 2) {terrain='shallow';height=0;}
    else if (coast < 3) {terrain='coast';height=.5;}
    else if (lake < .55) {terrain='lake';height=0;}
    else if (lake < 1) {terrain='shallow';height=0;}
    else if (ridge > 1 && y > 3 && y < 17) {terrain='highland';height=3;}
    else if (Math.sin(x*.65+phase)+Math.cos(y*.58)+random(state)*.8 > .4) {terrain='forest';height=1.2;}
    const maxFood=TERRAINS[terrain].food;
    state.tiles.push({x,y,id:key(x,y),terrain,baseTerrain:terrain,height,baseHeight:height,food:Math.floor(maxFood*(.55+random(state)*.45)),maxFood,danger:null,occupant:null,specialResource:null,loot:[]});
  }
  // Two explicit ramps connect the plateau to low ground, independent of the ridge seed.
  for(const y of [6,14]) for(let x=12;x<=18;x++) {
    const t=tileAt(state,x,y);t.terrain=t.baseTerrain=x>=15?'highland':'grass';
    t.height=t.baseHeight=1+Math.min(2,Math.max(0,x-12)*.4);t.ramp=true;t.maxFood=8;t.food=8;
  }
  for(const t of state.tiles){t.hazards={};t.barren=false;}
  const candidates=state.tiles.filter(t=>['grass','forest','coast'].includes(t.terrain));
  for(let i=0;i<9;i++) { const t=pick(state,candidates.filter(t=>!t.specialResource)); t.specialResource={kind:'crystal',value:i<2?8:3}; }
}
export function spawnPoints(state, count=1, minDistance=7) {
  const candidates=state.tiles.filter(t=>t.x>=3&&t.y>=3&&t.x<state.size-3&&t.y<state.size-3&&['grass','forest'].includes(t.terrain)&&!t.occupant&&t.food>=4&&neighbors(state,t).filter(n=>['grass','forest','coast','shallow'].includes(n.terrain)).length>=3);
  const result=[];
  while(result.length<count) {
    const available=candidates.filter(t=>result.every(p=>manhattan(t,p)>=minDistance));
    if(!available.length) break;
    result.push(pick(state,available));
  }
  return result;
}
export function refreshResources(state) {
  for(const tile of state.tiles) {
    if(tile.barren){tile.food=0;continue;}
    if(tile.food<tile.maxFood) tile.food=Math.min(tile.maxFood,tile.food+1);
  }
}
