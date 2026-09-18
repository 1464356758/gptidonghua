#!/usr/bin/env python3
from pathlib import Path
import os,subprocess,zipfile,shutil
R=Path(__file__).resolve().parents[1];out=R/'build/android';sdk=Path(os.environ['ANDROID_HOME']);bt=sdk/'build-tools/35.0.0';jar=sdk/'platforms/android-35/android.jar'
def run(*a):subprocess.run([str(x) for x in a],check=True)
classes=out/'testclasses';classes.mkdir(exist_ok=True);dex=out/'testdex';dex.mkdir(exist_ok=True)
run(bt/'aapt','package','-f','-M',R/'android/tests/AndroidManifest.xml','-I',jar,'-F',out/'test-unsigned.apk')
run('javac','-encoding','UTF-8','-source','8','-target','8','-bootclasspath',jar,'-d',classes,*sorted((R/'android/tests').rglob('*.java')))
run(bt/'d8','--lib',jar,'--min-api','26','--output',dex,*classes.rglob('*.class'))
with zipfile.ZipFile(out/'test-unsigned.apk','a',zipfile.ZIP_DEFLATED) as z:z.write(dex/'classes.dex','classes.dex')
# Ephemeral CI signing only. This key is not used for the delivered application.
run('keytool','-genkeypair','-noprompt','-keystore',out/'ci-test.p12','-storepass','android','-keypass','android','-alias','test','-keyalg','RSA','-keysize','2048','-validity','10','-dname','CN=CI only')
for src,dest in [('unsigned.apk','ci-app.apk'),('test-unsigned.apk','ci-test.apk')]:run(bt/'apksigner','sign','--ks',out/'ci-test.p12','--ks-pass','pass:android','--out',out/dest,out/src)
