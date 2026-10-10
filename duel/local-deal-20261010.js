import {Game,CHARACTERS,CARDS} from './engine-deal-20261010.js';
const history=await (await fetch(new URL('./history.json',import.meta.url))).json();
let game,player,clock=0,previous=performance.now(),parentPaused=false;
const view=()=>({...game.view(player.id),roomCode:'单人 / 机器人',owner:false});
export function stepLocal(){const now=performance.now();if(game&&!document.hidden&&!parentPaused){clock+=Math.min(now-previous,1000);game.tick(clock);}previous=now;return game?view():null;}
export async function requestLocal(url,body){
 if(url==='/api/info')return {characters:CHARACTERS,cardDefs:CARDS,addresses:[]};
 if(url==='/api/enter'){game=new Game(history.stocks,{seed:crypto.getRandomValues(new Uint32Array(1))[0]});player=game.addPlayer(body.character);clock=Date.now();previous=performance.now();game.start(clock,true);return {token:'static-practice',state:view()};}
 if(!game)throw new Error('请选择人物，开始新的一局');
 stepLocal();if(url==='/api/action')game.action(player.id,body);return view();
}
document.addEventListener('visibilitychange',()=>previous=performance.now());
window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin)return;if(e.data?.type==='portfolio-pause')parentPaused=true;if(e.data?.type==='portfolio-resume')parentPaused=false;previous=performance.now();});
