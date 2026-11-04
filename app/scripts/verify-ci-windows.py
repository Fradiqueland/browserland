"""Verify Windows icon resources and exercise the isolated NSIS fixture natively."""
from pathlib import Path
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]


def inside(path, parent):
    path, parent = Path(path).resolve(), Path(parent).resolve()
    if path == parent or not path.is_relative_to(parent):
        raise ValueError('Test path escaped its isolated directory')
    return path


def main():
    if sys.platform != 'win32':
        raise RuntimeError('Native installer verification requires Windows')
    import winreg
    import app_icons
    version = json.loads((ROOT / 'package.json').read_text())['version']
    proof_path = ROOT / 'reference' / f'electron-installer-{version}.json'
    proof = json.loads(proof_path.read_text())
    test_id = proof['testId']
    if not re.fullmatch(r'[0-9a-f]{32}', test_id):
        raise ValueError('Invalid isolated installer test ID')
    setup = inside(proof['testSetup'], ROOT / '.cache' / 'electron-installer')
    if setup.name != 'Test-Setup.exe' or not setup.is_file():
        raise ValueError('Isolated installer fixture missing')
    run = ROOT / 'test-results' / ('nsis-ci-' + uuid.uuid4().hex)
    run.mkdir(parents=True)
    target = inside(run / 'installed', run)
    target.mkdir()
    checks = []

    def check(label, passed):
        if not passed:
            raise AssertionError(label)
        checks.append(label)
        print('PASS ' + label, flush=True)

    def execute(label, command, timeout=120):
        with (run / (label + '.log')).open('wb') as log:
            process = subprocess.Popen(command, cwd=run, shell=False, stdout=log,
                                       stderr=log, creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                return process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                subprocess.run(['taskkill.exe', '/PID', str(process.pid), '/T', '/F'],
                               capture_output=True, timeout=15, check=False)
                process.wait(timeout=15)
                raise

    key = 'Software\\AntonioFradique\\Browserland\\InstallerTests\\' + test_id
    uninstall_key = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Browserland-Test-' + test_id

    def registry_value(path, name):
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as handle:
                return winreg.QueryValueEx(handle, name)[0]
        except FileNotFoundError:
            return None

    def registry_exists(path):
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY):
                return True
        except FileNotFoundError:
            return False

    check('Fixture registry names are unused', not registry_exists(key) and not registry_exists(uninstall_key))
    payload_proof = json.loads((ROOT / 'reference' / f'electron-payload-{version}.json').read_text())
    payload = inside(Path(payload_proof['directory']) / 'payload', ROOT / 'test-results')
    spec = importlib.util.spec_from_file_location('windows_builder', ROOT / 'scripts' / 'build-windows-single-file.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    group, images = app_icons.ico_resources()
    for label, executable in [('application', payload / 'Browserland.exe'),
                              ('portable', ROOT / 'dist' / f'Browserland-{version}-Windows-Portable.exe')]:
        resources = builder.pe_resources(executable)
        check(label + ' embeds the chosen icon', resources[14][1][1033] == group and
              all(resources[3][index + 1][1033] == image for index, image in enumerate(images)))
        check(label + ' embeds the current product version', resources[16][1][1033] == app_icons.version_resource('Browserland.exe'))

    fixture_bytes = b'controlled installer fixture; never launched'
    data = target / 'data'
    data.mkdir()
    sentinel = data / 'profile-session-sentinel.bin'
    sentinel_bytes = os.urandom(64)
    sentinel.write_bytes(sentinel_bytes)
    workspace = data / 'workspace.json'
    workspace_bytes = b'{"schema":2,"profiles":[],"settings":{"language":"pt-PT"}}'
    workspace.write_bytes(workspace_bytes)

    def data_preserved():
        return sentinel.read_bytes() == sentinel_bytes and workspace.read_bytes() == workspace_bytes

    # NSIS parses /D and _?= as the final unquoted remainder. shell=False keeps
    # this a CreateProcess command, including when the checkout has spaces.
    check('Fixture installs silently', execute('install', f'"{setup}" /S /D={target}') == 0)
    check('Install preserves existing profile data', data_preserved())
    check('Fixture payload installed', (target / 'Browserland.exe').read_bytes() == fixture_bytes)
    check('Isolated registry records the chosen directory', registry_value(key, 'InstallLocation') == str(target))
    links = [target / 'TestLinks' / 'Desktop' / 'Browserland.lnk',
             target / 'TestLinks' / 'StartMenu' / 'Browserland.lnk']
    check('Fixture shortcuts remain inside test directory', all(path.is_file() for path in links))
    (target / 'Browserland.exe').write_bytes(b'old application fixture')
    # Always force the contained path, including on update: a fixture must never
    # fall back to the user's real default application directory.
    check('Fixture updates the same isolated directory', execute('update', f'"{setup}" /S /D={target}') == 0)
    check('Update replaces application and preserves profile data',
          (target / 'Browserland.exe').read_bytes() == fixture_bytes and data_preserved())
    uninstaller = inside(target / 'Uninstall Browserland.exe', run)
    check('Fixture uninstalls silently', execute('uninstall', f'"{uninstaller}" /S _?={target}') == 0)
    check('Uninstall removes application and isolated shortcuts',
          not (target / 'Browserland.exe').exists() and not any(path.exists() for path in links))
    check('Uninstall preserves profiles and sessions', data_preserved())
    check('Uninstall removes its isolated registry entries', not registry_exists(key) and not registry_exists(uninstall_key))
    result = dict(ok=True, version=version, checks=checks, fixtureDirectory=str(run),
                  testId=test_id, installedRealApplication=False, nativeFixtureVerified=True,
                  iconResourcesVerified=True, profileDataPreserved=True,
                  fixtureSHA256=hashlib.sha256(setup.read_bytes()).hexdigest())
    (ROOT / 'reference' / f'ci-windows-verification-{version}.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
