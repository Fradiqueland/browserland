"""Verify Windows icon resources and exercise the isolated NSIS fixture natively."""
from pathlib import Path
import argparse
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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixture-only', action='store_true',
                        help='Run isolated installer checks only; cannot produce release verification')
    args = parser.parse_args()
    if sys.platform != 'win32':
        raise RuntimeError('Native installer verification requires Windows')
    import winreg
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

    def shortcuts(action, entries):
        # Use the Windows scripting API as an independent reader/writer of real
        # .lnk files. Only fixture paths are accepted; no user shortcut is touched.
        for entry in entries:
            link = inside(entry['path'], run)
            if link.suffix.lower() != '.lnk':
                raise ValueError('Expected an isolated shortcut file')
            if action == 'write':
                for field in ('TargetPath', 'WorkingDirectory'):
                    inside(entry['properties'][field], run)
        request = run / ('shortcut-request-' + uuid.uuid4().hex + '.json')
        request.write_text(json.dumps(dict(action=action, entries=entries)), encoding='utf-8')
        literal = "'" + str(request).replace("'", "''") + "'"
        script = r'''
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$request = Get-Content -LiteralPath REQUEST -Raw -Encoding UTF8 | ConvertFrom-Json
$shell = New-Object -ComObject WScript.Shell
$shellApplication = New-Object -ComObject Shell.Application
try {
    $results = foreach ($entry in $request.entries) {
        $link = $shell.CreateShortcut([string]$entry.path)
        try {
            if ($request.action -eq 'write') {
                foreach ($property in $entry.properties.PSObject.Properties) {
                    $link.($property.Name) = $property.Value
                }
                $link.Save()
            }
            $folder = $shellApplication.NameSpace([IO.Path]::GetDirectoryName([string]$entry.path))
            $item = $folder.ParseName([IO.Path]::GetFileName([string]$entry.path))
            $appId = $item.ExtendedProperty('System.AppUserModel.ID')
            [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($item)
            [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($folder)
            [ordered]@{
                Path = [string]$entry.path
                TargetPath = $link.TargetPath
                Arguments = $link.Arguments
                WorkingDirectory = $link.WorkingDirectory
                IconLocation = $link.IconLocation
                Description = $link.Description
                Hotkey = $link.Hotkey
                WindowStyle = $link.WindowStyle
                AppUserModelID = [string]$appId
            }
        } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($link) }
    }
    [ordered]@{links=@($results)} | ConvertTo-Json -Depth 4 -Compress
} finally {
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shellApplication)
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)
}
'''.replace('REQUEST', literal)
        completed = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script],
                                   cwd=run, shell=False, capture_output=True, timeout=30,
                                   creationflags=subprocess.CREATE_NO_WINDOW)
        if completed.returncode:
            raise RuntimeError('Shortcut fixture command failed: ' + completed.stderr.decode('utf-8', errors='replace'))
        return json.loads(completed.stdout.decode('utf-8-sig'))['links']

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
    if not args.fixture_only:
        import app_icons
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
    # Exercise a completely empty destination before adding existing profile data
    # and stale shell shortcuts for the update scenario.
    check('Fixture installs silently into an empty directory', execute('install', f'"{setup}" /S /D={target}') == 0)
    check('Fixture payload installed', (target / 'Browserland.exe').read_bytes() == fixture_bytes)
    check('Isolated registry records the chosen directory', registry_value(key, 'InstallLocation') == str(target))
    links = [target / 'TestLinks' / 'Desktop' / 'Browserland.lnk',
             target / 'TestLinks' / 'StartMenu' / 'Browserland.lnk']
    icon = target / f'Browserland-{version}.ico'
    expected_icon = (ROOT / 'ui' / 'assets' / 'app-icon.ico').read_bytes()
    check('Fresh install writes the chosen icon under a versioned filename', icon.read_bytes() == expected_icon)
    check('Fixture shortcuts remain inside test directory', all(path.is_file() for path in links))

    def installed_shortcuts_correct():
        return all(item['TargetPath'] == str(target / 'Browserland.exe') and
                   item['IconLocation'] == str(icon) + ',0' and
                   item['AppUserModelID'] == 'net.antoniofradique.browserland'
                   for item in shortcuts('read', [dict(path=str(path)) for path in links]))

    check('Fresh Desktop and Start menu shortcuts use the versioned icon and application identity', installed_shortcuts_correct())
    check('Installed-app listing uses the versioned icon', registry_value(uninstall_key, 'DisplayIcon') in (str(icon), str(icon) + ',0'))
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

    pinned = target / 'TestLinks' / 'TaskBar'
    pinned.mkdir(exist_ok=True)
    current_pin = pinned / 'Trabalho - Navega\u00e7\u00e3o.lnk'
    legacy_pin = pinned / 'Legacy custom pin.lnk'
    unrelated_pin = pinned / 'Different installation.lnk'
    malformed_pin = pinned / 'Unreadable shortcut.lnk'
    malformed_bytes = b'not a Windows shortcut; must not be rewritten'
    malformed_pin.write_bytes(malformed_bytes)
    other_install = run / 'another installation'
    other_install.mkdir()
    (other_install / 'Browserland.exe').write_bytes(b'unrelated fixture; never launched')
    (target / 'Multi-Browser.exe').write_bytes(b'legacy fixture; never launched')
    previous_icon = target / 'Browserland-0.0.1.ico'
    previous_icon.write_bytes(expected_icon)

    def pin(path, executable):
        return dict(path=str(path), properties=dict(
            TargetPath=str(executable), Arguments='--fixture "preserve these arguments"',
            WorkingDirectory=str(data), IconLocation=str(previous_icon) + ',0',
            Description='Preserve custom shortcut metadata', Hotkey='CTRL+ALT+B', WindowStyle=7))

    before = shortcuts('write', [pin(current_pin, target / 'Browserland.exe'),
                                 pin(legacy_pin, target / 'Multi-Browser.exe'),
                                 pin(unrelated_pin, other_install / 'Browserland.exe')])
    unrelated_bytes = unrelated_pin.read_bytes()
    # Also reproduce old Desktop/Start icons rather than testing a no-op update.
    shortcuts('write', [pin(path, target / 'Browserland.exe') for path in links])
    (target / 'Browserland.exe').write_bytes(b'old application fixture')
    icon.write_bytes(b'stale icon file')
    # NSIS parses /D and _?= as the final unquoted remainder. shell=False keeps
    # this a CreateProcess command, including when the checkout has spaces.
    # Always force the contained path, including on update: a fixture must never
    # fall back to the user's real default application directory.
    check('Fixture updates the same isolated directory', execute('update', f'"{setup}" /S /D={target}') == 0)
    check('Update replaces application and preserves profile data',
          (target / 'Browserland.exe').read_bytes() == fixture_bytes and data_preserved())
    check('Update restores the chosen versioned icon bytes', icon.read_bytes() == expected_icon)
    check('Update repairs Desktop and Start menu shortcut icon paths', installed_shortcuts_correct())
    after = shortcuts('read', [dict(path=str(current_pin)), dict(path=str(legacy_pin))])
    check('Update repairs renamed Unicode and legacy taskbar shortcuts',
          all(item['TargetPath'] == str(target / 'Browserland.exe') and
              item['IconLocation'] == str(icon) + ',0' and
              item['AppUserModelID'] == 'net.antoniofradique.browserland' for item in after))
    preserved_fields = ('Path', 'Arguments', 'WorkingDirectory', 'Description', 'Hotkey', 'WindowStyle')
    check('Taskbar repair preserves custom names and launch settings',
          all(all(old[field] == new[field] for field in preserved_fields)
              for old, new in zip(before[:2], after)))
    check('Other installations and malformed taskbar shortcuts are untouched',
          unrelated_pin.read_bytes() == unrelated_bytes and malformed_pin.read_bytes() == malformed_bytes)
    check('Update retains previous icon files referenced by other shortcuts', previous_icon.read_bytes() == expected_icon)
    uninstaller = inside(target / 'Uninstall Browserland.exe', run)
    check('Fixture uninstalls silently', execute('uninstall', f'"{uninstaller}" /S _?={target}') == 0)
    check('Uninstall removes application and isolated shortcuts',
          not (target / 'Browserland.exe').exists() and not any(path.exists() for path in links))
    check('Uninstall removes only its current versioned icon', not icon.exists() and previous_icon.read_bytes() == expected_icon)
    check('Uninstall preserves profiles and sessions', data_preserved())
    check('Uninstall removes its isolated registry entries', not registry_exists(key) and not registry_exists(uninstall_key))
    result = dict(ok=True, version=version, checks=checks, fixtureDirectory=str(run),
                  testId=test_id, installedRealApplication=False, nativeFixtureVerified=True,
                  iconResourcesVerified=not args.fixture_only, profileDataPreserved=True,
                  shortcutIconsVerified=True, pinnedShortcutsVerified=True,
                  fixtureSHA256=hashlib.sha256(setup.read_bytes()).hexdigest())
    report = 'ci-windows-fixture' if args.fixture_only else 'ci-windows-verification'
    (ROOT / 'reference' / f'{report}-{version}.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
