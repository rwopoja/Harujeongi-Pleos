package kr.mycabin.app;

import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Small fixed-provider adapter for an explicitly requested, public-data prototype. */
final class EvMapGateway {
 private static final int MAX_BYTES = 1_000_000;
 private final WebView web;
 private final ExecutorService worker = Executors.newSingleThreadExecutor();
 private volatile boolean closed;
 private long lastGeocode;
 EvMapGateway(WebView web) { this.web = web; }

 void request(String id, String raw) {
  if (closed || id == null || !id.matches("[0-9]{1,16}") || raw == null || raw.length() > 8000) return;
  worker.execute(() -> {
   try {
    JSONObject request = new JSONObject(raw);
    String type = request.getString("type"), body;
    if ("geocode".equals(type)) {
     String query = request.getString("query").trim();
     if (query.length() < 1 || query.length() > 150) throw new IllegalArgumentException("검색어 길이를 확인하세요.");
     long delay = 1200L - (System.currentTimeMillis() - lastGeocode);
     if (delay > 0) Thread.sleep(delay);
     lastGeocode = System.currentTimeMillis();
     body = get("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=kr&q=" + URLEncoder.encode(query, "UTF-8"), null);
     emit(id, new JSONObject().put("ok", true).put("data", new JSONArray(body)));
    } else if ("route".equals(type)) {
     JSONArray points = request.getJSONArray("points");
     if (points.length() < 2 || points.length() > 10) throw new IllegalArgumentException("출발지와 목적지를 확인하세요.");
     StringBuilder coords = new StringBuilder();
     for (int i = 0; i < points.length(); i++) {
      JSONObject p = points.getJSONObject(i);
      double lat = p.getDouble("lat"), lon = p.getDouble("lon");
      validate(lat, lon);
      if (i > 0) coords.append(';');
      coords.append(String.format(Locale.US, "%.6f,%.6f", lon, lat));
     }
     body = get("https://router.project-osrm.org/route/v1/driving/" + coords + "?overview=false&steps=false", null);
     emit(id, new JSONObject().put("ok", true).put("data", new JSONObject(body)));
    } else if ("chargers".equals(type)) {
     double lat = request.getDouble("lat"), lon = request.getDouble("lon");
     validate(lat, lon);
     String around = String.format(Locale.US, "(around:4000,%.6f,%.6f)", lat, lon);
     String q = "[out:json][timeout:15];(node[amenity=charging_station]" + around + ";way[amenity=charging_station]" + around + ";relation[amenity=charging_station]" + around + ";);out center tags 50;";
     body = get("https://overpass-api.de/api/interpreter", "data=" + URLEncoder.encode(q, "UTF-8"));
     emit(id, new JSONObject().put("ok", true).put("data", new JSONObject(body)));
    } else throw new IllegalArgumentException("지원하지 않는 요청입니다.");
   } catch (Exception e) {
    try { emit(id, new JSONObject().put("ok", false).put("error", "연결 또는 검색에 실패했습니다. 네트워크와 입력값을 확인해 주세요.")); }
    catch (Exception ignored) { }
   }
  });
 }

 private static void validate(double lat, double lon) {
  if (!Double.isFinite(lat) || !Double.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180)
   throw new IllegalArgumentException("좌표 오류");
 }
 private static String get(String address, String form) throws Exception {
  HttpURLConnection c = (HttpURLConnection)new URL(address).openConnection();
  try {
   c.setConnectTimeout(12000); c.setReadTimeout(20000); c.setInstanceFollowRedirects(false);
   c.setRequestProperty("User-Agent", "Harujeongi/0.1 (https://github.com/rwopoja/MyCabin-Pleos)");
   c.setRequestProperty("Accept", "application/json");
   if (form != null) {
    c.setRequestMethod("POST"); c.setDoOutput(true);
    c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
    try (java.io.OutputStream out = c.getOutputStream()) { out.write(form.getBytes(StandardCharsets.UTF_8)); }
   }
   if (c.getResponseCode() != 200) throw new IllegalStateException("HTTP " + c.getResponseCode());
   try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
    byte[] buffer = new byte[8192]; int n, total = 0;
    while ((n = in.read(buffer)) != -1) { total += n; if (total > MAX_BYTES) throw new IllegalStateException("Response too large"); out.write(buffer, 0, n); }
    return out.toString("UTF-8");
   }
  } finally { c.disconnect(); }
 }
 private void emit(String id, JSONObject result) {
  if (closed) return;
  web.post(() -> { if (!closed) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('ev-map-result',{detail:{id:" + JSONObject.quote(id) + ",result:" + result.toString() + "}}))", null); });
 }
 void release() { closed = true; worker.shutdownNow(); }
}
