import {GameState} from './GameState.js';
import {NoteManager} from './NoteManager.js';
export function grade(error,release=false){const ms=Math.abs(error)*1000;return ms<=(release?50:35)+0.00001?'PERFECT':ms<=(release?90:70)+0.00001?'GREAT':ms<=(release?140:110)+0.00001?'GOOD':'MISS';}
export class JudgeManager{
 constructor(notes,onJudge=()=>{}){this.manager=new NoteManager(notes);this.stats=new GameState(notes);this.onJudge=onJudge;}
 get notes(){return this.manager.notes;}
 emit(n,g,time,label=g,error=null){if(n.state==='done'){n.finishedAt=time;n.finalGrade=g;}this.stats.record(g);this.onJudge({lane:n.lane,direction:n.direction,grade:g,label,time,error});}
 wick(lane,direction,time){const n=this.manager.nearest(lane,'wick',direction,time);if(!n)return false;n.state='done';this.emit(n,grade(time-n.time),time,undefined,time-n.time);return true;}
 press(lane,time){const n=this.manager.nearest(lane,'hold',null,time);if(!n)return false;const g=grade(time-n.time);this.emit(n,g,time,g==='MISS'?'HOLD BREAK':g,time-n.time);if(g==='MISS'){n.state='done';this.emit(n,'MISS',time,'HOLD BREAK');this.emit(n,'MISS',time,'HOLD BREAK');}else{n.state='holding';n.startGrade=g;}return true;}
 release(lane,time){const n=this.notes.find(n=>n.state==='holding'&&n.lane===lane);if(!n)return false;const g=grade(time-(n.time+n.duration),true);n.state='done';this.emit(n,g==='MISS'?'MISS':'PERFECT',time,g==='MISS'?'HOLD BREAK':'HOLD');this.emit(n,g,time,g==='MISS'?'HOLD BREAK':`${g} RELEASE`,time-(n.time+n.duration));return true;}
 update(time){for(const n of this.notes){if(n.state==='pending'&&time-n.time>0.160001){n.state='done';for(let i=0;i<(n.type==='hold'?3:1);i++)this.emit(n,'MISS',time);}else if(n.state==='holding'&&time>n.time+n.duration+0.160001){n.state='done';this.emit(n,'PERFECT',time,'HOLD');this.emit(n,'MISS',time,'RELEASE MISS');}}}
}

