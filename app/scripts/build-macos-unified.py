"""One Mac download/app; native architecture selection, no installed runtimes."""
from pathlib import Path
import hashlib, importlib.util, json, plistlib, shlex, stat, zipfile
ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('mac_package', ROOT / 'scripts/build-macos.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
ARCHES = ('x64', 'arm64')

def launcher_script(commands=None):
    commands = commands or {}
    cmd = {name: shlex.quote(commands.get(name, path)) for name, path in {
        'uname': '/usr/bin/uname', 'sysctl': '/usr/sbin/sysctl',
        'arch': '/usr/bin/arch', 'alert': '/usr/bin/osascript',
    }.items()}
    return '''#!/bin/sh
set -eu
fail() {
    printf '%s\\n' "$1" >&2
    ALERT -e 'display alert "Browserland could not start" message "Extract the complete package into a writable local folder. macOS 13 or later is required. Do not remove the bundled runtimes." as critical' >/dev/null 2>&1 || true
    exit 1
}
macos_dir=$(CDPATH= cd -P "$(dirname "$0")" && pwd -P) || exit 1
contents_dir=$(CDPATH= cd -P "$macos_dir/.." && pwd -P) || exit 1
portable_dir=$(CDPATH= cd -P "$contents_dir/../.." && pwd -P) || exit 1
machine=$(UNAME -m) || fail 'Unable to determine the Mac architecture.'
# Rosetta can report x86_64 even on Apple Silicon.
silicon=$(SYSCTL -in hw.optional.arm64 2>/dev/null || true)
if [ "$machine" = arm64 ] || [ "$silicon" = 1 ]; then
    runtime_arch=arm64
    native_arch=arm64
elif [ "$machine" = x86_64 ]; then
    runtime_arch=x64
    native_arch=x86_64
else
    fail "Unsupported Mac architecture: $machine"
fi
runtime_dir="$contents_dir/Resources/runtimes/$runtime_arch"
executable="$runtime_dir/Browserland.app/Contents/MacOS/Electron"
chromium="$runtime_dir/.runtime/chromium/Chromium.app/Contents/MacOS/Chromium"
[ -x "$executable" ] && [ -x "$chromium" ] || fail 'A bundled runtime is missing or not executable.'
BROWSERLAND_DATA=${BROWSERLAND_DATA:-${MULTIBROWSER_DATA:-"$portable_dir/data"}}
case "$BROWSERLAND_DATA" in
    /*) ;;
    *) fail 'BROWSERLAND_DATA must be an absolute path.' ;;
esac
(umask 077; mkdir -p "$BROWSERLAND_DATA") || fail 'Cannot create the profile data directory.'
[ -d "$BROWSERLAND_DATA" ] && [ -w "$BROWSERLAND_DATA" ] || fail 'The profile data directory is not writable.'
export BROWSERLAND_DATA
exec ARCH "-$native_arch" "$executable" "$@"
'''.replace('UNAME', cmd['uname']).replace('SYSCTL', cmd['sysctl']).replace('ARCH ', cmd['arch'] + ' ').replace('ALERT', cmd['alert'])

def source_inventory():
    return sorted(p for folder in ('src', 'ui') for p in (ROOT / folder).rglob('*') if p.is_file()) + [ROOT / 'package.json']

def open_candidate(arch, version, files):
    name = f'Browserland-{version}-mac-{arch}-candidate'
    path = ROOT / 'dist' / (name + '.zip')
    proof = json.loads((ROOT / 'test-results' / f'mac-{arch}-{version}-result.json').read_text())
    if not proof.get('ok') or proof['arch'] != arch or base.digest(path) != proof['sha256']:
        raise ValueError('Candidate checksum/proof mismatch: ' + arch)
    archive = base.checked_archive(path)
    try:
        if archive.testzip():
            raise ValueError('Input ZIP CRC failure: ' + arch)
        app = name + '/Browserland.app/'
        runtime = name + '/.runtime/'
        allowed = (app, runtime, name + '/licenses/')
        for info in archive.infolist():
            if not info.filename.startswith(allowed) and info.filename != name + '/READ-ME-FIRST.txt':
                raise ValueError('Unexpected input file: ' + info.filename)
        for file in files:
            if archive.read(app + 'Contents/Resources/app/' + file.relative_to(ROOT).as_posix()) != file.read_bytes():
                raise ValueError('Candidate source is stale: ' + str(file))
        base.executable_arch(archive, app + 'Contents/MacOS/Electron', arch)
        base.executable_arch(archive, runtime + 'chromium/Chromium.app/Contents/MacOS/Chromium', arch)
        return archive, name, proof
    except Exception:
        archive.close()
        raise

def unified_plist(version, minimum):
    return dict(CFBundleExecutable='Browserland', CFBundlePackageType='APPL',
                CFBundleDisplayName='Browserland', CFBundleName='Browserland',
                CFBundleIdentifier='net.antoniofradique.browserland.launcher', CFBundleIconFile='app-icon.icns',
                CFBundleVersion=version, CFBundleShortVersionString=version,
                LSMinimumSystemVersion=minimum, NSHighResolutionCapable=True)

def build():
    version = json.loads((ROOT / 'package.json').read_text())['version']
    name = f'Browserland-{version}-mac-unified-candidate'
    destination = ROOT / 'dist' / (name + '.zip')
    if destination.exists():
        raise FileExistsError('Existing package preserved: ' + str(destination))
    files = source_inventory()
    inputs = {}
    try:
        for arch in ARCHES:
            inputs[arch] = open_candidate(arch, version, files)
            print('Verified input: ' + arch, flush=True)
        minimums = []
        for archive, input_name, _ in inputs.values():
            for item in ('/Browserland.app/Contents/Info.plist', '/.runtime/chromium/Chromium.app/Contents/Info.plist'):
                minimums.append(plistlib.loads(archive.read(input_name + item)).get('LSMinimumSystemVersion', '13.0'))
        minimum = max(minimums, key=lambda v: tuple(int(n) for n in v.split('.')))
        prefix = name + '/Browserland.app/Contents/'
        launcher = launcher_script().encode('utf-8')
        manifest = dict(version=version, architectures=list(ARCHES), layout='native-runtime-dispatch',
                        minimumMacOS=minimum, launcherSha256=hashlib.sha256(launcher).hexdigest(),
                        dataDirectory='data beside Browserland.app; BROWSERLAND_DATA override supported',
                        executionVerified=False, signed=False, notarized=False,
                        inputs={arch: dict(file=Path(values[2]['path']).name, sha256=values[2]['sha256']) for arch, values in inputs.items()})
        note = f'''Browserland {version} - one macOS package (Intel + Apple Silicon)

Extract the complete ZIP into a writable local folder and open Browserland.app.
macOS {minimum} or later is required. Native architecture is selected automatically,
including when Finder/Terminal was running under Rosetta. Rosetta is not required.
Electron and Chromium are bundled. No Node, Python, Java or browser installation
is required. Keep all contents of the application together.

Settings, profiles and sessions are saved in the data folder beside the app.
Back up/copy data only after closing the manager and all browser windows.
System-encrypted credentials may require re-entry on another computer.
Use encrypted session export/import for compatible cross-computer sessions.

DEVELOPMENT CANDIDATE: structure, runtime architecture, sources, permissions and
ZIP integrity are verified on Windows. This is not a signed/notarized release.
Real Mac execution, Gatekeeper, permissions, extensions and session persistence
still require validation on Intel and Apple Silicon. Do not disable protections.

Created by Antonio Fradique
https://AntonioFradique.net
'''
        with zipfile.ZipFile(destination, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as output:
            base.add_bytes(output, prefix + 'Info.plist', plistlib.dumps(unified_plist(version, minimum)))
            base.add_bytes(output, prefix + 'Resources/app-icon.icns', (ROOT/'ui/assets/app-icon.icns').read_bytes())
            base.add_bytes(output, prefix + 'PkgInfo', b'APPL????')
            base.add_bytes(output, prefix + 'MacOS/Browserland', launcher, 0o100755)
            base.add_bytes(output, name + '/READ-ME-FIRST.txt', note.encode('utf-8'))
            base.add_bytes(output, name + '/package-verification.json', json.dumps(manifest, indent=2).encode())
            for arch, (archive, input_name, _) in inputs.items():
                runtime_prefix = prefix + 'Resources/runtimes/' + arch + '/'
                for info in archive.infolist():
                    relative = info.filename[len(input_name) + 1:]
                    if relative != 'READ-ME-FIRST.txt':
                        base.copy_entry(archive, info, output, runtime_prefix + relative)
                print('Packaged native runtime: ' + arch, flush=True)
        print('Checking complete output ZIP...', flush=True)
        matched = 0
        with base.checked_archive(destination) as output:
            if output.testzip():
                raise ValueError('Output ZIP CRC failure')
            if output.read(prefix + 'MacOS/Browserland') != launcher:
                raise ValueError('Launcher mismatch')
            if not (output.getinfo(prefix + 'MacOS/Browserland').external_attr >> 16) & 0o111:
                raise ValueError('Launcher not executable')
            for arch, (archive, input_name, _) in inputs.items():
                runtime_prefix = prefix + 'Resources/runtimes/' + arch + '/'
                for info in archive.infolist():
                    relative = info.filename[len(input_name) + 1:]
                    if relative == 'READ-ME-FIRST.txt':
                        continue
                    target = runtime_prefix + relative
                    if output.read(target) != archive.read(info) or output.getinfo(target).external_attr != info.external_attr:
                        raise ValueError('Runtime content/permission mismatch: ' + target)
                    matched += 1
                base.executable_arch(output, runtime_prefix + 'Browserland.app/Contents/MacOS/Electron', arch)
                base.executable_arch(output, runtime_prefix + '.runtime/chromium/Chromium.app/Contents/MacOS/Chromium', arch)
            links = sum(stat.S_ISLNK(info.external_attr >> 16) for info in output.infolist())
            if any('/data/' in n or '/test-results/' in n for n in output.namelist()):
                raise ValueError('Unexpected private data')
        report = dict(ok=True, path=str(destination), bytes=destination.stat().st_size,
                      sha256=base.digest(destination), runtimeEntriesMatched=matched,
                      sourceFilesPerArchitecture=len(files), symlinksPreserved=links,
                      crcVerified=True, architecturesVerified=True, launcherExecutable=True,
                      **manifest)
        (ROOT / 'test-results' / f'mac-unified-{version}-result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report), flush=True)
        return report
    finally:
        for archive, _, _ in inputs.values():
            archive.close()

if __name__ == '__main__':
    build()
