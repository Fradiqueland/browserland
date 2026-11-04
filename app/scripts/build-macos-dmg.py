"""Build one real macOS DMG on Windows, without installing a system runtime."""
from pathlib import Path
import hashlib, json, os, shutil, subprocess, sys, urllib.request, zipfile
ROOT=Path(__file__).resolve().parent.parent
SCRIPTS=ROOT/'scripts'
CACHE=ROOT/'.cache/dmg-toolchain'

def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()

def download(url,path,expected):
 if not path.exists():
  with urllib.request.urlopen(url,timeout=60) as incoming,path.open('xb') as outgoing:
   shutil.copyfileobj(incoming,outgoing,1024*1024)
 if digest(path)!=expected:raise ValueError('Toolchain checksum mismatch: '+str(path))

def extract(archive,destination):
 with zipfile.ZipFile(archive) as z:
  for name in z.namelist():
   target=(destination/name).resolve()
   if not target.is_relative_to(destination.resolve()):raise ValueError('Unsafe toolchain path')
  z.extractall(destination)

def build():
 version=json.loads((ROOT/'package.json').read_text())['version']
 output=ROOT/'dist'/f'Browserland-{version}-mac.dmg'
 if output.exists():raise FileExistsError('Existing DMG preserved: '+str(output))
 source=ROOT/'dist'/f'Browserland-{version}-mac.zip'
 proof=json.loads((ROOT/'reference'/f'mac-single-{version}.json').read_text())
 if not proof.get('ok') or digest(source)!=proof['sha256']:raise ValueError('Input ZIP checksum mismatch')
 pins=json.loads((SCRIPTS/'mac-dmg-toolchain.json').read_text())
 CACHE.mkdir(parents=True,exist_ok=True)
 gozip=CACHE/pins['go']['filename']
 download('https://go.dev/dl/'+gozip.name,gozip,pins['go']['sha256'])
 if not (CACHE/'go/bin/go.exe').exists():extract(gozip,CACHE)
 modulezip=CACHE/'go-dmg-writer.zip'
 module='github.com/jetbrains/go-dmg-writer'
 download('https://proxy.golang.org/'+module+'/@v/'+pins['moduleVersion']+'.zip',modulezip,pins['moduleZipSha256'])
 writer=CACHE/'module'/(module+'@'+pins['moduleVersion'])
 if not writer.exists():extract(modulezip,CACHE/'module')
 for src,dest in [('mac-dmg-zip.go','zip_adapter.go'),('mac-dmg-create.go','create_zip.go'),('mac-dmg-zip_test.go','zip_adapter_test.go'),('mac-dmg-main.go','cmd/browserland-dmg/main.go')]:
  target=writer/dest;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(SCRIPTS/src,target)
 env=dict(os.environ,GOROOT=str(CACHE/'go'),GOPATH=str(CACHE/'gopath'),GOCACHE=str(CACHE/'gocache'),
          GOMODCACHE=str(CACHE/'gomodcache'),GOTOOLCHAIN='local',CGO_ENABLED='0',
          GOPROXY='https://proxy.golang.org',GOSUMDB='sum.golang.org')
 exe=CACHE/'browserland-dmg.exe';go=CACHE/'go/bin/go.exe'
 subprocess.run([go,'test','./...'],cwd=writer,env=env,check=True)
 subprocess.run([go,'build','-o',exe,'./cmd/browserland-dmg'],cwd=writer,env=env,check=True)
 subprocess.run([exe,source,output,CACHE],check=True)
 report=ROOT/'reference'/f'mac-dmg-{version}.json'
 subprocess.run([sys.executable,SCRIPTS/'verify-macos-dmg.py',output,source,report],check=True)
 result=json.loads(report.read_text());result['toolchainModule']=module+'@'+pins['moduleVersion']
 result['goVersion']=pins['go']['version'];result['toolSHA256']=digest(exe)
 report.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
 print('MAC_DMG_VERIFIED: '+str(output))

if __name__=='__main__':build()
