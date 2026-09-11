export const DEFAULT_LANE_KEYS=Object.freeze(['Digit1','Digit2','Digit3','Digit4']);
export const DEFAULT_BINDINGS=Object.freeze({laneKeys:DEFAULT_LANE_KEYS,sellKey:'KeyS',buyKey:'KeyB'});
const symbols={ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',Backslash:'\\',BracketLeft:'[',BracketRight:']',Minus:'-',Equal:'=',Backquote:'`',NumpadDecimal:'Num .'};
export function keyLabel(code){if(/^Key[A-Z]$/.test(code))return code.slice(3);if(/^Digit[0-9]$/.test(code))return code.slice(5);if(/^Numpad[0-9]$/.test(code))return `Num ${code.slice(6)}`;return symbols[code]||'?';}
export function isBindableKey(code){return typeof code==='string'&&(/^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(code)||Object.hasOwn(symbols,code));}
export const isLaneKey=isBindableKey;
export function sanitizeLaneKeys(keys){return Array.isArray(keys)&&keys.length===4&&keys.every(isLaneKey)&&new Set(keys).size===4?[...keys]:[...DEFAULT_LANE_KEYS];}
export function sanitizeBindings(value={}){
 const laneKeys=sanitizeLaneKeys(value?.laneKeys);
 const sellKey=isBindableKey(value?.sellKey)?value.sellKey:DEFAULT_BINDINGS.sellKey;
 const buyKey=isBindableKey(value?.buyKey)?value.buyKey:DEFAULT_BINDINGS.buyKey;
 const all=[...laneKeys,sellKey,buyKey];
 if(new Set(all).size!==all.length)return {laneKeys:[...DEFAULT_LANE_KEYS],sellKey:DEFAULT_BINDINGS.sellKey,buyKey:DEFAULT_BINDINGS.buyKey};
 return {laneKeys,sellKey,buyKey};
}
export function eventCode(event){if(event.code)return event.code;const key=event.key||'';if(/^[a-z]$/i.test(key))return `Key${key.toUpperCase()}`;if(/^[0-9]$/.test(key))return `Digit${key}`;return ({' ':'Space',Esc:'Escape'})[key]||key;}
export function resolveGameKey(code,bindings=DEFAULT_BINDINGS){
 const normalized=Array.isArray(bindings)?{laneKeys:bindings,sellKey:DEFAULT_BINDINGS.sellKey,buyKey:DEFAULT_BINDINGS.buyKey}:bindings||DEFAULT_BINDINGS;
 if(code===normalized.sellKey)return 's';if(code===normalized.buyKey)return 'b';
 const laneKeys=normalized.laneKeys||DEFAULT_LANE_KEYS;
 const index=laneKeys.indexOf(code);if(index>=0)return String(index+1);
 // Retain the original numeric keypad alias only when that keypad key is not explicitly bound.
 if(/^Numpad[0-9]$/.test(code)){const alias=laneKeys.indexOf(`Digit${code.slice(6)}`);if(alias>=0)return String(alias+1);}
 return null;
}
