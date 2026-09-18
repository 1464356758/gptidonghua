package cn.novelrelay.matcher;
import android.content.*;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;
public final class ZipProvider extends ContentProvider {
    public static Uri uri(File file){return new Uri.Builder().scheme("content").authority("cn.novelrelay.matcher.files").appendPath("exports").appendPath(file.getName()).build();}
    private File resolve(Uri uri)throws FileNotFoundException{
        if(!uri.getAuthority().equals("cn.novelrelay.matcher.files")||uri.getPathSegments().size()!=2||!uri.getPathSegments().get(0).equals("exports"))throw new FileNotFoundException();
        try{File dir=new File(getContext().getFilesDir(),"exports").getCanonicalFile(),file=new File(dir,uri.getLastPathSegment()).getCanonicalFile();if(!dir.equals(file.getParentFile())||!file.isFile()||!file.getName().endsWith(".zip"))throw new FileNotFoundException();return file;}catch(IOException e){throw new FileNotFoundException();}
    }
    @Override public boolean onCreate(){return true;}
    @Override public String getType(Uri uri){return "application/zip";}
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{if(!mode.equals("r"))throw new FileNotFoundException("read only");return ParcelFileDescriptor.open(resolve(uri),ParcelFileDescriptor.MODE_READ_ONLY);}
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){
        try{File f=resolve(uri);String[] cols=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;MatrixCursor cursor=new MatrixCursor(cols);Object[] row=new Object[cols.length];String name=f.getName().replaceFirst("^[0-9]+_[a-f0-9]{8}_","");for(int i=0;i<cols.length;i++)row[i]=cols[i].equals(OpenableColumns.DISPLAY_NAME)?name:cols[i].equals(OpenableColumns.SIZE)?f.length():null;cursor.addRow(row);return cursor;}catch(FileNotFoundException e){return null;}
    }
    @Override public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
    @Override public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
    @Override public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
}
