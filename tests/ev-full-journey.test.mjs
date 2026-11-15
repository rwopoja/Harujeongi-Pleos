import {Window} from 'happy-dom';import fs from 'node:fs';import assert from 'node:assert/strict';
const w=new Window({url:'https://example.test'}),calls=[],pushes=[];w.HaruNative={listen(){},speak(){},mapRequest(id,json){calls.push({id,request:JSON.parse(json)});},pushRequest(id,json){pushes.push({id,request:JSON.parse(json)});}};
w.document.write(fs.readFileSync('web/ev-day.html','utf8').replace(/<script[^>]*><\/script>/g,''));for(const f of ['ev-day.js','ev-journey.js','ev-planner.js'])w.eval(fs.readFileSync('web/'+f,'utf8'));
w.dispatchEvent(new w.CustomEvent('ev-ux',{detail:{state:'phone',restricted:false}}));
const $=id=>w.document.getElementById(id),tick=()=>new Promise(r=>setTimeout(r,0)),input=(id,v)=>{$(id).value=v;$(id).dispatchEvent(new w.Event('input',{bubbles:true}));};
const option=(host,prefix)=>[...host.querySelectorAll('button')].find(x=>x.textContent.startsWith(prefix));
const respond=async(data)=>{const c=calls.at(-1);w.dispatchEvent(new w.CustomEvent('ev-map-result',{detail:{id:c.id,result:{ok:true,data}}}));await tick();};
w.dispatchEvent(new w.CustomEvent('haru-voice',{detail:{text:'오늘 회사에 갔다가 퇴근 후 성수에서 친구를 만나고, 마트에 들렀다가 집에 돌아올 거야'}}));
assert.match($('draft-status').textContent,/회사 → 성수 → 마트 → 집/);$('apply-draft').click();assert.equal($('points').children.length,4);
w.dispatchEvent(new w.CustomEvent('haru-voice',{detail:{text:'친구 기다리는 동안 에어컨을 한 시간 정도 켤 거야'}}));
assert.equal($('voice-stop-hours').value,'1');$('voice-stop-index').value='1';$('voice-stop-power').value='2';$('voice-stop-apply').click();assert.equal(Number($('hours').value)*Number($('power').value),2);
$('map-consent').checked=true;input('origin','출발 집');$('origin-search').click();await respond([{lat:'37.50',lon:'127',display_name:'출발 집'}]);option($('origin-results'),'출발 집').click();
for(let i=0;i<4;i++){const point=$('points').children[i];option(point,'이 장소 검색').click();await respond([{lat:String(37.51+i*.01),lon:'127',display_name:'위치 '+i}]);option($('points').children[i],'위치 '+i).click();}
input('reserve','40');$('push-generate').click();$('push-consent').checked=true;$('push-auto').checked=true;
$('route-search').click();await respond({code:'Ok',routes:[{distance:90000,legs:[{distance:20000},{distance:20000},{distance:20000},{distance:30000}]}]});assert.match($('result').innerText,/36\.7%/);assert.equal(pushes.at(-1).request.action,'schedule');
$('find-chargers').click();await respond({elements:[{lat:37.505,lon:127,tags:{name:'시험 충전소'}}]});option($('charger-list'),'시험 충전소').click();await respond({code:'Ok',routes:[{distance:95000,legs:[{distance:10000},{distance:15000},{distance:20000},{distance:20000},{distance:30000}]}]});option($('charger-list'),'이 충전 계획 적용').click();
$('charge-added').value='10';$('charge-before-idle').value='0';$('charge-included').checked=true;$('charge-included').dispatchEvent(new w.Event('change',{bubbles:true}));$('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.match($('result').innerText,/51\.7%/);assert.equal(JSON.parse(w.localStorage.getItem('ev-day-last-prediction-v1')).charge.added,10);
option($('points').firstElementChild,'이 장소 방문').click();assert.equal($('charge-included').checked,false);assert.match($('progress-status').textContent,/이전 충전 계획은 해제/);input('remaining-soc','60');$('recalculate-remaining').click();await respond({code:'Ok',routes:[{distance:55000,legs:[{distance:20000},{distance:15000},{distance:20000}]}]});assert.match($('result').innerText,/38\.3%/);assert.match($('progress-status').textContent,/55\.0 km/);
// An invalid, newly enabled charge plan must not be described as a successful recalculation.
$('charge-included').checked=true;$('charge-before-idle').value='';$('recalculate-remaining').click();await respond({code:'Ok',routes:[{distance:55000,legs:[{distance:20000},{distance:15000},{distance:20000}]}]});assert.match($('progress-status').textContent,/충전 계획을 확인/);assert.doesNotMatch($('progress-status').textContent,/반영했습니다/);
console.log('Full itinerary, confirmed stop, charge decision and remaining replan passed with mocked maps');await w.happyDOM.abort();
