// Fixed local navigation chart: reveal once, then retain the completed geometry.
export function price(t){return 18+t*2.65+10*Math.sin(t*.43)-3*Math.sin(t*1.7);}
export function candle(index,progress=1){
 const open=price(index),target=price(index+1),p=Math.max(0,Math.min(1,progress));
 const close=open+(target-open)*p;
 return {open,close,high:Math.max(open,close),low:Math.min(open,close)};
}
export function chartState(seconds){
 const phase=Math.min(30,Math.max(0,seconds)/.18),newest=Math.min(29,Math.floor(phase)),progress=phase>=30?1:phase-newest;
 const start=0,baseline=price(0)-10;
 const bars=[];
 for(let i=Math.floor(start);i<=newest;i++)bars.push({index:i,x:24+(i-start)*39,...candle(i,i===newest?progress:1)});
 const y=value=>600-(value-baseline)*5.1;
 // A fixed peak index prevents the project link from jumping between candles.
 const peakIndex=Array.from({length:28},(_,i)=>i+1).find(i=>price(i+1)>price(i)&&price(i+1)>price(i+2))??7;
 const peak=candle(peakIndex);
 return {bars,y,marker:{x:24+peakIndex*39,y:y(peak.high)-14,visible:phase>=peakIndex+1},newest,complete:phase>=30};
}
