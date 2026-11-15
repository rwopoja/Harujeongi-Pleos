package kr.harujeongi.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

/** Same-device, user-scheduled reminder; it does not observe ignition or sync devices. */
public final class EvReminderReceiver extends BroadcastReceiver {
 private static final String PREF = "ev_day_reminder";
 private static PendingIntent alarm(Context c) {
  return PendingIntent.getBroadcast(c, 702, new Intent(c, EvReminderReceiver.class),
    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
 }
 static boolean notificationsEnabled(Context c) {
  NotificationManager n = (NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
  return n != null && n.areNotificationsEnabled();
 }
 static void schedule(Context c, int minutes) {
  if (minutes < 1 || minutes > 1440) throw new IllegalArgumentException("invalid delay");
  long when = System.currentTimeMillis() + minutes * 60000L;
  c.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putLong("when", when).apply();
  scheduleAt(c, when);
 }
 static void scheduleAt(Context c, long when) {
  AlarmManager a = (AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
  if (a == null) throw new IllegalStateException("Alarm unavailable");
  a.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, alarm(c));
 }
 static void cancel(Context c) {
  AlarmManager a = (AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
  if (a != null) a.cancel(alarm(c));
  c.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().clear().apply();
 }
 static void restore(Context c) {
  long when = c.getSharedPreferences(PREF, Context.MODE_PRIVATE).getLong("when", 0);
  if (when > System.currentTimeMillis()) scheduleAt(c, when);
 }
 @Override public void onReceive(Context c, Intent intent) {
  SharedPreferences prefs = c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
  long when = prefs.getLong("when", 0);
  if (when == 0 || when > System.currentTimeMillis() + 1000) return;
  prefs.edit().clear().apply();
  if (!notificationsEnabled(c)) return;
  try {
   NotificationManager n = (NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
   String channel = "ev-day-reminders";
   if (Build.VERSION.SDK_INT >= 26) n.createNotificationChannel(new NotificationChannel(channel, "하루전기 일정 알림", NotificationManager.IMPORTANCE_DEFAULT));
   PendingIntent open = PendingIntent.getActivity(c, 703, new Intent(c, MainActivity.class),
     PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
   android.app.Notification notification = new android.app.Notification.Builder(c, channel)
     .setSmallIcon(android.R.drawable.ic_dialog_info)
     .setContentTitle("하루전기 일정 확인")
     .setContentText("현재 배터리와 오늘의 충전 계획을 다시 확인해 주세요.")
     .setContentIntent(open).setAutoCancel(true).build();
   n.notify(702, notification);
  } catch (SecurityException ignored) { }
 }
}
