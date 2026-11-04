"""Compose macOS candidate ZIPs without flattening Unix symlinks on Windows.
Runtime downloads are verified by prepare-macos.mjs. A real Mac is still required
for signing/notarization and execution tests; these packages are not releases.
"""
from pathlib import Path, PurePosixPath
import argparse, copy, hashlib, json, plistlib, posixpath, shutil, stat, struct, zipfile
ROOT = Path(__file__).resolve().parent.parent

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def safe_name(name):
    if not name or name.startswith('/') or '\\' in name or ':' in name or '..' in PurePosixPath(name).parts:
        raise ValueError('Unsafe archive path: ' + name)
    return name

def checked_archive(path):
    archive = zipfile.ZipFile(path)
    seen = set()
    for info in archive.infolist():
        safe_name(info.filename)
        if info.filename in seen:
            raise ValueError('Duplicate archive entry: ' + info.filename)
        seen.add(info.filename)
        mode = info.external_attr >> 16
        if stat.S_ISLNK(mode):
            target = archive.read(info).decode('utf-8')
            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(info.filename), target))
            if target.startswith('/') or '\\' in target or resolved.startswith('../'):
                raise ValueError('Escaping symlink: ' + info.filename)
            # Links must stay inside the same top-level app/archive directory.
            if resolved.split('/')[0] != info.filename.split('/')[0]:
                raise ValueError('External symlink: ' + info.filename)
    return archive

def add_bytes(output, name, data, mode=0o100644):
    entry = zipfile.ZipInfo(safe_name(name))
    entry.create_system = 3
    entry.external_attr = mode << 16
    entry.compress_type = zipfile.ZIP_DEFLATED
    output.writestr(entry, data)

def copy_entry(source, info, output, destination):
    entry = copy.copy(info)
    entry.filename = safe_name(destination)
    entry.compress_type = zipfile.ZIP_DEFLATED
    # Preserve executable modes and symlink contents exactly.
    with source.open(info) as incoming, output.open(entry, 'w') as outgoing:
        shutil.copyfileobj(incoming, outgoing, 1024 * 1024)

def executable_arch(archive, name, expected):
    info = archive.getinfo(name)
    if not (info.external_attr >> 16) & 0o111:
        raise ValueError('Executable permission absent: ' + name)
    with archive.open(name) as stream:
        magic, cpu = struct.unpack('<II', stream.read(8))
    if magic != 0xfeedfacf or cpu != {'x64':0x01000007, 'arm64':0x0100000c}[expected]:
        raise ValueError('Wrong Mach-O architecture: ' + name)

def build(arch):
    cache = ROOT / '.runtime/downloads'
    manifest = json.loads((cache / ('darwin-' + arch + '-runtime.json')).read_text())
    if manifest['arch'] != arch or manifest['platform'] != 'darwin':
        raise ValueError('Wrong runtime manifest')
    archives = {}
    for engine in ('electron', 'chromium'):
        item = manifest[engine]
        if Path(item['file']).name != item['file']:
            raise ValueError('Invalid cache filename')
        path = cache / item['file']
        if digest(path) != item['sha256']:
            raise ValueError('Runtime checksum mismatch: ' + engine)
        archives[engine] = checked_archive(path)
    electron, chromium = archives['electron'], archives['chromium']
    executable_arch(electron, 'Electron.app/Contents/MacOS/Electron', arch)
    executable_arch(chromium, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', arch)
    chrome_info = plistlib.loads(chromium.read('chrome-mac/Chromium.app/Contents/Info.plist'))
    version = json.loads((ROOT / 'package.json').read_text())['version']
    name = 'Browserland-' + version + '-mac-' + arch + '-candidate'
    destination = ROOT / 'dist' / (name + '.zip')
    if destination.exists():
        raise FileExistsError('Existing package preserved: ' + str(destination))
    source_files = sorted(p for folder in ('src', 'ui') for p in (ROOT / folder).rglob('*') if p.is_file()) + [ROOT / 'package.json']
    with zipfile.ZipFile(destination, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as output:
        for info in electron.infolist():
            if info.filename.startswith('Electron.app/'):
                target = name + '/Browserland.app/' + info.filename[len('Electron.app/'):]
                if info.filename == 'Electron.app/Contents/Info.plist':
                    settings = plistlib.loads(electron.read(info))
                    settings.update(CFBundleDisplayName='Browserland', CFBundleName='Browserland', CFBundleIdentifier='net.antoniofradique.browserland', CFBundleShortVersionString=version, CFBundleVersion=version, CFBundleIconFile='app-icon.icns')
                    add_bytes(output, target, plistlib.dumps(settings))
                else:
                    copy_entry(electron, info, output, target)
            else:
                copy_entry(electron, info, output, name + '/licenses/electron/' + info.filename)
        for info in chromium.infolist():
            if not info.filename.startswith('chrome-mac/'):
                raise ValueError('Unexpected Chromium archive root')
            copy_entry(chromium, info, output, name + '/.runtime/chromium/' + info.filename[len('chrome-mac/'):])
        add_bytes(output, name + '/Browserland.app/Contents/Resources/app-icon.icns', (ROOT/'ui/assets/app-icon.icns').read_bytes())
        for file in source_files:
            add_bytes(output, name + '/Browserland.app/Contents/Resources/app/' + file.relative_to(ROOT).as_posix(), file.read_bytes())
        engine_info = dict(source=manifest['chromium']['url'], revision=manifest['chromium']['revision'], version=chrome_info['CFBundleShortVersionString'], archiveSha256=manifest['chromium']['sha256'], platform=manifest['chromium']['platform'], arch=arch, automaticUpdates=False)
        add_bytes(output, name + '/.runtime/chromium/browserland-runtime.json', json.dumps(engine_info, indent=2).encode())
        add_bytes(output, name + '/.runtime/chromium/CHROMIUM-LICENSE.txt', (ROOT / '.runtime/chromium/CHROMIUM-LICENSE.txt').read_bytes())
        note = ('Browserland ' + version + ' - macOS ' + arch + ' CANDIDATE\n\n'
                'This is a development candidate, not a signed/notarized release.\n'
                'Execution, permissions, extensions and session persistence must be\n'
                'verified on a real Mac before distributing it as ready to use.\n'
                'Do not disable Gatekeeper or other system protections.\n'
                'The application bundle has been modified: upstream signing does\n'
                'not certify this application. Final signing requires a Mac.\n\n'
                'Electron and Chromium are included; normal use needs no Node,\n'
                'Python, Java, Chrome or Edge installation. Keep .runtime beside\n'
                'Browserland.app. Profiles are stored in the sibling data folder,\n'
                'outside the .app bundle. Choose a writable local folder.\n'
                'Copy data only with all profile windows and the manager closed.\n'
                'System-encrypted credentials are not transferable by raw copying.\n'
                'Use encrypted session export/import between computers.\n')
        add_bytes(output, name + '/READ-ME-FIRST.txt', note.encode())
    electron.close(); chromium.close()
    with zipfile.ZipFile(destination) as result:
        if result.testzip() is not None:
            raise ValueError('Output ZIP CRC failure')
        for file in source_files:
            if result.read(name + '/Browserland.app/Contents/Resources/app/' + file.relative_to(ROOT).as_posix()) != file.read_bytes():
                raise ValueError('Packaged source mismatch')
        executable_arch(result, name + '/Browserland.app/Contents/MacOS/Electron', arch)
        executable_arch(result, name + '/.runtime/chromium/Chromium.app/Contents/MacOS/Chromium', arch)
        links = sum(stat.S_ISLNK(i.external_attr >> 16) for i in result.infolist())
        if not links:
            raise ValueError('Framework symlinks missing')
        if any('/data/' in n or '/test-results/' in n for n in result.namelist()):
            raise ValueError('Unexpected private data')
    report = dict(ok=True,arch=arch,path=str(destination),bytes=destination.stat().st_size,sha256=digest(destination),sourceFilesMatched=len(source_files),symlinksPreserved=links,crcVerified=True,machOArchitectureVerified=True,executionVerified=False,signed=False,notarized=False,chromium=engine_info)
    (ROOT / 'test-results' / ('mac-' + arch + '-' + version + '-result.json')).write_text(json.dumps(report, indent=2))
    print(json.dumps(report), flush=True)

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--arch', choices=['x64','arm64','all'], default='all')
    args=parser.parse_args()
    for arch in (['x64','arm64'] if args.arch=='all' else [args.arch]):
        build(arch)
