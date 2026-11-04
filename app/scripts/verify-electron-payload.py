"""Verify every shipped byte against the installer build manifest, without installing."""
import ctypes,hashlib,json,subprocess,tempfile
from ctypes import wintypes
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'package.json').read_text())['version']

def digest(path):
 result=hashlib.sha256()
 with path.open('rb') as stream:
  for chunk in iter(lambda:stream.read(8*1024*1024),b''):result.update(chunk)
 return result.hexdigest()

def windows_product_name(path):
 # Read through Windows' independent version parser, rather than assuming a
 # renamed executable has the correct Explorer/installed-product metadata.
 version=ctypes.WinDLL('version',use_last_error=True)
 version.GetFileVersionInfoSizeW.argtypes=[wintypes.LPCWSTR,ctypes.POINTER(wintypes.DWORD)];version.GetFileVersionInfoSizeW.restype=wintypes.DWORD
 version.GetFileVersionInfoW.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,wintypes.DWORD,ctypes.c_void_p];version.GetFileVersionInfoW.restype=wintypes.BOOL
 version.VerQueryValueW.argtypes=[ctypes.c_void_p,wintypes.LPCWSTR,ctypes.POINTER(ctypes.c_void_p),ctypes.POINTER(wintypes.UINT)];version.VerQueryValueW.restype=wintypes.BOOL
 unused=wintypes.DWORD();size=version.GetFileVersionInfoSizeW(str(path),ctypes.byref(unused))
 if not size:raise ValueError('Missing Windows version metadata')
 buffer=ctypes.create_string_buffer(size)
 if not version.GetFileVersionInfoW(str(path),0,size,buffer):raise ctypes.WinError(ctypes.get_last_error())
 pointer=ctypes.c_void_p();length=wintypes.UINT()
 if not version.VerQueryValueW(buffer,r'\VarFileInfo\Translation',ctypes.byref(pointer),ctypes.byref(length)) or length.value<4:raise ValueError('Missing version translation')
 translations=(wintypes.WORD*(length.value//2)).from_address(pointer.value)
 key='\\StringFileInfo\\%04x%04x\\ProductName'%(translations[0],translations[1])
 if not version.VerQueryValueW(buffer,key,ctypes.byref(pointer),ctypes.byref(length)):raise ValueError('Missing product name')
 return ctypes.wstring_at(pointer.value)

def main():
 proof=json.loads((ROOT/'reference'/f'electron-installer-{VERSION}.json').read_text())
 setup=Path(proof['file'])
 if digest(setup)!=proof['sha256']:raise ValueError('Installer checksum mismatch')
 work=ROOT/'.cache/electron-installer'
 expected=json.loads((work/f'payload-{VERSION}.json').read_text())
 destination=Path(tempfile.mkdtemp(prefix='download-installer-',dir=ROOT/'test-results'))
 with (destination/'extract.log').open('wb') as log:
  subprocess.run([str(work/'full-sevenzip/7z.exe'),'x','-y','-o'+str(destination/'payload'),str(setup)],stdout=log,stderr=log,check=True,timeout=180)
 payload=destination/'payload'
 actual={p.relative_to(payload).as_posix() for p in payload.rglob('*') if p.is_file() and p.relative_to(payload).parts[0]!='$PLUGINSDIR' and p.name!='Uninstall Browserland.exe'}
 if actual!={item['Path'] for item in expected}:raise ValueError('Payload file list mismatch')
 for item in expected:
  file=payload/item['Path']
  if file.stat().st_size!=item['Size'] or digest(file)!=item['SHA256']:raise ValueError('Payload mismatch: '+item['Path'])
 for folder in ['src','ui']:
  for source in (ROOT/folder).rglob('*'):
   if source.is_file():
    relative=source.relative_to(ROOT)
    if (payload/'resources/app'/relative).read_bytes()!=source.read_bytes():raise ValueError('Current source missing from installer: '+relative.as_posix())
 if json.loads((payload/'resources/app/package.json').read_text())['version']!=VERSION:raise ValueError('Application version mismatch')
 if windows_product_name(payload/'Browserland.exe')!='Browserland' or windows_product_name(setup)!='Browserland Setup':raise ValueError('Windows product branding mismatch')
 if (payload/'Multi-Browser.exe').exists() or not (payload/'.runtime/chromium/browserland-runtime.json').is_file():raise ValueError('Legacy application filename in current payload')
 result=dict(ok=True,version=VERSION,filesVerified=len(expected),installerSHA256=proof['sha256'],directory=str(destination),installedIntoUserProfile=False,windowsProductBrandingVerified=True)
 (ROOT/'reference'/f'electron-payload-{VERSION}.json').write_text(json.dumps(result,indent=2))
 print(json.dumps(result),flush=True)

if __name__=='__main__':main()
