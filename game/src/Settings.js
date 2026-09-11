import {sanitizeBindings} from './KeyBindings.js';
export const defaults={bpm:120,musicOffset:0,chartOffset:0,audioOffset:0,approach:2,volume:0.55};
export const limits={bpm:[30,300],musicOffset:[-10000,10000],chartOffset:[-10000,10000],audioOffset:[-300,300],approach:[1,2.5],volume:[0,1]};
export function sanitizeSettings(value={}){value=value||{};return {...Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,Number.isFinite(Number(value[k]))?Math.max(limits[k][0],Math.min(limits[k][1],Number(value[k]))):v])),...sanitizeBindings(value)};}
export class Settings{
 constructor(){try{this.value=sanitizeSettings(JSON.parse(localStorage.getItem('kline.settings.v1'))||{});}catch{this.value=sanitizeSettings();}}
 save(value){this.value=sanitizeSettings(value);try{localStorage.setItem('kline.settings.v1',JSON.stringify(this.value));}catch{}return this.value;}
}

