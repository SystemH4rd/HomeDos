package ua.homedos.app;

import android.app.Activity;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.graphics.Bitmap;
import android.graphics.Insets;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Build;
import android.os.Message;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;
import java.io.OutputStream;
import org.json.JSONObject;

@SuppressWarnings("deprecation")
public final class MainActivity extends Activity {
 private static final String HOME="https://systemh4rd.github.io/HomeDos/";
 private WebView web;
 private ValueCallback<Uri[]> chooser;
 private byte[] pendingDownload;
 private FrameLayout container;
 private LinearLayout errorPanel;
 private boolean trustedPage=false;
 private boolean pageFailed=false;
 private static boolean trusted(String value){
  if(value==null)return false;
  Uri u=Uri.parse(value);return "https".equals(u.getScheme())&&"systemh4rd.github.io".equals(u.getHost())&&(u.getPort()==-1||u.getPort()==443)&&u.getPath()!=null&&u.getPath().startsWith("/HomeDos/");
 }
 @Override public void onCreate(Bundle saved){
  super.onCreate(saved);container=new FrameLayout(this);setContentView(container);
  container.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener(){@Override public WindowInsets onApplyWindowInsets(View v,WindowInsets insets){if(Build.VERSION.SDK_INT>=30){Insets bars=insets.getInsets(WindowInsets.Type.systemBars());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return WindowInsets.CONSUMED;}v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets();}});
  web=new WebView(this);container.addView(web,new FrameLayout.LayoutParams(-1,-1));
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setDatabaseEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setJavaScriptCanOpenWindowsAutomatically(false);s.setSupportMultipleWindows(true);s.setMediaPlaybackRequiresUserGesture(true);s.setUserAgentString(s.getUserAgentString()+" HomeDosAndroid/1.0");
  CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);WebView.setWebContentsDebuggingEnabled(false);
  web.addJavascriptInterface(new Downloads(),"HomeDosNative");
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest request){if(!request.isForMainFrame())return false;return navigate(request.getUrl().toString());}
   @Override public boolean shouldOverrideUrlLoading(WebView v,String url){return navigate(url);}
   @Override public void onPageStarted(WebView v,String url,Bitmap icon){trustedPage=false;pageFailed=false;}
   @Override public void onPageFinished(WebView v,String url){trustedPage=trusted(url)&&!pageFailed;if(trustedPage){hideError();injectDownloadSupport();}}
   @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame()){pageFailed=true;showError();}}
   @Override public void onReceivedSslError(WebView v,SslErrorHandler handler,SslError error){handler.cancel();pageFailed=true;showError();}
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> callback,FileChooserParams params){if(chooser!=null)chooser.onReceiveValue(null);chooser=callback;Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);try{startActivityForResult(intent,11);}catch(ActivityNotFoundException e){chooser.onReceiveValue(null);chooser=null;toast("На пристрої немає програми вибору файлів");}return true;}
   @Override public boolean onCreateWindow(WebView v,boolean dialog,boolean gesture,Message result){if(!gesture)return false;final WebView popup=new WebView(MainActivity.this);popup.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){if(trusted(r.getUrl().toString()))web.loadUrl(r.getUrl().toString());else navigate(r.getUrl().toString());w.destroy();return true;}});((WebView.WebViewTransport)result.obj).setWebView(popup);result.sendToTarget();return true;}
  });
  web.setDownloadListener(new DownloadListener(){@Override public void onDownloadStart(String url,String agent,String disposition,String mime,long size){if(trustedPage&&url.startsWith("blob:"))readBlob(url,"HomeDos-file");else if(url.startsWith("https:"))external(url);}});
  web.loadUrl(HOME);
 }
 private boolean navigate(String url){if(trusted(url))return false;if(url.startsWith("https:")||url.startsWith("http:")||url.startsWith("mailto:")||url.startsWith("tel:"))external(url);return true;}
 private void external(String url){try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(ActivityNotFoundException e){toast("Немає програми для відкриття посилання");}}
 private void injectDownloadSupport(){web.evaluateJavascript("(function(){if(window.__homedosDownload)return;window.__homedosDownload=true;var apk=document.getElementById('android-download');if(apk)apk.hidden=true;var nativeClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download&&this.href.indexOf('blob:')===0){window.__homedosReadBlob(this.href,this.download);return;}return nativeClick.call(this)};document.addEventListener('click',function(e){if(e.target.closest('#auth-forgot')){e.preventDefault();e.stopImmediatePropagation();HomeDosNative.openRecovery();return;}var a=e.target.closest('a[download]');if(a&&a.href.indexOf('blob:')===0){e.preventDefault();window.__homedosReadBlob(a.href,a.download||'HomeDos-file');}},true);window.__homedosReadBlob=function(url,name){fetch(url).then(function(r){return r.blob()}).then(function(blob){if(blob.size>85*1024*1024)throw Error('Файл завеликий');var reader=new FileReader();reader.onload=function(){HomeDosNative.save(String(reader.result),name)};reader.readAsDataURL(blob)}).catch(function(){alert('Не вдалося підготувати файл до збереження')})}})();",null);}
 private void readBlob(String url,String name){web.evaluateJavascript("window.__homedosReadBlob&&window.__homedosReadBlob("+JSONObject.quote(url)+","+JSONObject.quote(name)+")",null);}
 public final class Downloads {
  @JavascriptInterface public void openRecovery(){runOnUiThread(new Runnable(){@Override public void run(){if(trustedPage&&trusted(web.getUrl())){toast("Відновлення пароля відкриється у браузері");external(HOME+"?auth=forgot");}}});}
  @JavascriptInterface public void save(final String data,final String name){if(data==null||data.length()>120*1024*1024)return;runOnUiThread(new Runnable(){@Override public void run(){if(!trustedPage||!trusted(web.getUrl()))return;if(pendingDownload!=null){toast("Завершіть попереднє збереження файлу");return;}try{int comma=data.indexOf(',');if(comma<0||!data.substring(0,comma).endsWith(";base64"))return;pendingDownload=Base64.decode(data.substring(comma+1),Base64.DEFAULT);String safeName=(name==null?"HomeDos-file":name).replaceAll("[\\\\/\\p{Cntrl}]","_");if(safeName.length()>150)safeName=safeName.substring(0,150);Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("application/octet-stream");intent.putExtra(Intent.EXTRA_TITLE,safeName);startActivityForResult(intent,12);}catch(Exception e){pendingDownload=null;toast("Не вдалося підготувати файл");}}});}
 }
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==11&&chooser!=null){Uri[] values=null;if(result==RESULT_OK&&data!=null){if(data.getClipData()!=null){values=new Uri[data.getClipData().getItemCount()];for(int i=0;i<values.length;i++)values[i]=data.getClipData().getItemAt(i).getUri();}else if(data.getData()!=null)values=new Uri[]{data.getData()};}chooser.onReceiveValue(values);chooser=null;}if(request==12){if(result==RESULT_OK&&data!=null&&data.getData()!=null&&pendingDownload!=null){try(OutputStream out=getContentResolver().openOutputStream(data.getData())){if(out==null)throw new Exception();out.write(pendingDownload);toast("Файл збережено");}catch(Exception e){toast("Не вдалося зберегти файл");}}pendingDownload=null;}}
 private void toast(String text){Toast.makeText(this,text,Toast.LENGTH_LONG).show();}
 private void showError(){trustedPage=false;if(errorPanel!=null)return;errorPanel=new LinearLayout(this);errorPanel.setOrientation(LinearLayout.VERTICAL);errorPanel.setPadding(40,80,40,40);errorPanel.setBackgroundColor(0xff111a28);TextView text=new TextView(this);text.setTextColor(0xfff1f5fc);text.setTextSize(20);text.setText("HomeDos\n\nНе вдалося відкрити дошку. Перевірте інтернет і повторіть. Ваші хмарні дошки залишаються в акаунті.");Button reload=new Button(this);reload.setText("Повторити");reload.setOnClickListener(new View.OnClickListener(){@Override public void onClick(View v){hideError();web.loadUrl(HOME);}});errorPanel.addView(text);errorPanel.addView(reload);container.addView(errorPanel,new FrameLayout.LayoutParams(-1,-1));}
 private void hideError(){if(errorPanel!=null){container.removeView(errorPanel);errorPanel=null;}}
 @Override public void onBackPressed(){if(!trustedPage){if(web.canGoBack())web.goBack();else super.onBackPressed();return;}web.evaluateJavascript("(function(){var d=Array.from(document.querySelectorAll('dialog[open]')).pop();if(d){if(d.id==='remember-device-dialog')document.querySelector('#remember-device-no').click();else d.close();return true}var z=document.querySelector('#zoom-menu');if(z&&!z.hidden){document.querySelector('#zoom-menu-close').click();return true}var side=document.querySelector('#sidebar.open');if(side){document.querySelector('#sidebar-close').click();return true}return false})()",new ValueCallback<String>(){@Override public void onReceiveValue(String result){if(!"true".equals(result)){if(web.canGoBack())web.goBack();else MainActivity.super.onBackPressed();}}});}
 @Override protected void onPause(){super.onPause();web.evaluateJavascript("if(window.OrbitCanvas&&OrbitCanvas.flushView)OrbitCanvas.flushView()",null);CookieManager.getInstance().flush();}
 @Override protected void onDestroy(){if(chooser!=null)chooser.onReceiveValue(null);pendingDownload=null;web.removeJavascriptInterface("HomeDosNative");web.destroy();super.onDestroy();}
}
