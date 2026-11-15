package kr.harujeongi.app;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.JavascriptInterface;
import android.speech.tts.TextToSpeech;
import java.util.Locale;
import java.io.ByteArrayInputStream;

/** Local-first contest app. Real SDK requests are isolated behind explicit support and parked-state checks. */
public final class MainActivity extends Activity {
 private WebView web;
 private TextToSpeech tts;
 private boolean ttsReady = false;
 private PleosVehicleGateway pleos;
 private VoiceGateway voice;
 private EvMapGateway map;
 private PleosNaviGateway navi;
 private CarUxGateway ux;
 private EvPushGateway push;
 private int pendingReminderMinutes;
 private static final String ORIGIN = "https://appassets.androidplatform.net/assets/";

 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  web = new WebView(this);
  web.setBackgroundColor(0xfff7f8f7);
  WebSettings settings=web.getSettings();
  settings.setJavaScriptEnabled(true);
  settings.setDomStorageEnabled(true);
  // Respect the page's device-width viewport when the vehicle resizes an app window.
  settings.setUseWideViewPort(true);
  settings.setLoadWithOverviewMode(false);
  // Let WebView use device density instead of forcing 100% physical-pixel scaling.
  web.setInitialScale(0);
  settings.setAllowFileAccess(false);
  settings.setAllowContentAccess(false);
  settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  settings.setMediaPlaybackRequiresUserGesture(true);
  WebView.setWebContentsDebuggingEnabled(false);
  web.addJavascriptInterface(new Bridge(), "HaruNative");
  pleos=new PleosVehicleGateway(this,web);
  voice=new VoiceGateway(this,web);
  map=new EvMapGateway(web);
  navi=new PleosNaviGateway(this,web);
  ux=new CarUxGateway(this,web);
  push=new EvPushGateway(web);
  web.setWebViewClient(new WebViewClient(){
   @Override public void onPageFinished(WebView view,String url){if(ux!=null)ux.start();}
   @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request){
    String url=request.getUrl().toString();
    if(!url.startsWith(ORIGIN))return blocked();
    String path=url.substring(ORIGIN.length()).split("\\?",2)[0];
    if(path.contains("..") || path.contains("%"))return blocked();
    String mime=path.endsWith(".html")?"text/html":path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":path.endsWith(".wav")?"audio/wav":path.endsWith(".ttf")?"font/ttf":"application/octet-stream";
    try{return new WebResourceResponse(mime,"UTF-8",getAssets().open(path));}catch(Exception e){return blocked();}
   }
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !request.getUrl().toString().startsWith(ORIGIN);}
  });
  tts=new TextToSpeech(this,status->{ttsReady=status==TextToSpeech.SUCCESS;});
  tts.setOnUtteranceProgressListener(new android.speech.tts.UtteranceProgressListener(){
   @Override public void onStart(String id){}
   @Override public void onDone(String id){speechResult(id,false);}
   @Override public void onError(String id){speechResult(id,true);}
  });
  setContentView(web);
  web.loadUrl(ORIGIN+"ev-day.html");
 }
 private void speechResult(String id,boolean error){if(id==null||id.isEmpty())return;runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.dispatchEvent(new CustomEvent('haru-audio',{detail:{id:"+org.json.JSONObject.quote(id)+",error:"+error+"}}))",null);});}
 private void reminderMessage(String text){web.evaluateJavascript("window.dispatchEvent(new CustomEvent('ev-reminder',{detail:"+org.json.JSONObject.quote(text)+"}))",null);}
 private void setReminder(int minutes){
  if(minutes<1||minutes>1440){reminderMessage("알림 시간을 확인해 주세요.");return;}
  if(android.os.Build.VERSION.SDK_INT>=33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=android.content.pm.PackageManager.PERMISSION_GRANTED){
   pendingReminderMinutes=minutes;requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},43);return;
  }
  if(!EvReminderReceiver.notificationsEnabled(this)){reminderMessage("기기 설정에서 하루전기 알림을 허용해 주세요.");return;}
  try{EvReminderReceiver.schedule(this,minutes);reminderMessage(minutes+"분 후 이 기기에 알림을 예약했습니다. 기기 절전 설정에 따라 늦어질 수 있습니다.");}
  catch(RuntimeException e){reminderMessage("알림을 예약하지 못했습니다.");}
 }
 private static WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
 public final class Bridge {
  @JavascriptInterface public void speak(String text,String language,String id){if(text==null)return;runOnUiThread(()->{if(!ttsReady){speechResult(id,true);return;}int languageStatus=tts.setLanguage(Locale.forLanguageTag(language));if(languageStatus==TextToSpeech.LANG_MISSING_DATA||languageStatus==TextToSpeech.LANG_NOT_SUPPORTED){speechResult(id,true);return;}if(tts.speak(text.substring(0,Math.min(text.length(),3500)),TextToSpeech.QUEUE_FLUSH,null,id)==TextToSpeech.ERROR)speechResult(id,true);});}
  @JavascriptInterface public void stopSpeech(){runOnUiThread(()->{if(tts!=null)tts.stop();});}
  @JavascriptInterface public void listen(){runOnUiThread(()->voice.listen());}
  @JavascriptInterface public void mapRequest(String id,String request){if(map!=null)map.request(id,request);}
  @JavascriptInterface public void observeNavi(){runOnUiThread(()->navi.start());}
  @JavascriptInterface public void pushRequest(String id,String request){if(push!=null)push.request(id,request);}
  @JavascriptInterface public void setReminder(int minutes){runOnUiThread(()->MainActivity.this.setReminder(minutes));}
  @JavascriptInterface public void cancelReminder(){runOnUiThread(()->{EvReminderReceiver.cancel(MainActivity.this);reminderMessage("예약한 알림을 취소했습니다.");});}
  @JavascriptInterface public void readBattery(String id){if(id==null||!id.matches("[0-9]{1,16}"))return;runOnUiThread(()->pleos.readBattery(id));}
  @JavascriptInterface public void exportData(String json){if(json==null||json.length()>2000000)return;runOnUiThread(()->{Intent share=new Intent(Intent.ACTION_SEND);share.setType("text/plain");share.putExtra(Intent.EXTRA_TEXT,json);startActivity(Intent.createChooser(share,"하루전기 기록 내보내기"));});}
 }
 @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request==41&&voice!=null)voice.onPermission(results.length>0&&results[0]==android.content.pm.PackageManager.PERMISSION_GRANTED);if(request==43){int minutes=pendingReminderMinutes;pendingReminderMinutes=0;if(results.length>0&&results[0]==android.content.pm.PackageManager.PERMISSION_GRANTED)setReminder(minutes);else reminderMessage("알림 권한이 없어 예약하지 못했습니다.");}}
 @Override public void onConfigurationChanged(android.content.res.Configuration config){
  super.onConfigurationChanged(config);
  // Android WebView can keep the old page scale after a window configuration change.
  // Recompute the viewport without reloading the page or discarding a running session.
  if(web!=null)web.postDelayed(()->web.evaluateJavascript("(function(){var m=document.querySelector('meta[name=viewport]');if(m){m.content='width=device-width';requestAnimationFrame(function(){m.content='width=device-width, initial-scale=1';});}})()",null),250);
 }
 @Override public void onBackPressed(){if(web!=null && web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override protected void onPause(){super.onPause();if(tts!=null)tts.stop();if(voice!=null)voice.cancel();web.evaluateJavascript("window.dispatchEvent(new Event('pagehide'))",null);web.onPause();}
 @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
 @Override protected void onDestroy(){if(push!=null)push.release();if(ux!=null)ux.release();if(navi!=null)navi.release();if(map!=null)map.release();if(voice!=null)voice.release();if(pleos!=null)pleos.release();if(tts!=null)tts.shutdown();if(web!=null){web.removeJavascriptInterface("HaruNative");web.destroy();}super.onDestroy();}
}
