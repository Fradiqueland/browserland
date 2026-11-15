"""Build a universal PKG with Apple's native packaging tools on a Mac.

The verified portable app supplies both runtimes. Only its outer launcher and
user instructions change: installed workspaces use Application Support, outside
the administrator-owned app. Neither the payload nor installer scripts contain
or migrate user data. The optional native check is restricted to disposable CI.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import os
import platform
import plistlib
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
IDENTIFIER = 'net.antoniofradique.browserland.pkg'
APP_ID = 'net.antoniofradique.browserland.launcher'
TUTORIAL = 'https://antoniofradique.net/browserland-pdf-tutorial'


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


unified = module('pkg_unified', ROOT / 'scripts/build-macos-unified.py')
base = unified.base


def installed_launcher(commands=None):
    source = unified.launcher_script(commands)
    old = 'BROWSERLAND_DATA=${BROWSERLAND_DATA:-${MULTIBROWSER_DATA:-"$portable_dir/data"}}'
    new = 'BROWSERLAND_DATA=${BROWSERLAND_DATA:-${MULTIBROWSER_DATA:-"$HOME/Library/Application Support/Browserland"}}'
    if source.count(old) != 1:
        raise ValueError('Portable launcher contract changed')
    return source.replace(old, new).replace(
        'Extract the complete package into a writable local folder.',
        'Reinstall Browserland using the complete universal installer.')


def distribution(version, minimum):
    doc = ET.Element('installer-gui-script', minSpecVersion='2')
    ET.SubElement(doc, 'title').text = 'Browserland ' + version
    ET.SubElement(doc, 'options', customize='never', hostArchitectures='x86_64,arm64',
                  **{'require-scripts': 'false', 'allow-external-scripts': 'no'})
    ET.SubElement(doc, 'domains', enable_localSystem='true', enable_anywhere='false',
                  enable_currentUserHome='false')
    ET.SubElement(ET.SubElement(ET.SubElement(doc, 'volume-check'), 'allowed-os-versions'),
                  'os-version', min=minimum)
    ET.SubElement(doc, 'welcome', file='welcome.html')
    ET.SubElement(doc, 'conclusion', file='conclusion.html')
    ET.SubElement(ET.SubElement(doc, 'choices-outline'), 'line', choice='browserland')
    ET.SubElement(ET.SubElement(doc, 'choice', id='browserland', visible='false'),
                  'pkg-ref', id=IDENTIFIER)
    reference = ET.SubElement(doc, 'pkg-ref', id=IDENTIFIER, version=version,
                              onConclusion='none')
    reference.text = '#Browserland.pkg'
    close = ET.SubElement(ET.SubElement(doc, 'pkg-ref', id=IDENTIFIER), 'must-close')
    for app_id in (APP_ID, 'net.antoniofradique.browserland'):
        ET.SubElement(close, 'app', id=app_id)
    ET.SubElement(doc, 'product', id=APP_ID, version=version)
    return ET.tostring(doc, encoding='utf-8', xml_declaration=True)


def run(args, timeout=900, env=None):
    print('RUN:', ' '.join(map(str, args)), flush=True)
    result = subprocess.run(list(map(str, args)), capture_output=True, text=True,
                            timeout=timeout, env=env)
    if result.returncode:
        raise RuntimeError(result.stdout + '\n' + result.stderr)
    return result.stdout


def inventory(app):
    entries = {}
    for path in sorted(app.rglob('*')):
        relative = path.relative_to(app).as_posix()
        info = path.lstat()
        if path.is_symlink():
            if not path.resolve(strict=True).is_relative_to(app.resolve()):
                raise ValueError('Installer symlink leaves application: ' + relative)
            entries[relative] = ['link', os.readlink(path)]
        elif path.is_file():
            entries[relative] = ['file', base.digest(path), bool(info.st_mode & 0o111)]
    return entries


def source_matches(actual, expected, file):
    if actual == expected:
        return True
    # Git on the Windows package runner may check text out as CRLF, while the
    # native Mac runner uses LF. Only that text transport difference is allowed.
    if Path(file).suffix not in {'.mjs', '.cjs', '.js', '.json', '.html', '.css'}:
        return False
    return actual.replace(b'\r\n', b'\n') == expected.replace(b'\r\n', b'\n')


def verify_input(source, receipt, version):
    proof = json.loads(receipt.read_text(encoding='utf-8-sig'))
    if proof.get('ok') is not True or proof.get('sha256') != base.digest(source):
        raise ValueError('Universal source checksum or proof mismatch')
    prefix = 'Browserland.app/Contents/'
    with base.checked_archive(source) as archive:
        info = plistlib.loads(archive.read(prefix + 'Info.plist'))
        if info['CFBundleIdentifier'] != APP_ID or info['CFBundleShortVersionString'] != version:
            raise ValueError('Stale or unrelated universal application')
        if archive.read(prefix + 'MacOS/Browserland') != unified.launcher_script().encode():
            raise ValueError('Unexpected portable launcher')
        if archive.read(prefix + 'Resources/app-icon.icns') != (ROOT / 'ui/assets/app-icon.icns').read_bytes():
            raise ValueError('Stale application icon')
        for arch in ('x64', 'arm64'):
            runtime = prefix + 'Resources/runtimes/' + arch + '/'
            base.executable_arch(archive, runtime + 'Browserland.app/Contents/MacOS/Electron', arch)
            base.executable_arch(archive, runtime + '.runtime/chromium/Chromium.app/Contents/MacOS/Chromium', arch)
            for file in unified.source_inventory():
                name = runtime + 'Browserland.app/Contents/Resources/app/' + file.relative_to(ROOT).as_posix()
                if not source_matches(archive.read(name), file.read_bytes(), file):
                    raise ValueError('Portable source does not match checkout: ' + name)
    return info.get('LSMinimumSystemVersion', '13.0')


def html(body):
    return ('<!doctype html><html><head><meta charset="utf-8"><style>'
            'body{font:14px -apple-system,Helvetica,sans-serif;color:#17324f;line-height:1.5}'
            'h1{color:#075ce7}code{font-size:12px}li{margin:8px 0}'
            '</style></head><body>' + body + '</body></html>')


def native_check(output, expected, version):
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise RuntimeError('Native installation checks require a disposable GitHub runner')
    target = Path('/Applications/Browserland.app')
    data = Path.home() / 'Library/Application Support/Browserland'
    if target.exists() or data.exists():
        raise RuntimeError('Existing application or workspace preserved; runner must be clean')
    data.mkdir(parents=True, mode=0o700)
    marker = data / 'installer-preservation-marker.txt'
    marker.write_text('Isolated Browserland native installer fixture.\n')
    original = marker.read_bytes()
    for operation in ('install', 'upgrade'):
        run(['sudo', '-n', '/usr/sbin/installer', '-pkg', output, '-target', '/'], timeout=600)
        if inventory(target) != expected or marker.read_bytes() != original:
            raise ValueError('Native installation changed payload or profile data: ' + operation)
    # The installed launcher sets its own default Application Support directory.
    # No real accounts or external links are used: the smoke check intercepts
    # shell.openExternal, clicks the UI, and confirms every translated label.
    environment = dict(os.environ)
    for name in ('BROWSERLAND_DATA', 'MULTIBROWSER_DATA', 'ELECTRON_RUN_AS_NODE'):
        environment.pop(name, None)
    try:
        run(['/usr/bin/open', '-W', '-n', target, '--args', '--self-test', '--social-links-only'],
            timeout=240, env=environment)
    except Exception:
        for name in ('progress.log', 'smoke-error.log'):
            file = data / name
            if file.is_file():
                print(file.read_text(errors='replace'), flush=True)
        raise
    if not (data / 'smoke-result.json').is_file():
        for name in ('progress.log', 'smoke-error.log'):
            file = data / name
            if file.is_file():
                print(file.read_text(errors='replace'), flush=True)
        raise ValueError('Installed application did not complete its native menu check')
    smoke = json.loads((data / 'smoke-result.json').read_text())
    if smoke.get('ok') is not True or marker.read_bytes() != original:
        raise ValueError('Installed application menu or workspace preservation failed')
    if not any('Tutorial PDF' in test['name'] for test in smoke['tests']):
        raise ValueError('Installed tutorial action was not exercised')
    return dict(nativeInstallationVerified=True, nativeUpgradeVerified=True,
                profileDataPreserved=True, tutorialMenuVerified=True,
                executedArchitecture=platform.machine(), menuChecks=smoke['tests'])


def build(source, receipt, output, verify_install=False):
    if sys.platform != 'darwin':
        raise RuntimeError('Use macOS with Apple pkgbuild and productbuild')
    version = json.loads((ROOT / 'package.json').read_text())['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Invalid package version')
    if output.exists():
        raise FileExistsError('Existing installer preserved: ' + str(output))
    minimum = verify_input(source, receipt, version)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='browserland-pkg-', dir=output.parent) as temporary:
        work = Path(temporary)
        extracted = work / 'extracted'
        run(['/usr/bin/ditto', '-x', '-k', source, extracted])
        payload = work / 'payload'
        payload.mkdir()
        app = payload / 'Browserland.app'
        shutil.move(extracted / 'Browserland.app', app)
        launcher = app / 'Contents/MacOS/Browserland'
        launcher.write_text(installed_launcher(), encoding='utf-8')
        launcher.chmod(0o755)
        note = ('Browserland ' + version + '\n\n'
                'Open Browserland from Applications. Both Intel and Apple Silicon are included.\n'
                'Profiles: ~/Library/Application Support/Browserland\n'
                'Close the manager and all profile browsers before updating or backing up.\n'
                'The installer never includes or replaces your profile data.\n\n'
                'Moving from a portable version: first back up its complete data folder.\n'
                'With all windows closed, copy that folder to the profile location above,\n'
                'before first launch. Never overwrite an existing workspace; keep both backups.\n'
                'The portable original is left untouched.\n\nTutorial: ' + TUTORIAL + '\n')
        (app / 'Contents/Resources/READ-ME-FIRST.txt').write_text(note, encoding='utf-8')
        verification = app / 'Contents/Resources/package-verification.json'
        metadata = json.loads(verification.read_text())
        metadata.update(layout='installed-native-runtime-dispatch',
                        dataDirectory='~/Library/Application Support/Browserland',
                        launcherSha256=hashlib.sha256(installed_launcher().encode()).hexdigest())
        verification.write_text(json.dumps(metadata, indent=2), encoding='utf-8')
        expected = inventory(app)
        components = work / 'components.plist'
        run(['/usr/bin/pkgbuild', '--analyze', '--root', payload, components])
        settings = plistlib.loads(components.read_bytes())
        for item in settings:
            item.update(BundleIsRelocatable=False, BundleIsVersionChecked=True,
                        BundleOverwriteAction='upgrade')
        components.write_bytes(plistlib.dumps(settings))
        component = work / 'Browserland.pkg'
        run(['/usr/bin/pkgbuild', '--root', payload, '--component-plist', components,
             '--identifier', IDENTIFIER, '--version', version, '--install-location',
             '/Applications', '--ownership', 'recommended', component])
        definition = work / 'Distribution.xml'
        definition.write_bytes(distribution(version, minimum))
        resources = work / 'Resources'
        resources.mkdir()
        (resources / 'welcome.html').write_text(html(
            '<h1>Browserland</h1><p>Install Browserland for Intel and Apple Silicon Macs.</p>'
            '<ul><li>Browserland will be installed in Applications.</li>'
            '<li>Close Browserland and all profile browser windows before continuing.</li>'
            '<li>Profiles are saved separately in <code>~/Library/Application Support/Browserland</code>.</li>'
            '<li>Updating the installer preserves this workspace.</li></ul>'
            '<h2>Already using a portable version?</h2><p>Back up its complete data folder. '
            'After closing every window, copy that folder to the location above before '
            'first launch. Do not overwrite an existing workspace. Keep the original backup.</p>'
            '<p>Electron and Chromium are included. No extra runtime installation is needed.</p>'), encoding='utf-8')
        (resources / 'conclusion.html').write_text(html(
            '<h1>Ready to use Browserland</h1><p>Open Browserland from Applications. '
            'The application selects the native Intel or Apple Silicon runtime automatically.</p>'
            '<p>Use <b>Download PDF Tutorial</b> in the sidebar for step-by-step instructions.</p>'
            '<p><a href="' + TUTORIAL + '">View the PDF tutorial</a></p>'), encoding='utf-8')
        candidate = work / output.name
        run(['/usr/bin/productbuild', '--distribution', definition, '--package-path',
             work, '--resources', resources, candidate])
        expanded = work / 'expanded'
        run(['/usr/sbin/pkgutil', '--expand-full', candidate, expanded])
        restored = expanded / 'Browserland.pkg/Payload/Browserland.app'
        if inventory(restored) != expected:
            raise ValueError('PKG extraction changed file bytes, links or executable permissions')
        package_info = ET.parse(expanded / 'Browserland.pkg/PackageInfo').getroot()
        if package_info.get('install-location') != '/Applications' or package_info.get('version') != version:
            raise ValueError('Incorrect package version or install destination')
        scripts = package_info.find('scripts')
        if scripts is not None and len(scripts):
            raise ValueError('Unexpected installer scripts')
        if (expanded / 'Distribution').read_bytes().find(b'x86_64,arm64') == -1:
            raise ValueError('Distribution is not universal')
        native = native_check(candidate, expected, version) if verify_install else {}
        candidate.replace(output)
    report = dict(ok=True, version=version, file=str(output), bytes=output.stat().st_size,
                  sha256=base.digest(output), sourceSHA256=base.digest(source),
                  commit=os.environ.get('GITHUB_SHA'), architectures=['x64', 'arm64'],
                  payloadFilesVerified=len(expected), payloadBytesAndLinksVerified=True,
                  installLocation='/Applications/Browserland.app', minimumMacOS=minimum,
                  profileDirectory='~/Library/Application Support/Browserland',
                  portableDataMigratedAutomatically=False, signed=False, notarized=False, **native)
    (ROOT / 'reference').mkdir(exist_ok=True)
    (ROOT / 'reference' / f'mac-installer-{version}.json').write_text(
        json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    parser.add_argument('--verify-install', action='store_true')
    args = parser.parse_args()
    version = json.loads((ROOT / 'package.json').read_text())['version']
    build(args.source.resolve(), args.receipt.resolve(),
          ROOT / 'dist' / f'Browserland-{version}-Mac-Universal.pkg', args.verify_install)
