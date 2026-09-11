import {keyLabel,DEFAULT_LANE_KEYS} from './KeyBindings.js';
import {noteProgress} from './NoteManager.js';
export class Renderer {
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.feedback=[];this.frames=[];this.last=0;this.fps=60;}
 draw(time,notes,held,settings,mode='menu'){
  const c=this.canvas,ctx=this.ctx,w=c.clientWidth,h=c.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
  if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const now=performance.now();if(this.last){this.frames.push(now-this.last);if(this.frames.length>60)this.frames.shift();this.fps=Math.round(1000/(this.frames.reduce((a,b)=>a+b,0)/this.frames.length));}this.last=now;
  const compact=w<700||h<330,margin=compact?Math.max(8,w*.025):Math.max(22,w*0.055),gap=compact?6:Math.max(10,w*0.012),laneW=(w-2*margin-3*gap)/4,top=compact?8:18,bottom=h-(compact?28:62),s=top+(compact?28:42),b=bottom-(compact?30:55),mid=(s+b)/2;
  this.layout={margin,gap,laneW,s,b,mid,top,bottom};
  const text=(txt,x,y,size=14,color='#171d23',weight=500)=>{ctx.font=`${weight} ${size}px "Segoe UI", "Microsoft YaHei", sans-serif`;ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(txt,x,y);};
  for(let lane=1;lane<=4;lane++){
   const x=margin+(lane-1)*(laneW+gap),cx=x+laneW/2;
   ctx.fillStyle=held.has(String(lane))?'#e7eef0':'#f0f3f3';ctx.strokeStyle='#dce2e3';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x,top,laneW,bottom-top,5);ctx.fill();ctx.stroke();
   ctx.strokeStyle='#e6ebec';ctx.beginPath();ctx.moveTo(cx,top+20);ctx.lineTo(cx,bottom-25);ctx.stroke();
   for(let y=s+38;y<b;y+=38){ctx.strokeStyle='#e9eeee';ctx.beginPath();ctx.moveTo(x+1,y);ctx.lineTo(x+laneW-1,y);ctx.stroke();}
   ctx.setLineDash([11,9]);ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+8,mid);ctx.lineTo(x+laneW-8,mid);ctx.stroke();ctx.setLineDash([]);
   for(const [direction,y,label] of [['up',s,'S'],['down',b,'B']]){
    const f=this.feedback.findLast(f=>f.lane===lane&&f.direction===direction&&now-f.at<550),age=f?now-f.at:999;
    const sideHeld=held.has(direction==='up'?'s':'b'),color=age<160?(f.grade==='MISS'?'#c62b37':'#e4ae21'):sideHeld?(direction==='up'?'#ef3345':'#00a95d'):'#1b242a';
    ctx.save();ctx.strokeStyle=color;ctx.lineWidth=sideHeld?4:2;ctx.setLineDash([9,7]);if(sideHeld||age<160&&f.grade!=='MISS'){ctx.shadowColor=sideHeld?(direction==='up'?'#ef3345':'#00bb65'):'#ffc72a';ctx.shadowBlur=22;}ctx.beginPath();ctx.moveTo(x+16,y);ctx.lineTo(x+laneW-36,y);ctx.stroke();ctx.restore();text(label,x+laneW-22,y+6,sideHeld?22:19,color,750);
    if(f){ctx.save();ctx.globalAlpha=Math.max(0,1-age/550);text(f.label,cx,y+(direction==='up'?29:-17),Math.min(20,laneW/10),f.grade==='MISS'?'#bc3241':'#b88612',750);if(f.error!==null)text(`${f.error<0?'EARLY':'LATE'} ${Math.abs(f.error*1000).toFixed(0)} ms`,cx,y+(direction==='up'?47:-38),10,'#8d9195');ctx.restore();}
   }
   if(!compact){ctx.fillStyle=held.has(String(lane))?'#1b242a':'#fff';ctx.strokeStyle='#b0bbc0';ctx.lineWidth=1.3;ctx.beginPath();ctx.roundRect(cx-34,bottom-42,68,32,7);ctx.fill();ctx.stroke();text(keyLabel((settings.laneKeys||DEFAULT_LANE_KEYS)[lane-1]),cx,bottom-18,18,held.has(String(lane))?'#fff':'#192228',750);}
  }
  for(const n of notes){
   const aftermath=n.state==='done',fadeDuration=n.finalGrade==='MISS'?0.38:0.12;if(aftermath&&(!Number.isFinite(n.finishedAt)||time-n.finishedAt>fadeDuration))continue;
   const progress=noteProgress(time,n.time,settings.approach);if(progress<0)continue;
   if(!aftermath&&n.state!=='holding'&&time>n.time+0.17)continue;
   const cx=margin+(n.lane-1)*(laneW+gap)+laneW/2,dir=n.direction==='up'?-1:1,travel=(b-s)/2,judgeY=dir<0?s:b;
   const y=mid+dir*travel*progress,color=dir<0?'#fa253b':'#00c66a';
   ctx.save();ctx.beginPath();ctx.rect(cx-laneW/2+2,top+2,laneW-4,bottom-top-47);ctx.clip();ctx.globalAlpha=Math.min(1,progress*settings.approach/0.075)*(aftermath?Math.max(0,1-(time-n.finishedAt)/fadeDuration):1);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=14;
   if(n.type==='wick'){
    ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(cx,y);ctx.lineTo(cx,y-dir*65);ctx.stroke();ctx.lineWidth=6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(cx-19,y);ctx.lineTo(cx+19,y);ctx.stroke();
   }else{
    const tail=mid+dir*travel*((time-n.time-n.duration+settings.approach)/settings.approach);
    const head=n.state==='holding'?judgeY:y;
    const clippedTail=dir<0?Math.min(mid,tail):Math.max(mid,tail);
    ctx.globalAlpha*=n.state==='holding'?0.95:0.8;
    ctx.fillRect(cx-15,Math.min(head,clippedTail),30,Math.max(3,Math.abs(head-clippedTail)));ctx.shadowBlur=0;ctx.strokeStyle=dir<0?'#db1830':'#009e52';ctx.lineWidth=2;ctx.strokeRect(cx-15,Math.min(head,clippedTail),30,Math.max(3,Math.abs(head-clippedTail)));
    if(n.state==='holding'){ctx.fillStyle='#fff';ctx.fillRect(cx-10,head-2,20,4);}
   }ctx.restore();
  }
  ctx.strokeStyle='#99a3aa';ctx.lineWidth=1;for(let i=0;i<49;i++){const x=margin+i*(w-2*margin)/48;ctx.beginPath();ctx.moveTo(x,h-25);ctx.lineTo(x,h-(i%4===0?45:35));ctx.stroke();}
  ctx.strokeStyle='#f72d40';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(w/2,h-48);ctx.lineTo(w/2,h-23);ctx.stroke();
  this.feedback=this.feedback.filter(f=>now-f.at<600);
 }
 hit(f){this.feedback.push({...f,at:performance.now()});}
}


