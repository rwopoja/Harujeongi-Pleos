package kr.mycabin.app;

import android.app.Activity;
import android.content.Intent;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;
import ai.pleos.playground.navi.constants.NaviErrorCode;
import ai.pleos.playground.navi.data.DestinationInfo;
import ai.pleos.playground.navi.data.WaypointInfo;
import ai.pleos.playground.navi.data.WaypointChangedInfo;
import ai.pleos.playground.navi.helper.NaviHelper;
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener;
import java.util.List;
import kotlin.Unit;

/** Read-only, explicitly activated Pleos navigation observer. */
final class PleosNaviGateway {
 private final Activity activity;
 private final WebView web;
 private NaviHelper helper;
 private boolean connecting, ready, closed;
 private final NaviHelperEventListener listener = new NaviHelperEventListener() {
  @Override public void onDestinationChanged() {
   emit("changed", "내비 목적지가 변경되어 확인 중입니다.");
   activity.runOnUiThread(() -> { try { if (helper != null && ready) helper.getDestinationInfo(); } catch (Exception e) { emit("error", "변경된 목적지를 확인하지 못했습니다."); } });
  }
  @Override public void onWaypointChanged(WaypointChangedInfo ignored) {
   emit("waypoint_changed", "내비 경유지가 변경됐습니다. 저장한 일정을 확인해 주세요.");
   activity.runOnUiThread(() -> { try { if (helper != null && ready) helper.getWaypointInfo(); } catch (Exception e) { emit("error", "변경된 경유지를 확인하지 못했습니다."); } });
  }
  @Override public void onDestinationInfo(DestinationInfo d) {
   if (d == null) { emit("error", "내비 목적지 정보가 없습니다."); return; }
   try {
    JSONObject value = new JSONObject().put("name", d.getName()).put("lat", d.getLatitude()).put("lon", d.getLongitude());
    send("destination", value);
   } catch (Exception e) { emit("error", "내비 목적지를 읽지 못했습니다."); }
  }
  @Override public void onWayPointInfo(List<WaypointInfo> list) {
   if (list == null) return;
   try {
    JSONArray points = new JSONArray();
    for (WaypointInfo p : list) if (p != null) points.put(new JSONObject().put("name", p.getName()).put("lat", p.getLatitude()).put("lon", p.getLongitude()));
    send("waypoints", points);
   } catch (Exception e) { emit("error", "내비 경유지를 읽지 못했습니다."); }
  }
  @Override public void onError(NaviErrorCode error) { emit("error", "Pleos 내비 요청 실패: " + String.valueOf(error)); }
 };
 PleosNaviGateway(Activity activity, WebView web) { this.activity = activity; this.web = web; }
 void start() {
  if (closed || connecting) return;
  if (ready && helper != null) { helper.getDestinationInfo(); helper.getWaypointInfo(); return; }
  Intent service = new Intent("ai.pleos.playground.intent.action.NAVI_START");
  if (activity.getPackageManager().resolveService(service, 0) == null) {
   emit("error", "Pleos 내비 서비스가 없는 환경입니다. 공개 지도나 직접 입력을 사용하세요."); return;
  }
  try {
   connecting = true;
   helper = new NaviHelper(activity.getApplicationContext());
   helper.initialize(() -> {
    activity.runOnUiThread(() -> {
     if (closed || helper == null) return;
     try {
      connecting = false; ready = true; helper.addListener(listener);
      emit("status", "Pleos 내비 연결됨 · 현재 목적지 확인 중");
      helper.getDestinationInfo(); helper.getWaypointInfo();
     } catch (Exception e) { ready = false; emit("error", "내비 정보를 요청하지 못했습니다."); }
    });
    return Unit.INSTANCE;
   }, error -> {
    activity.runOnUiThread(() -> { connecting = false; ready = false; emit("error", "Pleos 내비 서비스에 연결하지 못했습니다."); });
    return Unit.INSTANCE;
   });
  } catch (Exception e) { connecting = false; ready = false; emit("error", "Pleos 내비를 시작하지 못했습니다."); }
 }
 private void emit(String event, String text) { send(event, text); }
 private void send(String event, Object value) {
  if (closed) return;
  try {
   JSONObject data = new JSONObject().put("event", event).put("value", value);
   web.post(() -> { if (!closed) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('ev-navi',{detail:" + data.toString() + "}))", null); });
  } catch (Exception ignored) { }
 }
 void release() {
  closed = true;
  if (helper != null) { try { if (ready) helper.removeListener(listener); helper.release(); } catch (Exception ignored) { } }
  helper = null; ready = false; connecting = false;
 }
}
