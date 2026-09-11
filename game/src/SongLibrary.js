const DB_NAME='k-line-rhythm-song-library';
const DB_VERSION=1;
const STORE='songs';
export const LEGACY_ID='legacy-track-01';

function openDb(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,DB_VERSION);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'id'});};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
}

async function transact(mode,operation){
 const db=await openDb();
 try{return await new Promise((resolve,reject)=>{const transaction=db.transaction(STORE,mode),request=operation(transaction.objectStore(STORE));request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
 finally{db.close();}
}

export const getSong=id=>transact('readonly',store=>store.get(id));
export const putSong=song=>transact('readwrite',store=>store.put(song));
export async function listSongs(){
 const songs=await transact('readonly',store=>store.getAll());
 return songs.filter(song=>song.id!==LEGACY_ID).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function createSong({id,title,artist,audioBlob,audioName,audioType,audioLastModified,chart,createdAt}={}){
 if(!audioBlob)throw Error('请先选择音频。');
 const now=new Date().toISOString();
 return {
  id:id||`song-${crypto.randomUUID()}`,title:String(title||audioName||'未命名曲目').replace(/\.[^.]+$/,'').slice(0,80),artist:String(artist||'本地曲目').slice(0,80),
  audioBlob,audioName:String(audioName||'audio'),audioType:String(audioType||audioBlob.type||'audio/*'),audioLastModified:Number(audioLastModified)||Date.now(),chart:chart||null,
  createdAt:createdAt||now,updatedAt:now
 };
}

export function bakeChartOffset(chart,offsetMs=0){
 const shift=(Number(offsetMs)||0)/1000;
 if(!shift)return structuredClone(chart);
 const output=structuredClone(chart);
 output.notes=output.notes.map(note=>({...note,time:Math.max(0,Math.round((note.time+shift)*1000)/1000)}));
 if(Array.isArray(output.sections))output.sections=output.sections.map((section,index)=>({...section,time:index===0?0:Math.max(0,Math.round((section.time+shift)*1000)/1000)}));
 output.generator={...(output.generator||{}),previewOffsetMs:Number(offsetMs)||0};
 return output;
}

export function readLastAnalysisProject(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('k-line-rhythm-chart-lab',1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('projects'))request.result.createObjectStore('projects',{keyPath:'id'});};
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{
   const db=request.result,transaction=db.transaction('projects','readonly'),get=transaction.objectStore('projects').get('last-project');
   get.onsuccess=()=>{db.close();resolve(get.result||null);};get.onerror=()=>{db.close();reject(get.error);};
  };
 });
}
