"""Build a signed APK using an installed Android SDK/JDK, without a Gradle network daemon.
Dependencies are downloaded from vendor Maven repositories; a dependency SHA256 manifest is written.
Signing keys are local only and never copied into the repository.
"""
import os,sys,pathlib,urllib.request,urllib.error,zipfile,subprocess,hashlib,json,shutil,concurrent.futures,time,random
ROOT=pathlib.Path(__file__).resolve().parents[1]
SDK=pathlib.Path(os.environ['ANDROID_HOME']);JDK=pathlib.Path(os.environ['JAVA_HOME'])
TOOLS=SDK/'build-tools/35.0.0';ANDROID=SDK/'platforms/android-35/android.jar'
BUILD=ROOT/'app/build/manual';BUILD.mkdir(parents=True,exist_ok=True)
CACHE=pathlib.Path(os.environ.get('HARUJEONGI_DEPS','/tmp/harujeongi-deps'));CACHE.mkdir(exist_ok=True)
COORDS=[
 ('ai.pleos.playground','Vehicle','2.3.2','aar'),('ai.pleos.playground','vehicle-aidl','1.1.1','aar'),('ai.pleos.playground','vehicle-data','1.1.11','aar'),
 ('ai.pleos.playground','NaviHelper','3.0.5','aar'),('ai.pleos.playground','navi-aidl','3.0.1','aar'),('ai.pleos.playground','navi-data','3.0.4','aar'),
 ('org.jetbrains.kotlin','kotlin-stdlib','1.9.25','jar'),('org.jetbrains.kotlin','kotlin-reflect','1.9.25','jar'),('org.jetbrains','annotations','23.0.0','jar'),
 ('org.jetbrains.kotlinx','kotlinx-serialization-json-jvm','1.6.3','jar'),('org.jetbrains.kotlinx','kotlinx-serialization-core-jvm','1.6.3','jar'),
 ('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm','1.6.3','jar'),('org.jetbrains.kotlinx','kotlinx-coroutines-android','1.6.3','jar'),('com.google.code.gson','gson','2.10.1','jar'),
 ('androidx.core','core-ktx','1.8.0','aar'),('androidx.core','core','1.8.0','aar'),('androidx.annotation','annotation','1.2.0','jar'),
 ('androidx.collection','collection','1.0.0','jar'),('androidx.concurrent','concurrent-futures','1.0.0','jar'),('androidx.lifecycle','lifecycle-runtime','2.3.1','aar'),
 ('androidx.lifecycle','lifecycle-common','2.3.1','jar'),('androidx.arch.core','core-common','2.1.0','jar'),('androidx.versionedparcelable','versionedparcelable','1.1.1','aar'),
 ('com.google.guava','listenablefuture','1.0','jar')]
def fetch(c):
 g,a,v,ext=c;rel=f'{g.replace(".","/")}/{a}/{v}/{a}-{v}.{ext}'
 base='https://nexus-playground.pleos.ai/repository/maven-releases/' if g.startswith('ai.pleos') else 'https://dl.google.com/dl/android/maven2/' if g.startswith('androidx') else 'https://repo.maven.apache.org/maven2/'
 p=CACHE/f'{a}-{v}.{ext}'
 if not p.exists():
  for attempt in range(5):
   try:
    urllib.request.urlretrieve(base+rel,p)
    break
   except Exception as exc:
    print(f'Dependency download failed: {base+rel} ({type(exc).__name__}: {exc}); attempt {attempt+1}',file=sys.stderr,flush=True)
    if p.exists():p.unlink()
    if attempt==4:raise
    delay = min(30, 2**(attempt+1)) + random.random()
    if isinstance(exc, urllib.error.HTTPError) and exc.code == 429:
     retry = exc.headers.get('Retry-After', '')
     if retry.isdigit():
      if int(retry) > 60: raise
      delay = max(delay, int(retry))
    time.sleep(delay)
 return c,p,base+rel
results=list(concurrent.futures.ThreadPoolExecutor(max_workers=2).map(fetch,COORDS))
jars=[];dep_resources=[];metadata=[]
expected={item['coordinate']:item['sha256'] for item in json.loads((ROOT/'docs/dependency-sha256.json').read_text())}
for c,p,u in results:
 coordinate=':'.join(c[:3]);digest=hashlib.sha256(p.read_bytes()).hexdigest()
 if expected.get(coordinate)!=digest:raise RuntimeError('Dependency checksum mismatch or missing approved checksum: '+coordinate)
 metadata.append({'coordinate':coordinate,'url':u,'sha256':digest})
 if p.suffix=='.jar':jars.append(p)
 else:
  target=CACHE/(p.stem+'-unpacked');target.mkdir(exist_ok=True)
  with zipfile.ZipFile(p) as z:z.extractall(target)
  if (target/'classes.jar').exists():jars.append(target/'classes.jar')
  if (target/'res').exists():dep_resources.append(target/'res')
(ROOT/'docs/dependency-sha256.json').write_text(json.dumps(metadata,indent=2)+'\n')
def run(args):
 subprocess.run([str(x) for x in args],check=True)
compiled=[]
for i,res in enumerate(dep_resources+[ROOT/'app/src/main/res']):
 dest=BUILD/f'res-{i}.zip';run([TOOLS/'aapt2','compile','--dir',res,'-o',dest]);compiled.append(dest)
gen=BUILD/'gen';gen.mkdir(exist_ok=True)
unsigned=BUILD/'unsigned.apk'
manifest=BUILD/'AndroidManifest.xml'
manifest.write_text((ROOT/'app/src/main/AndroidManifest.xml').read_text().replace('<manifest xmlns:android=', '<manifest package="kr.harujeongi.app" xmlns:android=',1))
run([TOOLS/'aapt2','link','--auto-add-overlay','-I',ANDROID,'--manifest',manifest,'--min-sdk-version','28','--target-sdk-version','35','--version-code','1','--version-name','0.1.0','-A',ROOT/'web','--java',gen,'-o',unsigned,*sum((['-R',p] for p in compiled),[])])
classes=BUILD/'classes';classes.mkdir(exist_ok=True)
sources=list((ROOT/'app/src/main/java').rglob('*.java'))+list(gen.rglob('*.java'))
run([JDK/'bin/javac','-source','17','-target','17','-classpath',os.pathsep.join(map(str,[ANDROID,*jars])),'-d',classes,*sources])
ownjar=BUILD/'app.jar';run([JDK/'bin/jar','cf',ownjar,'-C',classes,'.'])
dex=BUILD/'dex';dex.mkdir(exist_ok=True)
run([TOOLS/'d8','--release','--min-api','28','--lib',ANDROID,'--output',dex,ownjar,*jars])
with zipfile.ZipFile(unsigned,'a',compression=zipfile.ZIP_DEFLATED) as z:
 for p in dex.glob('*.dex'):z.write(p,p.name)
 # AAR resources merged above; required Vehicle binding permission/query/metadata are explicitly declared in the app manifest.
aligned=BUILD/'aligned.apk';run([TOOLS/'zipalign','-f','4',unsigned,aligned])
keystore=pathlib.Path(os.environ.get('HARUJEONGI_KEYSTORE','/tmp/harujeongi-contest-signing.jks'))
password=os.environ.get('HARUJEONGI_KEYSTORE_PASSWORD','harujeongi-local-build')
if not keystore.exists():run([JDK/'bin/keytool','-genkeypair','-keystore',keystore,'-alias','harujeongi','-keyalg','RSA','-keysize','2048','-validity','3650','-storepass',password,'-keypass',password,'-dname','CN=Harujeongi Contest'])
out=ROOT/'apk/김재윤_하루전기_release.apk'
out.parent.mkdir(parents=True, exist_ok=True)
env=os.environ.copy();env['HARU_SIGN_PASS']=password
subprocess.run([str(TOOLS/'apksigner'),'sign','--ks',str(keystore),'--ks-key-alias','harujeongi','--ks-pass','env:HARU_SIGN_PASS','--key-pass','env:HARU_SIGN_PASS','--out',str(out),str(aligned)],check=True,env=env)
run([TOOLS/'apksigner','verify','--verbose',out]);print('APK:',out,flush=True)
