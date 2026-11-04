"""Rebuild portable releases from verified prior artifacts without reinstalling runtimes."""
import argparse,copy,hashlib,importlib.util,json,os,plistlib,shutil,stat,struct,subprocess,tempfile,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']

def digest(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as source:
  for chunk in iter(lambda:source.read(8*1024*1024),b''):h.update(chunk)
 return h.hexdigest()

def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--resume',action='store_true');parser.add_argument('--windows',type=Path);parser.add_argument('--mac',required=True,type=Path);args=parser.parse_args()
 config=json.loads((ROOT/'.cache/portable-go.json').read_text());tools=Path(config['work']);go=Path(config['goRoot'])
 if args.windows and not (go/'bin/go.exe').is_file():raise FileNotFoundError('Windows launcher rebuild requires the configured Go toolchain')
 tools.mkdir(parents=True,exist_ok=True)
 work=Path(tempfile.mkdtemp(prefix='source-update-',dir=tools))
 env=dict(os.environ,GOROOT=str(go),GOCACHE=str(tools/'go-build'),GOPATH=str(tools/'gopath'),GOTOOLCHAIN='local',CGO_ENABLED='0')
 tool=None
 if (go/'bin/go.exe').is_file():
  tool=work/'zip-overlay.exe';subprocess.run([str(go/'bin/go.exe'),'build','-trimpath','-o',str(tool),str(ROOT/'scripts/mac-artwork-zip.go')],env=env,check=True)
 overlay_dir=work/'overlays';overlay_dir.mkdir(exist_ok=True)
 sources=[p for folder in ['src','ui'] for p in (ROOT/folder).rglob('*') if p.is_file() and not p.is_symlink()]+[ROOT/'package.json']
 def packed_overlay(source,output,overlays,renames=None):
  # Rename only application-owned archive entries. Never flatten Unix symlinks.
  renames=renames or {}
  if tool and not renames:
   mapping=overlay_dir/(output.stem+'.json');mapping.write_text(json.dumps(overlays),encoding='utf-8')
   subprocess.run([str(tool),str(source),str(output),str(mapping)],check=True)
   return
  with zipfile.ZipFile(source) as previous,zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as result:
   seen=set()
   for original in previous.infolist():
    info=copy.copy(original);info.filename=renames.get(original.filename,original.filename)
    if info.filename in seen:raise ValueError('Archive rename collision: '+info.filename)
    seen.add(info.filename)
    if info.filename in overlays:
     replacement=overlays[info.filename];info.create_system=3;info.external_attr=replacement['Mode']<<16
     result.writestr(info,Path(replacement['File']).read_bytes())
    else:
     with previous.open(original) as incoming,result.open(info,'w') as outgoing:shutil.copyfileobj(incoming,outgoing,1024*1024)
   for name in sorted(set(overlays)-seen):
    replacement=overlays[name];info=zipfile.ZipInfo(name);info.create_system=3;info.external_attr=replacement['Mode']<<16;info.compress_type=zipfile.ZIP_DEFLATED
    result.writestr(info,Path(replacement['File']).read_bytes())
 def temporary(name,data):
  path=overlay_dir/name;path.write_bytes(data);return path
 def overlay(path,mode=0o100644):return {'File':str(path),'Mode':mode}
 output=ROOT/'dist'/f'Browserland-{VERSION}-Windows-Portable.exe'
 if args.windows is None:pass
 elif output.exists():
  if not args.resume:raise FileExistsError('Existing Windows release preserved')
  report=json.loads((ROOT/'reference'/f'windows-single-file-{VERSION}.json').read_text())
  if digest(output)!=report['sha256']:raise ValueError('Existing Windows release checksum mismatch')
 else:
  with zipfile.ZipFile(args.windows) as previous:
   manifest=json.loads(previous.read('single-file-manifest.json'));old_version=manifest['Version']
  proof=json.loads((ROOT/'reference'/f'windows-single-file-{old_version}.json').read_text())
  if digest(args.windows)!=proof['sha256']:raise ValueError('Windows base checksum mismatch')
  print('Updating Windows sources with verified runtime bytes unchanged...',flush=True)
  entries={};overlays={};win_renames={}
  for entry in manifest['Files']:
   renamed=entry['Path'].replace('Multi-Browser.exe','Browserland.exe').replace('Multi-Browser.cmd','Browserland.cmd').replace('multi-browser-runtime.json','browserland-runtime.json')
   if renamed!=entry['Path']:win_renames[entry['Path']]=renamed
   entry=dict(entry,Path=renamed);entries[renamed]=entry
  with zipfile.ZipFile(args.windows) as previous:
   executable=work/'Browserland.exe'
   executable.write_bytes(previous.read('Multi-Browser.exe' if 'Multi-Browser.exe' in previous.namelist() else 'Browserland.exe'))
  icons=module('app_icons',ROOT/'scripts/app_icons.py');icons.apply_windows(executable)
  data=executable.read_bytes();overlays['Browserland.exe']=overlay(executable);entries['Browserland.exe']={'Path':'Browserland.exe','Size':len(data),'SHA256':hashlib.sha256(data).hexdigest()}
  command=ROOT/'Browserland.cmd'
  if command.is_file():
   data=command.read_bytes();overlays['Browserland.cmd']=overlay(command);entries['Browserland.cmd']={'Path':'Browserland.cmd','Size':len(data),'SHA256':hashlib.sha256(data).hexdigest()}
  for source in sources:
   relative='resources/app/'+source.relative_to(ROOT).as_posix();data=source.read_bytes();sha=hashlib.sha256(data).hexdigest()
   if entries.get(relative,{}).get('SHA256')!=sha:overlays[relative]=overlay(source)
   entries[relative]={'Path':relative,'Size':len(data),'SHA256':sha}
  manifest={'Version':VERSION,'Files':sorted(entries.values(),key=lambda entry:entry['Path'])}
  raw=json.dumps(manifest,ensure_ascii=False,separators=(',',':')).encode();manifest_sha=hashlib.sha256(raw).hexdigest()
  overlays['single-file-manifest.json']=overlay(temporary('single-file-manifest.json',raw))
  payload=work/'payload.zip';packed_overlay(args.windows,payload,overlays,win_renames);payload_sha=digest(payload)
  builder=module('windows_builder',ROOT/'scripts/build-windows-single-file.py');builder.write_resources(executable)
  flags=f'-s -w -H=windowsgui -X main.payloadSHA={payload_sha} -X main.manifestSHA={manifest_sha}'
  stub=work/'launcher.exe';subprocess.run([str(go/'bin/go.exe'),'build','-trimpath','-ldflags',flags,'-o',str(stub),'.'],cwd=ROOT/'scripts/windows-single-file',env=dict(env,GOOS='windows',GOARCH='amd64'),check=True)
  with output.open('xb') as dest:
   with stub.open('rb') as source:shutil.copyfileobj(source,dest)
   offset=dest.tell()
   with payload.open('rb') as source:shutil.copyfileobj(source,dest)
   dest.write(b'MULTIBROWSER-SF1'+struct.pack('<QQ',offset,payload.stat().st_size))
  report=dict(version=VERSION,file=str(output),size=output.stat().st_size,sha256=digest(output),payloadSHA256=payload_sha,manifestSHA256=manifest_sha,files=len(entries),unpackedBytes=sum(e['Size'] for e in entries.values()),sourceVersion=old_version,sourceSHA256=proof['sha256'],runtimeTestsPending=True,nativeRuntimeCodeUnchanged=True,applicationResourcesRebranded=True)
  (ROOT/'reference'/f'windows-single-file-{VERSION}.json').write_text(json.dumps(report,indent=2))
  print('Windows portable rebuilt.',flush=True)
 output=ROOT/'dist'/f'Browserland-{VERSION}-Mac-Portable.zip'
 if output.exists() and not args.resume:raise FileExistsError('Existing Mac release preserved')
 portable=module('mac_portable',ROOT/'scripts/build-macos-portable.py')
 unified=module('mac_unified',ROOT/'scripts/build-macos-unified.py')
 if (go/'bin/go.exe').is_file():
  portable.compile_tools();launcher=portable.fat_launcher().read_bytes();launcher_kind='universal-mach-o'
 else:
  launcher=unified.launcher_script().encode();launcher_kind='native-shell-dispatch'
 with zipfile.ZipFile(args.mac) as previous:
  metadata=json.loads(previous.read('Mac-Portable/mac-portable-metadata.json'));old_version=metadata['version']
  proof=json.loads((ROOT/'reference'/f'mac-portable-{old_version}.json').read_text())
  if digest(args.mac)!=proof['zipSHA256']:raise ValueError('Mac base checksum mismatch')
  def renamed(path):
   return path.replace('Multi-Browser.app','Browserland.app').replace('/MacOS/Multi-Browser','/MacOS/Browserland').replace('multi-browser-runtime.json','browserland-runtime.json')
  renames={info.filename:renamed(info.filename) for info in previous.infolist() if renamed(info.filename)!=info.filename}
  original_paths={renamed(info.filename):info.filename for info in previous.infolist()}
  if len(original_paths)!=len(previous.infolist()):raise ValueError('Mac rebrand path collision')
  entries={}
  for old in metadata['entries']:
   entry=dict(old,path=renamed(old['path']))
   if entry['path'] in entries:raise ValueError('Mac manifest rename collision')
   entries[entry['path']]=entry
  overlays={}
  def replace(relative,data,mode=0o100644):
   file=temporary('mac-'+str(len(overlays)),data);overlays['Mac-Portable/'+relative]=overlay(file,mode)
   entries[relative]=dict(path=relative,mode=mode,kind='file',bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
  outer='Browserland.app/Contents/'
  roots=[outer]+[outer+'Resources/runtimes/'+arch+'/Browserland.app/Contents/' for arch in ['x64','arm64']]
  for app in roots:
   name=app+'Info.plist';settings=plistlib.loads(previous.read(original_paths['Mac-Portable/'+name]))
   # Keep an existing inner bundle identifier for native identity/permission compatibility.
   settings.update(CFBundleVersion=VERSION,CFBundleShortVersionString=VERSION,CFBundleDisplayName='Browserland',CFBundleName='Browserland',CFBundleIconFile='app-icon.icns')
   if app==outer:settings.update(CFBundleExecutable='Browserland',CFBundleIdentifier='net.antoniofradique.browserland.launcher')
   replace(name,plistlib.dumps(settings));replace(app+'Resources/app-icon.icns',(ROOT/'ui/assets/app-icon.icns').read_bytes())
  replace(outer+'MacOS/Browserland',launcher,0o100755)
  for app in roots[1:]:
   for source in sources:
    relative=app+'Resources/app/'+source.relative_to(ROOT).as_posix();data=source.read_bytes()
    if entries.get(relative,{}).get('sha256')!=hashlib.sha256(data).hexdigest():replace(relative,data)
  readme=portable.README.replace('0.21.0',VERSION)
  if launcher_kind=='native-shell-dispatch':
   readme=readme.replace('O lancador principal e um Mach-O universal (Intel e Apple Silicon).','O lancador usa /bin/sh do macOS para selecionar o motor nativo Intel ou Apple Silicon.')
   readme=readme.replace('O construtor 2.6.5 reconhece Mach-O no Windows e atribui permissao de execucao\na esses executaveis na exportacao Mac. Para manter todos os modos Unix originais,','O pacote inclui os motores Mach-O nativos de ambas as arquiteturas. Para manter todos os modos Unix originais,')
  replace(outer+'Resources/READ-ME-FIRST.txt',readme.encode())
  verification=dict(product='Browserland',version=VERSION,architectures=['x64','arm64'],layout='native-runtime-dispatch',launcher=launcher_kind,minimumMacOS='13.0',launcherSha256=hashlib.sha256(launcher).hexdigest(),dataDirectory='data beside Browserland.app; BROWSERLAND_DATA override; legacy override accepted',executionVerified=False,signed=False,notarized=False,sourceZipSHA256=proof['zipSHA256'])
  replace(outer+'Resources/package-verification.json',(json.dumps(verification,indent=2)+'\n').encode())
  records=sorted(entries.values(),key=lambda entry:entry['path'])
  metadata.update(product='Browserland',version=VERSION,launcher=launcher_kind,entries=records,sourceZipSHA256=proof['zipSHA256'],sharedSourcesUpdated=True,macExecutionTest='not executed: no Mac available')
  overlays['Mac-Portable/mac-portable-metadata.json']=overlay(temporary('mac-metadata.json',(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n').encode()))
  overlays['Mac-Portable/LEIA-ME.txt']=overlay(temporary('mac-readme.txt',readme.encode()))
  overlays['Mac-Portable/Restaurar-permissoes-Mac.command']=overlay(temporary('restore-mac.command',portable.restore_script(records).encode()),0o100755)
 print('Updating Browserland for both Mac architectures, retaining native binaries and symbolic links...',flush=True)
 if not output.exists():packed_overlay(args.mac,output,overlays,renames)
 with zipfile.ZipFile(output) as result:
  links=0
  if any('Multi-Browser.app' in name or '/MacOS/Multi-Browser' in name for name in result.namelist()):raise ValueError('Legacy bundle path remains')
  for entry in records:
   info=result.getinfo('Mac-Portable/'+entry['path']+('/' if entry['kind']=='directory' else ''))
   if info.external_attr>>16!=entry['mode']:raise ValueError('Mac mode changed: '+entry['path'])
   if entry['kind']=='file':
    if hashlib.sha256(result.read(info)).hexdigest()!=entry['sha256']:raise ValueError('Mac hash mismatch: '+entry['path'])
   elif entry['kind']=='symlink':
    links+=1
    if result.read(info).decode()!=entry['target']:raise ValueError('Mac symbolic link changed')
  if links!=38:raise ValueError('Unexpected Mac symlink count')
  shipped_launcher=result.read('Mac-Portable/'+outer+'MacOS/Browserland')
  if shipped_launcher!=launcher:raise ValueError('Mac launcher bytes mismatch')
  if launcher_kind=='universal-mach-o' and (launcher[:4]!=b'\xca\xfe\xba\xbe' or struct.unpack_from('>I',launcher,4)[0]!=2):raise ValueError('Mac launcher must be universal')
  if launcher_kind=='native-shell-dispatch' and not launcher.startswith(b'#!/bin/sh\n'):raise ValueError('Mac shell launcher header missing')
  for app in roots:
   settings=plistlib.loads(result.read('Mac-Portable/'+app+'Info.plist'))
   if settings['CFBundleDisplayName']!='Browserland' or settings['CFBundleVersion']!=VERSION:raise ValueError('Mac bundle branding/version mismatch')
  for app in roots[1:]:
   for source in sources:
    if result.read('Mac-Portable/'+app+'Resources/app/'+source.relative_to(ROOT).as_posix())!=source.read_bytes():raise ValueError('Mac source mismatch: '+str(source))
   if json.loads(result.read('Mac-Portable/'+app+'Resources/app/package.json'))['productName']!='Browserland':raise ValueError('Mac source product mismatch')
 report=dict(ok=True,version=VERSION,product='Browserland',zip=str(output),zipBytes=output.stat().st_size,zipSHA256=digest(output),sourceZipSHA256=proof['zipSHA256'],entriesVerified=len(records),symlinksPreserved=links,launcher=launcher_kind,architectures=['x64','arm64'],executionVerified=False,signed=False,notarized=False,nativeRuntimeBinariesUnchanged=True,sharedSourcesUpdated=True)
 (ROOT/'reference'/f'mac-portable-{VERSION}.json').write_text(json.dumps(report,indent=2))
 print('PORTABLE_SOURCES_UPDATED '+VERSION,flush=True)
if __name__=='__main__':main()
