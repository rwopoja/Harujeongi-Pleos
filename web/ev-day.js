'use strict';
(function(){
 const ids=['soc','cap','eff','reserve','distance','hours','power'];
 const defaults={soc:70,cap:60,eff:5,reserve:20,distance:90,hours:0,power:0}, key='ev-day-inputs-v1';
 const el=id=>document.getElementById(id);
 let saved;try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch(_){}
 if(saved&&typeof saved==='object')for(const id of ids)if(Number.isFinite(saved[id]))el(id).value=saved[id];
 el('form').addEventListener('submit',e=>{
  e.preventDefault();
  // Clear the current display before validation: later listeners must not treat
  // an earlier forecast as the result of this failed calculation.
  el('result').textContent='입력값을 확인하고 계획을 다시 계산해 주세요.';
  if(!el('form').reportValidity())return;
  const v=Object.fromEntries(ids.map(id=>[id,Number(el(id).value)]));
  if(ids.some(id=>!Number.isFinite(v[id]))||v.cap<=0||v.eff<=0){el('result').textContent='입력값을 확인해 주세요.';return;}
  const drive=v.distance/v.eff,rest=v.hours*v.power,total=drive+rest;
  let raw=v.soc-total/v.cap*100,charge=null,detail='';
  if(el('charge-included').checked){
   const fields=['charger-distance','charge-added','charge-before-idle'];
   if(fields.some(id=>el(id).value===''||!el(id).checkValidity()||!Number.isFinite(Number(el(id).value)))){
    el('result').textContent='충전소까지 거리, 충전량과 충전 전 정차 소비량을 모두 확인해 주세요.';return;
   }
   const leg=Number(el('charger-distance').value),added=Number(el('charge-added').value),before=Number(el('charge-before-idle').value);
   if(leg>v.distance || before>rest+1e-9){el('result').textContent='충전소까지 거리는 전체 거리 이하여야 하며, 충전 전 정차 소비량은 전체 정차 소비량 이하여야 합니다.';return;}
   const arrivalEnergy=v.soc*v.cap/100-leg/v.eff-before;
   if(arrivalEnergy<=0){el('result').textContent='계산상 충전소에 도착하기 전에 배터리가 소진됩니다. 더 가까운 충전 계획을 확인하세요.';return;}
   if(arrivalEnergy+added>v.cap+1e-9){el('result').textContent='충전소 도착 잔량과 충전량의 합이 배터리 용량을 넘습니다. 충전량을 확인하세요.';return;}
   raw=(arrivalEnergy+added-(drive-leg/v.eff)-(rest-before))/v.cap*100;
   charge={station:el('charger-name').value.trim(),distance:leg,added,beforeIdle:before,arrivalSoc:arrivalEnergy/v.cap*100};
   detail=`\n충전소 도착 예상 ${charge.arrivalSoc.toFixed(1)}% · 배터리 유입 충전 ${added.toFixed(1)} kWh 반영`;
  }
  let text=`예상 소비 ${total.toFixed(1)} kWh (주행 ${drive.toFixed(1)} + 정차 ${rest.toFixed(1)})${detail}\n`;
  if(raw<=0)text+='계산상 일정 종료 전 배터리가 소진됩니다. 충전 계획을 다시 확인하세요.';
  else {text+=`일정 종료 예상 잔량 ${raw.toFixed(1)}% · 목표 여유 대비 ${(raw-v.reserve).toFixed(1)}%p\n`;text+=raw<v.reserve?'입력한 조건에서 목표 여유에 미달합니다. 충전 계획을 확인하세요.':'입력한 조건에서는 목표 여유 이상입니다. 실제 보장은 아닙니다.';}
  if(charge)text+='\n충전 전 정차 소비량과 배터리 유입 충전량은 사용자가 입력한 가정입니다. 실제 충전 속도와 도착 가능 여부는 달라질 수 있습니다.';
  el('result').innerText=text;el('result').style.whiteSpace='pre-line';
  try{localStorage.setItem(key,JSON.stringify(v));localStorage.setItem('ev-day-last-prediction-v1',JSON.stringify({raw,inputs:v,charge,id:String(Date.now())+'-'+Math.random().toString(36).slice(2),route:el('route').value.trim()||'미입력',createdAt:Date.now()}));}catch(_){el('result').innerText+='\n입력값을 저장하지 못했습니다.';}
 });
 for(const id of ['charger-distance','charge-added','charge-before-idle','charge-included'])el(id).addEventListener(id==='charge-included'?'change':'input',()=>{
  el('result').textContent='충전 계획이 변경됐습니다. 계획을 다시 계산해 주세요.';
 });
 el('clear').addEventListener('click',()=>{for(const id of ids)el(id).value=defaults[id];el('charge-included').checked=false;el('charge-before-idle').value='';try{localStorage.removeItem(key);localStorage.removeItem('ev-day-last-prediction-v1');}catch(_){}el('result').textContent='입력값을 초기화했습니다.';});
})();
