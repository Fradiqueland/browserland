"""Exercise delivered startup progress and the standalone Electron splash."""
import ctypes,json,os,subprocess,time,uuid
from ctypes import wintypes as w
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'package.json').read_text())['version']
RUN=ROOT/'test-results'/('startup-progress-'+uuid.uuid4().hex);RUN.mkdir()
user=ctypes.WinDLL('user32',use_last_error=True)
ENUM=ctypes.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM)
user.GetWindowThreadProcessId.argtypes=[w.HWND,ctypes.POINTER(w.DWORD)]
user.GetWindowTextW.argtypes=[w.HWND,w.LPWSTR,ctypes.c_int]
user.GetClassNameW.argtypes=[w.HWND,w.LPWSTR,ctypes.c_int]
user.IsWindowVisible.argtypes=[w.HWND]
user.IsWindow.argtypes=[w.HWND]
user.EnumWindows.argtypes=[ENUM,w.LPARAM]
user.EnumChildWindows.argtypes=[w.HWND,ENUM,w.LPARAM]
user.SendMessageW.argtypes=[w.HWND,w.UINT,w.WPARAM,w.LPARAM];user.SendMessageW.restype=ctypes.c_size_t
user.PostMessageW.argtypes=[w.HWND,w.UINT,w.WPARAM,w.LPARAM]
checks=[]
def check(name,value):
 if not value:raise AssertionError(name)
 checks.append(name);print('PASS '+name,flush=True)
def windows(pids,title=None):
 result=[]
 @ENUM
 def visit(hwnd,_):
  pid=w.DWORD();user.GetWindowThreadProcessId(hwnd,ctypes.byref(pid))
  if pid.value in pids and user.IsWindowVisible(hwnd):
   text=ctypes.create_unicode_buffer(256);user.GetWindowTextW(hwnd,text,256)
   if title is None or text.value==title:result.append(hwnd)
  return True
 user.EnumWindows(visit,0);return result
def controls(hwnd):
 result=[]
 @ENUM
 def visit(child,_):
  name=ctypes.create_unicode_buffer(256);user.GetClassNameW(child,name,256)
  if name.value=='msctls_progress32':result.append(child)
  return True
 user.EnumChildWindows(hwnd,visit,0);return result
# Native single EXE: test cold extraction plus cache reuse against real progress controls.
source=ROOT/'dist'/f'Browserland-{VERSION}-Windows-Portable.exe'
app=RUN/'Browserland.exe';os.link(source,app)
env=dict(os.environ,BROWSERLAND_CACHE=str(RUN/'cache'),BROWSERLAND_DATA=str(RUN/'data'))
for cycle in (1,2):
 report=RUN/f'launch-{cycle}.json'
 with (RUN/f'launch-{cycle}.log').open('wb') as log:
  proc=subprocess.Popen([str(app),'--single-file-report='+str(report)],cwd=RUN,env=env,stdout=log,stderr=log)
  observed=[];seen=False;completed=False;bar=None;deadline=time.monotonic()+180
  try:
   while proc.poll() is None and time.monotonic()<deadline:
    top=windows([proc.pid],'Starting Browserland')
    if top:
     bars=controls(top[0]);seen=True
     if bars:
      bar=bars[0];value=user.SendMessageW(bar,0x408,0,0)
      if user.IsWindow(bar) and (not observed or observed[-1]!=value):observed.append(value)
    elif seen:
     completed=bool(observed and observed[-1]==100);break
    time.sleep(.02)
   (RUN/f'progress-{cycle}.json').write_text(json.dumps(observed))
   print('Progress sequence '+str(cycle)+': '+str(observed),flush=True)
   check(f'Opening {cycle} exposes a real determinate progress bar',seen and len(observed)>2)
   check(f'Opening {cycle} reports bounded monotonic progress',all(0<=n<=100 for n in observed) and observed==sorted(observed))
   check(f'Opening {cycle} reaches 100 percent and closes startup',completed)
   # Find only this test runtime's manager process.
   runtime=json.loads((ROOT/'reference'/f'windows-single-file-{VERSION}.json').read_text())['payloadSHA256']
   # Process tree enumeration is bounded to the launcher parent PID.
   class Entry(ctypes.Structure):
    _fields_=[('size',w.DWORD),('usage',w.DWORD),('pid',w.DWORD),('heap',ctypes.c_size_t),('module',w.DWORD),('threads',w.DWORD),('parent',w.DWORD),('priority',w.LONG),('flags',w.DWORD),('name',w.WCHAR*260)]
   kernel=ctypes.WinDLL('kernel32');kernel.CreateToolhelp32Snapshot.restype=w.HANDLE
   kernel.Process32FirstW.argtypes=[w.HANDLE,ctypes.POINTER(Entry)];kernel.Process32NextW.argtypes=[w.HANDLE,ctypes.POINTER(Entry)];kernel.CloseHandle.argtypes=[w.HANDLE]
   snap=kernel.CreateToolhelp32Snapshot(2,0);entry=Entry();entry.size=ctypes.sizeof(entry);pids=[]
   try:
    valid=kernel.Process32FirstW(snap,ctypes.byref(entry))
    while valid:
     if entry.parent==proc.pid:pids.append(entry.pid)
     valid=kernel.Process32NextW(snap,ctypes.byref(entry))
   finally:kernel.CloseHandle(snap)
   manager=windows(pids,'Browserland');check(f'Opening {cycle} reveals the manager after progress',bool(manager))
   for hwnd in manager:user.PostMessageW(hwnd,0x10,0,0)
   check(f'Opening {cycle} exits cleanly',proc.wait(timeout=30)==0)
   data=json.loads(report.read_text());check(f'Opening {cycle} waits for authenticated application readiness',data['StartupMS']>data['PreparationMS'] and data['OK'])
   check(f'Opening {cycle} cache state matches expectation',data['Reused']==(cycle==2))
   (RUN/f'progress-{cycle}.json').write_text(json.dumps(observed))
  finally:
   if proc.poll() is None:subprocess.run(['C:/Windows/System32/taskkill.exe','/PID',str(proc.pid),'/T','/F'],capture_output=True)
# Folder distribution exercises the common HTML splash shared with macOS.
folder=ROOT/'dist'/f'Browserland-{VERSION}-win-x64'/'Browserland.exe'
env=dict(os.environ,BROWSERLAND_DATA=str(RUN/'folder-data'),BROWSERLAND_STARTUP_TOKEN='1234567890abcdef1234567890abcdef')
env.pop('BROWSERLAND_SINGLE_FILE',None)
with (RUN/'folder.log').open('wb') as log:
 proc=subprocess.Popen([str(folder)],cwd=folder.parent,env=env,stdout=log,stderr=log)
 try:
  seen=False;manager=[];deadline=time.monotonic()+45
  while time.monotonic()<deadline and proc.poll() is None:
   seen=seen or bool(windows([proc.pid],'Starting Browserland'))
   manager=windows([proc.pid],'Browserland')
   if manager:break
   time.sleep(.01)
  check('Standalone folder opens the manager',bool(manager))
  check('Standalone folder closes its startup window',not windows([proc.pid],'Starting Browserland'))
  for hwnd in manager:user.PostMessageW(hwnd,0x10,0,0)
  check('Standalone folder exits cleanly',proc.wait(timeout=30)==0)
 finally:
  if proc.poll() is None:subprocess.run(['C:/Windows/System32/taskkill.exe','/PID',str(proc.pid),'/T','/F'],capture_output=True)
check('Standalone folder emits readiness after loading the manager','BROWSERLAND_STARTUP_READY=1234567890abcdef1234567890abcdef' in (RUN/'folder.log').read_text(errors='replace'))
result=dict(ok=True,version=VERSION,checks=checks,run=str(RUN),macExecutionVerified=False)
(ROOT/'reference'/f'startup-progress-{VERSION}.json').write_text(json.dumps(result,indent=2))
print('STARTUP_PROGRESS_OK',flush=True)
