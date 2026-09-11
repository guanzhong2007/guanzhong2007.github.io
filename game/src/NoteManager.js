export function noteProgress(time,hitTime,approach){return (time-(hitTime-approach))/approach;}
export class NoteManager{
 constructor(notes){this.notes=notes.map(n=>({...n,state:'pending',startGrade:null}));}
 nearest(lane,type,direction,time){return this.notes.filter(n=>n.state==='pending'&&n.lane===lane&&n.type===type&&(!direction||n.direction===direction)&&Math.abs(n.time-time)<=0.160001).sort((a,b)=>Math.abs(a.time-time)-Math.abs(b.time-time))[0];}
}
