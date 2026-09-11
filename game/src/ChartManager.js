export function validateChart(data){
 if(!data||!Array.isArray(data.notes)||!data.notes.length||data.notes.length>10000)throw Error('谱面需要 1～10000 个音符。');
 if(!Number.isFinite(data.bpm)||data.bpm<30||data.bpm>300)throw Error('谱面 BPM 应为 30～300。');
 if(data.duration!==undefined&&(!Number.isFinite(data.duration)||data.duration<0||data.duration>3632))throw Error('谱面总时长必须是 0～3632 秒。');
 if(data.sections!==undefined&&(!Array.isArray(data.sections)||data.sections.some(s=>!s||!Number.isFinite(s.time)||s.time<0||typeof s.label!=='string')))throw Error('谱面段落格式不正确。');
 const ids=new Set();
 const notes=data.notes.map((n,i)=>{
  if(!Number.isFinite(n.time)||n.time<0||n.time>3600||!Number.isInteger(n.lane)||n.lane<1||n.lane>4||!['up','down'].includes(n.direction)||!['wick','hold'].includes(n.type))throw Error(`第 ${i+1} 个音符格式不正确。`);
  const duration=n.type==='hold'?n.duration:0;
  if(!Number.isFinite(duration)||duration<0||(n.type==='hold'&&(duration<0.2||duration>30)))throw Error(`第 ${i+1} 个音符时长不正确。`);
  const id=String(n.id??i);if(ids.has(id))throw Error('谱面音符 id 重复。');ids.add(id);
  return {...n,id,duration};
 }).sort((a,b)=>a.time-b.time);
 for(let lane=1;lane<=4;lane++){
  const track=notes.filter(n=>n.lane===lane);
  for(let i=1;i<track.length;i++)if(track[i].time-track[i-1].time<(track[i-1].duration||0)+0.12)throw Error(`轨道 ${lane} 存在重叠或过密音符。`);
 }
 const end=notes.reduce((v,n)=>Math.max(v,n.time+n.duration),0);
 return {...data,title:String(data.title||'本地谱面').slice(0,80),notes,duration:Math.max(Number(data.duration)||0,end+2)};
}
export class ChartManager{
 async load(url){const response=await fetch(url);if(!response.ok)throw Error('无法加载谱面');return validateChart(await response.json());}
 prepare(chart,settings,practice){
  const scale=practice?chart.bpm/settings.bpm:1;
  return {...chart,bpm:settings.bpm,duration:chart.duration*scale,notes:chart.notes.map(n=>({...n,time:n.time*scale,duration:n.duration*scale}))};
 }
}

