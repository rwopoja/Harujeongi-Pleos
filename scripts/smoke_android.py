"""Install the EV prototype on a standard Android emulator. Not a Pleos test."""
import json,pathlib,re,subprocess,time,xml.etree.ElementTree as ET
OUT=pathlib.Path('runtime-artifacts');OUT.mkdir(exist_ok=True)
def adb(*args):return subprocess.run(['adb',*args],capture_output=True,text=True,check=True).stdout
def tree():
 adb('shell','uiautomator','dump','/sdcard/tree.xml')
 return ET.fromstring(adb('shell','cat','/sdcard/tree.xml'))
def shot(name):
 with (OUT/(name+'.png')).open('wb') as f:subprocess.run(['adb','exec-out','screencap','-p'],stdout=f,check=True)
def tap_visible(label):
 for _ in range(7):
  root=tree()
  for node in root.iter('node'):
   if label in node.get('text',''):
    coords=re.findall(r'[0-9]+',node.get('bounds',''))
    if len(coords)==4:
     x1,y1,x2,y2=map(int,coords)
     if x2>x1 and y2>y1:
      adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));return
  adb('shell','input','swipe','1000','880','1000','400','450');time.sleep(1)
 raise AssertionError('Visible button not found: '+label)
adb('shell','wm','size','1920x1080');adb('shell','wm','density','160')
adb('install','-r','apk/김재윤_하루전기_release.apk')
adb('shell','am','start','-W','-n','kr.harujeongi.app/.MainActivity')
for i in range(18):
 time.sleep(4);root=tree()
 if '계획 계산하기' in ET.tostring(root,encoding='unicode'):break
else: raise AssertionError('EV planning screen not loaded')
shot('01-ev-home')
assert '일반 Android 기기 시험 화면' in ET.tostring(root,encoding='unicode'), 'Missing ordinary-device UX status'
tap_visible('차량 배터리 조회')
time.sleep(16);root=tree();state=ET.tostring(root,encoding='unicode')
(OUT/'battery-tree.xml').write_text(state);shot('01-battery-debug')
assert ('조회 실패' in state or '조회 응답이 없습니다' in state), 'Missing explicit unavailable state on ordinary Android'
assert 'Pleos 조회값' not in state, 'Unexpected vehicle reading on ordinary Android'
shot('01-battery-unavailable')
tap_visible('계획 계산하기')
time.sleep(3);adb('shell','input','swipe','1000','880','1000','400','450');time.sleep(2);result=ET.tostring(tree(),encoding='unicode');(OUT/'result-tree.xml').write_text(result);shot('02-ev-result')
assert '18.0 kWh' in result, 'Expected sample energy result not found'
tap_visible('내비 연결 및 일정 확인')
time.sleep(3);navi=ET.tostring(tree(),encoding='unicode');shot('03-navi-unavailable')
assert 'Pleos 내비 서비스가 없는 환경' in navi, 'Missing explicit navigation unavailable state on ordinary Android'
(OUT/'result.json').write_text(json.dumps({'platform':'Android 14; not Pleos','ev_calculation':'passed','vehicle_data':'unavailable state verified on non-Pleos emulator','navigation':'unavailable state verified on non-Pleos emulator','speech':'Android speech integration present; actual speech service not tested','prediction_accuracy':'not validated'},ensure_ascii=False,indent=2))
print('EV prototype calculation passed on standard Android AVD')
