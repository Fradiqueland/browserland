"""Rebuild only the launcher while retaining the already verified runtime payload."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import time

script=Path(__file__).with_name('build-windows-single-file.py')
spec=importlib.util.spec_from_file_location('single_build',script)
build=importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)
report_path=build.ROOT/'reference'/f'windows-single-file-{build.VERSION}.json'
report=json.loads(report_path.read_text())
payload=build.CACHE/'payload.zip'
if build.sha(payload)!=report['payloadSHA256']:
    raise ValueError('Existing payload changed; full rebuild required')
env=dict(os.environ,GOROOT=str(build.GO_ROOT),GOCACHE=str(build.ROOT/'.cache/dmg-toolchain/go-build'),
         GOPATH=str(build.ROOT/'.cache/dmg-toolchain/gopath'),GOTOOLCHAIN='local',CGO_ENABLED='0',GOOS='windows',GOARCH='amd64')
subprocess.run([str(build.GO_ROOT/'bin/gofmt.exe'),'-w',str(build.LAUNCHER)],check=True)
build.write_resources(build.PORTABLE/'Browserland.exe')
stub=build.CACHE/'launcher.exe'
flags=f"-s -w -H=windowsgui -X main.payloadSHA={report['payloadSHA256']} -X main.manifestSHA={report['manifestSHA256']}"
subprocess.run([str(build.GO_ROOT/'bin/go.exe'),'build','-trimpath','-ldflags',flags,'-o',str(stub),'.'],cwd=build.LAUNCHER,env=env,check=True)
partial=build.OUTPUT.with_suffix('.exe.partial')
with partial.open('xb') as dest:
    with stub.open('rb') as src: shutil.copyfileobj(src,dest)
    offset=dest.tell()
    with payload.open('rb') as src: shutil.copyfileobj(src,dest)
    dest.write(b'MULTIBROWSER-SF1'+struct.pack('<QQ',offset,payload.stat().st_size))
backup=build.CACHE/f'previous-launcher-{time.time_ns()}.exe'
assert build.ROOT in backup.resolve().parents and build.ROOT in build.OUTPUT.resolve().parents
build.OUTPUT.rename(backup)
partial.rename(build.OUTPUT)
report.update(size=build.OUTPUT.stat().st_size,sha256=build.sha(build.OUTPUT),runtimeTestsPending=True)
report_path.write_text(json.dumps(report,indent=2),encoding='utf-8')
print('REBUILT '+str(build.OUTPUT),flush=True)
