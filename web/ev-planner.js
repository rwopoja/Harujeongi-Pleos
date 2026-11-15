'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const STORE = 'ev-planner-v2';
  const emptyPoint = name => ({name: name || '', lat: null, lon: null, label: '', stopHours: 0, stopPower: 0});
  let plan;
  try { plan = JSON.parse(localStorage.getItem(STORE)); } catch (_) {}
  if (!plan || !plan.origin || !Array.isArray(plan.stops)) plan = {origin: emptyPoint(), stops: []};
  const clean = point => {
    if (!point || typeof point.name !== 'string') return emptyPoint();
    const cleanPoint = emptyPoint(point.name.slice(0, 150));
    if (Number.isFinite(point.stopHours) && point.stopHours >= 0 && point.stopHours <= 24) cleanPoint.stopHours = point.stopHours;
    else if ('stopHours' in point) cleanPoint.stopHours = null;
    if (Number.isFinite(point.stopPower) && point.stopPower >= 0 && point.stopPower <= 20) cleanPoint.stopPower = point.stopPower;
    else if ('stopPower' in point) cleanPoint.stopPower = null;
    if (Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 && Number.isFinite(point.lon) && Math.abs(point.lon) <= 180 && typeof point.label === 'string') {
      cleanPoint.lat = point.lat; cleanPoint.lon = point.lon; cleanPoint.label = point.label.slice(0, 500);
    }
    return cleanPoint;
  };
  plan.origin = clean(plan.origin); plan.stops = plan.stops.slice(0, 8).map(clean);
  let draft = [], revision = 0, serial = 0;
  let stopDerived = false, stopDirty = false;
  try {
    stopDerived = localStorage.getItem('ev-stop-derived-v1') === 'true';
    stopDirty = localStorage.getItem('ev-stop-dirty-v1') === 'true';
  } catch (_) {}
  function setStopDirty(dirty) {
    stopDirty = dirty;
    $('hours').setCustomValidity(dirty ? '변경된 정차 계획을 적용하거나 정차 시간 또는 전력을 직접 입력해 주세요.' : '');
    try { localStorage.setItem('ev-stop-dirty-v1', String(dirty)); } catch (_) {}
    if (dirty) $('stop-energy-status').textContent = '정차 계획을 다시 적용하거나 정차 시간 또는 전력을 직접 입력해 주세요.';
  }
  setStopDirty(stopDirty);
  function stopStructureChanged() { if (stopDerived) setStopDirty(true); }
  for (const id of ['hours', 'power']) $(id).addEventListener('input', () => {
    stopDerived = false;
    try { localStorage.removeItem('ev-stop-derived-v1'); } catch (_) {}
    setStopDirty(false);
  });
  $('clear').addEventListener('click', () => {
    stopDerived = false;
    try { localStorage.removeItem('ev-stop-derived-v1'); } catch (_) {}
    setStopDirty(false);
  });
  let distanceFromRoute = false;
  try {
    distanceFromRoute = localStorage.getItem('ev-route-distance-derived-v1') === 'true';
    if (localStorage.getItem('ev-route-distance-invalid-v1') === 'true') $('distance').value = '';
  } catch (_) {}
  const pending = new Map();
  let uxRestricted = !!window.HaruNative;
  const uxDisabled = new WeakMap();
  const voiceAllowed = new Set(['start-voice','voice-route','speak-result']);
  function applyUx() {
    for (const control of document.querySelectorAll('button,input,select,textarea')) {
      if (voiceAllowed.has(control.id)) continue;
      if (uxRestricted) {
        if (!uxDisabled.has(control)) uxDisabled.set(control, control.disabled);
        control.disabled = true;
      } else if (uxDisabled.has(control)) {
        control.disabled = uxDisabled.get(control); uxDisabled.delete(control);
      }
    }
  }
  window.addEventListener('ev-ux', event => {
    const d = event.detail || {};
    uxRestricted = d.restricted !== false;
    $('ux-status').textContent = d.state === 'phone'
      ? '일반 Android 기기 시험 화면 · 차량 주행 상태는 확인하지 않습니다.'
      : d.state === 'unknown'
        ? '차량 주행 제한 상태를 확인할 수 없어 입력과 검색을 잠갔습니다.'
        : uxRestricted ? '차량의 주행 제한이 적용되어 입력과 검색을 잠갔습니다. 음성 안내를 이용하세요.'
        : '차량에서 입력 제한이 없는 상태로 확인됐습니다.';
    applyUx();
  });
  const uxObserver = new MutationObserver(() => { if (uxRestricted) applyUx(); });
  uxObserver.observe(document.body, {childList:true,subtree:true});
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(plan)); } catch (_) { $('map-status').textContent = '계획을 기기에 저장하지 못했습니다.'; } };
  const syncRouteText = () => {
    const names = plan.stops.map(p => p.name.trim()).filter(Boolean);
    $('route').value = names.join(' → ');
    if (names.length) $('save-route').click();
    else { try { localStorage.removeItem('ev-day-route-v1'); } catch (_) {} }
  };
  const changed = () => {
    revision++;
    if (distanceFromRoute) {
      $('distance').value = '';
      $('charger-distance').value = '';
      $('charger-name').value = '';
      distanceFromRoute = false;
      try { localStorage.removeItem('ev-route-distance-derived-v1'); localStorage.setItem('ev-route-distance-invalid-v1', 'true'); } catch (_) {}
    }
    $('map-status').textContent = '장소가 바뀌었습니다. 장소를 확인하고 경로를 다시 계산해 주세요.';
    $('result').textContent = '일정이 변경됐습니다. 거리와 차량 정보를 확인하고 다시 계산해 주세요.';
    $('charge-result').textContent = '일정이 변경됐습니다. 충전 계획을 다시 계산해 주세요.';
    $('charge-scenario-result').textContent = '일정이 변경됐습니다. 충전 후 귀가 잔량을 다시 계산해 주세요.';
    $('charger-list').replaceChildren();
    save();
  };
  const coordinate = point => point && Number.isFinite(point.lat) && Number.isFinite(point.lon)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
  const button = (label, action, className = 'option') => {
    const b = document.createElement('button'); b.type = 'button'; b.className = className; b.textContent = label;
    b.addEventListener('click', action); return b;
  };
  const describe = point => coordinate(point) ? '확인됨: ' + point.label : '검색 결과를 선택해 주세요.';

  // This intentionally extracts only common connectors, then asks the user to confirm.
  function parseStops(text) {
    let value = String(text || '').trim().replace(/^(오늘(?:은|은요)?|일정은|저는|나는|일단)\s*/g, '');
    value = value.replace(/(?:에|으로|로)?\s*(?:들렀다가|들렸다가|갔다가|다녀왔다가|들르고|들러서|거쳐서|간\s*다음(?:에)?|다음으로|이동하고|가고|그리고|그다음|다음에)\s*/g, ' → ');
    value = value.replace(/(?:에|으로|로)?\s*(?:가려고\s*해요|갈\s*거(?:야|예요|에요)?|갈게요?|갑니다|가겠습니다|갈래요|가요|간다)\s*[.!?。]*$/g, '');
    return value.split(/\s*(?:→|->|,|，|\n)\s*/).map(x => x.trim().replace(/^(?:그리고|그다음|그 다음)\s*/, '').replace(/(?:에|으로|까지)$/, '').trim()).filter(Boolean).slice(0, 8);
  }
  window.EvPlanner = {parseStops};
  function preview(text, speak) {
    draft = parseStops(text);
    $('draft-status').textContent = draft.length ? '인식한 순서: ' + draft.join(' → ') + '. 장소를 확인한 뒤 적용해 주세요.' : '장소를 나누지 못했습니다. 쉼표나 화살표로 구분해 주세요.';
    $('apply-draft').hidden = !draft.length;
    if (speak && draft.length) say('말씀하신 일정은 ' + draft.join(', 그리고 ') + '입니다. 화면에서 확인해 주세요.');
  }
  function say(text) {
    if (!text || !window.HaruNative || !window.HaruNative.speak) {
      $('speak-status').textContent = '이 기기의 한국어 음성 출력 기능이 필요합니다.'; return;
    }
    $('speak-status').textContent = '음성 안내 요청 중';
    window.HaruNative.speak(text, 'ko-KR', 'ev-day-result');
  }
  $('speak-result').addEventListener('click', () => say($('result').innerText || $('result').textContent));
  window.addEventListener('haru-audio', e => {
    if (e.detail && e.detail.id === 'ev-day-result') $('speak-status').textContent = e.detail.error ? '한국어 음성 출력이 준비되지 않았습니다.' : '음성 안내 완료';
  });
  $('parse-plan').addEventListener('click', () => preview($('route').value, false));
  $('start-voice').addEventListener('click', () => {
    $('voice-route').click();
    $('voice-status').scrollIntoView({behavior:'smooth',block:'center'});
  });
  for (const tab of document.querySelectorAll('[data-jump]')) {
    tab.addEventListener('click', () => {
      const target = $(tab.getAttribute('data-jump'));
      if (target) target.scrollIntoView({behavior:'smooth',block:'start'});
    });
  }
  window.addEventListener('haru-voice', e => {
    const heard = String(e.detail?.text || '').trim();
    if (!heard) return;
    $('voice-status').textContent = '인식: ' + heard;
    let reply = '';
    if (/(?:일정|계획).*(?:변경|바뀌|바꿀|달라)/.test(heard))
      reply = '변경된 출발지와 경유지를 말씀해 주세요. 장소를 확인한 후 다시 계산하겠습니다.';
    else if (/(?:새|새로운)\s*(?:일정|계획)/.test(heard))
      reply = '새 일정을 시작하려면 화면에서 새 일정을 선택한 뒤 경유지를 말씀해 주세요.';
    else if (/(?:이어|계속).*(?:일정|계획)|(?:일정|계획).*(?:이어|계속)/.test(heard))
      reply = '저장한 일정을 이어가려면 현재 배터리와 남은 거리를 확인하고 다시 계산해 주세요.';
    else if (/(?:충전).*(?:필요\s*없|안\s*할|하지\s*않)/.test(heard))
      reply = '충전 없이 진행할 경우 현재 예상 잔량과 목표 여유를 확인해 주세요.';
    else if (/(?:배터리|잔량|결과).*(?:알려|얼마|몇)|(?:얼마|몇).*(?:배터리|잔량)/.test(heard))
      reply = $('result').innerText || $('result').textContent;
    if (reply) {
      $('draft-status').textContent = reply; $('apply-draft').hidden = true; say(reply);
    } else {
      $('route').value = heard; preview(heard, true);
    }
  });
  $('apply-draft').addEventListener('click', () => {
    if (!draft.length) return;
    stopStructureChanged();
    plan.stops = draft.map(emptyPoint);
    $('route').value = draft.join(' → ');
    $('save-route').click(); $('apply-draft').hidden = true;
    changed(); render();
    $('draft-status').textContent = '경유지에 적용했습니다. 각 장소를 검색해 올바른 위치를 선택하세요.';
  });
  $('add-stop').addEventListener('click', () => {
    if (plan.stops.length >= 8) { $('map-status').textContent = '목적지는 최대 8개입니다.'; return; }
    stopStructureChanged();
    plan.stops.push(emptyPoint()); changed(); render();
  });
  $('origin').value = plan.origin.name || '';
  try {
    const provider = localStorage.getItem('ev-geocode-provider-v1');
    if (provider) $('geocode-endpoint').value = provider;
  } catch (_) {}
  $('geocode-endpoint').addEventListener('change', () => {
    try { localStorage.setItem('ev-geocode-provider-v1', $('geocode-endpoint').value.trim()); } catch (_) {}
  });
  $('origin').addEventListener('input', () => {
    plan.origin = emptyPoint($('origin').value.trim()); $('origin-results').replaceChildren(); changed();
  });

  function request(payload) {
    if (!$('map-consent').checked) return Promise.reject(new Error('외부 지도 서비스 전송에 동의해 주세요.'));
    if (!window.HaruNative || !window.HaruNative.mapRequest) return Promise.reject(new Error('설치형 앱의 지도 연결이 필요합니다.'));
    const id = String(Date.now() * 100 + (++serial % 100));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('응답 시간이 초과됐습니다.')); }, 45000);
      pending.set(id, {resolve, reject, timer});
      try { window.HaruNative.mapRequest(id, JSON.stringify(payload)); }
      catch (_) { clearTimeout(timer); pending.delete(id); reject(new Error('지도 연결을 시작하지 못했습니다.')); }
    });
  }
  window.addEventListener('ev-map-result', event => {
    const detail = event.detail || {}, p = pending.get(String(detail.id));
    if (!p) return;
    clearTimeout(p.timer); pending.delete(String(detail.id));
    const result = detail.result || {};
    if (result.ok) p.resolve(result.data); else p.reject(new Error(result.error || '검색에 실패했습니다.'));
  });
  async function searchPoint(point, container) {
    const query = point.name.trim();
    if (!query) { container.textContent = '장소명이나 주소를 입력해 주세요.'; return; }
    const at = revision; container.textContent = '장소 검색 중…';
    try {
      const data = await request({type:'geocode', query, endpoint:$('geocode-endpoint').value.trim()});
      if (at !== revision) return;
      container.replaceChildren();
      if (!Array.isArray(data) || !data.length) { container.textContent = '검색 결과가 없습니다. 더 구체적인 주소로 다시 검색하세요.'; return; }
      for (const row of data.slice(0, 5)) {
        const lat = Number(row.lat), lon = Number(row.lon), label = String(row.display_name || '');
        if (!coordinate({lat, lon}) || !label) continue;
        container.append(button(label, () => {
          point.lat = lat; point.lon = lon; point.label = label; changed(); render();
          $('map-status').textContent = '장소를 확인했습니다. 모든 경유지를 확인한 뒤 경로를 계산하세요.';
        }));
      }
      if (!container.childNodes.length) container.textContent = '유효한 위치를 찾지 못했습니다.';
    } catch (e) { if (at === revision) container.textContent = e.message; }
  }
  $('origin-search').addEventListener('click', () => searchPoint(plan.origin, $('origin-results')));
  function render() {
    $('origin').value = plan.origin.name || '';
    $('origin-results').textContent = describe(plan.origin);
    const host = $('points'); host.replaceChildren();
    plan.stops.forEach((point, i) => {
      const card = document.createElement('div'); card.className = 'point';
      const heading = document.createElement('div'); heading.className = 'row-head'; heading.textContent = '목적지 ' + (i + 1);
      const input = document.createElement('input'); input.value = point.name; input.maxLength = 150; input.placeholder = '장소명 또는 주소';
      input.setAttribute('aria-label', '목적지 ' + (i + 1));
      const results = document.createElement('div'); results.textContent = describe(point);
      input.addEventListener('input', () => { point.name = input.value.trim(); point.lat = null; point.lon = null; point.label = ''; results.textContent = describe(point); syncRouteText(); changed(); });
      const search = button('이 장소 검색', () => searchPoint(point, results), 'sub');
      const remove = button('삭제', () => { plan.stops.splice(i, 1); syncRouteText(); stopStructureChanged(); changed(); render(); }, 'sub');
      const up = button('앞으로', () => { if (i > 0) { [plan.stops[i - 1], plan.stops[i]] = [plan.stops[i], plan.stops[i - 1]]; syncRouteText(); changed(); render(); } }, 'sub');
      const hours = document.createElement('input'); hours.type = 'number'; hours.min = '0'; hours.max = '24'; hours.step = 'any'; hours.value = point.stopHours; hours.setAttribute('aria-label', '목적지 ' + (i + 1) + ' 차량 전기 사용 시간');
      const power = document.createElement('input'); power.type = 'number'; power.min = '0'; power.max = '20'; power.step = 'any'; power.value = point.stopPower; power.setAttribute('aria-label', '목적지 ' + (i + 1) + ' 정차 평균 소비전력');
      const hoursLabel = document.createElement('label'); hoursLabel.textContent = '차량에서 전기를 쓰는 시간 (시간)'; hoursLabel.append(hours);
      const powerLabel = document.createElement('label'); powerLabel.textContent = '그 시간의 평균 소비전력 (kW)'; powerLabel.append(power);
      for (const [field, key] of [[hours, 'stopHours'], [power, 'stopPower']]) field.addEventListener('input', () => {
        const value = field.value === '' ? null : Number(field.value);
        point[key] = value; setStopDirty(true); save();
        $('stop-energy-status').textContent = '정차 계획이 변경됐습니다. 정차 에너지 적용 버튼을 다시 눌러 주세요.';
        $('result').textContent = '정차 계획이 변경됐습니다. 정차 에너지를 적용하고 계획을 다시 계산해 주세요.';
        $('charge-result').textContent = '정차 계획이 변경됐습니다. 정차 에너지를 적용하고 충전 계획을 다시 계산해 주세요.';
        $('charge-scenario-result').textContent = '정차 계획이 변경됐습니다. 정차 에너지를 적용하고 다시 계산해 주세요.';
      });
      card.append(heading, input, search, up, remove, results, hoursLabel, powerLabel); host.append(card);
    });
    const anchor = $('charger-anchor'); anchor.replaceChildren();
    [plan.origin, ...plan.stops].forEach((p, i) => {
      const option = document.createElement('option'); option.value = String(i);
      option.textContent = (i === 0 ? '출발지' : '목적지 ' + i) + (p.name ? ' · ' + p.name : '');
      anchor.append(option);
    });
  }
  function selectedPoints() {
    const points = [plan.origin, ...plan.stops];
    if (points.length < 2 || points.some(p => !coordinate(p))) throw new Error('출발지와 모든 목적지의 검색 결과를 선택해 주세요.');
    return points;
  }
  async function roadRoute(points) {
    const data = await request({type:'route', points: points.map(p => ({lat:p.lat, lon:p.lon}))});
    const route = data && data.code === 'Ok' && Array.isArray(data.routes) && data.routes[0];
    if (!route || !Number.isFinite(route.distance) || route.distance <= 0 || route.distance > 3000000 || !Array.isArray(route.legs) || route.legs.length !== points.length - 1 || route.legs.some(l => !Number.isFinite(l.distance) || l.distance < 0))
      throw new Error('도로 경로를 계산하지 못했습니다. 장소와 도로 연결을 확인하세요.');
    return route;
  }
  function applyDistance(km) {
    $('distance').value = km.toFixed(1);
    distanceFromRoute = true;
    try { localStorage.setItem('ev-route-distance-derived-v1', 'true'); localStorage.removeItem('ev-route-distance-invalid-v1'); } catch (_) {}
    $('form').dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}));
  }
  $('distance').addEventListener('input', () => {
    distanceFromRoute = false;
    try { localStorage.removeItem('ev-route-distance-derived-v1'); localStorage.removeItem('ev-route-distance-invalid-v1'); } catch (_) {}
  });
  $('apply-stop-energy').addEventListener('click', () => {
    if (!plan.stops.length) { $('stop-energy-status').textContent = '목적지를 추가한 뒤 정차 계획을 입력해 주세요.'; return; }
    if (plan.stops.some(p => !Number.isFinite(p.stopHours) || p.stopHours < 0 || p.stopHours > 24 || !Number.isFinite(p.stopPower) || p.stopPower < 0 || p.stopPower > 20)) {
      $('stop-energy-status').textContent = '각 장소의 시간은 0~24시간, 소비전력은 0~20kW로 입력해 주세요.'; return;
    }
    const hours = plan.stops.reduce((sum, p) => sum + p.stopHours, 0);
    if (hours > 24) { $('stop-energy-status').textContent = '전기 사용 시간의 합계는 24시간 이하여야 합니다.'; return; }
    const energy = plan.stops.reduce((sum, p) => sum + p.stopHours * p.stopPower, 0);
    $('hours').value = String(hours); $('power').value = String(hours ? energy / hours : 0);
    $('hours').dispatchEvent(new Event('input', {bubbles:true}));
    $('power').dispatchEvent(new Event('input', {bubbles:true}));
    stopDerived = true; setStopDirty(false);
    try {
      localStorage.setItem('ev-stop-derived-v1', 'true');
      const savedInputs = JSON.parse(localStorage.getItem('ev-day-inputs-v1') || '{}');
      savedInputs.hours = hours; savedInputs.power = hours ? energy / hours : 0;
      localStorage.setItem('ev-day-inputs-v1', JSON.stringify(savedInputs));
    } catch (_) { $('stop-energy-status').textContent = '정차 계획을 저장하지 못했습니다. 다시 적용해 주세요.'; setStopDirty(true); return; }
    $('stop-energy-status').textContent = '정차 전력 합계 ' + energy.toFixed(2) + ' kWh를 계획 입력값에 반영했습니다. 계획 계산하기를 눌러 주세요.';
  });
  $('route-search').addEventListener('click', async () => {
    const at = revision; $('map-status').textContent = '선택한 장소로 도로 경로를 계산하고 있습니다…';
    try {
      const points = selectedPoints(), route = await roadRoute(points);
      if (at !== revision) return;
      applyDistance(route.distance / 1000);
      $('map-status').textContent = '공개 지도 도로 거리 약 ' + (route.distance / 1000).toFixed(1) + ' km를 계산에 반영했습니다. 교통·실시간 내비 경로와 다를 수 있습니다.';
    } catch (e) { if (at === revision) $('map-status').textContent = e.message; }
  });
  const radians = d => d * Math.PI / 180;
  function straightDistance(a, b) {
    const dlat = radians(b.lat-a.lat), dlon = radians(b.lon-a.lon);
    const h = Math.sin(dlat/2)**2 + Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dlon/2)**2;
    return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  let naviLocation = null, pendingDestination = null;
  $('connect-navi').addEventListener('click', () => {
    if (!window.HaruNative || !window.HaruNative.observeNavi) {
      $('navi-status').textContent = 'Pleos 설치형 앱에서 사용할 수 있습니다.'; return;
    }
    $('navi-status').textContent = 'Pleos 내비 연결 요청 중…';
    window.HaruNative.observeNavi();
  });
  window.addEventListener('ev-navi', event => {
    const data = event.detail || {}, value = data.value;
    if (data.event === 'location' && coordinate(value) && !(value.lat === 0 && value.lon === 0)) {
      naviLocation = {lat:value.lat,lon:value.lon,address:String(value.address || ''),receivedAt:Date.now()};
      $('navi-location-status').textContent = '내비 현재 위치를 받았습니다. 출발지로 사용할지 선택하세요.';
      $('use-navi-location').hidden = false;
    } else if (data.event === 'destination' && coordinate(value) && !(value.lat === 0 && value.lon === 0)) {
      const verified = plan.stops.filter(coordinate);
      const matches = verified.some(stop => straightDistance(stop, value) <= 0.5);
      pendingDestination = null; $('navi-add-destination').hidden = true;
      if (verified.length && !matches) {
        pendingDestination = {name:String(value.name || '내비 목적지').slice(0,150),lat:value.lat,lon:value.lon,receivedAt:Date.now()};
        $('navi-status').textContent = '내비 목적지 ' + pendingDestination.name + '가 확인된 일정 장소와 다릅니다. 일정이 바뀌었나요?';
        $('navi-add-destination').hidden = false;
        $('navi-change').hidden = false; $('navi-keep').hidden = false;
      } else {
        $('navi-status').textContent = '내비 목적지: ' + String(value.name || '이름 없음') + (matches ? ' · 확인된 일정 장소와 일치' : ' · 저장한 일정 장소를 먼저 확인해 주세요.');
        $('navi-change').hidden = true; $('navi-keep').hidden = true;
      }
    } else if (data.event === 'waypoint_changed') {
      pendingDestination = null; $('navi-add-destination').hidden = true;
      $('navi-status').textContent = '내비 경유지가 변경됐습니다. 저장한 일정도 바뀌었나요?';
      $('navi-change').hidden = false; $('navi-keep').hidden = false;
    } else if (data.event === 'error' || data.event === 'status' || data.event === 'changed') {
      $('navi-status').textContent = String(value || '내비 상태를 확인해 주세요.');
    }
  });
  $('navi-change').addEventListener('click', () => {
    pendingDestination = null; $('navi-add-destination').hidden = true;
    $('navi-change').hidden = true; $('navi-keep').hidden = true;
    $('voice-route').click(); $('voice-status').scrollIntoView({behavior:'smooth',block:'center'});
  });
  $('navi-add-destination').addEventListener('click', () => {
    if (!pendingDestination || Date.now() - pendingDestination.receivedAt > 120000) {
      pendingDestination = null; $('navi-add-destination').hidden = true;
      $('navi-status').textContent = '목적지 정보가 오래됐습니다. 내비 연결 및 일정 확인을 다시 눌러 주세요.'; return;
    }
    if (plan.stops.length >= 8) { $('navi-status').textContent = '목적지는 최대 8개입니다. 기존 장소를 정리해 주세요.'; return; }
    if (plan.stops.some(p => coordinate(p) && straightDistance(p,pendingDestination) <= 0.5)) {
      pendingDestination = null; $('navi-add-destination').hidden = true;
      $('navi-status').textContent = '이미 확인된 일정에 있는 장소입니다.'; return;
    }
    const p = pendingDestination;
    plan.stops.unshift({...emptyPoint(p.name),lat:p.lat,lon:p.lon,label:'Pleos 내비 목적지 · '+p.name});
    pendingDestination = null; $('navi-add-destination').hidden = true;
    $('navi-change').hidden = true; $('navi-keep').hidden = true;
    stopStructureChanged();
    syncRouteText(); changed(); render();
    $('navi-status').textContent = '기존 계획 맨 앞에 목적지를 추가했습니다. 이미 방문한 장소를 정리하고 현재 위치를 확인한 뒤 도로 경로를 다시 계산하세요.';
  });
  $('use-navi-location').addEventListener('click', () => {
    if (!naviLocation || Date.now() - naviLocation.receivedAt > 120000) {
      $('navi-location-status').textContent = '위치가 오래됐습니다. 내비 연결 및 일정 확인을 다시 눌러 주세요.'; return;
    }
    plan.origin = {name:'내비 현재 위치',lat:naviLocation.lat,lon:naviLocation.lon,label:naviLocation.address || 'Pleos 내비 현재 위치'};
    changed(); render();
    $('navi-location-status').textContent = '현재 위치를 출발지로 선택했습니다. 외부 도로 경로 계산 시 좌표가 전송됩니다.';
  });
  $('navi-keep').addEventListener('click', () => {
    pendingDestination = null; $('navi-add-destination').hidden = true;
    $('navi-change').hidden = true; $('navi-keep').hidden = true;
    $('navi-status').textContent = '저장한 일정을 유지합니다. 현재 위치와 남은 거리를 확인해 주세요.';
  });
  $('find-chargers').addEventListener('click', async () => {
    const at = revision, host = $('charger-list'), index = Number($('charger-anchor').value);
    host.textContent = '공개 지도에서 주변 충전소를 검색하고 있습니다…';
    try {
      const points = selectedPoints(), anchor = points[index];
      if (!anchor) throw new Error('검색할 위치를 선택해 주세요.');
      const data = await request({type:'chargers', lat:anchor.lat, lon:anchor.lon});
      if (at !== revision) return;
      const stations = (Array.isArray(data.elements) ? data.elements : []).map(e => ({
        lat: Number(e.lat ?? e.center?.lat), lon: Number(e.lon ?? e.center?.lon),
        name: String(e.tags?.name || e.tags?.operator || '이름 없는 충전소')
      })).filter(coordinate).map(s => ({...s, straight:straightDistance(anchor,s)})).sort((a,b) => a.straight-b.straight).slice(0,6);
      host.replaceChildren();
      if (!stations.length) { host.textContent = '공개 지도에서 주변 충전소를 찾지 못했습니다. 다른 위치를 선택하거나 직접 입력해 주세요.'; return; }
      const note = document.createElement('p'); note.textContent = '선택한 위치에서 직선거리 기준입니다. 영업·고장·사용 가능 여부는 확인되지 않았습니다.'; host.append(note);
      stations.forEach(station => host.append(button(station.name + ' · 직선 약 ' + station.straight.toFixed(1) + ' km · 경유 계산', async () => {
        const current = revision; host.textContent = '충전소를 경유하는 도로 경로를 계산하고 있습니다…';
        try {
          const updated = selectedPoints().slice(), insertAt = Math.max(1, index);
          updated.splice(insertAt, 0, station);
          const route = await roadRoute(updated);
          if (current !== revision) return;
          const km = route.distance / 1000;
          const toStation = route.legs.slice(0, insertAt).reduce((sum, leg) => sum + leg.distance, 0) / 1000;
          host.replaceChildren();
          const text = document.createElement('p');
          text.textContent = station.name + ' 경유 시 전체 도로 거리 약 ' + km.toFixed(1) + ' km, 충전소까지 약 ' + toStation.toFixed(1) + ' km. 경로·운영 여부를 확인해 주세요.';
          host.append(text, button('이 충전 계획 적용', () => {
            if (current !== revision) { host.textContent = '일정이 변경되어 다시 검색해야 합니다.'; return; }
            $('charger-name').value = station.name;
            $('charger-distance').value = toStation.toFixed(1);
            applyDistance(km); $('charge-calc').click();
            host.append(document.createTextNode(' 계산에 반영했습니다. 아래에서 충전 전력과 결과를 확인하세요.'));
          }, 'sub'));
        } catch (e) { if (current === revision) host.textContent = e.message; }
      })));
    } catch (e) { if (at === revision) host.textContent = e.message; }
  });
  const resume = $('resume-status').textContent;
  if (resume) { $('resume-current').hidden = false; $('resume-new').hidden = false; }
  $('resume-current').addEventListener('click', () => { $('resume-status').textContent = '저장한 일정을 이어갑니다. 현재 배터리와 남은 거리부터 다시 확인해 주세요.'; $('resume-current').hidden = true; $('resume-new').hidden = true; });
  $('resume-new').addEventListener('click', () => {
    $('new-route').click();
    $('resume-current').hidden = true; $('resume-new').hidden = true;
  });
  $('new-route').addEventListener('click', () => {
    stopStructureChanged();
    plan = {origin:emptyPoint(), stops:[]}; draft = []; $('apply-draft').hidden = true;
    $('draft-status').textContent = ''; changed(); render();
  });
  // Keep the previous prediction snapshot for later history entry, but never leave
  // its result presented as current after a user changes a calculation input.
  for (const id of ['soc','cap','eff','reserve','distance','hours','power']) {
    $(id).addEventListener('input', () => {
      $('result').textContent = '입력값이 변경됐습니다. 계획을 다시 계산해 주세요.';
      $('charge-result').textContent = '입력값이 변경됐습니다. 충전 계획을 다시 계산해 주세요.';
    });
  }
  window.addEventListener('pleos-result', e => {
    if (String(e.detail?.event || '').startsWith('EV_SOC_')) {
      $('result').textContent = '차량 잔량을 갱신했다면 계획을 다시 계산해 주세요.';
      $('charge-result').textContent = '차량 잔량을 확인하고 충전 계획을 다시 계산해 주세요.';
    }
  });
  function historyStats() {
    let rows = [];
    try { rows = JSON.parse(localStorage.getItem('ev-day-history-v1') || '[]'); } catch (_) {}
    if (!Array.isArray(rows)) rows = [];
    rows = rows.filter(h => h.noCharge && Number.isFinite(h.predicted) && Number.isFinite(h.actual));
    $('history-stats').textContent = rows.length < 3
      ? '충전 없이 이동거리가 일치한 확인 기록이 3개 이상이면 과거 예측 오차를 표시합니다.'
      : '확인 기록 ' + rows.length + '건의 평균 절대 오차 ' + (rows.reduce((sum,h) => sum + Math.abs(h.actual-h.predicted),0)/rows.length).toFixed(1) + '%p. 이 값은 과거 기록이며 다음 일정의 오차를 보장하지 않습니다.';
  }
  $('save-history').addEventListener('click', historyStats);
  $('delete-history').addEventListener('click', historyStats);
  $('apply-eff').addEventListener('click', () => {
    let rows = [];
    try { rows = JSON.parse(localStorage.getItem('ev-day-history-v1') || '[]'); } catch (_) {}
    if (!Array.isArray(rows)) rows = [];
    const values = rows.flatMap(h => {
      const v = h.inputs;
      if (!h.noCharge || !v || ![v.soc,v.cap,v.distance,v.hours,v.power,h.actual].every(Number.isFinite) || v.distance <= 0 || h.actual >= v.soc) return [];
      const energy = (v.soc-h.actual)*v.cap/100-v.hours*v.power;
      const efficiency = v.distance/energy;
      return energy > 0 && efficiency >= 0.1 && efficiency <= 20 ? [efficiency] : [];
    }).sort((a,b) => a-b);
    if (values.length < 3) { $('eff-suggestion').textContent = '적용 가능한 확인 기록이 3개 이상 필요합니다.'; return; }
    const n = values.length;
    const median = n % 2 ? values[(n-1)/2] : (values[n/2-1]+values[n/2])/2;
    $('eff').value = median.toFixed(1);
    $('eff').dispatchEvent(new Event('input', {bubbles:true}));
    $('eff-suggestion').textContent = '참고 전비 ' + median.toFixed(1) + ' km/kWh를 적용했습니다. 이번 조건에 적절한지 확인한 뒤 다시 계산하세요.';
  });
  $('export-history').addEventListener('click', () => {
    if (!window.HaruNative || !window.HaruNative.exportData) { $('eff-suggestion').textContent = '설치형 앱에서 기록을 내보낼 수 있습니다.'; return; }
    let rows = [];
    try { rows = JSON.parse(localStorage.getItem('ev-day-history-v1') || '[]'); } catch (_) {}
    window.HaruNative.exportData(JSON.stringify({version:1,history:Array.isArray(rows)?rows:[]}));
    $('eff-suggestion').textContent = '공유할 앱을 선택하세요. 경유지 등 개인 정보가 포함됩니다.';
  });
  $('reminder-set').addEventListener('click', () => {
    if (!window.HaruNative || !window.HaruNative.setReminder) { $('reminder-status').textContent = '설치형 앱에서 사용할 수 있습니다.'; return; }
    $('reminder-status').textContent = '알림을 예약하고 있습니다…';
    window.HaruNative.setReminder(Number($('reminder-minutes').value));
  });
  $('reminder-cancel').addEventListener('click', () => {
    if (!window.HaruNative || !window.HaruNative.cancelReminder) { $('reminder-status').textContent = '설치형 앱에서 사용할 수 있습니다.'; return; }
    window.HaruNative.cancelReminder();
  });
  window.addEventListener('ev-reminder', e => { $('reminder-status').textContent = String(e.detail || ''); });
  let pushPrefs = {};
  try { pushPrefs = JSON.parse(localStorage.getItem('ev-push-v1') || '{}'); } catch (_) {}
  if (!pushPrefs || typeof pushPrefs !== 'object') pushPrefs = {};
  $('push-topic').value = typeof pushPrefs.topic === 'string' && /^harujeongi-[a-f0-9]{48}$/.test(pushPrefs.topic) ? pushPrefs.topic : '';
  $('push-consent').checked = pushPrefs.consent === true;
  $('push-auto').checked = pushPrefs.auto === true && pushPrefs.consent === true;
  if ([15,30,60,120,360].includes(pushPrefs.minutes)) $('push-minutes').value = String(pushPrefs.minutes);
  function savePushPrefs() {
    try { localStorage.setItem('ev-push-v1', JSON.stringify({topic:$('push-topic').value,consent:$('push-consent').checked,auto:$('push-auto').checked,minutes:Number($('push-minutes').value)})); }
    catch (_) { $('push-status').textContent = '알림 설정을 기기에 저장하지 못했습니다.'; }
  }
  for (const id of ['push-consent','push-auto','push-minutes']) $(id).addEventListener('change', () => {
    if (!$('push-consent').checked) $('push-auto').checked = false;
    savePushPrefs();
  });
  $('push-generate').addEventListener('click', () => {
    if ($('push-topic').value && !window.confirm('연결 코드를 바꾸면 휴대폰에서 새 코드로 다시 구독해야 합니다. 이전 예약은 먼저 취소했나요?')) return;
    if (!window.crypto || !window.crypto.getRandomValues) { $('push-status').textContent = '안전한 연결 코드를 만들 수 없는 기기입니다.'; return; }
    const bytes = new Uint8Array(24); window.crypto.getRandomValues(bytes);
    $('push-topic').value = 'harujeongi-' + [...bytes].map(v => v.toString(16).padStart(2,'0')).join('');
    try { localStorage.removeItem('ev-push-pending-v1'); } catch (_) {}
    $('push-auto').checked = false; savePushPrefs();
    $('push-status').textContent = '휴대폰 ntfy 앱에서 이 코드를 구독한 다음 시험 알림을 보내세요.';
  });
  let pushSerial = 0;
  const pushPending = new Map();
  function sendPush(action, low = false) {
    const topic = $('push-topic').value;
    if (!$('push-consent').checked) { $('push-status').textContent = '알림 서비스 전송에 동의해 주세요.'; return; }
    if (!/^harujeongi-[a-f0-9]{48}$/.test(topic)) { $('push-status').textContent = '먼저 연결 코드를 만들어 주세요.'; return; }
    if (!window.HaruNative || !window.HaruNative.pushRequest) { $('push-status').textContent = '설치형 앱에서 사용할 수 있습니다.'; return; }
    const id = String(Date.now()*100+(++pushSerial%100));
    pushPending.set(id, action);
    if (action === 'schedule') { try { localStorage.setItem('ev-push-pending-v1','1'); } catch (_) {} }
    setTimeout(() => {
      if (pushPending.delete(id)) $('push-status').textContent = '응답 시간이 초과됐습니다. 서버 예약 여부를 확인하거나 취소를 요청하세요.';
    }, 30000);
    $('push-status').textContent = '알림 서버에 요청 중…';
    try { window.HaruNative.pushRequest(id, JSON.stringify({action,topic,minutes:Number($('push-minutes').value),low})); }
    catch (_) { pushPending.delete(id); $('push-status').textContent = '알림 요청을 시작하지 못했습니다.'; }
  }
  window.addEventListener('ev-push', e => {
    const data = e.detail || {}, action = pushPending.get(String(data.id));
    if (!action) return;
    pushPending.delete(String(data.id));
    if (!data.ok) { $('push-status').textContent = String(data.error || '알림 서버 요청에 실패했습니다.'); return; }
    if (action === 'schedule') {
      try { localStorage.setItem('ev-push-pending-v1','1'); } catch (_) {}
      $('push-status').textContent = '서버가 예약을 접수했습니다. 휴대폰의 실제 수신은 별도로 확인하세요.';
    } else if (action === 'cancel') {
      try { localStorage.removeItem('ev-push-pending-v1'); } catch (_) {}
      $('push-status').textContent = '서버에 예약 취소를 요청했습니다.';
    } else $('push-status').textContent = '시험 알림을 서버에 보냈습니다. 휴대폰에서 수신 여부를 확인하세요.';
  });
  function currentForecast() {
    let p;
    try { p = JSON.parse(localStorage.getItem('ev-day-last-prediction-v1') || 'null'); } catch (_) {}
    if (!p || !p.inputs || !Number.isFinite(p.raw) || !Number.isFinite(p.inputs.reserve) || !($('result').innerText || '').includes('예상 소비')) return null;
    return p;
  }
  $('push-test').addEventListener('click', () => sendPush('test'));
  $('push-schedule').addEventListener('click', () => {
    const p = currentForecast();
    sendPush('schedule', !!p && p.raw < p.inputs.reserve);
  });
  $('push-cancel').addEventListener('click', () => sendPush('cancel'));
  $('form').addEventListener('submit', () => {
    if (!$('push-auto').checked || !$('push-consent').checked) return;
    const p = currentForecast();
    if (!p) return;
    if (p.raw < p.inputs.reserve) sendPush('schedule', true);
    else {
      let hadPending = false;
      try { hadPending = localStorage.getItem('ev-push-pending-v1') === '1'; } catch (_) {}
      if (hadPending) sendPush('cancel');
    }
  });
  historyStats();
  render();
  applyUx();
})();
