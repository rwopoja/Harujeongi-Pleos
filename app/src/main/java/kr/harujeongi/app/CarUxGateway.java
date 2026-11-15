package kr.harujeongi.app;

import android.app.Activity;
import android.content.pm.PackageManager;
import android.webkit.WebView;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import java.lang.reflect.Proxy;

/** Reads AAOS UX restrictions without linking android.car on ordinary phones. */
final class CarUxGateway {
 private final Activity activity;
 private final WebView web;
 private Object car, manager, listener;
 private volatile boolean closed, restricted = true;
 private boolean started;
 private volatile String state = "checking";
 private final Handler main = new Handler(Looper.getMainLooper());
 private final Runnable refresh = new Runnable() {
  @Override public void run() {
   if (closed) return;
   String before = state; boolean old = restricted;
   try { update(manager == null ? null : manager.getClass().getMethod("getCurrentCarUxRestrictions").invoke(manager), false); }
   catch (Exception e) { state = "unknown"; restricted = true; }
   if (old != restricted || !before.equals(state)) emit();
   main.postDelayed(this, 3000);
  }
 };
 CarUxGateway(Activity activity, WebView web) { this.activity = activity; this.web = web; }
 void start() {
  if (closed) return;
  if (started) { emit(); return; }
  started = true;
  if (!activity.getPackageManager().hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)) {
   state = "phone"; restricted = false; emit(); return;
  }
  try {
   Class<?> carType = Class.forName("android.car.Car");
   car = carType.getMethod("createCar", android.content.Context.class).invoke(null, activity);
   if (car == null) throw new IllegalStateException("car service unavailable");
   String service = (String)carType.getField("CAR_UX_RESTRICTION_SERVICE").get(null);
   manager = carType.getMethod("getCarManager", String.class).invoke(car, service);
   if (manager == null) throw new IllegalStateException("UX manager unavailable");
   Class<?> listenerType = Class.forName("android.car.drivingstate.CarUxRestrictionsManager$OnUxRestrictionsChangedListener");
   listener = Proxy.newProxyInstance(listenerType.getClassLoader(), new Class<?>[]{listenerType}, (proxy, method, args) -> {
    if ("hashCode".equals(method.getName())) return System.identityHashCode(proxy);
    if ("equals".equals(method.getName())) return args != null && args.length > 0 && proxy == args[0];
    if ("toString".equals(method.getName())) return "HarujeongiUxListener";
    if ("onUxRestrictionsChanged".equals(method.getName()) && args != null && args.length > 0) update(args[0], true);
    return null;
   });
   manager.getClass().getMethod("registerListener", listenerType).invoke(manager, listener);
   update(manager.getClass().getMethod("getCurrentCarUxRestrictions").invoke(manager), true);
   main.postDelayed(refresh, 3000);
  } catch (Exception e) { state = "unknown"; restricted = true; emit(); }
 }
 private void update(Object restriction, boolean notify) {
  try {
   if (restriction == null) throw new IllegalStateException("missing restrictions");
   restricted = (Boolean)restriction.getClass().getMethod("isRequiresDistractionOptimization").invoke(restriction);
   state = "vehicle";
  } catch (Exception e) { restricted = true; state = "unknown"; }
  if (notify) emit();
 }
 private void emit() {
  if (closed) return;
  try {
   JSONObject detail = new JSONObject().put("state", state).put("restricted", restricted);
   web.post(() -> { if (!closed) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('ev-ux',{detail:" + detail + "}))", null); });
  } catch (Exception ignored) { }
 }
 void release() {
  closed = true;
  main.removeCallbacks(refresh);
  try { if (manager != null) manager.getClass().getMethod("unregisterListener").invoke(manager); } catch (Exception ignored) { }
  try { if (car != null) car.getClass().getMethod("disconnect").invoke(car); } catch (Exception ignored) { }
  manager = null; car = null; listener = null;
 }
}
