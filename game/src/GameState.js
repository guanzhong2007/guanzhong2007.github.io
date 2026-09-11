export class GameState{
 constructor(notes){this.combo=0;this.maxCombo=0;this.earned=0;this.judged=0;this.counts={PERFECT:0,GREAT:0,GOOD:0,MISS:0};this.total=notes.reduce((s,n)=>s+(n.type==='hold'?3:1),0);}
 record(grade){const weight={PERFECT:1,GREAT:0.8,GOOD:0.5,MISS:0}[grade];this.earned+=weight;this.judged++;this.counts[grade]++;this.combo=grade==='MISS'?0:this.combo+1;this.maxCombo=Math.max(this.combo,this.maxCombo);}
 get score(){return Math.round(this.earned/this.total*1000000);}
 get accuracy(){return this.judged?100*this.earned/this.judged:100;}
}
