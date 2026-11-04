"""Repackage the verified dual-architecture Mac build as one visible .app."""
from pathlib import Path
import hashlib, importlib.util, json, plistlib, stat, zipfile
ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('mac_package', ROOT / 'scripts/build-macos.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

def target_name(name, prefix):
    app = prefix + '/Browserland.app/'
    if name.startswith(app):
        return 'Browserland.app/' + name[len(app):]
    if name in (prefix + '/READ-ME-FIRST.txt', prefix + '/package-verification.json'):
        return 'Browserland.app/Contents/Resources/' + name.rsplit('/', 1)[1]
    raise ValueError('Unexpected input entry: ' + name)

def build():
    version = json.loads((ROOT / 'package.json').read_text())['version']
    prefix = f'Browserland-{version}-mac-unified-candidate'
    source = ROOT / 'dist' / (prefix + '.zip')
    proof = json.loads((ROOT / 'test-results' / f'mac-unified-{version}-result.json').read_text())
    if not proof.get('ok') or base.digest(source) != proof['sha256']:
        raise ValueError('Unified input does not match verified checksum')
    destination = ROOT / 'dist' / f'Browserland-{version}-mac.zip'
    if destination.exists():
        raise FileExistsError('Existing package preserved: ' + str(destination))
    with base.checked_archive(source) as incoming:
        mapped = [(info, target_name(info.filename, prefix)) for info in incoming.infolist()]
        if len(set(target for _, target in mapped)) != len(mapped):
            raise ValueError('Conflicting output paths')
        with zipfile.ZipFile(destination, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as output:
            for info, target in mapped:
                base.copy_entry(incoming, info, output, target)
        print('One-app ZIP created. Verifying all entries...', flush=True)
        with base.checked_archive(destination) as output:
            if output.testzip():
                raise ValueError('ZIP integrity failure')
            if {name.split('/')[0] for name in output.namelist()} != {'Browserland.app'}:
                raise ValueError('Package must contain one visible application only')
            for info, target in mapped:
                if output.read(target) != incoming.read(info) or output.getinfo(target).external_attr != info.external_attr:
                    raise ValueError('Content/permission mismatch: ' + target)
            info = plistlib.loads(output.read('Browserland.app/Contents/Info.plist'))
            executable = 'Browserland.app/Contents/MacOS/' + info['CFBundleExecutable']
            if not (output.getinfo(executable).external_attr >> 16) & 0o111:
                raise ValueError('Application launcher not executable')
            for arch in ('x64', 'arm64'):
                root = 'Browserland.app/Contents/Resources/runtimes/' + arch + '/'
                base.executable_arch(output, root + 'Browserland.app/Contents/MacOS/Electron', arch)
                base.executable_arch(output, root + '.runtime/chromium/Chromium.app/Contents/MacOS/Chromium', arch)
            links = sum(stat.S_ISLNK(i.external_attr >> 16) for i in output.infolist())
    report = dict(ok=True, version=version, path=str(destination), bytes=destination.stat().st_size,
                  sha256=base.digest(destination), inputSha256=proof['sha256'],
                  entriesMatched=len(mapped), symlinksPreserved=links, singleVisibleApp=True,
                  splitArchive=False, crcVerified=True, architectures=['x64','arm64'],
                  sourceAndLauncherUnchanged=True, executionVerified=False, signed=False, notarized=False)
    (ROOT / 'reference' / f'mac-single-{version}.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report), flush=True)

if __name__ == '__main__':
    build()
