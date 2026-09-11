import {DEFAULT_BINDINGS,eventCode,resolveGameKey} from './KeyBindings.js';
export class ComboInput{
 constructor(judge,clock){this.judge=judge;this.clock=clock;this.held=new Set();this.recent=new Map();this.used=new Set();this.serial=0;}
 down(key){if(this.held.has(key))return;const time=this.clock();this.held.add(key);const event={time,id:++this.serial};this.recent.set(key,event);
  if(/^[1-4]$/.test(key))this.judge.press(Number(key),time);
  for(const side of ['s','b'])for(const lane of ['1','2','3','4']){
   if(key!==side&&key!==lane||!this.held.has(side)||!this.held.has(lane))continue;const a=this.recent.get(lane),b=this.recent.get(side);if(!a||!b)continue;
   const pair=`${a.id}:${b.id}`;if(this.used.has(pair))continue;this.used.add(pair);this.judge.wick(Number(lane),side==='s'?'up':'down',Math.max(a.time,b.time));
  }
 }
 up(key){if(!this.held.delete(key))return;if(/^[1-4]$/.test(key))this.judge.release(Number(key),this.clock());}
 clear(){this.held.clear();this.recent.clear();this.used.clear();}
}
export class InputManager{
 constructor({onDown,onUp,onPause,getBindings=()=>DEFAULT_BINDINGS,isActive=()=>true,canPause=()=>true}){
  this.held=new Set();this.pressed=new Map();this.onDown=onDown;this.onUp=onUp;
  this.keydown=e=>{
   if(e.defaultPrevented||e.target?.matches?.('input,select,textarea,[contenteditable="true"]')||e.ctrlKey||e.altKey||e.metaKey)return;
   const code=eventCode(e);
   if(code==='Escape'||code==='Space'){if(canPause()){e.preventDefault();if(!e.repeat)onPause();}return;}
   if(!isActive())return;
   const key=resolveGameKey(code,getBindings());if(!key)return;e.preventDefault();
   if(e.repeat||this.pressed.has(code))return;
   this.pressed.set(code,key);if(this.held.has(key))return;
   this.held.add(key);onDown(key);
  };
  this.keyup=e=>{
   const code=eventCode(e),key=this.pressed.get(code);if(!key)return;
   this.pressed.delete(code);if([...this.pressed.values()].includes(key))return;
   this.held.delete(key);onUp(key);
  };
  window.addEventListener('keydown',this.keydown);window.addEventListener('keyup',this.keyup);
 }
 clear(){this.held.clear();this.pressed.clear();}
 destroy(){window.removeEventListener('keydown',this.keydown);window.removeEventListener('keyup',this.keyup);this.clear();}
}

