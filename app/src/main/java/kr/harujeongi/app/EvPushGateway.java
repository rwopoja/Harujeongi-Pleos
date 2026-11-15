package kr.harujeongi.app;

import android.webkit.WebView;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** Optional generic alerts to the user's own ntfy topic, never route or vehicle data. */
final class EvPushGateway {
 private final WebView web;
 private final ExecutorService worker = Executors.newSingleThreadExecutor();
 private volatile boolean closed;
 EvPushGateway(WebView web) { this.web = web; }
 void request(String id, String raw) {
  if (closed || id == null || !id.matches("[0-9]{1,16}") || raw == null || raw.length() > 1000) return;
  worker.execute(() -> {
   try {
    JSONObject input = new JSONObject(raw);
    String topic = input.getString("topic"), action = input.getString("action");
    if (!topic.matches("harujeongi-[a-f0-9]{48}")) throw new IllegalArgumentException("invalid topic");
    if (!action.equals("test") && !action.equals("schedule") && !action.equals("cancel")) throw new IllegalArgumentException("invalid action");
    int minutes = input.optInt("minutes", 0);
    if (action.equals("schedule") && (minutes < 1 || minutes > 1440)) throw new IllegalArgumentException("invalid time");
    String path = "https://ntfy.sh/" + topic + (action.equals("test") ? "" : "/ev-plan");
    HttpURLConnection c = (HttpURLConnection)new URL(path).openConnection();
    try {
     c.setConnectTimeout(8000); c.setReadTimeout(12000); c.setInstanceFollowRedirects(false);
     c.setRequestProperty("User-Agent", "Harujeongi/0.1 (https://github.com/rwopoja/MyCabin-Pleos)");
     if (action.equals("cancel")) {
      c.setRequestMethod("DELETE");
     } else {
      c.setRequestMethod("POST"); c.setDoOutput(true);
      c.setRequestProperty("Content-Type", "text/plain; charset=utf-8");
      c.setRequestProperty("Title", "Harujeongi");
      if (action.equals("schedule")) c.setRequestProperty("Delay", minutes + "m");
      String message = action.equals("test") ? "하루전기 휴대폰 알림 연결 시험입니다."
        : input.optBoolean("low", false) ? "계산 당시 목표 여유가 부족했습니다. 현재 충전 계획을 다시 확인해 주세요."
        : "오늘 이동 일정의 배터리와 충전 계획을 다시 확인해 주세요.";
      try (OutputStream out = c.getOutputStream()) { out.write(message.getBytes(StandardCharsets.UTF_8)); }
     }
     int status = c.getResponseCode();
     if (status < 200 || status >= 300) throw new IllegalStateException("HTTP " + status);
     emit(id, true, action, "");
    } finally { c.disconnect(); }
   } catch (Exception e) { emit(id, false, "", "알림 서버 연결에 실패했습니다. 인터넷과 연결 코드를 확인해 주세요."); }
  });
 }
 private void emit(String id, boolean ok, String action, String error) {
  if (closed) return;
  try {
   JSONObject result = new JSONObject().put("id", id).put("ok", ok).put("action", action).put("error", error);
   web.post(() -> { if (!closed) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('ev-push',{detail:" + result + "}))", null); });
  } catch (Exception ignored) { }
 }
 void release() { closed = true; worker.shutdownNow(); }
}
