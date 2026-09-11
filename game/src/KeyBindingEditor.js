import {DEFAULT_BINDINGS,keyLabel,isBindableKey,eventCode,resolveGameKey} from './KeyBindings.js';

const slots=[
 {id:'lane1',label:'轨道 1',get:d=>d.laneKeys[0],set:(d,v)=>{d.laneKeys[0]=v;}},
 {id:'lane2',label:'轨道 2',get:d=>d.laneKeys[1],set:(d,v)=>{d.laneKeys[1]=v;}},
 {id:'lane3',label:'轨道 3',get:d=>d.laneKeys[2],set:(d,v)=>{d.laneKeys[2]=v;}},
 {id:'lane4',label:'轨道 4',get:d=>d.laneKeys[3],set:(d,v)=>{d.laneKeys[3]=v;}},
 {id:'sell',label:'线上操作（S）',get:d=>d.sellKey,set:(d,v)=>{d.sellKey=v;}},
 {id:'buy',label:'线下操作（B）',get:d=>d.buyKey,set:(d,v)=>{d.buyKey=v;}}
];

export class KeyBindingEditor{
 constructor({settings,onSave}){
  this.settings=settings;this.onSave=onSave;this.dialog=document.getElementById('keys-dialog');this.status=document.getElementById('keys-status');this.draft={laneKeys:[],sellKey:'',buyKey:''};this.capture=null;this.pressed=new Set();
  this.buttons=[...this.dialog.querySelectorAll('[data-bind-key]')];
  this.buttons.forEach(button=>button.onclick=()=>{this.capture=button.dataset.bindKey;this.clearTest();this.paint();this.status.textContent=`请按下${this.slot(this.capture).label}要使用的键；Esc 取消录入。`;});
  document.getElementById('keys-open').onclick=()=>{this.draft=this.copy(settings.value);this.capture=null;this.clearTest();this.paint();this.status.textContent='轨道键和 S/B 操作键都可改；判定线上的字样保持 S / B。';this.dialog.showModal();};
  document.getElementById('keys-close').onclick=()=>this.dialog.close();
  document.getElementById('keys-reset').onclick=()=>{this.draft=this.copy(DEFAULT_BINDINGS);this.capture=null;this.clearTest();this.paint();this.status.textContent='已恢复默认按键，点击保存生效。';};
  document.getElementById('keys-save').onclick=()=>{if(this.capture!==null){this.status.textContent='请先录入按键，或按 Esc 取消录入。';return;}if(!this.isUnique()){this.status.textContent='六个操作键不能重复，请换一组按键。';return;}settings.save({...settings.value,...this.draft});this.dialog.close();onSave();};
  this.dialog.addEventListener('close',()=>{this.capture=null;this.clearTest();});
  window.addEventListener('blur',()=>this.clearTest());
  document.getElementById('key-test').addEventListener('blur',()=>this.clearTest());
  window.addEventListener('keydown',e=>this.handleKeyDown(e),true);
  window.addEventListener('keyup',e=>{if(this.pressed.delete(eventCode(e)))this.paintTest();},true);
 }
 copy(value){return {laneKeys:[...(value.laneKeys||DEFAULT_BINDINGS.laneKeys)],sellKey:value.sellKey||DEFAULT_BINDINGS.sellKey,buyKey:value.buyKey||DEFAULT_BINDINGS.buyKey};}
 slot(id){return slots.find(slot=>slot.id===id)||slots[0];}
 currentCodes(){return slots.map(slot=>slot.get(this.draft));}
 isUnique(){return new Set(this.currentCodes()).size===slots.length;}
 handleKeyDown(e){
  if(!this.dialog.open)return;
  const code=eventCode(e);
  if(this.capture!==null){
   if(code==='Tab'){this.capture=null;this.paint();this.status.textContent='已取消录入。';return;}
   e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;
   if(code==='Escape'){this.capture=null;this.paint();this.status.textContent='已取消录入。';return;}
   if(e.ctrlKey||e.altKey||e.metaKey||!isBindableKey(code)){this.status.textContent='请选择字母、数字、小键盘、方向键或常用标点；空格、Esc 和控制键保留。';return;}
   const slot=this.slot(this.capture),old=slot.get(this.draft),codes=this.currentCodes(),used=codes.indexOf(code);
   if(used>=0&&codes[used]!==old){this.status.textContent=`${keyLabel(code)} 已绑定到${this.slot(slots[used].id).label}，请选择另一个键。`;return;}
   slot.set(this.draft,code);this.capture=null;this.paint();this.status.textContent=`${slot.label} 已设为 ${keyLabel(code)}，点击保存生效。`;return;
  }
  if(!e.target.closest?.('#key-test')||e.ctrlKey||e.altKey||e.metaKey)return;
  const key=resolveGameKey(code,this.draft);if(!key)return;
  e.preventDefault();e.stopImmediatePropagation();this.pressed.add(code);this.paintTest();
 }
 paint(){for(const button of this.buttons){const slot=this.slot(button.dataset.bindKey);button.textContent=this.capture===slot.id?'按键…':keyLabel(slot.get(this.draft));button.classList.toggle('recording',this.capture===slot.id);button.setAttribute('aria-label',`${slot.label}：${keyLabel(slot.get(this.draft))}，点击修改`);}for(const item of this.dialog.querySelectorAll('[data-test-key]')){const key=item.dataset.testKey;item.textContent=key==='s'?'S':key==='b'?'B':keyLabel(this.draft.laneKeys[Number(key)-1]);}this.paintTest();}
 paintTest(){const held=new Set([...this.pressed].map(code=>resolveGameKey(code,this.draft)));for(const item of this.dialog.querySelectorAll('[data-test-key]'))item.classList.toggle('pressed',held.has(item.dataset.testKey));const labels=[...held].map(key=>key==='s'?'S':key==='b'?'B':keyLabel(this.draft.laneKeys[Number(key)-1]));document.getElementById('key-test-state').textContent=labels.length?`已识别：${labels.join(' + ')}`:'点击此处，同时按下要测试的按键';}
 clearTest(){this.pressed.clear();this.paintTest();}
}
