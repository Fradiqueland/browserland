"""Verify the delivered single EXE in an isolated, development-independent folder."""
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import app_icons, importlib.util
import subprocess
import time
import uuid

ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'package.json').read_text())['version']
EXE=ROOT/'dist'/f'Browserland-{VERSION}-Windows-Portable.exe'
RUN=ROOT/'test-results'/('single-file-'+uuid.uuid4().hex)
RUN.mkdir()
DELIVERY=RUN/'Portable with spaces'
DELIVERY.mkdir()
APP=DELIVERY/'Browserland.exe'
os.link(EXE,APP)
ENV=dict(os.environ,BROWSERLAND_CACHE=str(RUN/'runtime-cache'))
ENV.pop('BROWSERLAND_DATA',None)
ENV.pop('MULTIBROWSER_DATA',None)
ENV.pop('MULTIBROWSER_CACHE',None)
checks=[]
def check(name,value):
    if not value: raise AssertionError(name)
    checks.append(name)
    print('PASS: '+name,flush=True)

def execute(label,args,env=ENV,timeout=180):
    report=RUN/(label+'.json')
    with (RUN/(label+'.log')).open('wb') as log:
        process=subprocess.Popen([str(APP),*args,'--single-file-report='+str(report)],cwd=DELIVERY,env=env,stdout=log,stderr=log)
        try: code=process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            subprocess.run(['C:/Windows/System32/taskkill.exe','/PID',str(process.pid),'/T','/F'],capture_output=True)
            raise
    if not report.is_file(): raise AssertionError('No launcher report: '+label)
    result=json.loads(report.read_text())
    check(label+' exits successfully',code==0 and result['OK'])
    return result

first=execute('first-extraction',['--single-file-verify'])
check('First opening extracts bundled runtimes',not first['Reused'] and first['Files']>300)
runtime=Path(first['Runtime'])
spec=importlib.util.spec_from_file_location('builder',ROOT/'scripts/build-windows-single-file.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
group,images=app_icons.ico_resources()
for label,path in [('single EXE',EXE),('application EXE',runtime/'Browserland.exe')]:
    resources=builder.pe_resources(path)
    check(label+' exposes Browserland product and version metadata',resources[16][1][1033]==app_icons.version_resource('Browserland.exe'))
    check(label+' contains the exact chosen icon',resources[14][1][1033]==group and all(resources[3][i+1][1033]==image for i,image in enumerate(images)))
check('Application carries the original PNG',(runtime/'resources/app/ui/assets/app-icon.png').read_bytes()==(ROOT/'ui/assets/app-icon.png').read_bytes())
stamp=(runtime/'.runtime/chromium/chrome.dll').stat().st_mtime_ns
second=execute('cached-opening',['--single-file-verify'])
check('Repeated opening reuses the same complete runtime',second['Reused'] and second['Runtime']==first['Runtime'])
check('Repeated opening does not re-extract Chromium',(runtime/'.runtime/chromium/chrome.dll').stat().st_mtime_ns==stamp)
check('Default data remains beside the delivered EXE',Path(second['Data'])==DELIVERY/'data')

# The normal application is tested only through the delivered EXE.
smoke_env=dict(ENV,BROWSERLAND_DATA=str(RUN/'smoke-data'))
smoke=execute('application-integrations',['--self-test'],smoke_env,240)
report=json.loads((RUN/'smoke-data'/'smoke-result.json').read_text())
check('Real packaged application completes its integration suite',report['ok'] and len(report['tests'])>=89)
check('Bundled Chromium is used',bool(report['bundledChromium']))

# Launch and close two actual normal sessions, without a data override.
user32=ctypes.WinDLL('user32',use_last_error=True)
kernel32=ctypes.WinDLL('kernel32',use_last_error=True)
class PROCESSENTRY32W(ctypes.Structure):
    _fields_=[('dwSize',wintypes.DWORD),('cntUsage',wintypes.DWORD),('th32ProcessID',wintypes.DWORD),('th32DefaultHeapID',ctypes.c_size_t),('th32ModuleID',wintypes.DWORD),('cntThreads',wintypes.DWORD),('th32ParentProcessID',wintypes.DWORD),('pcPriClassBase',wintypes.LONG),('dwFlags',wintypes.DWORD),('szExeFile',wintypes.WCHAR*260)]
kernel32.CreateToolhelp32Snapshot.restype=wintypes.HANDLE
kernel32.Process32FirstW.argtypes=[wintypes.HANDLE,ctypes.POINTER(PROCESSENTRY32W)]
kernel32.Process32NextW.argtypes=[wintypes.HANDLE,ctypes.POINTER(PROCESSENTRY32W)]
kernel32.CloseHandle.argtypes=[wintypes.HANDLE]
def children(pid):
    snapshot=kernel32.CreateToolhelp32Snapshot(2,0)
    entry=PROCESSENTRY32W();entry.dwSize=ctypes.sizeof(entry);result=[]
    try:
        valid=kernel32.Process32FirstW(snapshot,ctypes.byref(entry))
        while valid:
            if entry.th32ParentProcessID==pid: result.append(entry.th32ProcessID)
            valid=kernel32.Process32NextW(snapshot,ctypes.byref(entry))
    finally: kernel32.CloseHandle(snapshot)
    return result
ENUM=ctypes.WINFUNCTYPE(wintypes.BOOL,wintypes.HWND,wintypes.LPARAM)
user32.IsWindowVisible.argtypes=[wintypes.HWND]
user32.GetWindowThreadProcessId.argtypes=[wintypes.HWND,ctypes.POINTER(wintypes.DWORD)]
user32.GetWindowTextW.argtypes=[wintypes.HWND,wintypes.LPWSTR,ctypes.c_int]
user32.PostMessageW.argtypes=[wintypes.HWND,wintypes.UINT,wintypes.WPARAM,wintypes.LPARAM]
def application_windows(pids):
    result=[]
    @ENUM
    def callback(hwnd,param):
        pid=wintypes.DWORD();user32.GetWindowThreadProcessId(hwnd,ctypes.byref(pid))
        if pid.value in pids and user32.IsWindowVisible(hwnd):
            title=ctypes.create_unicode_buffer(256);user32.GetWindowTextW(hwnd,title,256)
            if title.value=='Browserland': result.append(hwnd)
        return True
    user32.EnumWindows(callback,0)
    return result

data=DELIVERY/'data'
data.mkdir(exist_ok=True)
workspace={'schema':2,'profiles':[],'groups':['Personal','Work','Persistence marker'],'history':[],'bookmarks':[],'groupDetails':{},'downloads':[],'settings':{'theme':'light','language':'es','appearance':'modern'}}
(data/'workspace.json').write_text(json.dumps(workspace),encoding='utf-8')
before=(data/'workspace.json').read_bytes()
for cycle in (1,2):
    with (RUN/f'normal-{cycle}.log').open('wb') as log:
        process=subprocess.Popen([str(APP),'--single-file-report='+str(RUN/f'normal-{cycle}.json')],cwd=DELIVERY,env=ENV,stdout=log,stderr=log)
        try:
            deadline=time.monotonic()+60
            windows=[]
            while time.monotonic()<deadline and process.poll() is None:
                windows=application_windows(children(process.pid))
                if windows: break
                time.sleep(.2)
            check(f'Normal opening {cycle} displays the application',bool(windows))
            time.sleep(1)
            user32.SendMessageW.argtypes=[wintypes.HWND,wintypes.UINT,wintypes.WPARAM,wintypes.LPARAM]
            user32.SendMessageW.restype=ctypes.c_size_t
            check(f'Normal opening {cycle} exposes its application window icon',bool(user32.SendMessageW(windows[0],0x7f,1,0)))
            for hwnd in windows: user32.PostMessageW(hwnd,0x10,0,0)
            check(f'Normal opening {cycle} closes gracefully',process.wait(timeout=30)==0)
        finally:
            if process.poll() is None:
                subprocess.run(['C:/Windows/System32/taskkill.exe','/PID',str(process.pid),'/T','/F'],capture_output=True)
    check(f'Normal opening {cycle} preserves existing settings and groups',(data/'workspace.json').read_bytes()==before)
    check(f'Normal opening {cycle} writes runtime state beside the EXE',(data/'engine'/'Local State').is_file())

# Keep damaged fixtures separate and leave the valid delivered runtime untouched.
bad=runtime/'unwanted.dll'
bad.write_bytes(b'controlled test file')
try:
    result_path=RUN/'cache-tamper.json'
    process=subprocess.run([str(APP),'--single-file-verify','--single-file-report='+str(result_path)],cwd=DELIVERY,env=ENV,timeout=60)
    damaged=json.loads(result_path.read_text())
    check('Injected cache file blocks launch without replacing user data',process.returncode!=0 and not damaged['OK'] and 'unexpected runtime file' in damaged['Error'] and (data/'workspace.json').read_bytes()==before)
finally: bad.unlink()

build_report=ROOT/'reference'/f'windows-single-file-{VERSION}.json'
result=json.loads(build_report.read_text())
result.update(runtimeTestsPending=False,ok=True,run=str(RUN),checks=checks,integrationChecks=len(report['tests']),firstPreparationMS=first['PreparationMS'],cachedPreparationMS=second['PreparationMS'],unitTestsPassed=True,macRuntimeRetestRequired=True,macUnchanged=False,macCompanionVersion=VERSION)
build_report.write_text(json.dumps(result,indent=2),encoding='utf-8')
(RUN/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print('SINGLE_FILE_VERIFIED '+str(build_report),flush=True)
