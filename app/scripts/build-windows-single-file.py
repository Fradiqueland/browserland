"""Build a self-contained Windows EXE without changing the application sources."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import zipfile
import app_icons

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache' / 'windows-single-file'
LAUNCHER = ROOT / 'scripts' / 'windows-single-file'
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
PORTABLE = ROOT / 'dist' / f'Browserland-{VERSION}-win-x64'
OUTPUT = ROOT / 'dist' / f'Browserland-{VERSION}-Windows-Portable.exe'
GO_ROOT = ROOT / '.cache' / 'dmg-toolchain' / 'go'
GO_CONFIG = ROOT / '.cache' / 'portable-go.json'
if GO_CONFIG.is_file():
    prepared_go = Path(json.loads(GO_CONFIG.read_text(encoding='utf-8'))['goRoot'])
    if (prepared_go / 'bin' / 'go.exe').is_file():
        GO_ROOT = prepared_go

def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 << 20), b''):
            h.update(chunk)
    return h.hexdigest()

def pe_resources(exe):
    data = exe.read_bytes()
    pe = struct.unpack_from('<I', data, 0x3c)[0]
    sections = struct.unpack_from('<H', data, pe + 6)[0]
    optional_size = struct.unpack_from('<H', data, pe + 20)[0]
    optional = pe + 24
    resource_rva = struct.unpack_from('<I', data, optional + 112 + 16)[0]
    table = optional + optional_size
    mappings = [struct.unpack_from('<IIII', data, table + i * 40 + 8) for i in range(sections)]
    def offset(rva):
        for virtual_size, address, raw_size, raw in mappings:
            if address <= rva < address + max(virtual_size, raw_size):
                return raw + rva - address
        raise ValueError('PE resource RVA is outside sections')
    base = offset(resource_rva)
    def visit(relative):
        pos = base + relative
        named, ids = struct.unpack_from('<HH', data, pos + 12)
        result = {}
        for i in range(named + ids):
            key, value = struct.unpack_from('<II', data, pos + 16 + i * 8)
            if key & 0x80000000:
                continue
            if value & 0x80000000:
                result[key] = visit(value & 0x7fffffff)
            else:
                rva, size = struct.unpack_from('<II', data, base + value)
                result[key] = data[offset(rva):offset(rva)+size]
        return result
    return visit(0)

def write_resources(electron):
    # Retain the existing portable's icon. Add an asInvoker manifest; no elevation.
    original = pe_resources(electron)
    manifest = b'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
<assemblyIdentity version="0.21.0.0" processorArchitecture="amd64" name="AntonioFradique.Browserland.Portable" type="win32"/>
<description>Browserland Portable</description>
<trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges><requestedExecutionLevel level="asInvoker" uiAccess="false"/></requestedPrivileges></security></trustInfo>
<compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1"><application><supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/></application></compatibility>
<application xmlns="urn:schemas-microsoft-com:asm.v3"><windowsSettings><longPathAware xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">true</longPathAware><dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true</dpiAware></windowsSettings></application>
</assembly>'''
    manifest = manifest.replace(b'0.21.0.0',(VERSION+'.0').encode())
    tree = {k: original[k] for k in (3, 14) if k in original}
    tree[16] = {1: {1033: app_icons.version_resource('Browserland.exe')}}
    tree[24] = {1: {1033: manifest}}
    raw = bytearray()
    leaves = []
    def directory(entries):
        position = len(raw)
        raw.extend(struct.pack('<IIHHHH', 0, 0, 0, 0, 0, len(entries)))
        raw.extend(bytes(len(entries)*8))
        for i, (key, value) in enumerate(sorted(entries.items())):
            if isinstance(value, dict):
                target = directory(value) | 0x80000000
            else:
                target = len(raw)
                raw.extend(bytes(16))
                leaves.append((target, value))
            struct.pack_into('<II', raw, position+16+i*8, key, target)
        return position
    directory(tree)
    relocations = bytearray()
    for leaf, value in leaves:
        raw.extend(bytes((-len(raw)) % 4))
        offset = len(raw)
        raw.extend(value)
        struct.pack_into('<IIII', raw, leaf, offset, len(value), 0, 0)
        relocations.extend(struct.pack('<IIH', leaf, 0, 3))  # IMAGE_REL_AMD64_ADDR32NB
    raw_offset = 20+40
    relocation_offset = raw_offset+len(raw)
    symbol_offset = relocation_offset+len(relocations)
    header = struct.pack('<HHIIIHH', 0x8664, 1, 0, symbol_offset, 1, 0, 0)
    section = struct.pack('<8sIIIIIIHHI', b'.rsrc', 0, 0, len(raw), raw_offset, relocation_offset, 0, len(leaves), 0, 0x40300040)
    symbol = struct.pack('<8sIhHBB', b'.rsrc', 0, 1, 0, 3, 0)
    (LAUNCHER / 'resources_windows_amd64.syso').write_bytes(header+section+raw+relocations+symbol+struct.pack('<I',4))
    return sum(len(v) for v in tree.get(3, {}).values())

def prepare_portable():
    electron = ROOT / '.runtime' / 'electron'
    chrome = ROOT / '.runtime' / 'chromium'
    manifest = chrome / 'browserland-runtime.json'
    if not manifest.is_file():
        manifest = chrome / 'multi-browser-runtime.json'  # Existing verified runtime.
    info = json.loads(manifest.read_text())
    if sha(chrome/'chrome.exe').lower() != info['executableSha256'].lower():
        raise ValueError('Bundled Chromium does not match its preparation manifest')
    if not (electron/'electron.exe').is_file():
        raise FileNotFoundError('Prepare the existing Electron runtime first')
    if PORTABLE.exists():
        # Existing deliveries and user data are never overwritten.
        raise FileExistsError(f'Portable output already exists; preserve it before rebuilding: {PORTABLE}')
    shutil.copytree(electron, PORTABLE)
    (PORTABLE/'electron.exe').rename(PORTABLE/'Browserland.exe')
    shutil.copytree(chrome, PORTABLE/'.runtime'/'chromium')
    target = PORTABLE/'resources'/'app'
    target.mkdir()
    for name in ('src','ui'):
        shutil.copytree(ROOT/name, target/name)
    shutil.copy2(ROOT/'package.json', target/'package.json')
    shutil.copy2(ROOT/'LEIA-ME.txt', PORTABLE/'LEIA-ME.txt')
    app_icons.apply_windows(PORTABLE/'Browserland.exe')
    print('Portable folder restored from existing verified runtimes.', flush=True)

def main():
    if OUTPUT.exists():
        raise FileExistsError(f'Existing EXE preserved: {OUTPUT}')
    if not (GO_ROOT/'bin/go.exe').is_file():
        raise FileNotFoundError('Prepare the pinned build toolchain with scripts/prepare-portable-go.py')
    CACHE.mkdir(parents=True, exist_ok=True)
    prepare_portable()
    files = []
    paths = sorted(p for p in PORTABLE.rglob('*') if p.is_file())
    for path in paths:
        if path.is_symlink():
            raise ValueError('Windows delivery must not contain links')
        files.append({'Path':path.relative_to(PORTABLE).as_posix(),'Size':path.stat().st_size,'SHA256':sha(path)})
    manifest = json.dumps({'Version':VERSION,'Files':files},ensure_ascii=False,separators=(',',':')).encode()
    payload = CACHE/'payload.zip'
    with zipfile.ZipFile(payload,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as archive:
        for index,path in enumerate(paths):
            archive.write(path,path.relative_to(PORTABLE).as_posix())
            if index % 100 == 0:
                print(f'Packing {index+1}/{len(paths)} files',flush=True)
        archive.writestr('single-file-manifest.json',manifest)
    payload_hash = sha(payload)
    manifest_hash = hashlib.sha256(manifest).hexdigest()
    env = dict(os.environ, GOROOT=str(GO_ROOT), GOCACHE=str(ROOT/'.cache'/'dmg-toolchain'/'go-build'),
               GOPATH=str(ROOT/'.cache'/'dmg-toolchain'/'gopath'),GOTOOLCHAIN='local',CGO_ENABLED='0',GOOS='windows',GOARCH='amd64')
    write_resources(PORTABLE/'Browserland.exe')
    stub = CACHE/'launcher.exe'
    flags = f'-s -w -H=windowsgui -X main.payloadSHA={payload_hash} -X main.manifestSHA={manifest_hash}'
    subprocess.run([str(GO_ROOT/'bin'/'go.exe'),'build','-trimpath','-ldflags',flags,'-o',str(stub),'.'],cwd=LAUNCHER,env=env,check=True)
    partial = OUTPUT.with_suffix('.exe.partial')
    with partial.open('xb') as destination:
        with stub.open('rb') as source:
            shutil.copyfileobj(source,destination)
        start = destination.tell()
        with payload.open('rb') as source:
            shutil.copyfileobj(source,destination)
        destination.write(b'MULTIBROWSER-SF1'+struct.pack('<QQ',start,payload.stat().st_size))
    partial.rename(OUTPUT)
    report = {'version':VERSION,'file':str(OUTPUT),'size':OUTPUT.stat().st_size,'sha256':sha(OUTPUT),
              'payloadSHA256':payload_hash,'manifestSHA256':manifest_hash,'files':len(files),
              'unpackedBytes':sum(f['Size'] for f in files),'portable':str(PORTABLE),
              'macUnchanged':True,'runtimeTestsPending':True}
    (ROOT/'reference'/f'windows-single-file-{VERSION}.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2),flush=True)

if __name__ == '__main__':
    main()
