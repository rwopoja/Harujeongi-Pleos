import {Window} from 'happy-dom';import fs from 'node:fs';import assert from 'node:assert/strict';
const w=new Window({url:'https://example.test'});w.localStorage.setItem('ev-day-history-v1',JSON.stringify([
 {date:'a',route:'a',predicted:80,actual:60,noCharge:true,inputs:{reserve:70}},
 {date:'b',route:'b',predicted:65,actual:75,noCharge:true,inputs:{reserve:70}},
 {date:'c',route:'c',predicted:60,actual:60,noCharge:true,inputs:{reserve:70}},
 {date:'d',route:'d',predicted:20,actual:99,noCharge:false,inputs:{reserve:70}}
]));w.document.write(fs.readFileSync('web/ev-day.html','utf8').replace(/<script[^>]*><\/script>/g,''));for(const f of ['ev-day.js','ev-journey.js','ev-planner.js'])w.eval(fs.readFileSync('web/'+f,'utf8'));let s=w.document.getElementById('history-stats').textContent;
assert.match(s,/확인 기록 3건/);assert.match(s,/평균 절대 오차 10\.0%p/);assert.match(s,/RMSE 12\.9%p/);assert.match(s,/부족 미감지 1건/);assert.match(s,/부족 오탐 1건/);assert.match(s,/정확도를 보장하지/);
console.log('Confirmed history error metrics and missed-shortage accounting passed');await w.happyDOM.abort();
