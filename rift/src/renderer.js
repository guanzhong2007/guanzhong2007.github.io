import { TERRAINS, SPECIES, DISASTERS, manhattan, isWater, BALANCE } from './data.js';
import { tileAt } from './map.js';
import { intentFor } from './npc.js';
import { stats } from './rules.js';
const W=29,H=14.5,ELEV=13;
export class Renderer {
  constructor(canvas, callbacks) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.callbacks=callbacks;
    this.camera={x:0,y:0,zoom:1};this.target={...this.camera};this.selected=null;this.reachable=new Map();this.pathPreview=[];this.hover=null;this.menu=true;this.busy=false;this.effects=[];this.positions=new Map();this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize=()=>{this.width=innerWidth;this.height=innerHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=this.width*dpr;canvas.height=this.height*dpr;this.dpr=dpr;};
    addEventListener('resize',this.resize);this.resize();
    let drag=null;
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};if(e.isTrusted)canvas.setPointerCapture(e.pointerId);callbacks.hover(null);});
    canvas.addEventListener('pointermove',e=>{
      if(drag){const dx=e.clientX-drag.lastX,dy=e.clientY-drag.lastY;drag.lastX=e.clientX;drag.lastY=e.clientY;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)drag.moved=true;if(drag.moved){this.target.x+=dx;this.target.y+=dy;this.camera.x=this.target.x;this.camera.y=this.target.y;}return;}
      const hit=this.pick(e.clientX,e.clientY);this.hover=hit;callbacks.hover(hit,e.clientX,e.clientY);
    });
    canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved&&!this.menu&&!this.busy)callbacks.click(this.pick(e.clientX,e.clientY));drag=null;});
    canvas.addEventListener('pointercancel',()=>{drag=null;});
    canvas.addEventListener('pointerleave',()=>{this.hover=null;callbacks.hover(null);});
    canvas.addEventListener('wheel',e=>{e.preventDefault();callbacks.hover(null);this.zoom(Math.exp(-e.deltaY*.001),e.clientX,e.clientY);},{passive:false});
    this.lastFrame=0;const loop=t=>{this.draw(t);requestAnimationFrame(loop);};requestAnimationFrame(loop);
  }
  setState(state,menu=false){this.state=state;this.menu=menu;this.order=[...state.tiles].sort((a,b)=>(a.x+a.y)-(b.x+b.y)||a.x-b.x);this.positions.clear();this.effects=[];}
  project(x,y,height=0){return {x:(x-y)*W*this.camera.zoom+this.camera.x,y:((x+y)*H-height*ELEV)*this.camera.zoom+this.camera.y};}
  focus(){const p=this.state.player,t=tileAt(this.state,p.x,p.y);this.target.zoom=1.25;this.target.x=this.width*.5-(p.x-p.y)*W*this.target.zoom;this.target.y=this.height*.52-((p.x+p.y)*H-t.height*ELEV)*this.target.zoom;}
  overview(menu=false){const z=Math.min(this.width/(menu?1000:1220),(this.height-140)/700);this.target.zoom=Math.max(.48,Math.min(1.1,z));this.target.x=this.width*(menu?.70:.5);this.target.y=this.height*.5-290*this.target.zoom;}
  zoom(factor,x=this.width/2,y=this.height/2){const old=this.target.zoom,z=Math.max(.42,Math.min(2.5,old*factor));this.target.x=x-(x-this.target.x)*z/old;this.target.y=y-(y-this.target.y)*z/old;this.target.zoom=z;}
  polygon(points,fill,stroke){const c=this.ctx;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=.7;c.stroke();}}
  diamond(x,y,w,h,fill,stroke){this.polygon([[x,y-h],[x+w,y],[x,y+h],[x-w,y]],fill,stroke);}
  ellipse(x,y,rx,ry,fill,stroke){const c=this.ctx;c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();}}
  pick(x,y){
    if(!this.state||this.menu)return null;
    // Units take priority over ground. Test from front to back in current screen space.
    const units=[this.state.player,...this.state.npcs].filter(c=>!c.dead).sort((a,b)=>b.x+b.y-a.x-a.y);
    for(const unit of units){const t=tileAt(this.state,unit.x,unit.y),p=this.project(unit.x,unit.y,t.height),z=this.camera.zoom;if(((x-p.x)/(19*z))**2+((y-(p.y-13*z))/(23*z))**2<1)return {kind:'unit',unit,tile:t};}
    for(let i=this.order.length-1;i>=0;i--){const t=this.order[i],p=this.project(t.x,t.y,t.height);if(Math.abs(x-p.x)/(W*this.camera.zoom)+Math.abs(y-p.y)/(H*this.camera.zoom)<=1)return {kind:'tile',tile:t};}
    return null;
  }
  draw(t){
    if(!this.state)return;
    const dt=Math.min(40,t-(this.lastFrame||t));this.lastFrame=t;
    const factor=this.reduced?1:1-Math.exp(-dt/95);
    for(const k of ['x','y','zoom'])this.camera[k]+=(this.target[k]-this.camera[k])*factor;
    const c=this.ctx;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.width,this.height);
    const z=this.camera.zoom,w=W*z,h=H*z;
    // Quiet cartographic texture behind the island.
    c.strokeStyle='#c5d7b009';c.lineWidth=1;
    for(let y=100;y<this.height;y+=48){c.beginPath();c.moveTo(0,y);c.lineTo(this.width,y);c.stroke();}
    this.ellipse(this.camera.x,this.camera.y+335*z,580*z,270*z,'#071d2045');
    const rendered=[];
    for(const tile of this.order){
      const p=this.project(tile.x,tile.y,tile.height);if(p.x < -100||p.x>this.width+100||p.y< -100||p.y>this.height+100)continue;
      const land=TERRAINS[tile.terrain],depth=(tile.height*ELEV+11)*z;
      this.polygon([[p.x-w,p.y],[p.x,p.y+h],[p.x,p.y+h+depth],[p.x-w,p.y+depth]],land.side);
      this.polygon([[p.x,p.y+h],[p.x+w,p.y],[p.x+w,p.y+depth],[p.x,p.y+h+depth]],land.side);
      this.diamond(p.x,p.y,w,h,land.color,'#e2ebc91d');
      if(!this.menu&&manhattan(tile,this.state.player)>stats(this.state.player).perception)this.diamond(p.x,p.y,w,h,'#102d3038');
      if(isWater(tile.terrain)){
        const wave=this.reduced?0:Math.sin(t*.0015+tile.x+tile.y)*2*z;
        c.strokeStyle='#bfefdc35';c.lineWidth=.8;c.beginPath();c.moveTo(p.x-7*z,p.y+wave);c.lineTo(p.x+5*z,p.y+wave-1*z);c.stroke();
      }
      if(tile.terrain==='grass'&&tile.food>0&&(tile.x+tile.y)%3===0){c.strokeStyle='#d6df9e88';c.beginPath();c.moveTo(p.x-8*z,p.y);c.lineTo(p.x-9*z,p.y-4*z);c.moveTo(p.x-8*z,p.y);c.lineTo(p.x-5*z,p.y-3*z);c.stroke();}
      if(!this.menu&&this.reachable.has(tile.id)&&this.reachable.get(tile.id).cost>0)this.diamond(p.x,p.y,w-1*z,h-1*z,'#d8eda831','#e1f4ad77');
      if(tile.barren)this.diamond(p.x,p.y,w-1,h-1,'#5d494977','#ddb797');
      const marks=[...Object.keys(tile.hazards||{}).map(k=>DISASTERS[k].icon),...(this.state.disasters||[]).filter(d=>d.status==='warning'&&d.tiles.includes(tile.id)).map(d=>'!'+DISASTERS[d.kind].icon)];
      if(marks.length){c.fillStyle='#fff0bf';c.font=Math.max(9,11*z)+'px sans-serif';c.fillText(marks.join(''),p.x-12*z,p.y);}
      if(tile.ramp){c.fillStyle='#f6e5b8';c.font=11*z+'px sans-serif';c.fillText('↗',p.x-5*z,p.y+4*z);}
      for(const [dx,dy] of [[1,0],[0,1]]){const n=tileAt(this.state,tile.x+dx,tile.y+dy);if(n&&Math.abs(n.height-tile.height)>1.6){c.strokeStyle='#422e28';c.lineWidth=3*z;c.beginPath();c.moveTo(p.x,p.y+h);c.lineTo(p.x+(dx?1:-1)*w,p.y);c.stroke();}}

      if(this.hover?.tile.id===tile.id&&!this.menu)this.diamond(p.x,p.y,w,h,'#f1f4ce25','#f0efd6');
      if(this.selected?.tile?.id===tile.id&&!this.menu)this.diamond(p.x,p.y,w-1,h-1,null,'#edf0cf');
      if(tile.terrain==='forest'&&!tile.barren)rendered.push({order:tile.x+tile.y-.05,draw:()=>this.tree(p.x+8*z,p.y-4*z,z,(tile.x+tile.y)%3)});
      if(tile.specialResource)rendered.push({order:tile.x+tile.y,draw:()=>this.crystal(p.x-5*z,p.y-3*z,z,t,tile.specialResource.value)});
      if(tile.loot.length)rendered.push({order:tile.x+tile.y,draw:()=>{this.ellipse(p.x,p.y,7*z,4*z,'#e2c794');c.fillStyle='#e7e6c7';c.font=`${11*z}px sans-serif`;c.fillText('✧',p.x-4*z,p.y-4*z);}});
      if(tile.food>0&&!isWater(tile.terrain)&&tile.terrain!=='forest'&&(tile.x*3+tile.y)%4===0){this.ellipse(p.x+7*z,p.y+3*z,2*z,1.5*z,'#e4c787');this.ellipse(p.x+10*z,p.y+2*z,1.5*z,1.5*z,'#bcca78');}
    }
    if(!this.menu&&this.pathPreview?.length){
      c.beginPath();const start=this.state.player,st=tileAt(this.state,start.x,start.y),sp=this.project(start.x,start.y,st.height);c.moveTo(sp.x,sp.y);
      for(const step of this.pathPreview){const tile=tileAt(this.state,step.x,step.y),p=this.project(step.x,step.y,tile.height);c.lineTo(p.x,p.y);}
      c.strokeStyle='#eff4bd';c.lineWidth=2*z;c.setLineDash([4*z,4*z]);c.stroke();c.setLineDash([]);
      const last=this.pathPreview.at(-1),lt=tileAt(this.state,last.x,last.y),lp=this.project(last.x,last.y,lt.height);this.ellipse(lp.x,lp.y,4*z,2.5*z,'#f2efc0');
    }
    const all=[...this.state.npcs,this.state.player];
    for(const unit of all){if(unit.dead&&!this.positions.has(unit.id))continue;const pos=this.positions.get(unit.id)||unit,base=tileAt(this.state,Math.round(pos.x),Math.round(pos.y));const p=this.project(pos.x,pos.y,pos.height??base?.height??0);rendered.push({order:pos.x+pos.y+.1,draw:()=>this.creature(unit,p,z,t)});}
    rendered.sort((a,b)=>a.order-b.order).forEach(r=>r.draw());
    for(const effect of this.effects){const age=(t-effect.start)/1000;if(age>1)continue;const tile=tileAt(this.state,effect.x,effect.y),p=this.project(effect.x,effect.y,tile?.height||0);c.globalAlpha=Math.max(0,1-age);c.fillStyle=effect.type==='damage'?'#ffe0c7':'#e2f0b0';c.font=`600 ${Math.max(12,16*z)}px "Segoe UI",sans-serif`;c.textAlign='center';c.shadowColor='#15382b';c.shadowBlur=5;c.fillText(effect.text,p.x,p.y-34*z-age*35);c.shadowBlur=0;c.globalAlpha=1;}
    this.effects=this.effects.filter(e=>t-e.start<1000);c.textAlign='start';
    if(!this.menu){c.fillStyle='#b5cab06b';c.font='10px "Segoe UI",sans-serif';c.fillText(`RIFT ISLAND / ${this.state.seed} / 22 × 22`,26,this.height-82);}
  }
  tree(x,y,z,variant){
    this.ellipse(x,y+4*z,12*z,5*z,'#183a3545');this.polygon([[x-2*z,y],[x+2*z,y],[x+2*z,y-20*z],[x-2*z,y-20*z]],'#687660');
    if(variant===0){this.polygon([[x,y-38*z],[x-13*z,y-12*z],[x+13*z,y-12*z]],'#315c4b');this.polygon([[x,y-38*z],[x,y-12*z],[x+13*z,y-12*z]],'#63896a');}
    else{this.ellipse(x-6*z,y-22*z,10*z,11*z,'#315d4a');this.ellipse(x+6*z,y-21*z,10*z,12*z,'#547d5c');this.ellipse(x,y-30*z,11*z,10*z,'#719266');}
  }
  crystal(x,y,z,t,value){const c=this.ctx,dy=this.reduced?0:Math.sin(t*.002+x)*2*z;this.ellipse(x,y+4*z,10*z,5*z,'#70d7ed20');c.shadowColor='#96e9f4';c.shadowBlur=15*z;const h=(value===8?26:18)*z;this.polygon([[x,y-h+dy],[x-6*z,y-8*z+dy],[x,y+dy],[x+7*z,y-8*z+dy]],'#b5e4ec');c.shadowBlur=0;this.polygon([[x,y-h+dy],[x,y+dy],[x+7*z,y-8*z+dy]],'#78b9d2');}
  creature(unit,p,z,t){
    const c=this.ctx,isPlayer=unit.id==='player',organs=unit.organs,body=isPlayer?'#dfedb7':SPECIES[unit.species].color;
    const pulse=this.reduced?0:Math.sin(t*.002+unit.x)*.8*z;
    if(!isPlayer&&!this.menu){c.fillStyle='#f8dfb1';c.font='11px sans-serif';c.fillText(intentFor(this.state,unit).label,p.x-18*z,p.y-43*z);}
    this.ellipse(p.x,p.y+2*z,16*z,7*z,'#152c2855');
    if(isPlayer){this.ellipse(p.x,p.y,21*z,10*z,'#d5e99d16',this.selected?.unit?.id==='player'?'#e3f1ae':'#b2d99a88');}
    else if(!this.menu&&((manhattan(unit,this.state.player)===1&&this.state.player.actions>=1)||(manhattan(unit,this.state.player)<=2&&['predator','armored'].includes(unit.species))))this.ellipse(p.x,p.y,18*z,8*z,null,'#e6a682');
    if(organs.includes('wings')){this.ellipse(p.x-17*z,p.y-17*z,17*z,7*z,'#d8ecc0bb');this.ellipse(p.x+17*z,p.y-17*z,17*z,7*z,'#d8ecc0bb');}
    if(organs.includes('limbs')||organs.includes('legs'))for(const side of [-1,1])for(const offset of [-5,6])this.ellipse(p.x+side*12*z,p.y+offset*z-1*z,organs.includes('legs')?6*z:4*z,3*z,'#a7b88a');
    this.ellipse(p.x,p.y-12*z+pulse,(14+(unit.level||0)*2)*z,(12+(unit.level||0)*2)*z,body);
    this.ellipse(p.x-5*z,p.y-17*z+pulse,6*z,4*z,'#f4f4d644');
    if(organs.includes('shell')||organs.includes('armor')){this.ellipse(p.x,p.y-17*z,13*z,9*z,organs.includes('armor')?'#9caaa2':'#859675','#d7dec077');this.polygon([[p.x,p.y-25*z],[p.x-6*z,p.y-18*z],[p.x,p.y-11*z],[p.x+6*z,p.y-18*z]],null,'#dbe1bd66');}
    if(organs.includes('gills'))for(let i=0;i<3;i++){c.strokeStyle='#6197a4';c.beginPath();c.moveTo(p.x-10*z,p.y-(13+i*3)*z);c.lineTo(p.x-5*z,p.y-(10+i*3)*z);c.stroke();}
    const eyes=organs.includes('eyes')?2.7:1.7;
    this.ellipse(p.x+3*z,p.y-14*z,eyes*z,eyes*z,'#30483e');this.ellipse(p.x+10*z,p.y-13*z,eyes*z,eyes*z,'#30483e');
    if(organs.includes('mouth'))this.ellipse(p.x+7*z,p.y-7*z,4*z,2.5*z,'#758a65');
    if(organs.includes('teeth'))this.polygon([[p.x+4*z,p.y-9*z],[p.x+6*z,p.y-5*z],[p.x+8*z,p.y-9*z]],'#f6f0c9');
    if(organs.includes('venom')||unit.species==='predator')this.polygon([[p.x-8*z,p.y-21*z],[p.x-5*z,p.y-30*z],[p.x-2*z,p.y-21*z]],'#d8b0cc');
    if(organs.includes('regen'))this.ellipse(p.x-7*z,p.y-13*z,3*z,3*z,'#bce4d1');
    if(unit.hp<stats(unit).maxHp){c.fillStyle='#1b342b';c.fillRect(p.x-13*z,p.y-33*z,26*z,3*z);c.fillStyle=isPlayer?'#d7e8a8':'#dca281';c.fillRect(p.x-13*z,p.y-33*z,26*z*unit.hp/stats(unit).maxHp,3*z);}
    if(isPlayer&&!this.menu){c.fillStyle='#e7eed0';c.textAlign='center';c.font=`${10*Math.max(.8,z)}px sans-serif`;c.fillText('你',p.x,p.y-39*z);c.textAlign='start';}
  }
  async animate(events,speed=1){
    this.busy=true;
    // Initial visual positions preserve NPC sequencing even though the simulation commits atomically.
    for(const e of events){if(e.type==='move'&&!this.positions.has(e.id))this.positions.set(e.id,{...e.from});if(e.type==='death'&&!this.positions.has(e.id))this.positions.set(e.id,{x:e.x,y:e.y});}
    const waitFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    for(const e of events){
      if(e.type==='move'){
        let from=e.from;
        for(const to of e.path){
          const started=performance.now(),duration=this.reduced?0:e.id==='player'?125/speed:Math.max(170,BALANCE.npcStepMs/speed);
          const fromH=tileAt(this.state,from.x,from.y)?.height||0,toH=tileAt(this.state,to.x,to.y)?.height||0;
          let progress=0;
          do{progress=duration?Math.min(1,(performance.now()-started)/duration):1;const smooth=progress*progress*(3-2*progress);this.positions.set(e.id,{x:from.x+(to.x-from.x)*smooth,y:from.y+(to.y-from.y)*smooth,height:fromH+(toH-fromH)*smooth});if(progress<1)await waitFrame();}while(progress<1);
          from=to;
        }
        this.positions.delete(e.id);
      }else if(e.type==='damage'||e.type==='gain'){this.effects.push({...e,start:performance.now(),text:e.type==='damage'?`−${e.amount}${e.label?' '+e.label:''}`:e.text});}
      else if(e.type==='attack'){
        const start=performance.now(),duration=this.reduced?0:140/speed;
        let progress=0;do{progress=duration?Math.min(1,(performance.now()-start)/duration):1;const lean=Math.sin(progress*Math.PI)*.3;this.positions.set(e.id,{x:e.from.x+(e.to.x-e.from.x)*lean,y:e.from.y+(e.to.y-e.from.y)*lean});if(progress<1)await waitFrame();}while(progress<1);this.positions.delete(e.id);
      }else if(e.type==='death'){this.effects.push({...e,start:performance.now(),text:'✧'});this.positions.delete(e.id);}
    }
    this.positions.clear();this.busy=false;
  }
}
