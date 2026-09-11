// Each finger owns a lane + direction, so opposite gestures on other lanes never
// combine into an unintended S/B chord. A lane releases after its last finger.
export class TouchInput {
 constructor({isActive=()=>true,onDown=()=>{},onUp=()=>{},onCancel=()=>{}}={}){Object.assign(this,{isActive,onDown,onUp,onCancel});this.pointers=new Map();}
 get held(){return new Set([...this.pointers.values()].map(p=>String(p.lane)));}
 down(id,lane,direction){
  if(!this.isActive()||this.pointers.has(id)||!Number.isInteger(lane)||lane<1||lane>4||!['up','down'].includes(direction))return false;
  const first=!this.held.has(String(lane));this.pointers.set(id,{lane,direction});this.onDown(lane,direction,first);return true;
 }
 up(id){const point=this.pointers.get(id);if(!point)return;this.pointers.delete(id);if(!this.held.has(String(point.lane)))this.onUp(point.lane);}
 cancel(id){if(!this.pointers.has(id))return;this.clear();this.onCancel();}
 clear(){this.pointers.clear();}
 attach(root){
  const paint=()=>root.querySelectorAll('[data-touch-lane]').forEach(button=>{const active=[...this.pointers.values()].some(p=>p.lane===Number(button.dataset.touchLane)&&p.direction===button.dataset.direction);button.classList.toggle('pressed',active);button.setAttribute('aria-pressed',String(active));});
  const down=event=>{const button=event.target.closest('[data-touch-lane]');if(!button||event.button>0)return;if(this.down(event.pointerId,Number(button.dataset.touchLane),button.dataset.direction)){event.preventDefault();button.setPointerCapture(event.pointerId);paint();}};
  const up=event=>{this.up(event.pointerId);paint();};
  const cancel=event=>{this.cancel(event.pointerId);paint();};
  root.addEventListener('pointerdown',down);root.addEventListener('pointerup',up);root.addEventListener('pointercancel',cancel);root.addEventListener('lostpointercapture',cancel);
  root.addEventListener('contextmenu',event=>event.preventDefault());
  this.paint=paint;
 }
}
