"""Exercise installer shortcut migration before downloading and packing runtimes."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]


def main():
    if sys.platform != 'win32' or os.environ.get('GITHUB_ACTIONS') != 'true':
        raise RuntimeError('This test requires an isolated Windows CI runner')
    version = json.loads((ROOT / 'package.json').read_text())['version']
    receipt = ROOT / 'reference' / f'electron-installer-{version}.json'
    if receipt.exists():
        raise FileExistsError('Existing installer receipt preserved')
    test_id = uuid.uuid4().hex
    cache = ROOT / '.cache' / 'electron-installer'
    work = cache / ('early-shortcut-fixture-' + test_id)
    payload = work / 'payload'
    payload.mkdir(parents=True)
    (payload / 'Browserland.exe').write_bytes(b'controlled installer fixture; never launched')
    icon = payload / 'resources/app/ui/assets/app-icon.ico'
    icon.parent.mkdir(parents=True)
    shutil.copy2(ROOT / 'ui/assets/app-icon.ico', icon)
    spec = importlib.util.spec_from_file_location('installer_builder', ROOT / 'scripts/build-electron-installer.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    include = work / 'payload.nsh'
    builder.payload_include([{'Path': 'Browserland.exe'}, {'Path': 'resources/app/ui/assets/app-icon.ico'}], payload, include)
    setup = work / 'Test-Setup.exe'
    subprocess.run([str(cache / 'nsis-3.13/Bin/makensis.exe'), '/V3', '/INPUTCHARSET', 'UTF8',
                    '/DMB_VERSION=' + version, '/DMB_ICON=' + str(ROOT / 'ui/assets/app-icon.ico'),
                    '/DMB_SIZE_KB=100', '/DMB_TEST=1', '/DMB_TEST_ID=' + test_id,
                    '/DMB_PAYLOAD_INCLUDE=' + str(include), '/DMB_OUTPUT=' + str(setup),
                    str(ROOT / 'scripts/windows-installer-nsis.nsi')], check=True, timeout=60)
    receipt.parent.mkdir(exist_ok=True)
    receipt.write_text(json.dumps({'version': version, 'fixtureOnly': True, 'testSetup': str(setup), 'testId': test_id}))
    subprocess.run([sys.executable, str(ROOT / 'scripts/verify-ci-windows.py'), '--fixture-only'],
                   check=True, timeout=600)
    print('WINDOWS_SHORTCUT_MIGRATION_VERIFIED', flush=True)


if __name__ == '__main__':
    main()
