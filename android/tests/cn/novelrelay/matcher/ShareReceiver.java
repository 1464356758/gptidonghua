package cn.novelrelay.matcher;
import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.widget.TextView;
import java.io.InputStream;
import java.security.MessageDigest;

/** Installed only in the separate CI test APK, never in the delivered app. */
public final class ShareReceiver extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        TextView view=new TextView(this);view.setTextSize(18);view.setPadding(32,80,32,32);setContentView(view);
        try {
            Intent intent=getIntent();Uri uri=intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if(!Intent.ACTION_SEND.equals(intent.getAction())||!"application/zip".equals(intent.getType())||uri==null||!"content".equals(uri.getScheme())||(intent.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION)==0)throw new Exception("Invalid share intent or read grant");
            MessageDigest digest=MessageDigest.getInstance("SHA-256");long size=0;
            try(InputStream in=getContentResolver().openInputStream(uri)){byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1){digest.update(buf,0,n);size+=n;}}
            StringBuilder hash=new StringBuilder();for(byte b:digest.digest())hash.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
            view.setText("Share received: "+hash+"\nBytes: "+size+"\nReceiver UID: "+android.os.Process.myUid());
        }catch(Exception e){view.setText("Share failed: "+e.toString());}
    }
}
