"""Build a per-user native MSI from the verified self-contained Windows release."""
import argparse,hashlib,json,os,shutil,subprocess,uuid,zipfile
import xml.etree.ElementTree as ET
from pathlib import Path,PurePosixPath
from msi_database import Database

ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'package.json').read_text())['version']
WORK=ROOT/'.cache/windows-installer'
# Keep the legacy UpgradeCode/component namespace for MSI upgrade compatibility.
NAMESPACE=uuid.uuid5(uuid.NAMESPACE_URL,'https://antoniofradique.net/multi-browser/windows-installer/v1')
NS='http://wixtoolset.org/schemas/v4/wxs'
UI_NS='http://wixtoolset.org/schemas/v4/wxs/ui'
ET.register_namespace('',NS);ET.register_namespace('ui',UI_NS)

def digest(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as stream:
  for chunk in iter(lambda:stream.read(8*1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def id_for(prefix,value):return prefix+hashlib.sha1(value.encode()).hexdigest()[:20]
def element(parent,tag,**values):return ET.SubElement(parent,'{'+NS+'}'+tag,values)
def guid(value):return str(uuid.uuid5(NAMESPACE,value)).upper()

def main():
 (ROOT/'reference').mkdir(exist_ok=True)
 parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path);parser.add_argument('--resume',action='store_true');args=parser.parse_args()
 source=args.source or ROOT/'dist'/f'Browserland-{VERSION}-Windows-Portable.exe'
 report=ROOT/'reference'/f'windows-single-file-{VERSION}.json'
 proof=json.loads(report.read_text()) if report.exists() else json.loads((ROOT/'scripts/windows-installer-base.json').read_text())[VERSION]
 if digest(source)!=proof['sha256']:raise ValueError('Windows release checksum mismatch')
 output=ROOT/'dist'/f'Browserland-{VERSION}-Windows-Setup.msi'
 if output.exists() and not args.resume:raise FileExistsError('Existing installer preserved')
 stage=WORK/'payload'
 stage.mkdir(parents=True,exist_ok=True)
 print('Extracting the complete verified application and runtimes...',flush=True)
 with zipfile.ZipFile(source) as archive:
  manifest=json.loads(archive.read('single-file-manifest.json'))
  if manifest['Version']!=VERSION:raise ValueError('Application version mismatch')
  for item in manifest['Files']:
   relative=item['Path'];parts=PurePosixPath(relative).parts
   if not parts or relative.startswith('/') or '..' in parts or '\\' in relative or ':' in relative or parts[0].lower()=='data':raise ValueError('Unsafe installation payload path')
   dest=stage.joinpath(*parts);dest.parent.mkdir(parents=True,exist_ok=True);h=hashlib.sha256();size=0
   if dest.exists():
    if dest.stat().st_size!=item['Size'] or digest(dest)!=item['SHA256']:raise ValueError('Existing staging file changed: '+relative)
    continue
   with archive.open(relative) as incoming,dest.open('xb') as outgoing:
    for chunk in iter(lambda:incoming.read(1024*1024),b''):outgoing.write(chunk);h.update(chunk);size+=len(chunk)
   if size!=item['Size'] or h.hexdigest()!=item['SHA256']:raise ValueError('Installation file hash mismatch: '+relative)
 wix=WORK/'wix/wix-6.0.2/tools/net6.0/any/wix.dll'
 extension=WORK/'wix/wixtoolset.ui.wixext-6.0.2/wixext6/WixToolset.UI.wixext.dll'
 if not wix.is_file() or not extension.is_file():raise FileNotFoundError('Prepare pinned WiX 6.0.2 build tools first')
 document=ET.Element('{'+NS+'}Wix')
 package=element(document,'Package',Name='Browserland',Manufacturer='Antonio Fradique',Version=VERSION,Language='1033',UpgradeCode=str(NAMESPACE).upper(),Scope='perUser',InstallerVersion='500',Compressed='yes')
 element(package,'MajorUpgrade',AllowSameVersionUpgrades='yes',Schedule='afterInstallInitialize',DowngradeErrorMessage='A newer Browserland version is already installed.')
 element(package,'MediaTemplate',EmbedCab='yes',CompressionLevel='mszip',MaximumUncompressedMediaSize='2048')
 element(package,'Icon',Id='ApplicationIcon',SourceFile=str(ROOT/'ui/assets/app-icon.ico'))
 for name,value in [('ARPPRODUCTICON','ApplicationIcon'),('ARPURLINFOABOUT','https://AntonioFradique.net'),('MSIRESTARTMANAGERCONTROL','Disable')]:element(package,'Property',Id=name,Value=value)
 # Preserve the MSI registry keypaths as well as UpgradeCode, so existing MSI
 # installations upgrade in place without relocating their private data.
 property_node=element(package,'Property',Id='INSTALLFOLDER')
 element(property_node,'RegistrySearch',Id='PreviousInstallFolder',Root='HKCU',Key=r'Software\AntonioFradique\Multi-Browser\Installer',Name='InstallDir',Type='raw',Bitness='always64')
 local=element(package,'StandardDirectory',Id='LocalAppDataFolder');programs=element(local,'Directory',Id='UserProgramsFolder',Name='Programs')
 application=element(programs,'Directory',Id='INSTALLFOLDER',Name='Browserland')
 directories={'':application};directory_ids={'':'INSTALLFOLDER'};components=[];files={}
 all_paths=sorted({str(PurePosixPath(item['Path']).parent) for item in manifest['Files']})
 def directory(path):
  if path in ('','.'):return application
  if path not in directories:
   parent=str(PurePosixPath(path).parent);name=PurePosixPath(path).name;identifier=id_for('Dir_',path)
   directories[path]=element(directory(parent),'Directory',Id=identifier,Name=name);directory_ids[path]=identifier
  return directories[path]
 for item in manifest['Files']:
  relative=item['Path'];component_id=id_for('Component_',relative);file_id=id_for('File_',relative);components.append(component_id);files[relative]=file_id
  component=element(directory(str(PurePosixPath(relative).parent)),'Component',Id=component_id,Guid=guid('file:'+relative),Bitness='always64')
  element(component,'File',Id=file_id,Source=str(stage.joinpath(*PurePosixPath(relative).parts)),KeyPath='no')
  element(component,'RegistryValue',Root='HKCU',Key=r'Software\AntonioFradique\Multi-Browser\Installer\Components',Name=file_id,Type='string',Value=VERSION,KeyPath='yes')
 marker=element(application,'Component',Id='InstallationMarker',Guid=guid('install-folder'),Bitness='always64');components.append('InstallationMarker')
 element(marker,'RegistryValue',Root='HKCU',Key=r'Software\AntonioFradique\Multi-Browser\Installer',Name='InstallDir',Value='[INSTALLFOLDER]',Type='string',KeyPath='yes')
 for index,path in enumerate(sorted(directory_ids,key=lambda path:len(PurePosixPath(path).parts),reverse=True)):
  element(marker,'RemoveFolder',Id='RemoveEmptyDir'+str(index),Directory=directory_ids[path],On='uninstall')
 desktop=element(package,'StandardDirectory',Id='DesktopFolder')
 start=element(package,'StandardDirectory',Id='ProgramMenuFolder');menu=element(start,'Directory',Id='BrowserlandMenu',Name='Browserland')
 for target,component_id in [(desktop,'DesktopShortcut'),(menu,'StartMenuShortcut')]:
  component=element(target,'Component',Id=component_id,Guid=guid(component_id),Bitness='always64');components.append(component_id)
  shortcut=element(component,'Shortcut',Id=component_id+'Link',Name='Browserland',Target='[#'+files['Browserland.exe']+']',WorkingDirectory='INSTALLFOLDER',Icon='ApplicationIcon',Advertise='no')
  element(shortcut,'ShortcutProperty',Key='System.AppUserModel.ID',Value='net.antoniofradique.browserland')
  element(component,'RegistryValue',Root='HKCU',Key=r'Software\AntonioFradique\Multi-Browser\Installer',Name=component_id,Type='integer',Value='1',KeyPath='yes')
  if component_id=='StartMenuShortcut':element(component,'RemoveFolder',Id='RemoveStartMenuFolder',On='uninstall')
 feature=element(package,'Feature',Id='Application',Title='Browserland',Level='1')
 for component in components:element(feature,'ComponentRef',Id=component)
 ET.SubElement(package,'{'+UI_NS+'}WixUI',{'Id':'WixUI_InstallDir','InstallDirectory':'INSTALLFOLDER'})
 information=WORK/'installation-information.rtf'
 information.write_text(r'{\rtf1\ansi Browserland - Antonio Fradique\par Complete browser runtimes are included.\par Profiles and sessions remain in the data folder beside the installed application. Updates and uninstallation preserve that folder.\par Third-party components retain their respective licenses, included in the application.}',encoding='ascii')
 element(package,'WixVariable',Id='WixUILicenseRtf',Value=str(information))
 wxs=WORK/'Browserland.wxs';ET.indent(document);ET.ElementTree(document).write(wxs,encoding='utf-8',xml_declaration=True)
 print('Building a single self-contained native Windows MSI...',flush=True)
 if not output.exists():subprocess.run(['dotnet',str(wix),'build',str(wxs),'-arch','x64','-ext',str(extension),'-culture','en-us','-cc',str(WORK/'cabinet-cache'),'-intermediatefolder',str(WORK/'obj'),'-v','-o',str(output)],check=True,timeout=600)
 # Use the standard, tested directory/progress/maintenance dialogs, omitting
 # the license-acceptance page: this installer adds no new license agreement.
 with Database(output,write=True) as database:
  events=database.query("SELECT `Dialog_`,`Control_`,`Event`,`Argument`,`Condition`,`Ordering` FROM `ControlEvent` WHERE `Argument`='LicenseAgreementDlg'")
  if not any(row[0]=='WelcomeDlg' and row[1]=='Next' for row in events):raise ValueError('Unexpected installer UI navigation')
  for dialog,control,destination in [('WelcomeDlg','Next','InstallDirDlg'),('InstallDirDlg','Back','WelcomeDlg')]:
   rows=[row for row in events if row[0]==dialog and row[1]==control and row[2]=='NewDialog']
   if not rows:raise ValueError('Missing expected setup navigation')
   database.execute("DELETE FROM `ControlEvent` WHERE `Dialog_`='"+dialog+"' AND `Control_`='"+control+"' AND `Event`='NewDialog' AND `Argument`='LicenseAgreementDlg'")
   for row in rows:
    row[3]=destination;values=["'"+value.replace("'","''")+"'" for value in row[:5]]+[row[5]]
    database.execute('INSERT INTO `ControlEvent` (`Dialog_`,`Control_`,`Event`,`Argument`,`Condition`,`Ordering`) VALUES ('+','.join(values)+')')
  database.commit()
 report=dict(version=VERSION,file=str(output),bytes=output.stat().st_size,sha256=digest(output),format='Windows Installer MSI',scope='current-user',defaultDirectory=r'%LOCALAPPDATA%\Programs\Browserland',desktopShortcut=True,startMenuShortcut=True,uninstallEntry=True,dataDirectory='data beside installed Browserland.exe',dataPreservedOnUpdate=True,dataPreservedOnUninstall=True,externalRuntimesRequired=False,payloadFiles=len(manifest['Files']),unpackedBytes=manifest and sum(item['Size'] for item in manifest['Files']),sourcePortableSHA256=proof['sha256'],signed=False,executionTestsPending=True)
 (ROOT/'reference'/f'windows-installer-{VERSION}.json').write_text(json.dumps(report,indent=2))
 print('WINDOWS_INSTALLER_BUILT '+str(output),flush=True)
if __name__=='__main__':main()
