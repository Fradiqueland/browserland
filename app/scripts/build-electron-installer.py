"""Build a genuine NSIS Setup.exe containing the complete Electron/Chromium app."""
import argparse,hashlib,json,shutil,subprocess,uuid,zipfile
import app_icons
from pathlib import Path,PurePosixPath
ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'package.json').read_text())['version']
WORK=ROOT/'.cache/electron-installer'

def digest(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as stream:
  for chunk in iter(lambda:stream.read(8*1024*1024),b''):h.update(chunk)
 return h.hexdigest()

def quoted(value):
 value=str(value)
 if any(char in value for char in ['\n','\r','"']):raise ValueError('Invalid installer path')
 return '"'+value.replace('$','$$')+'"'

def payload_include(entries,stage,output):
 lines=['!macro MB_INSTALL_FILES'];previous=None
 for item in entries:
  relative=item['Path'];folder=str(PurePosixPath(relative).parent)
  if folder!=previous:
   suffix='' if folder=='.' else '\\'+folder.replace('/','\\')
   lines.append('SetOutPath "$INSTDIR'+suffix+'"');previous=folder
  lines.append('File '+quoted(stage.joinpath(*PurePosixPath(relative).parts)))
 lines+=['!macroend','!macro MB_REMOVE_FILES']
 lines+=['Delete "$INSTDIR\\'+item['Path'].replace('/','\\')+'"' for item in entries]
 lines+=['!macroend','!macro MB_REMOVE_EMPTY_DIRECTORIES']
 folders=set()
 for item in entries:
  parent=PurePosixPath(item['Path']).parent
  while str(parent)!='.':folders.add(str(parent));parent=parent.parent
 lines+=['RMDir "$INSTDIR\\'+folder.replace('/','\\')+'"' for folder in sorted(folders,key=lambda p:len(p.split('/')),reverse=True)]
 lines+=['!macroend'];output.write_text('\n'.join(lines)+'\n',encoding='utf-8-sig')

def updated_setup_payload(source):
 # Reuse a verified installer when the original portable archive is absent.
 # Extract to a fresh build directory; never modify installed files or profiles.
 proofs=[json.loads(p.read_text()) for p in (ROOT/'reference').glob('electron-installer-*.json')]
 source_hash=digest(source)
 # User-renamed downloads are accepted by the verified bytes, not a basename.
 proof=next((p for p in proofs if p.get('sha256')==source_hash),None)
 if not proof:raise ValueError('Base installer checksum mismatch')
 stage=WORK/('payload-'+VERSION);stage.mkdir(parents=True,exist_ok=False)
 extractor=WORK/'full-sevenzip/7z.exe'
 subprocess.run([str(extractor),'x','-y','-o'+str(stage),str(source)],check=True,timeout=180)
 package=stage/'resources/app'
 if json.loads((package/'package.json').read_text())['version']!=proof['version']:raise ValueError('Base application version mismatch')
 uninstallers={'Uninstall Browserland.exe','Uninstall Multi-Browser.exe'}
 files=[p for p in stage.rglob('*') if p.is_file() and p.relative_to(stage).parts[0]!='$PLUGINSDIR' and p.name not in uninstallers]
 if len(files)!=proof['payloadFiles']:raise ValueError('Base application payload count mismatch')
 if any(p.is_symlink() or 'data'==p.relative_to(stage).parts[0].lower() for p in files):raise ValueError('Unexpected base application data')
 branded_names={'Multi-Browser.exe','Multi-Browser.cmd','Browserland.exe','Browserland.cmd','LEIA-ME.txt'}
 runtime_hashes={p.relative_to(stage).as_posix():digest(p) for p in files if not p.is_relative_to(package) and p.name not in branded_names}
 # Only the application filename, icon and VERSIONINFO change. The executable
 # code is checked by app_icons; Chromium and other runtime files stay identical.
 legacy_exe=stage/'Multi-Browser.exe';executable=stage/'Browserland.exe'
 if legacy_exe.exists():legacy_exe.rename(executable)
 legacy_cmd=stage/'Multi-Browser.cmd'
 if legacy_cmd.exists():legacy_cmd.rename(stage/'Browserland.cmd')
 if (stage/'Browserland.cmd').exists():(stage/'Browserland.cmd').write_bytes(b'@echo off\r\nstart "" "%~dp0Browserland.exe"\r\n')
 app_icons.apply_windows(executable)
 legacy_manifest=stage/'.runtime/chromium/multi-browser-runtime.json'
 if legacy_manifest.exists():
  legacy_manifest.rename(stage/'.runtime/chromium/browserland-runtime.json')
  runtime_hashes['.runtime/chromium/browserland-runtime.json']=runtime_hashes.pop('.runtime/chromium/multi-browser-runtime.json')
 for folder in ['src','ui']:
  shutil.copytree(ROOT/folder,package/folder,dirs_exist_ok=True)
 shutil.copy2(ROOT/'package.json',package/'package.json');shutil.copy2(ROOT/'LEIA-ME.txt',stage/'LEIA-ME.txt')
 entries=[]
 for file in sorted(stage.rglob('*')):
  if not file.is_file() or file.relative_to(stage).parts[0]=='$PLUGINSDIR' or file.name in uninstallers:continue
  relative=file.relative_to(stage).as_posix();sha=digest(file)
  if relative in runtime_hashes and sha!=runtime_hashes[relative]:raise ValueError('Native runtime changed')
  entries.append({'Path':relative,'Size':file.stat().st_size,'SHA256':sha})
 (WORK/('payload-'+VERSION+'.json')).write_text(json.dumps(entries,indent=2))
 return stage,entries,proof

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--compiler',type=Path);parser.add_argument('--base-setup',type=Path);args=parser.parse_args()
 compiler=args.compiler or WORK/'nsis-3.13/Bin/makensis.exe'
 source=ROOT/'dist'/f'Browserland-{VERSION}-Windows-Portable.exe'
 output=ROOT/'dist'/f'Browserland-{VERSION}-Windows-Setup.exe'
 if output.exists():raise FileExistsError('Existing EXE installer preserved')
 if args.base_setup:
  stage,entries,proof=updated_setup_payload(args.base_setup.resolve())
 else:
  report=ROOT/'reference'/f'windows-single-file-{VERSION}.json'
  proof=json.loads(report.read_text()) if report.exists() else json.loads((ROOT/'scripts/windows-installer-base.json').read_text())[VERSION]
  if digest(source)!=proof['sha256']:raise ValueError('Original application checksum mismatch')
  stage=WORK/'payload';stage.mkdir(parents=True,exist_ok=True)
  print('Preparing complete Electron and Chromium installation files...',flush=True)
  with zipfile.ZipFile(source) as archive:
   manifest=json.loads(archive.read('single-file-manifest.json'))
   if manifest['Version']!=VERSION:raise ValueError('Application version mismatch')
   for item in manifest['Files']:
    name=item['Path'];parts=PurePosixPath(name).parts
    if name.startswith('/') or '..' in parts or '\\' in name or ':' in name or parts[0].lower()=='data':raise ValueError('Unsafe application payload')
    file=stage.joinpath(*parts);file.parent.mkdir(parents=True,exist_ok=True)
    if not file.exists():
     with archive.open(name) as incoming,file.open('xb') as outgoing:
      while chunk:=incoming.read(1024*1024):outgoing.write(chunk)
    if file.stat().st_size!=item['Size'] or digest(file)!=item['SHA256']:raise ValueError('Application file changed: '+name)
   entries=manifest['Files']
 # Both source paths expose the complete manifest to the independent verifier.
 (WORK/('payload-'+VERSION+'.json')).write_text(json.dumps(entries,indent=2))
 include=WORK/('payload-'+VERSION+'.nsh');payload_include(entries,stage,include)
 base=[str(compiler),'/V3','/INPUTCHARSET','UTF8','/DMB_VERSION='+VERSION,'/DMB_ICON='+str(ROOT/'ui/assets/app-icon.ico'),'/DMB_SIZE_KB='+str(sum(item['Size'] for item in entries)//1024)]
 print('Building branded NSIS Setup.exe...',flush=True)
 subprocess.run(base+['/DMB_PAYLOAD_INCLUDE='+str(include),'/DMB_OUTPUT='+str(output),str(ROOT/'scripts/windows-installer-nsis.nsi')],check=True,timeout=300)
 # Same installer/uninstaller instructions, with a tiny payload and isolated
 # shortcuts/registry, so native testing cannot affect the user's real app.
 fixture=WORK/'test-payload';fixture.mkdir(exist_ok=True);(fixture/'Browserland.exe').write_bytes(b'controlled installer fixture; never launched')
 fixture_icon=fixture/'resources/app/ui/assets/app-icon.ico';fixture_icon.parent.mkdir(parents=True,exist_ok=True)
 shutil.copy2(ROOT/'ui/assets/app-icon.ico',fixture_icon)
 fake=[{'Path':'Browserland.exe'},{'Path':'resources/app/ui/assets/app-icon.ico'}];test_include=WORK/'test-payload.nsh';payload_include(fake,fixture,test_include)
 test_exe=WORK/'Test-Setup.exe';test_id=uuid.uuid4().hex
 subprocess.run(base+['/DMB_TEST=1','/DMB_TEST_ID='+test_id,'/DMB_PAYLOAD_INCLUDE='+str(test_include),'/DMB_OUTPUT='+str(test_exe),str(ROOT/'scripts/windows-installer-nsis.nsi')],check=True,timeout=30)
 result=dict(version=VERSION,file=str(output),bytes=output.stat().st_size,sha256=digest(output),format='NSIS Setup.exe',application='Electron with bundled full Chromium',applicationArchitecture='x64',installerArchitecture='x86-unicode',frameworkVersion='3.13',scope='current-user',defaultDirectory=r'%LOCALAPPDATA%\Programs\Browserland',desktopShortcut=True,startMenuShortcut=True,uninstallEntry=True,externalRuntimesRequired=False,requiresWindowsInstallerService=False,payloadFiles=len(entries),dataPreservedOnUpdate=True,dataPreservedOnUninstall=True,uninstallUsesRecursiveDelete=False,sourcePortableSHA256=proof['sha256'],signed=False,nativeExecutionTestPending=True,testSetup=str(test_exe),testId=test_id)
 if args.base_setup:
  result['sourceInstallerSHA256']=result.pop('sourcePortableSHA256')
  result['nativeRuntimeBytesUnchangedExceptApplicationBranding']=True
  result['applicationCodeSectionsUnchanged']=True
  result['legacyUpgradeUsesExistingDirectory']=True
 (ROOT/'reference').mkdir(exist_ok=True);(ROOT/'reference'/f'electron-installer-{VERSION}.json').write_text(json.dumps(result,indent=2))
 print('ELECTRON_NSIS_SETUP_BUILT '+str(output),flush=True)
if __name__=='__main__':main()
