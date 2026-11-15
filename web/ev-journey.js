'use strict';
(function(){
 const el=id=>document.getElementById(id),routeKey='ev-day-route-v1',historyKey='ev-day-history-v1';
 const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch(_){return fallback;}};
 const write=(key,val)=>{try{localStorage.setItem(key,JSON.stringify(val));return true;}catch(_){return false;}};
 let route=read(routeKey,null),history=[],historyLocked=false;
 const validHistoryRow = h => h && typeof h==='object' && Number.isFinite(h.predicted) && h.predicted>=0 && h.predicted<=100 && Number.isFinite(h.actual) && h.actual>=0 && h.actual<=100;
 try {const raw=localStorage.getItem(historyKey);if(raw!==null){const parsed=JSON.parse(raw);if(!Array.isArray(parsed)){historyLocked=true;}else{history=parsed.filter(validHistoryRow);historyLocked=history.length!==parsed.length;}}} catch(_){historyLocked=true;}

 let socPending=false,socTimer=null,socRequestId=null,socSequence=0;
 el('read-soc').onclick=()=>{if(socPending)return;if(!window.HaruNative||!window.HaruNative.readBattery){el('soc-status').textContent='설치형 Pleos 환경에서 조회할 수 있습니다. 직접 입력하세요.';return;}socPending=true;socRequestId=String(Date.now()*100+(++socSequence%100));el('soc-status').textContent='Pleos에 배터리 조회 요청 중';socTimer=setTimeout(()=>{socPending=false;el('soc-status').textContent='조회 응답이 없습니다. 차량 지원 상태를 확인하거나 직접 입력하세요.';},12000);window.HaruNative.readBattery(socRequestId);};
 window.addEventListener('pleos-result',event=>{const r=event.detail||{};if(!socPending||!String(r.event||'').endsWith('_'+socRequestId))return;if(r.event==='EV_STATUS_'+socRequestId){el('soc-status').textContent=String(r.value);return;}clearTimeout(socTimer);socPending=false;if(r.event==='EV_SOC_'+socRequestId&&/^\d+$/.test(String(r.value))&&Number(r.value)>=0&&Number(r.value)<=100){el('soc').value=Number(r.value);el('soc').dispatchEvent(new Event('input',{bubbles:true}));el('soc-status').textContent='Pleos 조회값 '+r.value+'% · 다시 계산해 주세요.';}else el('soc-status').textContent='배터리 조회 실패 · 직접 입력하세요. '+String(r.value||'');});
 const idleKey='ev-idle-hours-v1', idleOptions=[4,6,12,24];
 let idleHours=read(idleKey,6);if(!idleOptions.includes(idleHours))idleHours=6;
 el('idle-hours').value=String(idleHours);
 function refreshResume(){
  const stale=!!(route&&typeof route.name==='string'&&Number.isFinite(route.updatedAt)&&Date.now()-route.updatedAt>=idleHours*60*60*1000);
  el('resume-status').textContent=stale?'마지막 일정 저장 또는 이어가기 후 '+idleHours+'시간이 지났습니다. 저장한 일정을 이어가거나 새 일정을 시작하세요. 차량 움직임은 확인하지 않습니다.':'';
  el('resume-current').hidden=!stale;el('resume-new').hidden=!stale;
 }
 if(route&&typeof route.name==='string')el('route').value=route.name;
 refreshResume();
 window.addEventListener('ev-route-cleared',()=>{route=null;refreshResume();});
 el('idle-hours').addEventListener('change',()=>{const next=Number(el('idle-hours').value);if(!idleOptions.includes(next))return;idleHours=next;write(idleKey,next);refreshResume();});
 el('resume-current').addEventListener('click',()=>{if(!route)return;route.updatedAt=Date.now();write(routeKey,route);refreshResume();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshResume();});
 setInterval(refreshResume,60000);
 function showPredictionForHistory(){
  const p=read('ev-day-last-prediction-v1',null),v=p&&p.inputs;
  if(!p||!Number.isFinite(p.raw)||!v||!Number.isFinite(v.distance)){el('history-prediction-status').textContent='저장된 예측이 없습니다. 먼저 계획을 계산하세요.';return;}
  const name=typeof p.route==='string'?p.route:'미입력';
  el('history-prediction-status').textContent='기록할 마지막 예측: '+name+' · 거리 '+v.distance.toFixed(1)+' km · 예상 '+p.raw.toFixed(1)+'%'+(p.charge?' · 충전 계획 포함':' · 충전 계획 없음')+'. 아래 실제 잔량이 이 예측에 해당하는지 확인하세요.';
 }
 el('form').addEventListener('submit',showPredictionForHistory);
 el('clear').addEventListener('click',showPredictionForHistory);
 showPredictionForHistory();
 function showHistory(){const host=el('history');host.replaceChildren();if(historyLocked){const warning=document.createElement('p');warning.textContent='일부 기록을 읽을 수 없어 원본을 보호 중입니다. 기록 내보내기로 원본을 보관한 뒤 필요하면 기록 전체 삭제를 선택하세요.';host.append(warning);}if(!history.length){if(!historyLocked)host.textContent='저장된 기록이 없습니다.';return;}for(const item of history.slice().reverse()){const row=document.createElement('p');const routeLine=document.createElement('small');row.textContent=`${item.date} · 예상 ${item.predicted.toFixed(1)}% · 실제 ${item.actual.toFixed(1)}% · 오차 ${(item.actual-item.predicted).toFixed(1)}%p`;routeLine.textContent='경유: '+item.route;row.append(document.createElement('br'),routeLine);if(item.noCharge&&item.inputs&&Number.isFinite(item.inputs.soc)&&Number.isFinite(item.inputs.cap)&&Number.isFinite(item.inputs.distance)){const use=(item.inputs.soc-item.actual)*item.inputs.cap/100;const detail=document.createElement('small');detail.textContent='이동 '+item.inputs.distance.toFixed(1)+' km · 잔량 변화 기준 소비 '+(use>=0?use.toFixed(1)+' kWh':'확인 불가');row.append(document.createElement('br'),detail);}host.append(row);}}
 el('voice-route').onclick=()=>{if(window.HaruNative&&window.HaruNative.listen){el('voice-status').textContent='기기의 음성 인식 준비 중';window.HaruNative.listen();}else el('voice-status').textContent='설치형 앱과 기기의 음성 인식 서비스가 필요합니다.';};
 window.addEventListener('haru-voice',event=>{const r=event.detail||{};if(r.status||r.error)el('voice-status').textContent=r.status||r.error;});
 el('save-route').onclick=()=>{const name=el('route').value.trim();if(!name){el('route-status').textContent='일정을 먼저 입력해 주세요.';return;}route={name,updatedAt:Date.now()};el('route-status').textContent=write(routeKey,route)?'일정을 이 기기에 저장했습니다. 거리가 바뀌면 아래 계산값을 직접 수정해 주세요.':'저장하지 못했습니다.';refreshResume();};
 el('new-route').onclick=()=>{route=null;el('route').value='';try{localStorage.removeItem(routeKey);}catch(_){}refreshResume();el('route-status').textContent='새 일정을 입력해 주세요.';};
 function calculate(){const fields=['soc','cap','eff','reserve','distance','hours','power'],v={};for(const id of fields){const input=el(id);if(!input.checkValidity()||input.value==='')return null;v[id]=Number(input.value);if(!Number.isFinite(v[id]))return null;}if(v.cap<=0||v.eff<=0)return null;v.energy=v.distance/v.eff+v.hours*v.power;v.raw=v.soc-100*v.energy/v.cap;return v;}
 // Require an explicit assumption whenever waiting consumes energy; otherwise a
 // charging recommendation could silently overstate the arrival battery.
 function chargingInputs() {
  const v=calculate(), station=el('charger-distance'), leg=Number(station.value), idle=el('charge-before-idle');
  if(!v || station.value==='' || !station.checkValidity() || !Number.isFinite(leg) || leg<0) return {error:'차량 정보와 충전소까지 거리를 확인해 주세요.'};
  if(leg>v.distance) return {error:'충전소까지 거리는 전체 이동 거리보다 클 수 없습니다. 우회 거리를 포함해 전체 거리를 다시 입력해 주세요.'};
  const rest=v.hours*v.power;
  if(idle.value==='' && rest>0) return {error:'충전소 도착 전 정차 소비량을 입력해 주세요. 없다면 0을 입력하세요.'};
  const before=idle.value===''?0:Number(idle.value);
  if(!idle.checkValidity() || !Number.isFinite(before) || before<0 || before>rest+1e-9) return {error:'충전 전 정차 소비량은 0 이상이며 전체 정차 소비량 이하여야 합니다.'};
  const arrival=v.soc-100*(leg/v.eff+before)/v.cap;
  if(arrival<=0) return {error:'입력한 조건에서는 충전소 도착 전에 배터리가 소진됩니다. 더 가까운 충전 계획을 확인하세요.'};
  return {v,arrival,before};
 }
 el('charge-calc').onclick=()=>{
  const plan=chargingInputs(),powerInput=el('charge-power'),power=Number(powerInput.value);
  if(plan.error){el('charge-result').textContent=plan.error;return;}
  if(powerInput.value==='' || !powerInput.checkValidity() || !Number.isFinite(power) || power<=0){el('charge-result').textContent='예상 평균 충전 전력을 확인해 주세요.';return;}
  const {v,arrival}=plan, station=el('charger-name').value.trim();
  const need=Math.max(0,(v.reserve-v.raw)*v.cap/100),chargeSoc=arrival+100*need/v.cap;
  if(chargeSoc>100+1e-9){el('charge-result').textContent=`계산상 충전소 도착 잔량 ${arrival.toFixed(1)}%. 한 번의 충전으로 목표에 도달하려면 배터리 용량을 초과합니다. 일정 또는 추가 충전 계획을 조정하세요.`;return;}
  el('charge-result').textContent=(station?station+' · ':'')+`입력 조건의 충전소 예상 도착 ${arrival.toFixed(1)}%. `+(need===0?(v.raw<=0?'목표를 0%로 설정해 부족분은 0이지만 잔량이 소진될 수 있습니다. 목표 여유를 높이고 충전 계획을 확인하세요.':'최종 목표 부족분은 없습니다.'):'목표까지 이론상 부족분 '+need.toFixed(1)+' kWh · 충전 직후 약 '+chargeSoc.toFixed(1)+'% · 입력한 평균 전력 기준 약 '+Math.ceil(need/power*60)+'분.')+' 충전 전 정차 소비량과 실제 전비·충전 속도는 입력 가정입니다. 실제 도착과 충전 시간은 달라질 수 있습니다.';
 };
 el('charge-scenario').onclick=()=>{
  const plan=chargingInputs(), field=el('charge-added'), amount=Number(field.value), out=el('charge-scenario-result');
  if(plan.error){out.textContent=plan.error;return;}
  if(field.value==='' || !field.checkValidity() || !Number.isFinite(amount)){out.textContent='계획 충전량을 확인해 주세요.';return;}
  const {v,arrival}=plan,after=arrival+amount/v.cap*100;
  if(after>100+1e-9){out.textContent='충전소 도착 잔량과 충전량의 합이 배터리 용량을 넘습니다. 조건을 다시 확인하세요.';return;}
  const final=v.raw+amount/v.cap*100;
  out.textContent=(final<=0?'계산상 일정 종료 전 배터리가 소진될 수 있습니다.':`충전량 ${amount.toFixed(1)} kWh를 반영한 일정 종료 예상 잔량 ${final.toFixed(1)}% · 목표 대비 ${(final-v.reserve).toFixed(1)}%p. `+(final<v.reserve?'목표 여유에 미달합니다.':'목표 여유 이상입니다.'))+' 충전 전 정차 소비량과 충전량은 입력 가정이며 실제 도착과 충전량은 달라질 수 있습니다. 하루 계산과 알림에 반영하려면 충전 계획 포함을 선택하고 계획을 다시 계산하세요.';
 };
 for(const id of ['soc','cap','eff','reserve','distance','hours','power','charger-distance','charge-added','charge-before-idle']) el(id).addEventListener('input',()=>{el('charge-scenario-result').textContent='입력값이 변경됐습니다. 충전 후 귀가 잔량을 다시 계산해 주세요.';});
 for(const id of ['charger-distance','charge-before-idle','charge-power']) el(id).addEventListener('input',()=>{el('charge-result').textContent='입력값이 변경됐습니다. 충전 계획을 다시 계산해 주세요.';});
 el('save-history').onclick=()=>{if(historyLocked){el('history').textContent='기록 원본을 보호 중이어서 새로 저장할 수 없습니다. 먼저 기록 내보내기를 사용하세요.';return;}const prediction=read('ev-day-last-prediction-v1',null),input=el('actual-soc'),actual=Number(input.value);if(!prediction||!Number.isFinite(prediction.raw)||!input.value||!input.checkValidity()||!Number.isFinite(actual)){el('history').textContent='먼저 계획 계산을 실행하고 실제 종료 잔량을 입력해 주세요.';return;}if(prediction.raw<=0){el('history').textContent='계산상 도중 소진된 일정은 정확한 종료 예측이 없어 비교 기록할 수 없습니다.';return;}const predictionId=prediction.id||String(prediction.createdAt||'');if(predictionId&&history.some(h=>h.predictionId===predictionId)){el('history').textContent='이미 기록한 예측입니다. 새 일정을 계산한 뒤 기록해 주세요.';return;}const row={predictionId,date:new Date().toLocaleString('ko-KR'),predicted:Math.max(0,prediction.raw),actual,inputs:prediction.inputs||null,noCharge:el('no-charge').checked&&!prediction.charge,charge:prediction.charge||null,route:typeof prediction.route==='string'?prediction.route:'미입력'};const nextHistory=history.concat([row]).slice(-100);if(!write(historyKey,nextHistory)){el('history').textContent='기록을 저장하지 못했습니다.';return;}history=nextHistory;showHistory();};
 el('suggest-eff').onclick=()=>{if(historyLocked){el('eff-suggestion').textContent='읽을 수 없는 기록이 있어 참고 전비를 표시하지 않습니다. 원본을 내보내 확인하세요.';return;}const estimates=[];for(const h of history){const v=h.inputs;if(!h.noCharge||!v||![v.soc,v.cap,v.distance,v.hours,v.power,h.actual].every(Number.isFinite)||v.distance<=0||h.actual>=v.soc)continue;const total=(v.soc-h.actual)*v.cap/100,drive=total-v.hours*v.power;if(drive>0)estimates.push(v.distance/drive);}if(estimates.length<3){el('eff-suggestion').textContent='충전 없이 실제 거리가 일치한 기록이 3개 이상 필요합니다. 정차 전력은 입력한 가정을 사용합니다.';return;}estimates.sort((a,b)=>a-b);const m=estimates.length,median=m%2?estimates[(m-1)/2]:(estimates[m/2-1]+estimates[m/2])/2;el('eff-suggestion').textContent=`사용자 확인 ${m}건의 참고 전비 중앙값 ${median.toFixed(1)} km/kWh. 배터리 용량·정차 소비 입력과 잔량 표시 오차에 영향을 받으며 실제 정확도 향상은 검증되지 않았습니다. 자동으로 적용하지 않습니다.`;};
 el('delete-history').onclick=()=>{if(!window.confirm('이 기기에 저장한 운행 기록을 모두 삭제할까요?'))return;try{localStorage.removeItem(historyKey);}catch(_){el('history').textContent='기록을 삭제하지 못했습니다.';return;}history=[];historyLocked=false;showHistory();};showHistory();
})();
