"""Exercise archive rebranding against a tiny verified legacy Mac fixture."""
import contextlib, hashlib, importlib.util, io, json, plistlib, shutil, sys, tempfile, unittest, zipfile
from pathlib import Path
from unittest.mock import patch

APP=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('source_update',APP/'scripts/update-portable-sources.py')
m=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(m)

class PortableRebrandTests(unittest.TestCase):
 def setUp(self):
  temporary=tempfile.TemporaryDirectory(prefix='browserland-package-');self.addCleanup(temporary.cleanup)
  self.root=Path(temporary.name);self.records=[]
  for folder in ('scripts','src','ui/assets','dist','reference','.cache'): (self.root/folder).mkdir(parents=True)
  for name in ('build-macos.py','build-macos-unified.py','build-macos-portable.py'):
   shutil.copyfile(APP/'scripts'/name,self.root/'scripts'/name)
  (self.root/'package.json').write_text(json.dumps({'name':'browserland','productName':'Browserland','version':'0.22.0'}))
  (self.root/'src/main.mjs').write_text('export const product="Browserland";')
  (self.root/'ui/assets/app-icon.icns').write_bytes(b'current-test-icon')
  (self.root/'.cache/portable-go.json').write_text(json.dumps({'work':str(self.root/'.cache/build'),'goRoot':str(self.root/'.cache/missing-go')}))
  self.source=self.root/'legacy.zip'
  with zipfile.ZipFile(self.source,'w') as archive:
   outer='Multi-Browser.app/Contents/'
   roots=[outer]+[outer+'Resources/runtimes/'+arch+'/Multi-Browser.app/Contents/' for arch in ('x64','arm64')]
   for index,base in enumerate(roots):
    self.add(archive,base+'Info.plist',plistlib.dumps({'CFBundleDisplayName':'Multi-Browser','CFBundleName':'Multi-Browser','CFBundleIdentifier':'net.antoniofradique.multibrowser'+('.launcher' if index==0 else ''),'CFBundleExecutable':'Multi-Browser' if index==0 else 'Electron','CFBundleVersion':'0.21.6'}))
    self.add(archive,base+'Resources/app-icon.icns',b'old-icon')
    if index:
     self.add(archive,base+'MacOS/Electron',b'unchanged-electron-'+str(index).encode(),0o100755)
     self.add(archive,base+'Resources/app/package.json',b'{"name":"multi-browser","version":"0.21.6"}')
    else:
     self.add(archive,base+'MacOS/Multi-Browser',b'old-launcher',0o100755)
   for arch in ('x64','arm64'):
    base=outer+'Resources/runtimes/'+arch+'/.runtime/chromium/'
    self.add(archive,base+'multi-browser-runtime.json',b'{"revision":"1726545"}')
    self.add(archive,base+'Chromium.app/Contents/MacOS/Chromium',b'unchanged-chromium-'+arch.encode(),0o100755)
    for index in range(19):self.add(archive,base+'Chromium.app/Contents/MacOS/link'+str(index),b'Chromium',0o120777)
   archive.writestr('Mac-Portable/mac-portable-metadata.json',json.dumps({'version':'0.21.6','product':'Multi-Browser','entries':self.records}))
  self.record_proof()
 def record_proof(self):
  (self.root/'reference/mac-portable-0.21.6.json').write_text(json.dumps({'zipSHA256':m.digest(self.source)}))
 def add(self,archive,name,data,mode=0o100644):
  info=zipfile.ZipInfo('Mac-Portable/'+name);info.create_system=3;info.external_attr=mode<<16
  archive.writestr(info,data)
  record={'path':name,'mode':mode,'kind':'symlink' if mode==0o120777 else 'file'}
  if record['kind']=='symlink':record.update(target=data.decode(),targetIsDirectory=False)
  else:record.update(bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
  self.records.append(record)
 def run_update(self):
  with patch.object(m,'ROOT',self.root),patch.object(m,'VERSION','0.22.0'),patch.object(sys,'argv',['update','--mac',str(self.source)]),contextlib.redirect_stdout(io.StringIO()):m.main()
 def test_rename_preserves_runtime_links_identity_and_sources(self):
  self.run_update();output=self.root/'dist/Browserland-0.22.0-Mac-Portable.zip'
  with zipfile.ZipFile(output) as archive:
   self.assertFalse(any('Multi-Browser.app' in name for name in archive.namelist()))
   outer='Mac-Portable/Browserland.app/Contents/'
   self.assertEqual(plistlib.loads(archive.read(outer+'Info.plist'))['CFBundleExecutable'],'Browserland')
   launcher=archive.read(outer+'MacOS/Browserland');self.assertTrue(launcher.startswith(b'#!/bin/sh\n'))
   self.assertIn(b'BROWSERLAND_DATA',launcher);self.assertIn(b'MULTIBROWSER_DATA',launcher)
   for index,arch in enumerate(('x64','arm64'),1):
    base=outer+'Resources/runtimes/'+arch+'/Browserland.app/Contents/'
    self.assertEqual(archive.read(base+'MacOS/Electron'),b'unchanged-electron-'+str(index).encode())
    self.assertEqual(plistlib.loads(archive.read(base+'Info.plist'))['CFBundleIdentifier'],'net.antoniofradique.multibrowser')
    self.assertEqual(archive.read(base+'Resources/app/src/main.mjs'),(self.root/'src/main.mjs').read_bytes())
    chromium=outer+'Resources/runtimes/'+arch+'/.runtime/chromium/'
    self.assertEqual(archive.read(chromium+'browserland-runtime.json'),b'{"revision":"1726545"}')
    self.assertEqual(archive.read(chromium+'Chromium.app/Contents/MacOS/Chromium'),b'unchanged-chromium-'+arch.encode())
    for number in range(19):
     name=chromium+'Chromium.app/Contents/MacOS/link'+str(number)
     self.assertEqual(archive.getinfo(name).external_attr>>16,0o120777);self.assertEqual(archive.read(name),b'Chromium')
   metadata=json.loads(archive.read('Mac-Portable/mac-portable-metadata.json'))
   self.assertEqual(metadata['product'],'Browserland');self.assertEqual(metadata['launcher'],'native-shell-dispatch')
  self.assertFalse((self.root/'data').exists())
 def test_modified_base_is_refused_before_output(self):
  with self.source.open('ab') as file:file.write(b'changed')
  with self.assertRaisesRegex(ValueError,'base checksum'):self.run_update()
  self.assertFalse((self.root/'dist/Browserland-0.22.0-Mac-Portable.zip').exists())
 def test_conflicting_new_and_old_bundle_names_are_refused(self):
  with zipfile.ZipFile(self.source,'a') as archive:archive.writestr('Mac-Portable/Browserland.app/Contents/Info.plist',b'conflict')
  self.record_proof()
  with self.assertRaisesRegex(ValueError,'collision'):self.run_update()
  self.assertFalse((self.root/'dist/Browserland-0.22.0-Mac-Portable.zip').exists())

if __name__=='__main__':unittest.main(verbosity=2)
