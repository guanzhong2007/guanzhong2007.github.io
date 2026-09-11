import { BODY, ORGANS } from './data.js';
import { stats } from './rules.js';
export function evolutionInfo(player,id) {
  const body=id==='body', item=body?BODY[player.level+1]:ORGANS.find(o=>o.id===id);
  if(!item) return {ok:false,reasons:[body?'身体已达最高等级':'未知进化']};
  const reasons=[];
  if(!body) {
    if(player.organs.includes(id)) reasons.push('已经拥有');
    if(ORGANS.some(o=>o.replaces===id&&player.organs.includes(o.id)))reasons.push('已拥有升级器官');
    if(player.level<item.level&&!player.unlocked.includes(id)) reasons.push(`需要身体 Lv.${item.level}`);
    for(const req of item.requires||[]) if(!player.organs.includes(req)&&!(req==='mouth'&&player.organs.includes('stomach'))) reasons.push(`需要${ORGANS.find(o=>o.id===req).name}`);
    if(!item.replaces&&player.organs.length>=stats(player).capacity)reasons.push('器官容量已满，请成长身体或重组');
    if(item.special&&!player.unlocked.includes(id)) reasons.push('先吸收对应组织');
  }
  if(player.bio<item.bio) reasons.push(`缺少 ${item.bio-player.bio} 生物质`);
  if(player.ep<item.ep) reasons.push(`缺少 ${item.ep-player.ep} 进化点`);
  return {ok:!reasons.length,reasons,item};
}
export function evolve(player,id) {
  const check=evolutionInfo(player,id);if(!check.ok) return {ok:false,message:check.reasons.join(' · ')};
  player.bio-=check.item.bio;player.ep-=check.item.ep;
  if(id==='body') {player.level++;player.name='进化生命';player.hp=Math.min(stats(player).maxHp,player.hp+5);}
  else {if(check.item.replaces)player.organs=player.organs.filter(o=>o!==check.item.replaces);player.organs.push(id);}
  return {ok:true,message:id==='body'?`身体进化到 Lv.${player.level}。生命上限与器官容量提升。`:`长出了${check.item.name}。${check.item.effect}`};
}
