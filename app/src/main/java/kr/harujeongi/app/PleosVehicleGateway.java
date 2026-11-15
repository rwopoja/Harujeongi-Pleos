package kr.harujeongi.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import org.json.JSONObject;
import ai.pleos.playground.vehicle.Vehicle;
import ai.pleos.playground.vehicle.api.model.capability.AccessType;
import kotlin.Unit;

/** Read-only EV battery access; absence or failure is always reported explicitly. */
final class PleosVehicleGateway {
 private final Activity activity;
 private final WebView web;
 private final Handler main = new Handler(Looper.getMainLooper());
 private Vehicle vehicle;
 private volatile boolean closed;
 PleosVehicleGateway(Activity activity, WebView web) { this.activity = activity; this.web = web; }
 private void emit(String event, Object value) {
  main.post(() -> {
   if (closed) return;
   try {
    JSONObject result = new JSONObject().put("event", event).put("value", String.valueOf(value));
    web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pleos-result',{detail:" + result + "}))", null);
   } catch (Exception ignored) { }
  });
 }
 void readBattery(String id) {
  try {
   if (activity.getPackageManager().resolveService(new Intent("ai.pleos.playground.vehicle.VEHICLE_START"), 0) == null) {
    emit("EV_ERROR_" + id, "Pleos 차량 서비스를 찾을 수 없습니다."); return;
   }
   if (vehicle == null) { vehicle = new Vehicle(activity); vehicle.initialize(); }
   emit("EV_STATUS_" + id, "배터리 조회 지원 여부 확인 중");
   vehicle.getEvBattery().checkEvBatteryStateOfChargeCapabilities(config -> {
    if (config.getAccessType() != AccessType.READ && config.getAccessType() != AccessType.READ_WRITE) {
     emit("EV_ERROR_" + id, "이 차량에서 배터리 잔량 읽기가 지원되지 않습니다."); return Unit.INSTANCE;
    }
    vehicle.getEvBattery().getEvBatteryStateOfCharge(value -> {
     if (value == null || value < 0 || value > 100) emit("EV_ERROR_" + id, "유효하지 않은 배터리 잔량을 받았습니다.");
     else emit("EV_SOC_" + id, value);
     return Unit.INSTANCE;
    }, error -> { emit("EV_ERROR_" + id, "배터리 잔량 조회에 실패했습니다."); return Unit.INSTANCE; });
    return Unit.INSTANCE;
   }, error -> { emit("EV_ERROR_" + id, "배터리 지원 여부를 확인하지 못했습니다."); return Unit.INSTANCE; });
  } catch (Exception e) { emit("EV_ERROR_" + id, "배터리 조회를 시작하지 못했습니다."); }
 }
 void release() { closed = true; try { if (vehicle != null) vehicle.release(); } catch (Exception ignored) { } }
}
