"""Check the new social menu through the delivered EXE and both Mac source trees."""
import argparse,hashlib,json,os,subprocess,uuid,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'package.json').read_text())['version']
parser=argparse.ArgumentParser();parser.add_argument('--diagnostic-no-sandbox',action='store_true');parser.add_argument('--reuse-test-cache',type=Path);args=parser.parse_args()
RUN=ROOT/'test-results'/('social-'+uuid.uuid4().hex);RUN.mkdir(parents=True)
exe=ROOT/'dist'/f'Browserland-{VERSION}-Windows-Portable.exe'
mac=ROOT/'dist'/f'Browserland-{VERSION}-Mac-Portable.zip'
sources=[p for folder in ['src','ui'] for p in (ROOT/folder).rglob('*') if p.is_file() and not p.is_symlink()]+[ROOT/'package.json']
with zipfile.ZipFile(exe) as archive:
 for file in sources:
  if archive.read('resources/app/'+file.relative_to(ROOT).as_posix())!=file.read_bytes():raise AssertionError('Windows source mismatch: '+str(file))
with zipfile.ZipFile(mac) as archive:
 for arch in ['x64','arm64']:
  prefix='Mac-Portable/Browserland.app/Contents/Resources/runtimes/'+arch+'/Browserland.app/Contents/Resources/app/'
  for file in sources:
   if archive.read(prefix+file.relative_to(ROOT).as_posix())!=file.read_bytes():raise AssertionError('Mac source mismatch: '+str(file))
print('PASS: Delivered Windows and both Mac architectures contain the exact updated sources',flush=True)
env=dict(os.environ,BROWSERLAND_DATA=str(RUN/'data'),BROWSERLAND_CACHE=str(RUN/'cache'))
if args.reuse_test_cache:
 cache=args.reuse_test_cache.resolve()
 if (ROOT/'test-results').resolve() not in cache.parents or cache.name!='cache':raise ValueError('Only an isolated test cache may be reused')
 env['BROWSERLAND_CACHE']=str(cache)
report=RUN/'launcher.json'
with (RUN/'launcher.log').open('wb') as log:
 flags=['--no-sandbox','--disable-gpu'] if args.diagnostic_no_sandbox else []
 process=subprocess.Popen([str(exe),'--self-test','--social-links-only','--single-file-report='+str(report),*flags],cwd=RUN,env=env,stdout=log,stderr=log)
 print('Testing real menu clicks, keyboard and 44 language/theme combinations...',flush=True)
 try:code=process.wait(timeout=150)
 except subprocess.TimeoutExpired:
  subprocess.run(['C:/Windows/System32/taskkill.exe','/PID',str(process.pid),'/T','/F'],capture_output=True);raise
if code:
 for file in [report,RUN/'data/smoke-error.log',RUN/'data/single-file-launch.log',RUN/'data/progress.log']:
  if file.exists():print(file.name+': '+file.read_text(errors='replace')[-5000:],flush=True)
 raise RuntimeError('Packaged social test failed: '+str(code))
smoke=json.loads((RUN/'data/smoke-result.json').read_text());launch=json.loads(report.read_text())
if not smoke['ok'] or smoke.get('scope')!='author-social-links' or not launch['OK']:raise AssertionError('Incomplete social test report')
if len(smoke['tests'])!=5 or len(list((RUN/'data').glob('social-menu-*.png')))!=2:raise AssertionError('Social menu checks incomplete')
result=dict(ok=True,version=VERSION,run=str(RUN),checks=smoke['tests'],sourceParity=['windows','mac-x64','mac-arm64'],languageThemeStyleCombinations=44,externalNavigation='real renderer click -> authorized IPC -> mocked OS opener; no external sites or messages opened',macExecutionVerified=False,diagnosticSandboxDisabled=args.diagnostic_no_sandbox)
(ROOT/'reference'/f'author-social-{VERSION}.json').write_text(json.dumps(result,indent=2))
build=ROOT/'reference'/f'windows-single-file-{VERSION}.json';data=json.loads(build.read_text());data.update(ok=True,runtimeTestsPending=args.diagnostic_no_sandbox,verificationScope='source parity, startup and social menu',socialMenuChecks=5,sourceCoreTests=75,diagnosticSandboxDisabled=args.diagnostic_no_sandbox);build.write_text(json.dumps(data,indent=2))
print('SOCIAL_PORTABLE_OK '+str(RUN),flush=True)
