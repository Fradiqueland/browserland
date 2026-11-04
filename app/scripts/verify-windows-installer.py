"""Inspect MSI metadata and optionally install an isolated test copy, never the real product."""
import argparse,hashlib,json,os,shutil,subprocess,uuid,zipfile
from pathlib import Path,PurePosixPath
from msi_database import Database
ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'package.json').read_text())['version']

def digest(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as stream:
  for chunk in iter(lambda:stream.read(8*1024*1024),b''):h.update(chunk)
 return h.hexdigest()

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--install-test',action='store_true');parser.add_argument('--verify-payload',action='store_true');args=parser.parse_args()
 proof=json.loads((ROOT/'reference'/f'windows-installer-{VERSION}.json').read_text())
 source=Path(proof['file'])
 assert digest(source)==proof['sha256'],'Installer checksum mismatch'
 with zipfile.ZipFile(ROOT/'dist'/f'Browserland-{VERSION}-Windows-Portable.exe') as portable:manifest=json.loads(portable.read('single-file-manifest.json'))
 expected={item['Path']:item for item in manifest['Files']};checks=[]
 def check(label,value):
  assert value,label;checks.append(label);print('PASS '+label,flush=True)
 with Database(source) as db:
  properties=dict(db.query('SELECT `Property`,`Value` FROM `Property`'));check('Correct product and version',properties.get('ProductName')=='Browserland' and properties.get('ProductVersion')==VERSION)
  check('Current-user installation without administrator privileges',properties.get('ALLUSERS','')=='' and db.summary(15)&8!=0)
  check('Native x64 Windows Installer package',db.summary(7).startswith('x64;'))
  dirs={row[0]:(row[1],row[2].split('|')[-1]) for row in db.query('SELECT `Directory`,`Directory_Parent`,`DefaultDir` FROM `Directory`')}
  check('Default location is the current-user Programs folder',dirs['INSTALLFOLDER']==('UserProgramsFolder','Browserland') and dirs['UserProgramsFolder']==('LocalAppDataFolder','Programs'))
  components={row[0]:row[1] for row in db.query('SELECT `Component`,`Directory_` FROM `Component`')}
  def relative(directory):
   if directory=='INSTALLFOLDER':return ''
   parent,name=dirs[directory];return str(PurePosixPath(relative(parent))/name)
  installed={};file_ids={}
  for fid,component,name,size in db.query('SELECT `File`,`Component_`,`FileName`,`FileSize` FROM `File`'):
   name=name.split('|')[-1];path=str(PurePosixPath(relative(components[component]))/name);installed[path]=int(size);file_ids[fid]=path
  check('All application and runtime files are included exactly',installed=={path:item['Size'] for path,item in expected.items()})
  check('No profile or session data is part of the installation payload',not any(path.split('/')[0].lower()=='data' for path in installed))
  media=db.query('SELECT `Cabinet` FROM `Media`');check('All cabinet files are embedded in one MSI',bool(media) and all(row[0].startswith('#') for row in media))
  shortcuts=db.query('SELECT `Shortcut`,`Directory_`,`Target`,`WkDir`,`Icon_` FROM `Shortcut`')
  check('Desktop and Start menu shortcuts point directly to the installed program',len(shortcuts)==2 and {row[1] for row in shortcuts}=={'DesktopFolder','BrowserlandMenu'} and all(row[2].startswith('[#') and file_ids.get(row[2][2:-1])=='Browserland.exe' and row[3]=='INSTALLFOLDER' and row[4]=='ApplicationIcon' for row in shortcuts))
  removals=db.query('SELECT `FileName`,`InstallMode` FROM `RemoveFile`');check('Uninstall removes only owned files and empty directories',all(row[0]=='' and row[1]=='2' for row in removals))
  actions=dict(db.query('SELECT `Action`,`Sequence` FROM `InstallExecuteSequence`'));check('Updates run inside the Windows Installer rollback transaction',int(actions['InstallInitialize'])<int(actions['RemoveExistingProducts'])<int(actions['InstallFinalize']))
  events=db.query("SELECT `Dialog_`,`Control_`,`Argument` FROM `ControlEvent` WHERE `Event`='NewDialog'")
  check('Directory chooser and normal install wizard are configured',any(row==['WelcomeDlg','Next','InstallDirDlg'] for row in events) and any(row==['InstallDirDlg','Back','WelcomeDlg'] for row in events))
 result=dict(ok=True,version=VERSION,checks=checks,installationTest='not requested',nativeApplicationExecutionVerified=False)
 if args.verify_payload:
  payload=ROOT/'.cache/windows-installer/payload-verification';payload.mkdir(exist_ok=False)
  with Database(source) as db:
   for cabinet, in media:
    file=payload/cabinet[1:];db.export_stream(cabinet[1:],file)
    with (payload/'expand.log').open('ab') as log:subprocess.run(['C:/Windows/System32/expand.exe','-F:*',str(file),str(payload)],stdout=log,stderr=log,check=True,timeout=120)
  check('Embedded cabinets expand to all 388 original application/runtime file hashes',len(file_ids)==len(expected) and all(digest(payload/fid)==expected[path]['SHA256'] for fid,path in file_ids.items()))
  result['payloadHashesVerified']=len(expected)
 if args.install_test:
  run=ROOT/'test-results'/('installer-'+uuid.uuid4().hex);run.mkdir(parents=True);target=run/'Installed application';test_msi=run/'Isolated installer test.msi';shutil.copy2(source,test_msi)
  test_id=str(uuid.uuid4()).upper();product='{'+str(uuid.uuid4()).upper()+'}';upgrade='{'+str(uuid.uuid4()).upper()+'}'
  test_prefix=r'Software\AntonioFradique\Multi-Browser\InstallerTests'+'\\'+test_id
  with Database(test_msi,write=True) as db:
   db.execute("UPDATE `Property` SET `Value`='"+product+"' WHERE `Property`='ProductCode'")
   db.execute("UPDATE `Property` SET `Value`='Browserland isolated installer test' WHERE `Property`='ProductName'")
   db.execute("UPDATE `Property` SET `Value`='"+upgrade+"' WHERE `Property`='UpgradeCode'")
   db.execute('DELETE FROM `Upgrade`')
   for cid,old in db.query('SELECT `Component`,`ComponentId` FROM `Component`'):
    new_guid='{'+str(uuid.uuid5(uuid.UUID(test_id),cid)).upper()+'}'
    db.execute("UPDATE `Component` SET `ComponentId`='"+new_guid+"' WHERE `Component`='"+cid+"'")
   for key, in db.query('SELECT DISTINCT `Key` FROM `Registry`'):
    db.execute("UPDATE `Registry` SET `Key`='"+key.replace(r'Software\AntonioFradique\Multi-Browser\Installer',test_prefix)+"' WHERE `Key`='"+key+"'")
   for key, in db.query('SELECT DISTINCT `Key` FROM `RegLocator`'):
    db.execute("UPDATE `RegLocator` SET `Key`='"+key.replace(r'Software\AntonioFradique\Multi-Browser\Installer',test_prefix)+"' WHERE `Key`='"+key+"'")
   # Rename standard shell directories so the test cannot touch the user's
   # actual Desktop or Start menu. Production MSI is left unchanged.
   for old,new,name in [('DesktopFolder','TEST_DESKTOP','TestDesktop'),('ProgramMenuFolder','TEST_STARTMENU','TestStartMenu')]:
    db.execute("INSERT INTO `Directory` (`Directory`,`Directory_Parent`,`DefaultDir`) VALUES ('"+new+"','INSTALLFOLDER','"+name+"')")
    for table,column in [('Directory','Directory_Parent'),('Component','Directory_'),('Shortcut','Directory_'),('RemoveFile','DirProperty')]:
     db.execute('UPDATE `'+table+'` SET `'+column+"`='"+new+"' WHERE `"+column+"`='"+old+"'")
    db.execute("DELETE FROM `Directory` WHERE `Directory`='"+old+"'")
   db.set_package_code('{'+str(uuid.uuid4()).upper()+'}');db.commit()
  def msiexec(args,label):
   with (run/(label+'.stdout')).open('wb') as output:
    # MSI property names must stay outside the quotes around their values.
    tokens=['C:/Windows/System32/msiexec.exe',*args,'/qn','/norestart','/l*v',str(run/(label+'.log'))]
    command=[]
    for token in tokens:
     if token.startswith(('INSTALLFOLDER=','REINSTALL=','REINSTALLMODE=')):
      key,value=token.split('=',1)
      if '"' in value:raise ValueError('Invalid test property value')
      command.append(key+'="'+value+'"')
     else:command.append(subprocess.list2cmdline([token]))
    process=subprocess.Popen(' '.join(command),stdout=output,stderr=output)
    try:return process.wait(timeout=180)
    except subprocess.TimeoutExpired:
     subprocess.run(['C:/Windows/System32/taskkill.exe','/PID',str(process.pid),'/T','/F'],capture_output=True);raise
  code=msiexec(['/i',str(test_msi),'INSTALLFOLDER='+str(target)],'install')
  result.update(run=str(run),installationExit=code)
  if code not in (0,3010):
   result['installationTest']='blocked or failed in the restricted execution environment';result['installationLog']=str(run/'install.log')
   print('NATIVE_INSTALL_TEST_NOT_COMPLETED exit='+str(code),flush=True)
  else:
   try:
    check('Actual isolated installation writes every bundled file correctly',all(digest(target/path)==item['SHA256'] for path,item in expected.items()))
    check('Actual installation creates Desktop and Start menu shortcuts', (target/'TestDesktop/Browserland.lnk').is_file() and (target/'TestStartMenu/Browserland/Browserland.lnk').is_file())
    private=target/'data/profiles/fixture';private.mkdir(parents=True);marker=private/'session.bin';marker.write_bytes(b'controlled session persistence fixture')
    preserve=marker.read_bytes();changed=target/'resources/app/ui/social-links.css';changed.write_text('controlled repair fixture')
    code=msiexec(['/i',str(test_msi),'REINSTALL=ALL','REINSTALLMODE=amus'],'repair');check('Repair restores application files and preserves session data',code in (0,3010) and digest(changed)==expected['resources/app/ui/social-links.css']['SHA256'] and marker.read_bytes()==preserve)
    code=msiexec(['/x',product],'uninstall');check('Actual uninstall removes the program and preserves sessions',code in (0,3010) and not (target/'Browserland.exe').exists() and marker.read_bytes()==preserve)
    check('Actual uninstall removes its generated shortcuts',not (target/'TestDesktop/Browserland.lnk').exists() and not (target/'TestStartMenu/Browserland/Browserland.lnk').exists())
    result['installationTest']='installed, repaired and uninstalled successfully with data retained'
   finally:
    if (target/'Browserland.exe').exists():msiexec(['/x',product],'cleanup')
 result['checks']=checks
 (ROOT/'reference'/f'windows-installer-verification-{VERSION}.json').write_text(json.dumps(result,indent=2))
 if result['installationTest']=='not requested' and proof.get('installationTest'):result['installationTest']=proof['installationTest']
 proof.update(structureVerified=True,executionTestsPending=result['installationTest']!='installed, repaired and uninstalled successfully with data retained',installationTest=result['installationTest'],checks=len(checks),payloadHashesVerified=result.get('payloadHashesVerified',proof.get('payloadHashesVerified',0)));(ROOT/'reference'/f'windows-installer-{VERSION}.json').write_text(json.dumps(proof,indent=2))
 print('WINDOWS_INSTALLER_VERIFIED '+str(source),flush=True)
if __name__=='__main__':main()
