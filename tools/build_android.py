#!/usr/bin/env python3
"""Build using the official SDK and JDK, without Gradle or Maven dependencies."""
import os,subprocess,shutil,zipfile
from pathlib import Path
R=Path(__file__).resolve().parents[1];out=R/'build/android';out.mkdir(parents=True,exist_ok=True)
sdk=Path(os.environ.get('ANDROID_HOME',os.environ.get('ANDROID_SDK_ROOT','/usr/local/lib/android/sdk')))
bt=sdk/'build-tools/35.0.0';platform=sdk/'platforms/android-35/android.jar'
def run(*args):subprocess.run([str(a) for a in args],check=True)
assert platform.exists() and (bt/'aapt').exists(),'Install platforms;android-35 and build-tools;35.0.0'
run('python3',R/'tools/build_portable.py')
assets=out/'assets';assets.mkdir(exist_ok=True)
shutil.copyfile(R/'portable/手机匹配文件生成器.html',assets/'index.html')
(assets/'manual.html').write_text((R/'portable/整合系统说明书与操作教程.html').read_text('utf-8').replace('href="手机匹配文件生成器.html"','href="index.html"'),'utf-8')
classes=out/'classes';classes.mkdir(exist_ok=True);gen=out/'gen';gen.mkdir(exist_ok=True)
run(bt/'aapt','package','-f','-M',R/'android/AndroidManifest.xml','-S',R/'android/res','-A',assets,'-I',platform,'-J',gen,'-F',out/'resources.apk')
run('javac','-encoding','UTF-8','--release','8','-classpath',platform,'-d',classes,*sorted((R/'android/src').rglob('*.java')),*sorted(gen.rglob('*.java')))
run(bt/'d8','--lib',platform,'--min-api','26','--output',out,*sorted(classes.rglob('*.class')))
shutil.copyfile(out/'resources.apk',out/'unaligned.apk')
with zipfile.ZipFile(out/'unaligned.apk','a',zipfile.ZIP_DEFLATED) as z:z.write(out/'classes.dex','classes.dex')
run(bt/'zipalign','-f','4',out/'unaligned.apk',out/'unsigned.apk')
# Distribute the official signer alongside unsigned output for private local signing.
shutil.copyfile(bt/'lib/apksigner.jar',out/'apksigner.jar')
print('Built:',out/'unsigned.apk')
