package kr.harujeongi.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class EvBootReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context c, Intent intent) {
  if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) EvReminderReceiver.restore(c);
 }
}
