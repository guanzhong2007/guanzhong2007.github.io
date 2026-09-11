const lanePatterns = [
 [1,2,3,4,2,3,1,4],
 [4,3,2,1,3,2,4,1],
 [1,3,2,4,3,1,4,2],
 [2,4,1,3,4,2,3,1]
];

const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const round=value=>Math.round(value*1000)/1000;

export function alignBeatPhase(events,bpm){
 const beat=60/bpm;
 if(!Number.isFinite(beat)||beat<=0||!events.length)return 0;
 let bestPhase=0,bestScore=-Infinity;
 for(let i=0;i<80;i++){
  const phase=i/80*beat;
  let score=0;
  for(const event of events){
   let distance=Math.abs(((event.time-phase+beat/2)%beat+beat)%beat-beat/2);
   score+=(event.strength||0.5)*Math.exp(-0.5*(distance/0.055)**2);
  }
  if(score>bestScore){bestScore=score;bestPhase=phase;}
 }
 return round(bestPhase);
}

export function estimateOnsetTempo(events,minBpm=70,maxBpm=190){
 const values=[];
 for(let index=1;index<events.length;index++){
  const gap=Number(events[index].time)-Number(events[index-1].time);
  if(!Number.isFinite(gap)||gap<0.16||gap>2)continue;
  let bpm=60/gap;
  while(bpm<minBpm)bpm*=2;
  while(bpm>maxBpm)bpm/=2;
  if(bpm>=minBpm&&bpm<=maxBpm)values.push({bpm,weight:.25+(Number(events[index].strength)||.5)});
 }
 if(values.length<4)return {bpm:0,confidence:0};
 const scores=new Float64Array(Math.ceil(maxBpm)+1);
 for(const value of values){
  for(let bin=Math.max(Math.floor(minBpm),Math.round(value.bpm)-4);bin<=Math.min(Math.floor(maxBpm),Math.round(value.bpm)+4);bin++)scores[bin]+=value.weight*Math.exp(-.5*((bin-value.bpm)/2.2)**2);
 }
 let peak=Math.floor(minBpm);
 for(let bin=peak+1;bin<scores.length;bin++)if(scores[bin]>scores[peak])peak=bin;
 let weighted=0,total=0,near=0,all=0;
 for(const value of values){
  all+=value.weight;
  if(Math.abs(value.bpm-peak)<=8){weighted+=value.bpm*value.weight;total+=value.weight;near+=value.weight;}
 }
 return {bpm:round(total?weighted/total:peak),confidence:round(all?near/all:0)};
}

export function buildBeatGrid(duration,bpm,firstBeat=0,subdivision=2){
 const step=60/bpm/subdivision;
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(step)||step<=0)return [];
 const start=Math.max(0,Number(firstBeat)||0),grid=[];
 for(let time=start;time<=duration+1e-6;time+=step)grid.push(round(time));
 return grid;
}

function sectionList(duration,bpm,firstBeat){
 const measure=60/bpm*4;
 const entries=[[0,'INTRO'],[0.24,'SECTION A'],[0.48,'SECTION B'],[0.7,'CLIMAX'],[0.88,'OUTRO']];
 const seen=new Set();
 return entries.map(([ratio,label])=>{
  if(ratio===0)return {time:0,label};
  const measureIndex=Math.max(0,Math.round((duration*ratio-firstBeat)/measure));
  return {time:round(firstBeat+measureIndex*measure),label};
 }).filter(section=>section.time<duration-1&&section.time>=0&&!seen.has(section.time)&&seen.add(section.time));
}

function selectLane(preferred,lastEnd,time){
 const order=[preferred,1,2,3,4].filter((lane,index,list)=>list.indexOf(lane)===index);
 return order.find(lane=>time-lastEnd[lane]>=0.12)||0;
}

export function generateDraft({
 title='本地分析草稿',artist='',duration,bpm,firstBeat=0,events=[],density=55,
 subdivision=2,chordPercent=6,holdPercent=15
}){
 const safeDuration=Number(duration),safeBpm=Number(bpm),safeFirst=Math.max(0,Number(firstBeat)||0);
 if(!Number.isFinite(safeDuration)||safeDuration<3)throw Error('音频时长不足，无法生成谱面。');
 if(!Number.isFinite(safeBpm)||safeBpm<30||safeBpm>300)throw Error('BPM 应为 30～300。');
 const safeSubdivision=[1,2,4].includes(Number(subdivision))?Number(subdivision):2;
 const step=60/safeBpm/safeSubdivision,tail=safeDuration-2.05;
 const buckets=new Map();
 for(const raw of events){
  const time=Number(raw.time),index=Math.round((time-safeFirst)/step),snapped=safeFirst+index*step;
  if(!Number.isFinite(time)||index<0||snapped<0||snapped>tail||Math.abs(time-snapped)>Math.min(0.16,step*0.48))continue;
  const event={time:round(snapped),strength:clamp(Number(raw.strength)||0,0,1),sustain:clamp(Number(raw.sustain)||0,0,1),slope:clamp(Number(raw.slope)||0,-1,1)};
  const key=event.time.toFixed(3),previous=buckets.get(key);
  if(!previous||event.strength>previous.strength)buckets.set(key,event);
 }
 const perMinute=25+clamp(Number(density)||55,10,100)*1.15;
 const target=Math.max(12,Math.round(safeDuration/60*perMinute));
 const pool=[...buckets.values()],selectedKeys=new Set(),selected=[];
 const windowSeconds=8,windowCount=Math.ceil(safeDuration/windowSeconds);
 for(let windowIndex=0;windowIndex<windowCount;windowIndex++){
  const start=windowIndex*windowSeconds,end=Math.min(safeDuration,start+windowSeconds);
  const quota=Math.max(1,Math.round(target*(end-start)/safeDuration));
  const local=pool.filter(event=>event.time>=start&&event.time<end).sort((a,b)=>b.strength-a.strength||a.time-b.time).slice(0,quota);
  for(const event of local){const key=event.time.toFixed(3);if(!selectedKeys.has(key)){selectedKeys.add(key);selected.push(event);}}
 }
 if(selected.length<target){
  const remainder=pool.filter(event=>!selectedKeys.has(event.time.toFixed(3))).sort((a,b)=>b.strength-a.strength||a.time-b.time).slice(0,target-selected.length);
  selected.push(...remainder);
 }
 selected.sort((a,b)=>a.time-b.time);
 const requestedHoldRatio=clamp(Number(holdPercent)||0,0,40)/100;
 const desiredHolds=Math.round(selected.length*requestedHoldRatio);
 const holdCandidates=selected.map((event,index)=>({
  index,event,score:event.sustain*.72+event.strength*.28
 })).filter(item=>item.event.sustain>=.48&&item.event.time<tail-step*3)
  .sort((a,b)=>b.score-a.score||a.event.time-b.event.time);
 const holdIndexes=new Set();
 for(const candidate of holdCandidates){
  if(holdIndexes.size>=desiredHolds)break;
  const tooClose=[...holdIndexes].some(index=>Math.abs(selected[index].time-candidate.event.time)<step*2);
  if(!tooClose)holdIndexes.add(candidate.index);
 }
 const lastEnd=[0,-Infinity,-Infinity,-Infinity,-Infinity],notes=[];
 for(let index=0;index<selected.length;index++){
  const event=selected[index],beat=60/safeBpm;
  const phrase=Math.max(0,Math.floor((event.time-safeFirst)/(beat*8)))%lanePatterns.length;
  const pattern=lanePatterns[phrase],preferred=pattern[index%pattern.length];
  const lane=selectLane(preferred,lastEnd,event.time);
  if(!lane)continue;
  const quietSlope=Math.abs(event.slope)<0.035;
  const direction=quietSlope?(Math.floor((event.time-safeFirst)/beat)%2?'down':'up'):(event.slope>0?'up':'down');
  const makeHold=holdIndexes.has(index);
  const holdBeats=event.sustain>=.9?4:event.sustain>=.76?3:event.sustain>=.6?2:1.5;
  const available=Math.max(0,tail-event.time);
  const holdDuration=makeHold?round(Math.min(available,Math.max(step*3,Math.round(holdBeats*beat/step)*step))):0;
  const type=holdDuration>=0.2?'hold':'wick',groupId=`draft-${String(index+1).padStart(4,'0')}`;
  notes.push({id:groupId,time:event.time,lane,direction,type,duration:type==='hold'?holdDuration:0});
  lastEnd[lane]=event.time+(type==='hold'?holdDuration:0);
  const makeChord=type==='wick'&&event.strength>=0.82&&((index*29+7)%100)<clamp(Number(chordPercent)||0,0,25);
  if(makeChord){
   const opposite=selectLane(5-lane,lastEnd,event.time);
   if(opposite&&opposite!==lane){
    notes.push({id:`${groupId}-b`,groupId,time:event.time,lane:opposite,direction,type:'wick',duration:0});
    lastEnd[opposite]=event.time;
   }
  }
 }
 notes.sort((a,b)=>a.time-b.time||a.lane-b.lane);
 return {
  version:1,title:String(title||'本地分析草稿').slice(0,80),artist:String(artist||'').slice(0,80),
  bpm:round(safeBpm),duration:round(safeDuration),sections:sectionList(safeDuration,safeBpm,safeFirst),notes,
  generator:{name:'@audio/beat local draft',firstBeat:round(safeFirst),density:clamp(Number(density)||55,10,100),subdivision:safeSubdivision,chordPercent:clamp(Number(chordPercent)||0,0,25),holdPercent:clamp(Number(holdPercent)||0,0,40)}
 };
}
