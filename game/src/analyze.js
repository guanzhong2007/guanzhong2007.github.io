import {ODF,combTempo,peakPick,spectralFlux} from '@audio/beat';
import {alignBeatPhase,buildBeatGrid,estimateOnsetTempo,generateDraft} from './ChartDraftGenerator.js';
import {validateChart} from './ChartManager.js';
import {bakeChartOffset,createSong,getSong,putSong} from './SongLibrary.js';

const $=id=>document.getElementById(id);
const ui={
 file:$('audio-file'),analyze:$('analyze'),status:$('analysis-status'),summary:$('file-summary'),workspace:$('workspace'),audio:$('audio'),
 duration:$('metric-duration'),bpmMetric:$('metric-bpm'),firstMetric:$('metric-first'),onsetsMetric:$('metric-onsets'),notesMetric:$('metric-notes'),
 canvas:$('timeline'),candidates:$('tempo-candidates'),title:$('title'),artist:$('artist'),bpm:$('bpm'),first:$('first-beat'),subdivision:$('subdivision'),
 density:$('density'),densityOutput:$('density-output'),chord:$('chord'),chordOutput:$('chord-output'),hold:$('hold'),holdOutput:$('hold-output'),
 regenerate:$('regenerate'),downloadChart:$('download-chart'),downloadAnalysis:$('download-analysis'),rows:$('note-rows'),addNote:$('add-note'),toast:$('toast'),
 preview:$('game-preview'),previewTime:$('preview-time'),previewPlay:$('preview-play'),previewRestart:$('preview-restart'),previewOffset:$('preview-offset'),
 autoAlign:$('auto-align'),tapCalibrate:$('tap-calibrate'),tapStatus:$('tap-status'),saveProject:$('save-project'),saveLibrary:$('save-library'),restoreProject:$('restore-project'),saveStatus:$('save-status')
};

let context,decoded,objectUrl,analysis,chart,currentFile,librarySongId=sessionStorage.getItem('kline.analyze.songId')||'',parametersDirty=false,previewOffsetMs=0,calibrating=false,tapOffsets=[];
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const round=value=>Math.round(value*1000)/1000;
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const DB_NAME='k-line-rhythm-chart-lab',DB_VERSION=1,PROJECT_ID='last-project';

function openProjectDb(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,DB_VERSION);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('projects'))request.result.createObjectStore('projects',{keyPath:'id'});};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
}

async function projectStore(mode,operation){
 const db=await openProjectDb();
 try{return await new Promise((resolve,reject)=>{const transaction=db.transaction('projects',mode),request=operation(transaction.objectStore('projects'));request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
 finally{db.close();}
}

const getSavedProject=()=>projectStore('readonly',store=>store.get(PROJECT_ID));
const putSavedProject=projectStoreValue=>projectStore('readwrite',store=>store.put(projectStoreValue));

function formatTime(seconds){
 const value=Math.max(0,Number(seconds)||0),minutes=Math.floor(value/60),rest=Math.floor(value%60);
 return `${String(minutes).padStart(2,'0')}:${String(rest).padStart(2,'0')}`;
}

function toast(message){
 ui.toast.textContent=message;ui.toast.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>ui.toast.hidden=true,2600);
}

function setStatus(message,error=false){ui.status.textContent=message;ui.status.classList.toggle('error',error);}

function filenameTitle(name){return name.replace(/\.[^.]+$/,'').replace(/\s*\[[^\]]+\]\s*$/,'').replace(/^[“”"]|[“”"]$/g,'').trim()||'本地分析草稿';}

async function renderMono(buffer,targetRate=22050){
 const rate=Math.min(targetRate,buffer.sampleRate);
 const offline=new OfflineAudioContext(1,Math.ceil(buffer.duration*rate),rate);
 const source=offline.createBufferSource();source.buffer=buffer;source.connect(offline.destination);source.start();
 const rendered=await offline.startRendering();
 return {samples:new Float32Array(rendered.getChannelData(0)),sampleRate:rendered.sampleRate};
}

async function renderRhythmFocus(buffer,targetRate=22050){
 const rate=Math.min(targetRate,buffer.sampleRate),offline=new OfflineAudioContext(1,Math.ceil(buffer.duration*rate),rate);
 const addBand=(type,frequency,gainValue)=>{
  const source=offline.createBufferSource(),filter=offline.createBiquadFilter(),gain=offline.createGain();
  source.buffer=buffer;filter.type=type;filter.frequency.value=frequency;filter.Q.value=.7;gain.gain.value=gainValue;
  source.connect(filter).connect(gain).connect(offline.destination);source.start();
 };
 addBand('lowpass',260,1);addBand('highpass',2200,.72);
 const rendered=await offline.startRendering();
 return {samples:new Float32Array(rendered.getChannelData(0)),sampleRate:rendered.sampleRate};
}

function energyEnvelope(samples,frameSize=2048,hopSize=512){
 const length=Math.max(1,Math.floor((samples.length-frameSize)/hopSize)+1),values=new Float32Array(length);
 let peak=0;
 for(let frame=0;frame<length;frame++){
  const start=frame*hopSize,end=Math.min(samples.length,start+frameSize);let sum=0;
  for(let i=start;i<end;i++)sum+=samples[i]*samples[i];
  values[frame]=Math.sqrt(sum/Math.max(1,end-start));peak=Math.max(peak,values[frame]);
 }
 if(peak)for(let i=0;i<values.length;i++)values[i]/=peak;
 return values;
}

function waveformSummary(samples,bins=1200){
 const values=new Float32Array(bins),step=samples.length/bins;
 for(let bin=0;bin<bins;bin++){
  const start=Math.floor(bin*step),end=Math.max(start+1,Math.floor((bin+1)*step));let peak=0;
  for(let i=start;i<end&&i<samples.length;i++)peak=Math.max(peak,Math.abs(samples[i]));
  values[bin]=peak;
 }
 return values;
}

function percentile(values,ratio){
 const sorted=Array.from(values).filter(value=>Number.isFinite(value)&&value>0).sort((a,b)=>a-b);
 return sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*ratio))]:1;
}

function describeEvents(onsets,flux,energy){
 const reference=percentile(flux.odf,.96)||1,events=[];
 for(const rawTime of onsets){
  const time=Number(rawTime),index=clamp(Math.round(time*flux.fs/flux.hopSize),0,flux.odf.length-1);
  const radius=Math.max(12,Math.round(8*flux.fs/flux.hopSize));let localPeak=0;
  for(let i=Math.max(0,index-radius);i<=Math.min(flux.odf.length-1,index+radius);i++)localPeak=Math.max(localPeak,flux.odf[i]);
  const globalStrength=clamp(flux.odf[index]/reference,0,1),localStrength=clamp(flux.odf[index]/Math.max(.000001,localPeak),0,1);
  const strength=clamp(globalStrength*.42+localStrength*.58,0,1);
  let future=0,count=0;
  for(let i=index+4;i<=Math.min(energy.length-1,index+20);i++){future+=energy[i];count++;}
  const sustain=clamp((future/Math.max(1,count))/Math.max(.08,energy[index]||.08),0,1);
  const before=energy[Math.max(0,index-6)]||0,after=energy[Math.min(energy.length-1,index+6)]||0;
  events.push({time:round(time),strength:round(strength),sustain:round(sustain),slope:round(clamp((after-before)*2,-1,1))});
 }
 return events;
}

function tempoChoices(result,intervalTempo){
 const base=result.candidates?.length?result.candidates:[{bpm:result.bpm,confidence:result.confidence}],choices=[];
 if(intervalTempo.bpm){
  const closest=base.reduce((best,item)=>Math.abs(item.bpm-intervalTempo.bpm)<Math.abs(best.bpm-intervalTempo.bpm)?item:best,base[0]);
  const compatible=Math.abs(closest.bpm-intervalTempo.bpm)/intervalTempo.bpm<=.06;
  const bpm=compatible?round((intervalTempo.bpm*2+closest.bpm)/3):intervalTempo.bpm;
  choices.push({bpm,confidence:intervalTempo.confidence,kind:compatible?'推荐 · 双方法接近':'推荐 · 起音间隔'});
 }
 for(const item of base){
  if(item.bpm>=30&&item.bpm<=300&&!choices.some(choice=>Math.abs(choice.bpm-item.bpm)<.5))choices.push({bpm:round(item.bpm),confidence:round(item.confidence),kind:'检测'});
 }
 for(const [factor,kind] of [[.5,'半速'],[2,'双速']]){
  const bpm=result.bpm*factor;
  if(bpm>=30&&bpm<=300&&!choices.some(choice=>Math.abs(choice.bpm-bpm)<.5))choices.push({bpm:round(bpm),confidence:round(result.confidence*.92),kind});
 }
 return choices.slice(0,7);
}

function renderCandidates(){
 ui.candidates.replaceChildren();
 for(const candidate of analysis.candidates){
  const button=document.createElement('button');button.type='button';
  button.textContent=`${candidate.bpm} BPM · ${candidate.kind} · 相对 ${Math.round(candidate.confidence*100)}%`;
  button.classList.toggle('active',Math.abs(Number(ui.bpm.value)-candidate.bpm)<.05);
  button.onclick=()=>{ui.bpm.value=candidate.bpm;ui.first.value=alignBeatPhase(analysis.events,candidate.bpm);regenerate();};
  ui.candidates.append(button);
 }
}

function settingsFromControls(){
 return {
  title:ui.title.value,artist:ui.artist.value,duration:analysis.duration,bpm:Number(ui.bpm.value),firstBeat:Number(ui.first.value),events:analysis.events,
  density:Number(ui.density.value),subdivision:Number(ui.subdivision.value),chordPercent:Number(ui.chord.value),holdPercent:Number(ui.hold.value)
 };
}

function updateMetrics(){
 ui.duration.textContent=formatTime(analysis?.duration);ui.bpmMetric.textContent=chart?.bpm??'--';ui.firstMetric.textContent=chart?`${chart.generator.firstBeat.toFixed(3)}s`:'--';
 ui.onsetsMetric.textContent=analysis?.events.length??'--';
 ui.notesMetric.textContent=chart?`${chart.notes.length}（${chart.notes.filter(note=>note.type==='hold').length} 长按）`:'--';
}

function regenerate(showMessage=true){
 try{
  chart=generateDraft(settingsFromControls());validateChart(chart);parametersDirty=false;ui.downloadChart.disabled=false;ui.saveProject.disabled=false;ui.saveLibrary.disabled=false;ui.regenerate.textContent='按参数重生成';
  renderCandidates();renderRows();updateMetrics();drawTimeline();drawPreview();
  if(showMessage)toast(`已生成 ${chart.notes.length} 根 K 线草稿`);
 }catch(error){toast(error.message);}
}

function markParametersDirty(){
 parametersDirty=true;ui.downloadChart.disabled=true;ui.regenerate.textContent='应用参数并重生成';
 ui.densityOutput.value=ui.density.value;ui.chordOutput.value=`${ui.chord.value}%`;ui.holdOutput.value=`${ui.hold.value}%`;
}

function makeInput(type,value,field,options={}){
 const input=document.createElement('input');input.type=type;input.value=value;input.dataset.field=field;
 for(const [key,item] of Object.entries(options))input[key]=item;
 return input;
}

function makeSelect(value,field,items){
 const select=document.createElement('select');select.dataset.field=field;
 for(const [itemValue,label] of items){const option=document.createElement('option');option.value=itemValue;option.textContent=label;option.selected=itemValue===value;select.append(option);}
 return select;
}

function renderRows(){
 ui.rows.replaceChildren();
 chart.notes.forEach((note,index)=>{
  const row=document.createElement('tr');row.dataset.index=index;
  const number=document.createElement('td');number.textContent=String(index+1);
  const time=document.createElement('td');time.append(makeInput('number',note.time,'time',{step:.001,min:0}));
  const lane=document.createElement('td');lane.append(makeSelect(String(note.lane),'lane',[["1","1"],["2","2"],["3","3"],["4","4"]]));
  const direction=document.createElement('td');direction.append(makeSelect(note.direction,'direction',[["up","红涨 / S"],["down","绿跌 / B"]]));
  const type=document.createElement('td');type.append(makeSelect(note.type,'type',[["wick","短线"],["hold","长按"]]));
  const duration=document.createElement('td');duration.append(makeInput('number',note.duration||0,'duration',{step:.001,min:0,disabled:note.type!=='hold'}));
  const actions=document.createElement('td');actions.className='actions-cell';
  const locate=document.createElement('button');locate.type='button';locate.textContent='定位';locate.dataset.action='locate';
  const remove=document.createElement('button');remove.type='button';remove.textContent='删除';remove.className='delete';remove.dataset.action='delete';actions.append(locate,remove);
  row.append(number,time,lane,direction,type,duration,actions);ui.rows.append(row);
 });
}

function editRow(event){
 const target=event.target,row=target.closest('tr');if(!row)return;
 const index=Number(row.dataset.index),note=chart.notes[index],field=target.dataset.field;if(!field)return;
 if(field==='lane')note.lane=Number(target.value);
 else if(field==='time'||field==='duration')note[field]=round(Math.max(0,Number(target.value)||0));
 else note[field]=target.value;
 if(field==='type'){note.duration=note.type==='hold'?round(Math.max(.2,60/chart.bpm)):0;}
 chart.notes.sort((a,b)=>a.time-b.time||a.lane-b.lane);renderRows();updateMetrics();drawTimeline();
}

function rowAction(event){
 const button=event.target.closest('button'),row=button?.closest('tr');if(!button||!row)return;
 const index=Number(row.dataset.index),note=chart.notes[index];
 if(button.dataset.action==='locate'){ui.audio.currentTime=note.time;ui.audio.play().catch(()=>{});drawTimeline();}
 if(button.dataset.action==='delete'){chart.notes.splice(index,1);renderRows();updateMetrics();drawTimeline();}
}

function addNote(){
 if(!chart)return;const time=round(clamp(ui.audio.currentTime||0,0,Math.max(0,analysis.duration-2.05)));
 const lane=(chart.notes.length%4)+1,direction=chart.notes.length%2?'down':'up';
 chart.notes.push({id:`manual-${Date.now()}`,time,lane,direction,type:'wick',duration:0});chart.notes.sort((a,b)=>a.time-b.time||a.lane-b.lane);
 renderRows();updateMetrics();drawTimeline();toast(`已在 ${time.toFixed(3)} 秒添加音符`);
}

function downloadJson(data,name){
 const blob=new Blob([`${JSON.stringify(data,null,2)}\n`],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
 anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function safeStem(){return (currentFile?.name||ui.file.files[0]?.name||'local-song').replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|“”]/g,'_').slice(0,70);}

function projectControls(){return {title:ui.title.value,artist:ui.artist.value,bpm:ui.bpm.value,firstBeat:ui.first.value,subdivision:ui.subdivision.value,density:ui.density.value,chord:ui.chord.value,hold:ui.hold.value,previewOffsetMs};}

async function saveCurrentProject(){
 if(!analysis||!chart||!currentFile)return;
 try{
  const record={id:PROJECT_ID,savedAt:new Date().toISOString(),file:{name:currentFile.name,type:currentFile.type,lastModified:currentFile.lastModified,blob:currentFile},analysis,chart,controls:projectControls()};
  await putSavedProject(record);ui.restoreProject.disabled=false;ui.saveStatus.textContent=`已保存：${currentFile.name} · ${new Date(record.savedAt).toLocaleString()}`;toast('音频、分析数据和谱面工程已保存到当前浏览器');
 }catch(error){toast(`保存失败：${error.message}`);}
}

async function saveToLibrary(){
 if(!analysis||!chart||!currentFile)return;
 try{
  if(parametersDirty)throw Error('参数有变化，请先点击“应用参数并重生成”。');
  await saveCurrentProject();const checked=validateChart(bakeChartOffset(chart,previewOffsetMs)),existing=librarySongId?await getSong(librarySongId):null;
  const record=createSong({id:existing?.id,title:ui.title.value||checked.title,artist:ui.artist.value||checked.artist,audioBlob:currentFile,audioName:currentFile.name,audioType:currentFile.type,audioLastModified:currentFile.lastModified,chart:checked,createdAt:existing?.createdAt});
  await putSong(record);librarySongId=record.id;sessionStorage.setItem('kline.analyze.songId',record.id);ui.saveStatus.textContent=`已加入游戏曲库：${record.title} · ${record.chart.notes.length} 根 K 线`;toast('已保存到游戏曲库，返回游戏即可直接选择');
 }catch(error){toast(`曲库保存失败：${error.message}`);}
}

async function loadLibrarySong(){
 if(!librarySongId)return false;
 try{
  const song=await getSong(librarySongId);if(!song?.audioBlob){sessionStorage.removeItem('kline.analyze.songId');librarySongId='';return false;}
  currentFile=new File([song.audioBlob],song.audioName,{type:song.audioType,lastModified:song.audioLastModified});decoded=null;
  if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(currentFile);ui.audio.src=objectUrl;ui.audio.volume=.7;ui.title.value=song.title;ui.artist.value=song.artist||'';
  ui.summary.textContent=`${currentFile.name} · ${(currentFile.size/1024/1024).toFixed(2)} MB · 已从游戏曲库载入`;ui.analyze.disabled=false;setStatus('曲库音频已就绪，点击开始本地分析；完成后可直接保存回游戏曲库。');
  return true;
 }catch(error){setStatus(`曲库音频载入失败：${error.message}`,true);return false;}
}

async function restoreSavedProject(auto=false){
 try{
  const record=await getSavedProject();
  if(!record){ui.restoreProject.disabled=true;if(!auto)toast('还没有保存过本地工程');return false;}
  currentFile=new File([record.file.blob],record.file.name,{type:record.file.type,lastModified:record.file.lastModified});decoded=null;
  if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(currentFile);ui.audio.src=objectUrl;ui.audio.volume=.7;
  analysis=record.analysis;chart=record.chart;const controls=record.controls||{};
  ui.title.value=controls.title??chart.title;ui.artist.value=controls.artist??chart.artist;ui.bpm.value=controls.bpm??chart.bpm;ui.first.value=controls.firstBeat??chart.generator.firstBeat;
  ui.subdivision.value=controls.subdivision??chart.generator.subdivision;ui.density.value=controls.density??chart.generator.density;ui.chord.value=controls.chord??chart.generator.chordPercent;ui.hold.value=controls.hold??chart.generator.holdPercent;
  ui.densityOutput.value=ui.density.value;ui.chordOutput.value=`${ui.chord.value}%`;ui.holdOutput.value=`${ui.hold.value}%`;setPreviewOffset(controls.previewOffsetMs??0);
  ui.summary.textContent=`${currentFile.name} · ${formatTime(analysis.duration)} · ${(currentFile.size/1024/1024).toFixed(2)} MB · 已从本地工程恢复`;
  ui.workspace.hidden=false;ui.analyze.disabled=false;ui.saveProject.disabled=false;ui.saveLibrary.disabled=false;ui.restoreProject.disabled=false;parametersDirty=false;
  renderCandidates();renderRows();updateMetrics();drawTimeline();drawPreview();
  ui.saveStatus.textContent=`已恢复：${currentFile.name} · 保存于 ${new Date(record.savedAt).toLocaleString()}`;setStatus('已自动恢复上次保存的音频、分析数据和谱面。');
  if(!auto)toast('已恢复上次保存的本地工程');return true;
 }catch(error){ui.saveStatus.textContent=`恢复失败：${error.message}`;if(!auto)toast(`恢复失败：${error.message}`);return false;}
}

function downloadChart(){
 if(parametersDirty){toast('参数有变化，请先点击“应用参数并重生成”。');return;}
 try{
  const output=structuredClone(chart),shift=previewOffsetMs/1000;
  output.title=ui.title.value.slice(0,80)||'本地分析草稿';output.artist=ui.artist.value.slice(0,80);output.bpm=round(Number(ui.bpm.value));
  output.notes=output.notes.map(note=>({...note,time:round(note.time+shift)}));
  output.sections=output.sections.map((section,index)=>({...section,time:index===0?0:round(Math.max(0,section.time+shift))}));
  output.generator={...output.generator,previewOffsetMs};
  const checked=validateChart(output);if(checked.notes.at(-1).time+(checked.notes.at(-1).duration||0)>analysis.duration-1.8)throw Error('末尾音符离歌曲结束太近，请调整。');
  downloadJson(output,`${safeStem()}-kline-draft.json`);toast(`草稿已下载，整体延迟 ${previewOffsetMs}ms 已写入`);
 }catch(error){toast(`无法导出：${error.message}`);}
}

function downloadAnalysis(){
 if(!analysis)return;
 const output={
  version:1,engine:'@audio/beat 2.1.3',source:analysis.source,duration:analysis.duration,analysisSampleRate:analysis.sampleRate,
  mode:analysis.mode,candidates:analysis.candidates,libraryTempo:analysis.libraryTempo,intervalTempo:analysis.intervalTempo,selected:{bpm:Number(ui.bpm.value),firstBeat:Number(ui.first.value),previewOffsetMs},
  beats:buildBeatGrid(analysis.duration,Number(ui.bpm.value),Number(ui.first.value),1),onsets:analysis.events
 };
 downloadJson(output,`${safeStem()}-audio-analysis.json`);toast('分析数据已下载');
}

function drawTimeline(){
 if(!analysis||!chart||ui.workspace.hidden)return;
 const rect=ui.canvas.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1),width=Math.max(1,Math.round(rect.width*ratio)),height=Math.max(1,Math.round(rect.height*ratio));
 if(ui.canvas.width!==width||ui.canvas.height!==height){ui.canvas.width=width;ui.canvas.height=height;}
 const ctx=ui.canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);const w=rect.width,h=rect.height,pad=14,duration=analysis.duration;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#f6f9f6';ctx.fillRect(0,0,w,h);
 ctx.strokeStyle='#dfe7e1';ctx.lineWidth=1;
 for(let lane=1;lane<=4;lane++){const y=pad+(h-pad*2)*lane/5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
 const beats=buildBeatGrid(duration,Number(ui.bpm.value),Number(ui.first.value),1);ctx.strokeStyle='#cbd8d0';ctx.globalAlpha=.75;
 for(const time of beats){const x=time/duration*w;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
 ctx.globalAlpha=1;ctx.fillStyle='#91a29855';const center=h/2,scale=h*.24;
 for(let i=0;i<analysis.waveform.length;i++){const x=i/(analysis.waveform.length-1)*w,value=analysis.waveform[i]*scale;ctx.fillRect(x,center-value,Math.max(1,w/analysis.waveform.length+.4),value*2);}
 ctx.strokeStyle='#445f50';ctx.lineWidth=1;
 for(const event of analysis.events){const x=event.time/duration*w,length=5+event.strength*22;ctx.globalAlpha=.2+event.strength*.45;ctx.beginPath();ctx.moveTo(x,center-length);ctx.lineTo(x,center+length);ctx.stroke();}
 ctx.globalAlpha=1;
 for(const note of chart.notes){const x=note.time/duration*w,y=pad+(h-pad*2)*note.lane/5;ctx.fillStyle=note.direction==='up'?'#ef3345':'#00b965';const noteWidth=note.type==='hold'?Math.max(3,(note.duration/duration)*w):3;ctx.fillRect(x,y-5,noteWidth,10);}
 const playX=(ui.audio.currentTime||0)/duration*w;ctx.strokeStyle='#1b2d25';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(playX,0);ctx.lineTo(playX,h);ctx.stroke();
}

function setPreviewOffset(value,announce=false){
 previewOffsetMs=Math.round(clamp(Number(value)||0,-2000,2000));ui.previewOffset.value=previewOffsetMs;
 if(announce)toast(`谱面整体${previewOffsetMs<0?'提前':'延后'} ${Math.abs(previewOffsetMs)}ms`);
 drawPreview();
}

function drawDashedLine(ctx,x1,y,x2){ctx.setLineDash([8,7]);ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x2,y);ctx.stroke();ctx.setLineDash([]);}

function drawPreview(){
 if(!analysis||!chart||ui.workspace.hidden)return;
 const rect=ui.preview.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1),w=Math.max(1,rect.width),h=Math.max(1,rect.height);
 const pixelWidth=Math.round(w*ratio),pixelHeight=Math.round(h*ratio);if(ui.preview.width!==pixelWidth||ui.preview.height!==pixelHeight){ui.preview.width=pixelWidth;ui.preview.height=pixelHeight;}
 const ctx=ui.preview.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#f7faf8';ctx.fillRect(0,0,w,h);
 const top=62,bottom=h-62,center=h/2,laneWidth=w/4,now=ui.audio.currentTime||0,approach=2;
 for(let lane=0;lane<4;lane++){
  const x=lane*laneWidth;ctx.fillStyle=lane%2?'#f2f6f3':'#f8faf9';ctx.fillRect(x,0,laneWidth,h);ctx.strokeStyle='#dbe4de';ctx.strokeRect(x+.5,.5,laneWidth-1,h-1);
  ctx.fillStyle='#203b2e';ctx.font='700 14px Segoe UI';ctx.textAlign='center';ctx.fillText(String(lane+1),x+laneWidth/2,h-18);
 }
 ctx.strokeStyle='#253a31';ctx.lineWidth=1.4;drawDashedLine(ctx,12,top,w-12);drawDashedLine(ctx,12,bottom,w-12);
 ctx.fillStyle='#203b2e';ctx.font='700 15px Segoe UI';ctx.textAlign='right';ctx.fillText('S',w-14,top-9);ctx.fillText('B',w-14,bottom+22);
 for(const note of chart.notes){
  const target=note.time+previewOffsetMs/1000,delta=target-now,endDelta=delta+(note.duration||0);
  if(endDelta<-.18||delta>approach)continue;
  const line=note.direction==='up'?top:bottom;
  const position=d=>line+(center-line)*clamp(d/approach,0,1);
  const head=position(delta),tail=position(endDelta),x=(note.lane-.5)*laneWidth,color=note.direction==='up'?'#ef3345':'#00b965';
  ctx.globalAlpha=delta<0?clamp(1+delta/.18,0,1):1;ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=10;
  if(note.type==='hold')ctx.fillRect(x-11,Math.min(head,tail),22,Math.max(8,Math.abs(tail-head)));
  ctx.fillRect(x-23,head-4,46,8);ctx.shadowBlur=0;ctx.globalAlpha=1;
 }
 ui.previewTime.textContent=`${formatTime(now)}.${String(Math.floor(now*1000)%1000).padStart(3,'0')} · Offset ${previewOffsetMs>=0?'+':''}${previewOffsetMs}ms`;
 ui.previewPlay.innerHTML=ui.audio.paused?'播放预览 <span>▶</span>':'暂停预览 <span>Ⅱ</span>';
}

function restartPreview(){
 const first=chart?.notes[0]?.time??0;ui.audio.currentTime=Math.max(0,first+previewOffsetMs/1000-2);ui.audio.play().catch(error=>toast(`无法播放：${error.message}`));drawPreview();
}

function startTapCalibration(){
 if(!analysis||!chart)return;calibrating=true;tapOffsets=[];ui.tapCalibrate.classList.add('calibrating');ui.tapCalibrate.textContent='请跟着鼓点按空格 0 / 4';ui.tapStatus.textContent='请选择清楚、稳定的鼓点连续敲 4 次。';
 if(ui.audio.paused)ui.audio.play().catch(()=>{});
}

function recordCalibrationTap(){
 if(!calibrating)return;
 const now=ui.audio.currentTime,bpm=Number(ui.bpm.value),first=Number(ui.first.value),beat=60/bpm;
 const nearest=first+Math.round((now-first)/beat)*beat;tapOffsets.push((now-nearest)*1000);
 ui.tapCalibrate.textContent=`请跟着鼓点按空格 ${tapOffsets.length} / 4`;
 if(tapOffsets.length<4)return;
 const sorted=[...tapOffsets].sort((a,b)=>a-b),middle=(sorted[1]+sorted[2])/2;
 setPreviewOffset(middle,true);calibrating=false;ui.tapCalibrate.classList.remove('calibrating');ui.tapCalibrate.textContent='跟着鼓点敲 4 次自动校准';
 ui.tapStatus.textContent=`已根据 4 次敲击应用 ${previewOffsetMs>=0?'+':''}${previewOffsetMs}ms；请继续试听确认。`;
}

async function analyzeFile(){
 const file=currentFile||ui.file.files[0];if(!file)return;
 ui.analyze.disabled=true;setStatus('正在把音频转换成分析用的单声道数据…');await nextFrame();
 try{
  if(!decoded){context??=new AudioContext();decoded=await context.decodeAudioData(await file.arrayBuffer());}
  const [mono,rhythm]=await Promise.all([renderMono(decoded),renderRhythmFocus(decoded)]);setStatus('正在突出鼓点和打击乐并检测 BPM，页面可能短暂停顿…');await nextFrame();
  const options={fs:mono.sampleRate,frameSize:2048,hopSize:512,minBpm:60,maxBpm:200};
  const flux=spectralFlux(rhythm.samples,options),onsets=peakPick(flux.odf,{hopSize:flux.hopSize,fs:flux.fs,delta:1.18,windowSize:8});
  const tempo=combTempo(rhythm.samples,{...options,candidates:5,[ODF]:flux}),energy=energyEnvelope(mono.samples,2048,512);
  if(!tempo.bpm||!onsets.length)throw Error('没有检测到稳定节拍，请换成 WAV/OGG 或降低起音阈值。');
  const events=describeEvents(onsets,flux,energy),intervalTempo=estimateOnsetTempo(events),candidates=tempoChoices(tempo,intervalTempo);
  analysis={
   source:{name:file.name,size:file.size,type:file.type||'audio/mp4',originalSampleRate:decoded.sampleRate},duration:round(decoded.duration),sampleRate:mono.sampleRate,
   mode:'rhythm-focus',candidates,libraryTempo:{bpm:tempo.bpm,confidence:round(tempo.confidence)},intervalTempo,events,waveform:waveformSummary(mono.samples)
  };
  if(!librarySongId){ui.title.value=filenameTitle(file.name);ui.artist.value='';}ui.bpm.value=candidates[0].bpm;ui.first.value=alignBeatPhase(events,candidates[0].bpm);setPreviewOffset(0);
  const disagreement=intervalTempo.bpm&&Math.abs(tempo.bpm-intervalTempo.bpm)/intervalTempo.bpm>.06;
  ui.workspace.hidden=false;regenerate(false);setStatus(`分析完成：${events.length} 个起音，已生成可编辑草稿。${disagreement?' 两种 BPM 估计差异较大，请试听后确认候选值。':''}`);await nextFrame();drawTimeline();
 }catch(error){setStatus(`分析失败：${error.message}`,true);console.error(error);}
 finally{ui.analyze.disabled=false;}
}

ui.file.onchange=async()=>{
 const file=ui.file.files[0];if(!file)return;
 if(librarySongId){librarySongId='';sessionStorage.removeItem('kline.analyze.songId');}
 currentFile=file;
 ui.analyze.disabled=true;setStatus('正在读取并解码本地音频…');
 try{
  context??=new AudioContext();await context.resume();decoded=await context.decodeAudioData(await file.arrayBuffer());
  if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(file);ui.audio.src=objectUrl;ui.audio.volume=.7;
  ui.summary.textContent=`${file.name} · ${formatTime(decoded.duration)} · ${(file.size/1024/1024).toFixed(2)} MB · ${decoded.sampleRate} Hz`;
  ui.analyze.disabled=false;setStatus('音频已就绪，点击开始分析。');
 }catch(error){decoded=null;setStatus(`音频解码失败：${error.message}`,true);}
};

for(const control of [ui.bpm,ui.first,ui.subdivision,ui.density,ui.chord,ui.hold])control.addEventListener('input',markParametersDirty);
ui.regenerate.onclick=()=>regenerate();ui.analyze.onclick=analyzeFile;ui.downloadChart.onclick=downloadChart;ui.downloadAnalysis.onclick=downloadAnalysis;ui.addNote.onclick=addNote;
ui.saveProject.onclick=saveCurrentProject;ui.saveLibrary.onclick=saveToLibrary;ui.restoreProject.onclick=()=>restoreSavedProject(false);
ui.previewPlay.onclick=()=>{if(ui.audio.paused)ui.audio.play().catch(error=>toast(`无法播放：${error.message}`));else ui.audio.pause();drawPreview();};
ui.previewRestart.onclick=restartPreview;ui.previewOffset.oninput=()=>setPreviewOffset(ui.previewOffset.value);
document.querySelectorAll('[data-nudge]').forEach(button=>button.onclick=()=>setPreviewOffset(previewOffsetMs+Number(button.dataset.nudge),true));
ui.autoAlign.onclick=()=>{if(!analysis)return;ui.first.value=alignBeatPhase(analysis.events,Number(ui.bpm.value));setPreviewOffset(0);regenerate();toast('已按检测到的音乐起音重新对齐');};
ui.tapCalibrate.onclick=startTapCalibration;
window.addEventListener('keydown',event=>{if(calibrating&&event.code==='Space'){event.preventDefault();recordCalibrationTap();}});
ui.rows.addEventListener('change',editRow);ui.rows.addEventListener('click',rowAction);
ui.title.addEventListener('input',()=>{if(chart)chart.title=ui.title.value;});ui.artist.addEventListener('input',()=>{if(chart)chart.artist=ui.artist.value;});
ui.canvas.addEventListener('click',event=>{if(!analysis)return;const rect=ui.canvas.getBoundingClientRect();ui.audio.currentTime=clamp((event.clientX-rect.left)/rect.width*analysis.duration,0,analysis.duration);drawTimeline();drawPreview();});
new ResizeObserver(drawTimeline).observe(ui.canvas);new ResizeObserver(drawPreview).observe(ui.preview);ui.audio.addEventListener('timeupdate',()=>{drawTimeline();drawPreview();});ui.audio.addEventListener('seeked',()=>{drawTimeline();drawPreview();});
function animation(){if(!ui.audio.paused){drawTimeline();drawPreview();}requestAnimationFrame(animation);}requestAnimationFrame(animation);
if(!await loadLibrarySong())await restoreSavedProject(true);
