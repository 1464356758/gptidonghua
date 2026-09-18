package cn.novelrelay.matcher;
import android.app.*;
import android.os.*;
import android.content.*;
import android.net.Uri;
import android.view.*;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.*;
import android.graphics.Bitmap;
import android.database.Cursor;
import android.provider.OpenableColumns;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.*;
import java.security.MessageDigest;
import org.json.*;
public final class Checks extends Instrumentation {
    private WebView web;private File evidence;private int checks=0;
    @Override public void onCreate(Bundle args){super.onCreate(args);start();}
    private void check(boolean ok,String message){if(!ok)throw new AssertionError(message);checks++;}
    private String js(String code)throws Exception{
        CountDownLatch done=new CountDownLatch(1);String[] out={null};runOnMainSync(()->web.evaluateJavascript(code,r->{out[0]=r;done.countDown();}));if(!done.await(20,TimeUnit.SECONDS))throw new AssertionError("JS timeout");return out[0];
    }
    private void waitJS(String code)throws Exception{for(int i=0;i<240;i++){if("true".equals(js(code)))return;Thread.sleep(250);}throw new AssertionError("page timeout "+code);}
    private WebView find(View v){if(v instanceof WebView)return(WebView)v;if(v instanceof ViewGroup){ViewGroup g=(ViewGroup)v;for(int i=0;i<g.getChildCount();i++){WebView w=find(g.getChildAt(i));if(w!=null)return w;}}return null;}
    private AccessibilityNodeInfo root(){return getUiAutomation().getRootInActiveWindow();}
    private String tree(AccessibilityNodeInfo node){if(node==null)return "";StringBuilder out=new StringBuilder();out.append(node.getPackageName()).append(" ").append(node.getText()).append(" ").append(node.getContentDescription()).append("\n");for(int i=0;i<node.getChildCount();i++)out.append(tree(node.getChild(i)));return out.toString();}
    private boolean clickText(AccessibilityNodeInfo node,String label){if(node==null)return false;String text=String.valueOf(node.getText());if(label.equalsIgnoreCase(text)&&node.isEnabled()){AccessibilityNodeInfo target=node;for(int i=0;i<3&&target!=null;i++,target=target.getParent())if(target.isClickable()&&target.performAction(AccessibilityNodeInfo.ACTION_CLICK))return true;}for(int i=0;i<node.getChildCount();i++)if(clickText(node.getChild(i),label))return true;return false;}
    private void waitPicker()throws Exception{for(int i=0;i<180;i++){AccessibilityNodeInfo r=root();String t=tree(r);if(t.contains("isn't responding"))throw new AssertionError("Android system dialog ANR: "+t);if(r!=null&&String.valueOf(r.getPackageName()).contains("documentsui")&&t.toLowerCase().contains("save"))return;Thread.sleep(500);}throw new AssertionError("No rendered document picker: "+tree(root()));}
    private void waitPaint()throws Exception{CountDownLatch ready=new CountDownLatch(1);runOnMainSync(()->web.postVisualStateCallback(1,new WebView.VisualStateCallback(){@Override public void onComplete(long id){ready.countDown();}}));if(!ready.await(30,TimeUnit.SECONDS))throw new AssertionError("WebView paint timeout");waitForIdleSync();Thread.sleep(1500);}
    private void shot(String name)throws Exception{Bitmap bitmap=getUiAutomation().takeScreenshot();if(bitmap!=null)try(FileOutputStream out=new FileOutputStream(new File(evidence,name))){bitmap.compress(Bitmap.CompressFormat.PNG,100,out);}}
    private static byte[] bytes(InputStream in)throws Exception{ByteArrayOutputStream b=new ByteArrayOutputStream();byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1)b.write(buf,0,n);return b.toByteArray();}
    private static String sha(File file)throws Exception{byte[] content;try(InputStream in=new FileInputStream(file)){content=bytes(in);}StringBuilder out=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(content))out.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return out.toString();}
    @Override public void onStart(){Bundle result=new Bundle();try{
        Context context=getTargetContext();evidence=context.getExternalFilesDir(null);evidence.mkdirs();
        Intent intent=new Intent();intent.setClassName(context,"cn.novelrelay.matcher.MainActivity");intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);Activity activity=startActivitySync(intent);web=find(activity.getWindow().getDecorView());check(web!=null,"WebView exists");
        waitJS("document.getElementById('generate')!==null && typeof generate==='function'");check("true".equals(js("!!crypto.subtle && !!window.NativeRelay")),"secure generator/native bridge");waitPaint();shot("android-home.png");
        js("document.getElementById('repo').value='sample/novel';document.getElementById('academy_repo').value='https://github.com/mirror-owner/rules';document.getElementById('academy_branch').value='rules/stable';draft();document.getElementById('generate').click();");
        File dir=new File(context.getFilesDir(),"exports");File[] files=null;for(int i=0;i<100;i++){files=dir.listFiles();if(files!=null&&files.length>0)break;Thread.sleep(200);}check(files!=null&&files.length>0,"native export created");File f=files[0];JSONObject config;
        try(ZipFile zip=new ZipFile(f)){config=new JSONObject(new String(bytes(zip.getInputStream(zip.getEntry("自动化/控制台导入.json"))),"UTF-8")).getJSONObject("config");check(zip.getEntry("角色指令/03_总监.txt")!=null,"director rule included");}
        check(config.getString("academy_repo").equals("mirror-owner/rules")&&config.getString("academy_branch").equals("rules/stable"),"custom academy survives native export");
        Uri uri=new Uri.Builder().scheme("content").authority("cn.novelrelay.matcher.files").appendPath("exports").appendPath(f.getName()).build();
        try(InputStream in=context.getContentResolver().openInputStream(uri);FileInputStream source=new FileInputStream(f)){check(Arrays.equals(bytes(in),bytes(source)),"share provider returns exact ZIP bytes");}
        try(Cursor cur=context.getContentResolver().query(uri,null,null,null,null)){check(cur!=null&&cur.moveToFirst()&&cur.getLong(cur.getColumnIndex(OpenableColumns.SIZE))==f.length(),"share provider size");}
        try(FileInputStream in=new FileInputStream(f);FileOutputStream out=new FileOutputStream(new File(evidence,"android-generated.zip"))){out.write(bytes(in));}
        waitPicker();Thread.sleep(1000);shot("android-save-picker.png");check(clickText(root(),"Save"),"system Save action clicked");waitJS("document.getElementById('message').textContent.includes('ZIP 已保存')");check(true,"actual SAF save completed");
        js("document.getElementById('generate').click()");waitPicker();for(int k=0;k<4;k++){sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);Thread.sleep(700);if("true".equals(js("document.getElementById('message').textContent.includes('取消')")))break;}waitJS("document.getElementById('message').textContent.includes('取消')");check(true,"save cancellation returns to usable form");
        js("document.getElementById('share').click()");boolean selected=false;for(int i=0;i<100;i++){AccessibilityNodeInfo r=root();String t=tree(r);if(t.contains("isn't responding"))throw new AssertionError("System ANR during share");if(t.contains("Matcher test receiver")){shot("android-share.png");selected=clickText(r,"Matcher test receiver");if(selected)break;}if(t.contains("Share received:")){selected=true;break;}Thread.sleep(300);}check(selected,"system share target selected");
        String received="";for(int i=0;i<100;i++){received=tree(root());if(received.contains("Share received:")||received.contains("Share failed:"))break;Thread.sleep(300);}check(received.contains("Share received: "+sha(f))&&received.contains("Bytes: "+f.length()),"external app received exact ZIP through read grant");check(received.contains("Receiver UID:")&&!received.contains("Receiver UID: "+android.os.Process.myUid()),"share receiver uses independent app UID");shot("android-share-received.png");sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);waitJS("!document.getElementById('generate').disabled");check(true,"share return");
        runOnMainSync(()->web.loadUrl("https://appassets.androidplatform.net/assets/manual.html"));waitJS("document.querySelectorAll('h2').length===15");waitPaint();shot("android-manual.png");check(true,"offline integrated manual");
        try(FileOutputStream out=new FileOutputStream(new File(evidence,"android-test-report.txt"))){out.write(("Android integration checks passed: "+checks+"\nNo real ChatGPT account tested. SAF save, cancellation and exact ZIP receipt in a separate-UID test app verified. Personal-device third-party share targets still require acceptance.\n").getBytes("UTF-8"));}
        result.putString("stream","Android integration checks passed: "+checks+"\n");finish(Activity.RESULT_OK,result);
    }catch(Throwable e){try{shot("android-failure.png");try(FileOutputStream out=new FileOutputStream(new File(evidence,"android-failure-ui.txt"))){out.write((e.toString()+"\n"+tree(root())).getBytes("UTF-8"));}}catch(Exception ignored){}result.putString("stream","FAIL: "+e.toString()+"\n");finish(Activity.RESULT_CANCELED,result);}}
}
