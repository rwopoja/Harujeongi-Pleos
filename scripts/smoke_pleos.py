"""Evidence collection for the official Pleos AVD. Fails if app content cannot be observed."""
import pathlib
import re
import subprocess
import time
import xml.etree.ElementTree as ET

OUT = pathlib.Path("pleos-evidence")
OUT.mkdir(exist_ok=True)
def adb(*args, check=True):
    return subprocess.run(["adb", *args], text=True, capture_output=True, check=check).stdout
def screenshot(name):
    with (OUT / (name + ".png")).open("wb") as f:
        subprocess.run(["adb", "exec-out", "screencap", "-p"], stdout=f, check=True)
def tree():
    adb("shell", "uiautomator", "dump", "/sdcard/pleos-tree.xml", check=False)
    return adb("shell", "cat", "/sdcard/pleos-tree.xml", check=False)
def tap_label(xml, label):
    try: root = ET.fromstring(xml)
    except ET.ParseError: return False
    for node in root.iter("node"):
        if label != node.get("text", "") and label != node.get("content-desc", ""): continue
        if node.get("package") != "kr.mycabin.app" or node.get("class") != "android.widget.Button": continue
        b = re.findall(r"\d+", node.get("bounds", ""))
        if len(b) != 4: continue
        x1,y1,x2,y2 = map(int,b)
        if x2 > x1 and y2 > y1:
            adb("shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2))
            return True
    return False

(OUT/"screen-size.txt").write_text(adb("shell","wm","size"))
(OUT/"screen-density.txt").write_text(adb("shell","wm","density"))
adb("install","-r","apk/김재윤_하루전기_release.apk")
# Pleos system services keep initializing after Android reports boot complete.
time.sleep(75)
adb("shell","input","tap","1067","1010")
time.sleep(12)
screenshot("01-app-library")
library = tree()
(OUT/"library-tree.xml").write_text(library)
opened_from_library = tap_label(library,"하루전기")
if not opened_from_library:
    adb("shell","am","start","-W","-n","kr.mycabin.app/.MainActivity")
found = False
for i in range(10):
    time.sleep(15)
    xml = tree()
    (OUT/"tree.xml").write_text(xml)
    screenshot("02-latest-app-window")
    if 'resource-id="read-soc"' in xml and 'package="kr.mycabin.app"' in xml:
        found = True
        break
(OUT/"launch-method.txt").write_text("launcher" if opened_from_library else "adb activity")
(OUT/"activity.txt").write_text(adb("shell","dumpsys","activity","activities",check=False))
(OUT/"logcat.txt").write_text(adb("logcat","-d",check=False))
if not found:
    raise AssertionError("App was installed and launched, but its interactive content was not observed in the Pleos UI tree.")
if tap_label(xml,"차량 배터리 조회"):
    time.sleep(8)
    xml=tree()
    (OUT/"battery-tree.xml").write_text(xml)
    screenshot("03-pleos-battery-result")
    (OUT/"battery-logcat.txt").write_text(adb("logcat","-d",check=False))
if 'package="kr.mycabin.app"' not in xml:
    adb("shell","am","start","-W","-n","kr.mycabin.app/.MainActivity")
    time.sleep(15)
    xml=tree()
for i in range(6):
    if tap_label(xml,"계획 계산하기"):
        break
    adb("shell","input","swipe","1300","850","1300","450","500",check=False)
    time.sleep(2)
    xml=tree()
else:
    xml = ""
if xml:
    time.sleep(8)
    (OUT/"calculation-tree.xml").write_text(tree())
    screenshot("04-pleos-calculation")
print("Pleos application content observed; inspect battery and calculation evidence separately.")
