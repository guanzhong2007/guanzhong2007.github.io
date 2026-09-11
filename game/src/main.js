let builtinSong=null;
async function portfolioSongs(){const saved=await listSongs();return builtinSong?[builtinSong,...saved.filter(s=>s.id!=='builtin-qingming')]:saved;}
import {keyLabel} from './KeyBindings.js';
import {KeyBindingEditor} from './KeyBindingEditor.js';
import {Settings} from './Settings.js';
import {ChartManager,validateChart} from './ChartManager.js';
import {AudioManager} from './AudioManager.js';
import {JudgeManager} from './JudgeManager.js';
import {InputManager,ComboInput} from './InputManager.js';
import {TouchInput} from './TouchInput.js';
import {Renderer} from './Renderer.js';
import {LEGACY_ID,bakeChartOffset,createSong,getSong,listSongs,putSong,readLastAnalysisProject} from './SongLibrary.js';
const $=id=>document.getElementById(id),settings=new Settings(),charts=new ChartManager(),audio=new AudioManager(),renderer=new Renderer($('game'));
let baseChart,customChart,customBuffer,customBlob,customFileInfo,customName='',librarySongs=[],selectedLibrarySong=null,selectedLibraryBuffer=null,editingSongId=null,selection='practice',mode='menu',judge=null,comboInput=null,currentChart=null,buffer=null,auto=false,resuming=false,resumeAt=0,toastTimer,calibration=null,calibrationSuggestion=0,loadVersion=0,selectionVersion=0;
const input=new InputManager({getBindings:()=>settings.value,isActive:()=>['playing','countdown'].includes(mode),canPause:()=>['playing','countdown','paused'].includes(mode),onDown:key=>{if(mode==='playing'&&!auto)comboInput.down(key);},onUp:key=>{if(mode==='playing'&&!auto){if(touch.held.has(key))comboInput.held.delete(key);else comboInput.up(key);}},onPause:()=>{if(mode==='playing'||mode==='countdown')pause();else if(mode==='paused')resume();}});
const touch=new TouchInput({isActive:()=>!auto&&['playing','countdown'].includes(mode),onDown:(lane,direction,first)=>{if(mode!=='playing')return;if(first&&!input.held.has(String(lane)))judge.press(lane,clock());judge.wick(lane,direction,clock());},onUp:lane=>{if(mode==='playing'&&!input.held.has(String(lane)))judge.release(lane,clock());},onCancel:()=>pause()});
for(const direction of ['up','down'])for(let lane=1;lane<=4;lane++){const button=document.createElement('button');button.type='button';button.dataset.touchLane=lane;button.dataset.direction=direction;button.setAttribute('aria-label',`轨道 ${lane} ${direction==='up'?'上方红色':'下方绿色'}触控区，实体柱按住`);button.tabIndex=-1;button.innerHTML=`<span>${direction==='up'?'↑':'↓'} ${lane}</span>`;$('touch-controls').append(button);}
touch.attach($('touch-controls'));
function clearInputs(){input.clear();touch.clear();touch.paint();}
const touchMedia=matchMedia('(pointer: coarse), (max-width: 700px)');
function updateTouchMode(){document.body.classList.toggle('touch-mode',touchMedia.matches);if(['playing','countdown'].includes(mode))pause();}
touchMedia.addEventListener('change',updateTouchMode);updateTouchMode();
function refreshKeyLabels(){const labels=settings.value.laneKeys.map(keyLabel),sell=keyLabel(settings.value.sellKey),buy=keyLabel(settings.value.buyKey);$('lane-keys-hint').textContent=labels.join(' / ');$('sell-key-hint').textContent=sell;$('buy-key-hint').textContent=buy;$('chord-example').textContent=`${labels[0]} + ${labels[3]} + ${sell}`;$('game').setAttribute('aria-label',`四轨 K 线节奏游戏，轨道键 ${labels.join('、')}。上方 S（${sell}），下方 B（${buy}），实体柱长按轨道键。`);const helpItems=$('help-dialog').querySelectorAll('.help-list li');if(helpItems[0])helpItems[0].innerHTML=`<b>看前端，不看尾巴。</b> 红色横杠碰到上方 S 线时，按对应轨道键 + 线上操作键（${sell}）；绿色横杠碰到下方 B 线时，按轨道键 + 线下操作键（${buy}）。画面仍分别显示 S / B。`;if(helpItems[2])helpItems[2].innerHTML='<b>实体柱就是长按。</b> 柱头到判定线时按住轨道键，柱尾到线时松开。上行和下行都不需要线上或线下操作键。';}
new KeyBindingEditor({settings,onSave:()=>{clearInputs();refreshKeyLabels();notify('轨道键与 S/B 操作键已保存；判定线标识仍为 S / B');}});
refreshKeyLabels();
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function clock(){return audio.time-(settings.value.chartOffset+settings.value.audioOffset)/1000;}
function formatTime(t){t=Math.max(0,Math.floor(t));return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;}
const isLibrarySelection=()=>selection!=='practice'&&selection!=='custom';
const activeChart=()=>selection==='practice'?baseChart:selection==='custom'?customChart:selectedLibrarySong?.chart;
const activeBuffer=()=>selection==='practice'?null:selection==='custom'?customBuffer:selectedLibraryBuffer;
function updateAvailability(){const unavailable=selection!=='practice'&&(!activeBuffer()||!activeChart());$('start').disabled=unavailable;$('demo').disabled=unavailable;}
function setSong(){
 const practice=selection==='practice',library=isLibrarySelection(),chart=activeChart();
 $('song-title').textContent=practice?'开盘 · Opening Bell':library?selectedLibrarySong?.title||'本地曲目':customChart?.title||'清明上河图 / 同花顺进行曲';
 $('song-artist').textContent=practice?'K-LINE 原创合成练习曲':library?selectedLibrarySong?.artist||selectedLibrarySong?.audioName||'本地曲目':customName||'等待导入本地音频';
 $('bpm-display').textContent=practice?settings.value.bpm:chart?.bpm||'--';$('mode-label').textContent=practice?'练习曲':library?'自定义曲库':'临时导入';
}
function updateImport(){
 if(selection==='custom')$('import-status').textContent=[customBlob?`音频：${customName}${customBuffer?`（${formatTime(customBuffer.duration)}）`:''}`:'未导入音频',customChart?`谱面：${customChart.notes.length} 个 K 线`:'未导入配套 JSON 谱面','已自动保存'].join(' · ');
 else if(isLibrarySelection())$('import-status').textContent=selectedLibrarySong?.chart?`音频与谱面已保存 · ${selectedLibrarySong.chart.notes.length} 个 K 线 · 可以开始`:'音频已保存 · 待制谱；点击“去分析页制谱”或“编辑 / 补充文件”补上 JSON';
 updateAvailability();setSong();
}
async function select(value){
 const token=++selectionVersion;selection=value;document.querySelectorAll('.track[data-song-id]').forEach(button=>button.classList.toggle('active',button.dataset.songId===value));
 $('practice-track').classList.toggle('active',value==='practice');$('custom-track').classList.toggle('active',value==='custom');$('custom-options').hidden=value==='practice';
 $('legacy-import-row').hidden=value!=='custom';$('library-actions').hidden=!isLibrarySelection()||value==='builtin-qingming';selectedLibrarySong=isLibrarySelection()?librarySongs.find(song=>song.id===value)||null:null;selectedLibraryBuffer=null;
 updateImport();
 try{
  if(value==='custom'&&customBlob&&!customBuffer)customBuffer=await audio.decode(await customBlob.arrayBuffer());
  if(isLibrarySelection()&&selectedLibrarySong?.audioBlob){$('import-status').textContent='正在读取已保存的音频…';selectedLibraryBuffer=await audio.decode(await selectedLibrarySong.audioBlob.arrayBuffer());}
  if(token===selectionVersion)updateImport();
 }catch(error){if(token===selectionVersion){updateImport();notify(`音频恢复失败：${error.message}`);}}
}
function renderLibrary(){
 document.querySelectorAll('.track[data-song-id]').forEach(node=>node.remove());const add=$('add-track');
 librarySongs.forEach((song,index)=>{const button=document.createElement('button');button.type='button';button.className='track';button.dataset.songId=song.id;
  const number=document.createElement('span');number.className='track-number';number.textContent=song.id==='builtin-qingming'?'01':String(index+2).padStart(2,'0');
  const copy=document.createElement('span'),title=document.createElement('strong'),detail=document.createElement('small');title.textContent=song.title;detail.textContent=`${song.artist||song.audioName} · ${song.chart?`${song.chart.notes.length} 根 K 线`:'只有音频'}`;copy.append(title,detail);
  const badge=document.createElement('span');badge.className=`track-badge${song.chart?'':' pending'}`;badge.textContent=song.chart?'可游玩':'待制谱';button.append(number,copy,badge);button.onclick=()=>select(song.id);if(song.id==='builtin-qingming')$('practice-track').before(button);else add.before(button);
 });
}
async function saveLegacy(){
 if(!customBlob&&!customChart)return;await putSong({id:LEGACY_ID,title:customChart?.title||'清明上河图 / 同花顺进行曲',artist:customName||'本地曲目',audioBlob:customBlob||null,audioName:customFileInfo?.name||customName,audioType:customFileInfo?.type||customBlob?.type||'',audioLastModified:customFileInfo?.lastModified||0,chart:customChart||null,updatedAt:new Date().toISOString()});
}
async function restoreLegacy(){
 let saved=await getSong(LEGACY_ID);
 if(!saved){const project=await readLastAnalysisProject();if(project?.file?.blob&&project?.chart){saved={id:LEGACY_ID,title:project.controls?.title||project.chart.title,artist:project.controls?.artist||'',audioBlob:project.file.blob,audioName:project.file.name,audioType:project.file.type,audioLastModified:project.file.lastModified,chart:validateChart(bakeChartOffset(project.chart,project.controls?.previewOffsetMs||0)),updatedAt:new Date().toISOString()};await putSong(saved);}}
 if(!saved)return;customBlob=saved.audioBlob;customName=saved.audioName||saved.artist||'';customFileInfo={name:saved.audioName,type:saved.audioType,lastModified:saved.audioLastModified};customChart=saved.chart||null;
 $('custom-track').querySelector('small').textContent=customBlob&&customChart?`已自动恢复 · ${customChart.notes.length} 根 K 线`:customBlob?'已自动恢复音频 · 待补谱面':'已保存谱面 · 待补音频';
}
async function start(demo=false){
 if(!baseChart)return;
 const token=++loadVersion;$('start').disabled=true;$('demo').disabled=true;$('start').textContent='准备音频…';
 try{
  await audio.init();audio.setVolume(settings.value.volume);auto=demo;
  currentChart=charts.prepare(activeChart(),settings.value,selection==='practice');
  buffer=selection==='practice'?await audio.synthesize(currentChart):activeBuffer();
  if(token!==loadVersion)return;
  if(!buffer)throw Error('请先导入音频。');
  const lastHit=Math.max(...currentChart.notes.map(n=>n.time+n.duration))+(settings.value.chartOffset-settings.value.musicOffset)/1000;
  if(selection!=='practice'&&lastHit>buffer.duration+0.16)throw Error('谱面结束时间超过音频长度，请检查配套谱面与 Offset。');
  judge=new JudgeManager(currentChart.notes,f=>{renderer.hit(f);if(judge.stats.combo&&judge.stats.combo%50===0){$('combo').classList.remove('pulse');void $('combo').offsetWidth;$('combo').classList.add('pulse');}});
  comboInput=new ComboInput(judge,clock);clearInputs();renderer.feedback=[];mode='countdown';resuming=false;
  audio.play(buffer,0,3,settings.value.musicOffset);$('menu').hidden=true;$('pause').disabled=false;$('mode-label').textContent=auto?'AUTO · 演示不计纪录':selection==='practice'?'练习曲':'本地曲目';
 }catch(e){notify(`无法开始：${e.message}`);mode='menu';}finally{$('start').innerHTML='开始交易 <span>↗</span>';updateAvailability();}
}
function pause(){if(!['playing','countdown'].includes(mode))return;audio.pause();mode='paused';$('countdown').hidden=true;clearInputs();comboInput.clear();$('pause-dialog').showModal();}
async function resume(){
 if(mode!=='paused')return;try{await audio.init();$('pause-dialog').close();resumeAt=audio.position;audio.play(buffer,resumeAt,3,settings.value.musicOffset);mode='countdown';resuming=true;clearInputs();comboInput.clear();}catch(e){notify(e.message);}
}
function back(){++loadVersion;audio.stop();mode='menu';clearInputs();comboInput?.clear();judge=null;renderer.feedback=[];$('menu').hidden=false;$('pause').disabled=true;$('countdown').hidden=true;for(const id of ['pause-dialog','result-dialog'])$(id).close();setSong();}
function finish(){audio.stop();mode='result';clearInputs();comboInput.clear();$('pause').disabled=true;const s=judge.stats;$('result-mode').textContent=auto?'AUTO DEMO · 演示成绩':'SESSION CLOSED · 练习成绩';$('result-grade').textContent=s.accuracy>=98?'S':s.accuracy>=90?'A':s.accuracy>=80?'B':s.accuracy>=60?'C':'D';$('result-score').textContent=s.score.toLocaleString('en-US');$('result-acc').textContent=`${s.accuracy.toFixed(2)}% ACC`;$('result-counts').replaceChildren(...Object.entries(s.counts).map(([grade,count])=>{const span=document.createElement('span');span.textContent=grade;const b=document.createElement('b');b.textContent=count;span.append(b);return span;}));$('result-combo').textContent=`最大连击 ${s.maxCombo} · ${s.judged} / ${s.total} 次判定 · ${currentChart.notes.length} 根 K 线`;$('result-dialog').showModal();}
function frame(){
 document.body.dataset.playState=mode;$('touch-controls').hidden=auto||!['playing','countdown'].includes(mode);
 let t=judge?(mode==='countdown'&&resuming?resumeAt-(settings.value.chartOffset+settings.value.audioOffset)/1000:clock()):0;
 if(mode==='countdown'){
  const left=(resuming?resumeAt:0)-audio.time;
  $('countdown').hidden=false;$('countdown').textContent=left>0?Math.ceil(left):'GO';
  if(left<=0){t=clock();mode='playing';$('countdown').hidden=true;
   if(resuming){for(const n of judge.notes.filter(n=>n.state==='holding'&&!auto)){if(input.held.has(String(n.lane)))comboInput.held.add(String(n.lane));else if(!touch.held.has(String(n.lane)))judge.release(n.lane,t);}resuming=false;}
  }
 }
 if(mode==='playing'){
  if(auto){for(const n of judge.notes){if(n.state==='pending'&&t>=n.time){if(n.type==='wick')judge.wick(n.lane,n.direction,n.time);else judge.press(n.lane,n.time);}if(n.state==='holding'&&t>=n.time+n.duration)judge.release(n.lane,n.time+n.duration);}}
  judge.update(t);
  if(t>=currentChart.duration)finish();
 }
 if(judge){const s=judge.stats;$('combo').textContent=s.combo;$('score').textContent=s.score.toLocaleString('en-US',{minimumIntegerDigits:6});$('accuracy').textContent=s.accuracy.toFixed(1)+'%';$('progress-fill').style.width=`${Math.max(0,Math.min(100,t/currentChart.duration*100))}%`;$('time').textContent=`${formatTime(t)} / ${formatTime(currentChart.duration)}`;$('section').textContent=currentChart.sections?.findLast(s=>s.time*(selection==='practice'?baseChart.bpm/settings.value.bpm:1)<=t)?.label||'OPENING';}
 else{$('section').textContent='MARKET READY';$('combo').textContent='0';$('score').textContent='000,000';$('accuracy').textContent='100.0%';$('progress-fill').style.width='0%';}
 const activeHeld=auto&&judge?new Set(judge.notes.filter(n=>n.state==='holding').map(n=>String(n.lane))):new Set([...input.held,...touch.held]);
 const preview=[{lane:1,type:'wick',direction:'up',time:1,state:'pending'},{lane:2,type:'hold',direction:'down',time:1.4,duration:0.7,state:'pending'},{lane:3,type:'hold',direction:'up',time:1,duration:0.65,state:'pending'},{lane:4,type:'wick',direction:'down',time:0.6,state:'pending'}];
 renderer.draw(mode==='menu'?0:(mode==='countdown'&&resuming?resumeAt-(settings.value.chartOffset+settings.value.audioOffset)/1000:t),mode==='menu'?preview:judge?.notes||[],activeHeld,settings.value,mode);$('fps').textContent=`${renderer.fps} FPS`;
 const layout=renderer.layout,controls=$('touch-controls');controls.style.left=`${layout.margin}px`;controls.style.right=`${layout.margin}px`;controls.style.columnGap=`${layout.gap}px`;controls.style.top=`${layout.top}px`;controls.style.bottom=`${renderer.canvas.clientHeight-layout.bottom}px`;
 if(calibration&&audio.context.currentTime>calibration.end)endCalibration();
 requestAnimationFrame(frame);
}
$('practice-track').onclick=()=>select('practice');$('custom-track').onclick=()=>select('custom');$('start').onclick=()=>start(false);$('demo').onclick=()=>start(true);$('pause').onclick=pause;$('resume').onclick=resume;$('quit').onclick=back;$('result-back').onclick=back;$('retry').onclick=()=>{$('result-dialog').close();start(auto);};
$('audio-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>150*1024*1024)throw Error('音频请控制在 150 MB 内。');const decoded=await audio.decode(await file.arrayBuffer());customBuffer=decoded;customBlob=file;customFileInfo={name:file.name,type:file.type,lastModified:file.lastModified};customName=file.name;await saveLegacy();updateImport();notify('音频已导入并自动保存');}catch(e){notify(`音频导入失败：${e.message}`);}};
$('chart-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>3*1024*1024)throw Error('谱面文件过大。');const next=validateChart(JSON.parse((await file.text()).replace(/^\uFEFF/,'')));customChart=next;settings.save({...settings.value,bpm:next.bpm});await saveLegacy();updateImport();notify('谱面已导入并自动保存');}catch(e){notify(`谱面导入失败：${e.message}`);}};
$('load-local').onclick=async()=>{try{const response=await fetch('assets/music/qingming_shanghetu.mp3');if(!response.ok)throw Error('项目内没有 assets/music/qingming_shanghetu.mp3；手动导入音频后不需要点这里。');customBlob=await response.blob();customBuffer=await audio.decode(await customBlob.arrayBuffer());customFileInfo={name:'qingming_shanghetu.mp3',type:customBlob.type,lastModified:0};customName=customFileInfo.name;await saveLegacy();updateImport();notify('项目内固定音频已读取并自动保存');}catch(e){notify(e.message);}};

function openSongDialog(song=null){
 editingSongId=song?.id||null;$('song-dialog-title').textContent=song?'编辑自定义曲目':'添加自定义曲目';$('song-title-input').value=song?.title||'';$('song-artist-input').value=song?.artist||'';$('song-audio-input').value='';$('song-chart-input').value='';
 $('song-form-status').textContent=song?`当前音频：${song.audioName} · ${song.chart?'已有谱面，选择新 JSON 可替换':'还没有谱面'}`:'请选择文件，或导入分析页已经保存的工程。';$('song-dialog').showModal();
}
$('add-track').onclick=()=>openSongDialog();$('edit-track').onclick=()=>{if(selectedLibrarySong)openSongDialog(selectedLibrarySong);};
$('analyze-track').onclick=()=>{if(selectedLibrarySong)sessionStorage.setItem('kline.analyze.songId',selectedLibrarySong.id);};
$('song-form').onsubmit=async event=>{
 event.preventDefault();const existing=editingSongId?librarySongs.find(song=>song.id===editingSongId):null,audioFile=$('song-audio-input').files[0],chartFile=$('song-chart-input').files[0];
 try{
  if(audioFile?.size>150*1024*1024)throw Error('音频请控制在 150 MB 内。');if(chartFile?.size>3*1024*1024)throw Error('谱面文件过大。');
  const audioBlob=audioFile||existing?.audioBlob;if(!audioBlob)throw Error('新曲目必须先选择音频。');if(audioFile)await audio.decode(await audioFile.arrayBuffer());
  const chart=chartFile?validateChart(JSON.parse((await chartFile.text()).replace(/^\uFEFF/,''))):existing?.chart||null;
  const record=createSong({id:existing?.id,title:$('song-title-input').value||chart?.title||audioFile?.name||existing?.title,artist:$('song-artist-input').value||chart?.artist||existing?.artist,audioBlob,audioName:audioFile?.name||existing?.audioName,audioType:audioFile?.type||existing?.audioType,audioLastModified:audioFile?.lastModified||existing?.audioLastModified,chart,createdAt:existing?.createdAt});
  await putSong(record);librarySongs=await portfolioSongs();renderLibrary();$('song-dialog').close();await select(record.id);notify(record.chart?'曲目、音频和谱面已保存到本地曲库':'曲目和音频已保存；补上谱面后即可游玩');
 }catch(error){$('song-form-status').textContent=`保存失败：${error.message}`;}
};
$('import-analysis-project').onclick=async()=>{
 try{
  const project=await readLastAnalysisProject();if(!project?.file?.blob||!project?.chart)throw Error('分析页还没有保存完整工程。请先在分析页点击“保存当前工程到浏览器”。');
  const checked=validateChart(bakeChartOffset(project.chart,project.controls?.previewOffsetMs||0)),record=createSong({title:project.controls?.title||checked.title,artist:project.controls?.artist||checked.artist,audioBlob:project.file.blob,audioName:project.file.name,audioType:project.file.type,audioLastModified:project.file.lastModified,chart:checked});
  await putSong(record);librarySongs=await portfolioSongs();renderLibrary();$('song-dialog').close();await select(record.id);notify('分析工程已加入曲库，预览 Offset 已写入谱面');
 }catch(error){$('song-form-status').textContent=`导入失败：${error.message}`;}
};
$('settings-open').onclick=()=>{for(const [k,v]of Object.entries(settings.value)){const field=$('settings-form').elements.namedItem(k);if(field)field.value=v;}$('settings-dialog').showModal();};
$('settings-form').onsubmit=e=>{e.preventDefault();settings.save({...settings.value,...Object.fromEntries(new FormData(e.target))});stopCalibration();audio.setVolume(settings.value.volume);$('settings-dialog').close();setSong();notify('设置已保存');};
$('help-open').onclick=()=>$('help-dialog').showModal();
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>{$(button.dataset.close).close();if(button.dataset.close==='settings-dialog')stopCalibration();};
for(const id of ['pause-dialog','result-dialog'])$(id).addEventListener('cancel',e=>{e.preventDefault();if(id==='pause-dialog')resume();else back();});
$('settings-dialog').addEventListener('cancel',stopCalibration);
window.addEventListener('blur',()=>{if(['playing','countdown'].includes(mode))pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&['playing','countdown'].includes(mode))pause();});
function stopCalibration(){for(const node of calibration?.nodes||[]){try{node.stop();}catch{}}calibration=null;$('calibrate').disabled=false;}
async function calibrate(){await audio.init();audio.setVolume(settings.value.volume);$('apply-calibration').hidden=true;const start=audio.context.currentTime+1;calibration={start,end:start+12*0.5,errors:[],used:new Set(),nodes:[]};for(let i=0;i<12;i++)calibration.nodes.push(audio.click(start+i*0.5));$('calibrate').disabled=true;$('calibration-status').textContent='跟随滴声按 F 或点击拍点 · 0 / 10 次有效采样';}
function endCalibration(){const errors=calibration.errors;stopCalibration();if(errors.length<6){$('calibration-status').textContent='有效采样不足 6 次，请重试。';return;}errors.sort((a,b)=>a-b);const trimmed=errors.slice(1,-1);calibrationSuggestion=Math.max(-300,Math.min(300,Math.round(trimmed.reduce((s,n)=>s+n,0)/trimmed.length)));$('calibration-status').textContent=`建议 Audio Offset ${calibrationSuggestion>=0?'+':''}${calibrationSuggestion} ms · ${errors.length} 次采样（去除最高最低值）`;$('apply-calibration').hidden=false;}
$('calibrate').onclick=()=>calibrate().catch(e=>notify(e.message));$('apply-calibration').onclick=()=>{$('settings-form').elements.audioOffset.value=calibrationSuggestion;$('calibration-status').textContent='已填入建议值，点击保存设置生效。';};
function calibrationTap(){if(!calibration)return;const now=audio.context.currentTime,beat=Math.round((now-calibration.start)/0.5),error=(now-calibration.start-beat*0.5)*1000;if(beat<2||beat>11||Math.abs(error)>240||calibration.used.has(beat))return;calibration.used.add(beat);calibration.errors.push(error);$('calibration-status').textContent=`跟随滴声按 F 或点击拍点 · ${calibration.errors.length} / 10 次有效采样`;}
window.addEventListener('keydown',e=>{if(calibration&&e.code==='KeyF'&&!e.repeat){e.preventDefault();calibrationTap();}});
$('calibration-tap').addEventListener('pointerdown',e=>{e.preventDefault();calibrationTap();});
try{baseChart=await charts.load('charts/opening-bell.json');await restoreLegacy();librarySongs=await portfolioSongs();
try { const [audioResponse,chartResponse]=await Promise.all([fetch('assets/builtin/qingming.m4a'),fetch('assets/builtin/qingming.json')]);
if(!audioResponse.ok||!chartResponse.ok)throw Error('内置曲目资源无法加载');
builtinSong={id:'builtin-qingming',title:'清明上河图',artist:'内置录音 · 草稿谱面',audioName:'qingming.m4a',audioBlob:await audioResponse.blob(),chart:validateChart(await chartResponse.json())};librarySongs.unshift(builtinSong);
} catch(error) { notify(error.message); }
renderLibrary();setSong();await select(librarySongs.some(s=>s.id==='builtin-qingming')?'builtin-qingming':'practice');requestAnimationFrame(frame);}catch(e){notify(e.message);$('start').disabled=true;$('demo').disabled=true;}







window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==='portfolio-pause')pause();});

// Runs in the packaged game's module scope, where mode reflects actual playback.
let portfolioTouch=null;
function portfolioCanNavigate(){return ['paused','menu','result'].includes(mode);}
function portfolioHasScroll(target,direction){
 for(let el=target instanceof Element?target:null;el&&el!==document.body;el=el.parentElement){
  if(!/(auto|scroll)/.test(getComputedStyle(el).overflowY)||el.scrollHeight<=el.clientHeight+1)continue;
  if(direction<0?el.scrollTop>1:el.scrollTop+el.clientHeight<el.scrollHeight-1)return true;
 }
 return false;
}
function portfolioNavigate(direction){if(parent!==window&&portfolioCanNavigate())parent.postMessage({type:'portfolio-navigate',direction},location.origin);}
window.addEventListener('wheel',event=>{
 if(parent===window||!portfolioCanNavigate()||Math.abs(event.deltaY)<30||portfolioHasScroll(event.target,Math.sign(event.deltaY)))return;
 event.preventDefault();portfolioNavigate(Math.sign(event.deltaY));
},{passive:false});
window.addEventListener('touchstart',event=>{portfolioTouch=portfolioCanNavigate()?{y:event.touches[0]?.clientY,up:portfolioHasScroll(event.target,-1),down:portfolioHasScroll(event.target,1)}:null;},{passive:true});
window.addEventListener('touchend',event=>{if(portfolioTouch===null)return;const start=portfolioTouch,delta=start.y-event.changedTouches[0].clientY;portfolioTouch=null;if(Math.abs(delta)>65&&!(delta>0?start.down:start.up)&&!portfolioHasScroll(event.target,Math.sign(delta)))portfolioNavigate(Math.sign(delta));},{passive:true});
window.addEventListener('touchcancel',()=>portfolioTouch=null,{passive:true});
let portfolioDrag=null;
window.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button===0&&portfolioCanNavigate()&&!event.target.closest('button,a,input,select,textarea'))portfolioDrag={y:event.clientY,target:event.target};});
window.addEventListener('pointerup',event=>{if(!portfolioDrag)return;const start=portfolioDrag;portfolioDrag=null;const delta=start.y-event.clientY;if(Math.abs(delta)>65&&!portfolioHasScroll(start.target,Math.sign(delta)))portfolioNavigate(Math.sign(delta));});
window.addEventListener('pointercancel',()=>portfolioDrag=null);
let portfolioLastMode='';
function portfolioSync(){if(mode!==portfolioLastMode){portfolioLastMode=mode;parent.postMessage({type:'portfolio-state',canNavigate:portfolioCanNavigate()},location.origin);}requestAnimationFrame(portfolioSync);}
if(parent!==window)portfolioSync();
