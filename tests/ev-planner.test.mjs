import { Window } from 'happy-dom';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const w = new Window({url:'https://example.test'});
const calls = [];
const spoken = [];
const pushes = [];
let reminder = null;
let naviRequests = 0;
w.HaruNative = {
  listen(){},
  readBattery(){},
  speak(text, lang, id){ spoken.push({text, lang, id}); },
  setReminder(minutes){ reminder = minutes; },
  cancelReminder(){ reminder = null; },
  observeNavi(){ naviRequests++; },
  pushRequest(id,json){ pushes.push({id, request:JSON.parse(json)}); },
  mapRequest(id, json){ calls.push({id, request:JSON.parse(json)}); }
};
w.document.write(fs.readFileSync('web/ev-day.html','utf8').replace(/<script[^>]*><\/script>/g,''));
for (const file of ['ev-day.js','ev-journey.js','ev-planner.js']) w.eval(fs.readFileSync('web/'+file,'utf8'));
w.dispatchEvent(new w.CustomEvent('ev-ux',{detail:{state:'phone',restricted:false}}));
const $ = id => w.document.getElementById(id);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const input = (id, value) => { $(id).value = value; $(id).dispatchEvent(new w.Event('input', {bubbles:true})); };
const respond = async (call, data) => {
  w.dispatchEvent(new w.CustomEvent('ev-map-result', {detail:{id:call.id, result:{ok:true,data}}}));
  await tick();
};
const option = (host, prefix) => [...host.querySelectorAll('button')].find(x => x.textContent.startsWith(prefix));

w.dispatchEvent(new w.CustomEvent('ev-ux',{detail:{state:'vehicle',restricted:true}}));
assert.equal($('route-search').disabled,true);
assert.equal($('origin').disabled,true);
assert.equal($('voice-route').disabled,false);
w.dispatchEvent(new w.CustomEvent('ev-ux',{detail:{state:'unknown',restricted:true}}));
assert.match($('ux-status').textContent,/확인할 수 없어/);
w.dispatchEvent(new w.CustomEvent('ev-ux',{detail:{state:'vehicle',restricted:false}}));
assert.equal($('route-search').disabled,false);

assert.deepEqual([...w.EvPlanner.parseStops('오늘 서울역에 갔다가 강남역 들르고 집에 갈 거야')], ['서울역','강남역','집']);
$('route').value = '오늘 서울역에 갔다가 강남역 들르고 집에 갈 거야';
$('parse-plan').click();
assert.match($('draft-status').textContent, /서울역 → 강남역 → 집/);
assert.equal($('points').children.length, 0, 'speech never modifies the itinerary before confirmation');
$('apply-draft').click();
assert.equal($('points').children.length, 3);
assert.match($('route').value, /서울역 → 강남역 → 집/);
w.dispatchEvent(new w.CustomEvent('haru-voice',{detail:{text:'서울역 갔다가 집에 갈게'}}));
assert.match(spoken.at(-1).text,/서울역/);
const priorRoute=$('route').value;
w.dispatchEvent(new w.CustomEvent('haru-voice',{detail:{text:'일정이 바뀌었어'}}));
assert.equal($('route').value,priorRoute,'a change question must not replace a saved route');
assert.match(spoken.at(-1).text,/변경된 출발지/);

// One stop is sufficient for a repeatable routing and charger test.
$('route').value='서울역';
$('parse-plan').click();
$('apply-draft').click();
input('origin','광화문');
$('origin-search').click();
await tick();
assert.equal(calls.length, 0, 'no external request before consent');
assert.match($('origin-results').textContent,/동의/);
$('map-consent').checked = true;

// An outdated response must never confirm the wrong location.
$('origin-search').click();
const stale = calls.at(-1);
input('origin','서울특별시청');
await respond(stale,[{lat:'37.572',lon:'126.976',display_name:'오래된 광화문 검색 결과'}]);
assert.doesNotMatch($('origin-results').textContent,/오래된/);
$('origin-search').click();
assert.equal(calls.at(-1).request.query,'서울특별시청');
await respond(calls.at(-1),[{lat:'37.5663',lon:'126.978',display_name:'서울특별시청, 서울'}]);
option($('origin-results'),'서울특별시청').click();
let card = $('points').firstElementChild;
option(card,'이 장소 검색').click();
await respond(calls.at(-1),[{lat:'37.5547',lon:'126.9707',display_name:'서울역, 서울'}]);
card = $('points').firstElementChild;
option(card,'서울역').click();
$('connect-navi').click();
assert.equal(naviRequests,1);
w.dispatchEvent(new w.CustomEvent('ev-navi',{detail:{event:'location',value:{lat:37.5663,lon:126.978,address:'시험 위치'}}}));
assert.equal($('use-navi-location').hidden,false);
$('use-navi-location').click();
assert.equal($('origin').value,'내비 현재 위치');
w.dispatchEvent(new w.CustomEvent('ev-navi',{detail:{event:'destination',value:{name:'다른 곳',lat:37.50,lon:127.03}}}));
assert.match($('navi-status').textContent,/일정이 바뀌었나요/);
assert.equal($('navi-change').hidden,false);
w.dispatchEvent(new w.CustomEvent('ev-navi',{detail:{event:'destination',value:{name:'서울역',lat:37.5547,lon:126.9707}}}));
assert.match($('navi-status').textContent,/일치/);
assert.equal($('navi-change').hidden,true);

$('route-search').click();
let call = calls.at(-1);
assert.equal(call.request.type,'route');
assert.equal(call.request.points.length,2);
await respond(call,{code:'Ok',routes:[{distance:5600,legs:[{distance:5600}]}]});
assert.equal($('distance').value,'5.6');
assert.match($('result').innerText,/kWh/);
assert.match($('map-status').textContent,/5.6 km/);

// Out-of-order routing response after a change cannot replace the current distance.
$('route-search').click();
call = calls.at(-1);
input('origin','새 출발지');
await respond(call,{code:'Ok',routes:[{distance:100000,legs:[{distance:100000}]}]});
assert.equal($('distance').value,'5.6');
assert.match($('result').innerText,/변경|kWh/);
// Restore a verified origin.
$('origin-search').click();
await respond(calls.at(-1),[{lat:'37.5663',lon:'126.978',display_name:'새 출발지'}]);
option($('origin-results'),'새 출발지').click();

$('find-chargers').click();
call = calls.at(-1);
assert.equal(call.request.type,'chargers');
await respond(call,{elements:[{lat:37.565,lon:126.977,tags:{name:'시험 충전소'}}]});
assert.match($('charger-list').textContent,/직선/);
option($('charger-list'),'시험 충전소').click();
call = calls.at(-1);
assert.equal(call.request.type,'route');
assert.equal(call.request.points.length,3);
await respond(call,{code:'Ok',routes:[{distance:8500,legs:[{distance:1200},{distance:7300}]}]});
assert.match($('charger-list').textContent,/8.5 km/);
option($('charger-list'),'이 충전 계획 적용').click();
assert.equal($('distance').value,'8.5');
assert.equal($('charger-distance').value,'1.2');
assert.equal($('charger-name').value,'시험 충전소');
assert.match($('charge-result').textContent,/충전소/);

$('reminder-minutes').value='60';
$('reminder-set').click();
assert.equal(reminder,60);
w.dispatchEvent(new w.CustomEvent('ev-reminder',{detail:'60분 후 이 기기에 알림을 예약했습니다.'}));
assert.match($('reminder-status').textContent,/60분/);
$('reminder-cancel').click();
assert.equal(reminder,null);
$('push-generate').click();
assert.match($('push-topic').value,/^harujeongi-[a-f0-9]{48}$/);
$('push-test').click();
assert.equal(pushes.length,0,'push requires explicit consent');
$('push-consent').checked=true;
$('push-auto').checked=true;
input('soc','10');
$('form').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
assert.equal(pushes.at(-1).request.action,'schedule');
assert.equal(pushes.at(-1).request.low,true);
assert.equal('route' in pushes.at(-1).request,false,'no route details are sent to the push gateway');
w.dispatchEvent(new w.CustomEvent('ev-push',{detail:{id:pushes.at(-1).id,ok:true,action:'schedule'}}));
assert.match($('push-status').textContent,/서버가 예약/);
input('soc','90');
$('form').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
assert.equal(pushes.at(-1).request.action,'cancel','a safe recalculation cancels a pending shortage alert');
$('new-route').click();
assert.equal($('points').children.length,0);
assert.equal($('origin').value,'');
console.log('EV speech confirmation, privacy consent, stale responses, road routing and charger detour passed');
await w.happyDOM.abort();
