"""Best-effort live checks with public, non-user locations; not a Pleos test."""
import json
import pathlib
import secrets
import urllib.parse
import urllib.request

OUT = pathlib.Path("runtime-artifacts")
OUT.mkdir(exist_ok=True)
HEADERS = {"User-Agent": "Harujeongi/0.1 (https://github.com/rwopoja/Harujeongi-Pleos)", "Accept": "application/json"}
tests = {
    "geocode": (
        "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
            "format": "jsonv2", "limit": "5", "countrycodes": "kr", "q": "서울역"}),
        None),
    "route": ("https://router.project-osrm.org/route/v1/driving/126.978,37.5663;126.9707,37.5547?overview=false&steps=false", None),
    "weather": ("https://api.open-meteo.com/v1/forecast?latitude=37.5663&longitude=126.978&current=temperature_2m%2Cprecipitation%2Cweather_code&timezone=auto", None),
}
results = {}
for name, (url, body) in tests.items():
    try:
        req = urllib.request.Request(url, data=body, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read(1_000_000))
        if name == "geocode":
            valid = isinstance(data, list)
        elif name == "route":
            valid = data.get("code") == "Ok" and len(data.get("routes", [])) > 0
        else:
            current = data.get("current", {})
            valid = isinstance(current.get("temperature_2m"), (int, float)) and isinstance(current.get("precipitation"), (int, float)) and isinstance(current.get("time"), str)
        results[name] = {"ok": bool(valid), "note": "response format checked only"}
    except Exception as exc:
        results[name] = {"ok": False, "error": type(exc).__name__, "message": str(exc)[:200]}
query = urllib.parse.urlencode({"data": "[out:json][timeout:10];(node[amenity=charging_station](around:4000,37.5663,126.978);way[amenity=charging_station](around:4000,37.5663,126.978););out center tags 20;"})
results["chargers"] = {"ok": False, "attempts": []}
for host in ("https://overpass.private.coffee/api/interpreter", "https://overpass-api.de/api/interpreter"):
    try:
        req = urllib.request.Request(host + "?" + query, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=12) as response:
            data = json.loads(response.read(1_000_000))
        results["chargers"]["attempts"].append({"host":host, "ok":isinstance(data.get("elements"), list)})
        if isinstance(data.get("elements"), list):
            results["chargers"]["ok"] = True
            break
    except Exception as exc:
        results["chargers"]["attempts"].append({"host":host,"ok":False,"error":type(exc).__name__})
# Disposable, random topic; no personal or trip data is published.
topic = "harujeongi-" + secrets.token_hex(24)
url = "https://ntfy.sh/" + topic + "/ev-plan"
try:
    req = urllib.request.Request(url, data=b"Harujeongi notification test", method="POST",
        headers={**HEADERS, "Delay":"1m", "Content-Type":"text/plain"})
    with urllib.request.urlopen(req, timeout=12) as response:
        scheduled = 200 <= response.status < 300
    req = urllib.request.Request(url, method="DELETE", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=12) as response:
        cancelled = 200 <= response.status < 300
    results["phone_push"] = {"ok":scheduled and cancelled,"note":"server accepted test scheduling and cancellation; no phone delivery tested"}
except Exception as exc:
    results["phone_push"] = {"ok":False,"error":type(exc).__name__}
(OUT / "public-map-services.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps(results, ensure_ascii=False, indent=2))
if not all(row["ok"] for row in results.values()):
    raise SystemExit("One or more public demonstration services failed.")
