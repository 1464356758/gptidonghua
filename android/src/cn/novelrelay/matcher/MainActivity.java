package cn.novelrelay.matcher;

import android.app.Activity;
import android.os.Bundle;
import android.net.Uri;
import android.content.*;
import android.webkit.*;
import android.util.Base64;
import android.widget.FrameLayout;
import android.content.pm.ApplicationInfo;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final String ORIGIN="https://appassets.androidplatform.net";
    private static final int SAVE_ZIP=101;
    WebView web;
    private File pending;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root=new FrameLayout(this);
        web=new WebView(this);root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets();});
        setContentView(root);
        WebSettings ws=web.getSettings();ws.setJavaScriptEnabled(true);ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(false);ws.setAllowContentAccess(false);ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        ws.setJavaScriptCanOpenWindowsAutomatically(false);ws.setSupportMultipleWindows(false);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE)!=0);
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){
                String url=req.getUrl().toString(),asset=null;
                if(url.equals(ORIGIN+"/assets/index.html"))asset="index.html";
                if(url.equals(ORIGIN+"/assets/manual.html"))asset="manual.html";
                try {if(asset!=null)return new WebResourceResponse("text/html","UTF-8",getAssets().open(asset));}catch(IOException ignored){}
                return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                String url=req.getUrl().toString();
                if(url.equals(ORIGIN+"/assets/index.html")||url.equals(ORIGIN+"/assets/manual.html")||url.startsWith(ORIGIN+"/assets/manual.html#"))return false;
                if(req.isForMainFrame()&&req.hasGesture())openExternal(url);return true;
            }
        });
        web.addJavascriptInterface(new Bridge(),"NativeRelay");
        web.loadUrl(ORIGIN+"/assets/index.html");
        if(state!=null){String p=state.getString("pending");if(p!=null){File f=new File(getFilesDir(),"exports/"+p);if(f.isFile())pending=f;}}
    }
    private void feedback(String message){runOnUiThread(()->web.evaluateJavascript("window.nativeFeedback && window.nativeFeedback("+JSONObject.quote(message)+")",null));}
    private void openExternal(String url){
        try{Uri u=Uri.parse(url);if(!"https".equals(u.getScheme())||!"github.com".equals(u.getHost())||u.getUserInfo()!=null)return;startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(ActivityNotFoundException e){feedback("没有可用的浏览器，请手动打开所填学堂地址。");}
    }
    final class Bridge {
        @JavascriptInterface public void openGithub(String url){runOnUiThread(()->openExternal(url));}
        @JavascriptInterface public void exportZip(String name,String encoded,String mode){
            try {
                if(!name.matches("[A-Za-z0-9_-]{1,40}_小说匹配文件_AUTO_RC2\\.zip")||encoded.length()>12*1024*1024||!(mode.equals("save")||mode.equals("share")))throw new IOException("导出参数不合法");
                byte[] bytes=Base64.decode(encoded,Base64.DEFAULT);
                if(bytes.length<4||bytes.length>8*1024*1024||bytes[0]!='P'||bytes[1]!='K')throw new IOException("生成文件不是有效ZIP");
                File dir=new File(getFilesDir(),"exports");if(!dir.isDirectory()&&!dir.mkdirs())throw new IOException("无法建立导出目录");
                File file=new File(dir,System.currentTimeMillis()+"_"+UUID.randomUUID().toString().substring(0,8)+"_"+name);
                try(FileOutputStream out=new FileOutputStream(file)){out.write(bytes);out.getFD().sync();}
                runOnUiThread(()->{
                    try {
                        if(mode.equals("share")){
                            Uri uri=ZipProvider.uri(file);
                            Intent send=new Intent(Intent.ACTION_SEND);send.setType("application/zip");send.putExtra(Intent.EXTRA_STREAM,uri);send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);send.setClipData(ClipData.newRawUri(name,uri));
                            startActivity(Intent.createChooser(send,"分享小说匹配包"));feedback("匹配包已交给系统分享。取消分享时可以重新操作。");
                        }else{
                            pending=file;Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);save.addCategory(Intent.CATEGORY_OPENABLE);save.setType("application/zip");save.putExtra(Intent.EXTRA_TITLE,name);startActivityForResult(save,SAVE_ZIP);
                        }
                    }catch(Exception e){pending=null;feedback("无法打开保存或分享界面："+e.getMessage());}
                });
            }catch(Exception e){feedback("生成失败："+e.getMessage());}
        }
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);if(request!=SAVE_ZIP)return;
        File file=pending;pending=null;
        if(result!=RESULT_OK||data==null||data.getData()==null){feedback("已取消保存，配置仍保留，可以重新生成。");return;}
        Uri uri=data.getData();
        new Thread(()->{
            try(InputStream in=new FileInputStream(file);OutputStream out=getContentResolver().openOutputStream(uri,"wt")){
                if(out==null)throw new IOException("无法打开保存位置");byte[] buf=new byte[32768];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);out.flush();
            }catch(Exception e){feedback("保存失败，请重新选择位置："+e.getMessage());return;}
            feedback("ZIP 已保存。请发送到电脑，在新版控制台导入。");
        },"save-matching-zip").start();
    }
    @Override protected void onSaveInstanceState(Bundle out){super.onSaveInstanceState(out);if(pending!=null)out.putString("pending",pending.getName());}
    @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){web.removeJavascriptInterface("NativeRelay");web.destroy();super.onDestroy();}
}
