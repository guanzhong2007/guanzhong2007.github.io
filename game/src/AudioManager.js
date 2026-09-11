export class AudioManager {
 constructor(){this.context=null;this.buffer=null;this.source=null;this.position=0;this.running=false;}
 ensureContext(){if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.master.connect(this.context.destination);}}
 async init(){this.ensureContext();await this.context.resume();}
 setVolume(value){if(this.master)this.master.gain.setValueAtTime(value,this.context.currentTime);}
 async decode(bytes){this.ensureContext();return this.context.decodeAudioData(bytes);}
 async synthesize(chart){
  const rate=22050,ctx=new OfflineAudioContext(2,Math.ceil((chart.duration+1)*rate),rate);
  const master=ctx.createGain();master.gain.value=0.55;master.connect(ctx.destination);
  function tone(t,f,d,type='sine',vol=0.2){const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+0.006);g.gain.exponentialRampToValueAtTime(0.0001,t+d);o.connect(g);g.connect(master);o.start(t);o.stop(t+d+0.01);}
  function kick(t){const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.setValueAtTime(140,t);o.frequency.exponentialRampToValueAtTime(38,t+0.14);g.gain.setValueAtTime(0.5,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.18);o.connect(g);g.connect(master);o.start(t);o.stop(t+0.2);}
  const beat=60/chart.bpm;
  for(let t=0,i=0;t<chart.duration;t+=beat,i++){
   kick(t);tone(t+beat/2,6000,0.035,'square',0.015);
   const roots=[130.81,103.83,116.54,98];tone(t,roots[Math.floor(i/8)%4],beat*0.8,'triangle',0.13);
   if(i%2)tone(t,180,0.07,'triangle',0.17);
  }
  for(const n of chart.notes){const f=[523.25,659.25,783.99,1046.5][n.lane-1]*(n.direction==='down'?0.5:1);tone(n.time,f,n.type==='hold'?n.duration:0.15,n.type==='hold'?'triangle':'sine',n.type==='hold'?0.32:0.4);if(n.type==='hold')tone(n.time+n.duration,f*2,0.12,'sine',0.18);}
  return ctx.startRendering();
 }
 play(buffer,position=0,lead=3,musicOffset=0){
  this.stop();this.buffer=buffer;this.position=position;this.musicOffset=musicOffset/1000;
  this.anchor=this.context.currentTime+lead-position;this.running=true;
  this.source=this.context.createBufferSource();this.source.buffer=buffer;this.source.connect(this.master);
  const desired=this.anchor+this.musicOffset;
  const when=Math.max(this.context.currentTime+lead,desired);
  const offset=Math.max(0,when-desired);
  if(offset<buffer.duration)this.source.start(when,offset);
 }
 get time(){return this.running?this.context.currentTime-this.anchor:this.position;}
 pause(){this.position=this.time;this.stop();return this.position;}
 stop(){if(this.running)this.position=this.time;if(this.source){try{this.source.stop();}catch{}this.source.disconnect();this.source=null;}this.running=false;}
 click(when){const o=this.context.createOscillator(),g=this.context.createGain();o.frequency.value=1100;g.gain.setValueAtTime(0.35,when);g.gain.exponentialRampToValueAtTime(0.0001,when+0.06);o.connect(g);g.connect(this.master);o.start(when);o.stop(when+0.07);return o;}
}


