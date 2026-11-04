import json, os, subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
go=root/'.cache/dmg-toolchain/go'
config=root/'.cache/portable-go.json'
if config.is_file():
    prepared=Path(json.loads(config.read_text())['goRoot'])
    if (prepared/'bin/go.exe').is_file(): go=prepared
if not (go/'bin/go.exe').is_file():
    raise FileNotFoundError('Prepare the pinned build toolchain with scripts/prepare-portable-go.py')
tmp=root/'.cache/windows-single-file/unit-tmp'
tmp.mkdir(parents=True,exist_ok=True)
env=dict(os.environ,GOROOT=str(go),GOCACHE=str(root/'.cache/dmg-toolchain/go-build'),GOPATH=str(root/'.cache/dmg-toolchain/gopath'),GOTOOLCHAIN='local',CGO_ENABLED='0',TEMP=str(tmp),TMP=str(tmp))
raise SystemExit(subprocess.run([str(go/'bin/go.exe'),'test','-count=1','-v','./...'],cwd=root/'scripts/windows-single-file',env=env).returncode)
