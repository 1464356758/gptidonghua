package cn.novelrelay.matcher;
import android.app.*;
import android.os.*;
import android.content.*;
import android.net.Uri;
import android.view.*;
import android.webkit.*;
import android.graphics.Bitmap;
import android.database.Cursor;
import android.provider.OpenableColumns;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.*;
import org.json.*;
public final class Checks extends Instrumentation {
    private WebView web;private File evidence;private int checks=0;
    @Override public void onCreate(Bundle args){super.onCreate(args);start();}
    private void check(boolean ok,String message){if(!ok)throw new AssertionError(message);checks++;}
    private String js(String code)throws Exception{
        CountDownLatch done=new CountDownLatch(1);String[] out={null};runOnMainSync(()->web.evaluateJavascript(code,r->{out[0]=r;done.countDown();}));if(!done.await(20,TimeUnit.SECONDS))throw new AssertionError("JS timeout");return out[0];
    }
    private void waitJS(String code)throws Exception{for(int i=0;i<80;i++){if("true".equals(js(code)))return;Thread.sleep(250);}throw new AssertionError("page timeout "+code);}
    private WebView find(View v){if(v instanceof WebView)return(WebView)v;if(v instanceof ViewGroup){ViewGroup g=(ViewGroup)v;for(int i=0;i<g.getChildCount();i++){WebView w=find(g.getChildAt(i));if(w!=null)return w;}}return null;}
    private void shot(String name)throws Exception{Bitmap bitmap=getUiAutomation().takeScreenshot();if(bitmap!=null)try(FileOutputStream out=new FileOutputStream(new File(evidence,name))){bitmap.compress(Bitmap.CompressFormat.PNG,100,out);}}
    private static byte[] bytes(InputStream in)throws Exception{ByteArrayOutputStream b=new ByteArrayOutputStream();byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1)b.write(buf,0,n);return b.toByteArray();}
    @Override public void onStart(){Bundle result=new Bundle();try{
        Context context=getTargetContext();evidence=context.getExternalFilesDir(null);evidence.mkdirs();
        Intent intent=new Intent();intent.setClassName(context,"cn.novelrelay.matcher.MainActivity");intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);Activity activity=startActivitySync(intent);web=find(activity.getWindow().getDecorView());check(web!=null,"WebView exists");
        waitJS("document.getElementById('generate')!==null && typeof generate==='function'");check("true".equals(js("!!crypto.subtle && !!window.NativeRelay")),"secure generator/native bridge");shot("android-home.png");
        js("document.getElementById('repo').value='sample/novel';document.getElementById('academy_repo').value='https://github.com/mirror-owner/rules';document.getElementById('academy_branch').value='rules/stable';draft();document.getElementById('generate').click();");
        File dir=new File(context.getFilesDir(),"exports");File[] files=null;for(int i=0;i<100;i++){files=dir.listFiles();if(files!=null&&files.length>0)break;Thread.sleep(200);}check(files!=null&&files.length>0,"native export created");File f=files[0];JSONObject config;
        try(ZipFile zip=new ZipFile(f)){config=new JSONObject(new String(bytes(zip.getInputStream(zip.getEntry("自动化/控制台导入.json"))),"UTF-8")).getJSONObject("config");check(zip.getEntry("角色指令/03_总监.txt")!=null,"director rule included");}
        check(config.getString("academy_repo").equals("mirror-owner/rules")&&config.getString("academy_branch").equals("rules/stable"),"custom academy survives native export");
        Uri uri=new Uri.Builder().scheme("content").authority("cn.novelrelay.matcher.files").appendPath("exports").appendPath(f.getName()).build();
        try(InputStream in=context.getContentResolver().openInputStream(uri);FileInputStream source=new FileInputStream(f)){check(Arrays.equals(bytes(in),bytes(source)),"share provider returns exact ZIP bytes");}
        try(Cursor cur=context.getContentResolver().query(uri,null,null,null,null)){check(cur!=null&&cur.moveToFirst()&&cur.getLong(cur.getColumnIndex(OpenableColumns.SIZE))==f.length(),"share provider size");}
        try(FileInputStream in=new FileInputStream(f);FileOutputStream out=new FileOutputStream(new File(evidence,"android-generated.zip"))){out.write(bytes(in));}
        Thread.sleep(1800);shot("android-save-picker.png");for(int k=0;k<4;k++){sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);Thread.sleep(700);if("true".equals(js("document.getElementById('message').textContent.includes('取消')")))break;}waitJS("document.getElementById('message').textContent.includes('取消')");check(true,"save cancellation returns to usable form");
        js("document.getElementById('share').click()");Thread.sleep(1800);shot("android-share.png");sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);waitJS("!document.getElementById('generate').disabled");check(true,"share chooser and return");
        runOnMainSync(()->web.loadUrl("https://appassets.androidplatform.net/assets/manual.html"));waitJS("document.querySelectorAll('h2').length===15");shot("android-manual.png");check(true,"offline integrated manual");
        try(FileOutputStream out=new FileOutputStream(new File(evidence,"android-test-report.txt"))){out.write(("Android integration checks passed: "+checks+"\nNo real ChatGPT account tested. Save picker cancellation tested; final user-selected storage write requires device acceptance.\n").getBytes("UTF-8"));}
        result.putString("stream","Android integration checks passed: "+checks+"\n");finish(Activity.RESULT_OK,result);
    }catch(Throwable e){result.putString("stream","FAIL: "+e.toString()+"\n");finish(Activity.RESULT_CANCELED,result);}}
}
