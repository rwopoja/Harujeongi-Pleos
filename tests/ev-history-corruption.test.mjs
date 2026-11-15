import {Window} from 'happy-dom';import fs from 'node:fs';import assert from 'node:assert/strict';
for(const original of ['{broken json',JSON.stringify([{date:'old',route:'x',predicted:50,actual:45,noCharge:true},null])]){
 const w=new Window({url:'https://example.test'});let exported='';w.HaruNative={listen(){},exportData(text){exported=text;}};w.confirm=()=>true;
 w.localStorage.setItem('ev-day-history-v1',original);w.document.write(fs.readFileSync('web/ev-day.html','utf8').replace(/<script[^>]*><\/script>/g,''));for(const f of ['ev-day.js','ev-journey.js','ev-planner.js'])w.eval(fs.readFileSync('web/'+f,'utf8'));
 w.dispatchEvent(new w.CustomEvent('ev-ux',{detail:{state:'phone',restricted:false}}));const $=id=>w.document.getElementById(id);
 assert.match($('history').textContent,/원본을 보호/);$('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));$('actual-soc').value='30';$('save-history').click();assert.match($('history').textContent,/보호 중/);assert.equal(w.localStorage.getItem('ev-day-history-v1'),original);
 $('apply-eff').click();assert.match($('eff-suggestion').textContent,/기록/);$('export-history').click();assert.equal(JSON.parse(exported).originalStorage,original);
 $('delete-history').click();assert.equal(w.localStorage.getItem('ev-day-history-v1'),null);$('save-history').click();assert.equal(JSON.parse(w.localStorage.getItem('ev-day-history-v1')).length,1);await w.happyDOM.abort();
}
console.log('Corrupt history is protected, exportable, and explicitly clearable');
