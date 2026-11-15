"""Best-effort UI test of live public map services in the actual Android APK."""
import json
import pathlib
import re
import subprocess
import time
import xml.etree.ElementTree as ET

OUT=pathlib.Path("runtime-artifacts")
OUT.mkdir(exist_ok=True)
result={"platform":"Android 14, not Pleos", "live_map_ui":"not completed"}
def adb(*args):
    return subprocess.run(["adb",*args],capture_output=True,text=True,check=True).stdout
def tree():
    adb("shell","uiautomator","dump","/sdcard/map-tree.xml")
    return ET.fromstring(adb("shell","cat","/sdcard/map-tree.xml"))
def find(root, **attrs):
    for n in root.iter("node"):
        if all(n.get(k)==v for k,v in attrs.items()):
            b=re.findall(r"\d+",n.get("bounds",""))
            if len(b)==4 and int(b[2])>int(b[0]) and int(b[3])>int(b[1]): return n
    return None
def tap(node):
    x1,y1,x2,y2=map(int,re.findall(r"\d+",node.get("bounds","")))
    adb("shell","input","tap",str((x1+x2)//2),str((y1+y2)//2))
def seek(direction="down", **attrs):
    for _ in range(12):
        root=tree(); node=find(root,**attrs)
        if node is not None: return node
        y1,y2=("880","350") if direction=="down" else ("350","880")
        adb("shell","input","swipe","1000",y1,"1000",y2,"450")
        time.sleep(1)
    raise AssertionError("UI element not visible: "+str(attrs))
def click_id(name,direction="down"):
    tap(seek(direction,**{"resource-id":name}))
    time.sleep(1)
def enter(name,value,direction="down"):
    click_id(name,direction)
    adb("shell","input","text",value.replace(" ","%s"))
    adb("shell","input","keyevent","4")
    time.sleep(1)
def choose_search_result(container, ignore):
    for _ in range(20):
        root=tree()
        parent=next((n for n in root.iter("node") if n.get("resource-id")==container),None)
        if parent is not None:
            for n in parent.iter("node"):
                label=n.get("text","")
                if n.get("class")=="android.widget.Button" and label and label not in ignore:
                    b=re.findall(r"\d+",n.get("bounds",""))
                    if len(b)==4 and int(b[2])>int(b[0]) and int(b[3])>int(b[1]):
                        tap(n);return label
        time.sleep(2)
    raise AssertionError("Live search did not return a selectable result")

try:
    adb("shell","pm","clear","kr.harujeongi.app")
    adb("shell","am","start","-W","-n","kr.harujeongi.app/.MainActivity")
    time.sleep(12)
    enter("route","Seoul Station")
    click_id("parse-plan")
    click_id("apply-draft")
    click_id("map-consent")
    enter("origin","Seoul City Hall","up")
    click_id("origin-search","up")
    choose_search_result("origin-results",set())
    tap(seek("down",text="이 장소 검색"))
    choose_search_result("points",{"이 장소 검색","앞으로","삭제"})
    click_id("route-search")
    time.sleep(20)
    root=tree()
    xml=ET.tostring(root,encoding="unicode")
    (OUT/"live-map-tree.xml").write_text(xml)
    with (OUT/"04-live-map.png").open("wb") as f: subprocess.run(["adb","exec-out","screencap","-p"],stdout=f,check=True)
    if "공개 지도 도로 거리 약" not in xml: raise AssertionError("The routing result was not displayed")
    result["live_map_ui"]="geocode and road route passed"
except Exception as exc:
    result["error"]=str(exc)
finally:
    (OUT/"live-map-result.json").write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps(result,ensure_ascii=False))
