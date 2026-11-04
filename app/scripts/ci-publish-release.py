"""Publish complete verified CI packages; never overwrite a release or tag."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def gh(*args):
    return subprocess.check_output(['gh', *args], text=True)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def publish(source):
    version = json.loads((ROOT / 'package.json').read_text())['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Invalid release version')
    repository = os.environ['GITHUB_REPOSITORY']
    commit = os.environ['GITHUB_SHA']
    if repository != 'Fradiqueland/browserland' or not re.fullmatch('[a-f0-9]{40}', commit):
        raise ValueError('Unexpected release context')
    source = source.resolve(strict=True)
    names = [f'Browserland-{version}-{suffix}' for suffix in (
        'Windows-Setup.exe', 'Windows-Portable.exe', 'mac.dmg', 'Mac-Portable.zip')]
    packages = []
    for name in names:
        matches = list(source.rglob(name))
        if len(matches) != 1 or matches[0].is_symlink() or matches[0].stat().st_size < 1_000_000:
            raise ValueError('Missing, ambiguous or incomplete package: ' + name)
        packages.append(matches[0])
    reports = sorted(source.glob('*-verification/*.json'))
    if not reports:
        raise ValueError('Missing verification reports')
    proof_names = {path.name for path in reports}
    required = {f'electron-payload-{version}.json', f'ci-windows-verification-{version}.json',
                f'mac-dmg-{version}.json', f'mac-portable-{version}.json', f'mac-ci-{version}.json'}
    if not required.issubset(proof_names):
        raise ValueError('Missing required package verification')
    for path in reports:
        data = json.loads(path.read_text(encoding='utf-8-sig'))
        if path.name in required and data.get('ok') is not True:
            raise ValueError('Package verification failed: ' + path.name)
    # Packages must be the exact artifacts described by the build receipts.
    proof_files = {p.name: json.loads(p.read_text(encoding='utf-8-sig')) for p in reports}
    native = proof_files[f'ci-windows-verification-{version}.json']
    if any(native.get(flag) is not True for flag in ('nativeFixtureVerified', 'profileDataPreserved',
                                                    'iconResourcesVerified', 'shortcutIconsVerified',
                                                    'pinnedShortcutsVerified')):
        raise ValueError('Native Windows validation is incomplete')
    mac = proof_files[f'mac-ci-{version}.json']
    if mac.get('structuralValidation') is not True or mac.get('commit') != commit:
        raise ValueError('Mac package validation does not match this commit')
    proof_map = {
        names[0]: (f'electron-installer-{version}.json', 'sha256'),
        names[1]: (f'windows-single-file-{version}.json', 'sha256'),
        names[2]: (f'mac-dmg-{version}.json', 'sha256'),
        names[3]: (f'mac-portable-{version}.json', 'zipSHA256'),
    }
    hashes = {}
    for path in packages:
        proof_name, key = proof_map[path.name]
        actual = digest(path)
        if proof_files.get(proof_name, {}).get(key) != actual:
            raise ValueError('Package checksum does not match receipt: ' + path.name)
        hashes[path.name] = actual
    tag = 'v' + version
    # Query collections successfully before deciding that the target is absent.
    releases = json.loads(gh('api', '--paginate', '--slurp', f'repos/{repository}/releases?per_page=100'))
    if any(r['tag_name'] == tag for page in releases for r in page):
        raise ValueError('Existing release preserved: ' + tag)
    tags = json.loads(gh('api', f'repos/{repository}/git/matching-refs/tags/{tag}'))
    if any(r['ref'] == 'refs/tags/' + tag for r in tags):
        raise ValueError('Existing tag preserved: ' + tag)
    out = source / 'publication'
    out.mkdir(exist_ok=False)
    checksums = out / 'SHA256SUMS.txt'
    checksums.write_text(''.join(f'{hashes[p.name]}  {p.name}\n' for p in packages))
    verification = out / f'Browserland-{version}-Verification.zip'
    with zipfile.ZipFile(verification, 'x', zipfile.ZIP_DEFLATED) as archive:
        for path in reports:
            archive.write(path, path.parent.name + '/' + path.name)
    notes = out / 'release-notes.md'
    notes.write_text(
        f'Browserland {version} configures the circular blue Windows icons automatically during installation and updates.\n\n'
        'Windows: use Windows-Setup.exe for installation and Desktop/Start menu shortcuts, '
        'or Windows-Portable.exe for portable use. Setup uses a versioned icon for Desktop, Start menu and installed-app entries, '
        'and refreshes existing Browserland taskbar shortcuts. Existing profile data is preserved.\n\n'
        'Mac: the DMG and Mac-Portable.zip contain both Intel and Apple Silicon runtimes. '
        'Keep the existing data folder when updating.\n\n'
        'The packages include Electron and Chromium. No separate runtime installation is required.\n\n'
        'Validation: application tests, Windows installer payload verification and isolated '
        'install/update/uninstall checks, and Mac package/DMG structure and checksum verification. '
        'Real macOS execution, signing and notarization are not verified by this build.\n\n'
        f'Source commit: {commit}. Checksums and detailed build receipts are attached.\n', encoding='utf-8')
    assets = [*packages, checksums, verification]
    gh('release', 'create', tag, '--repo', repository, '--target', commit, '--draft',
       '--title', 'Browserland ' + version, '--notes-file', str(notes), *map(str, assets))
    release = json.loads(gh('release', 'view', tag, '--repo', repository, '--json', 'assets,isDraft'))
    expected = {p.name: p.stat().st_size for p in assets}
    actual = {item['name']: item['size'] for item in release['assets']}
    if actual != expected or release['isDraft'] is not True:
        raise ValueError('Draft assets are incomplete; draft left unpublished')
    gh('release', 'edit', tag, '--repo', repository, '--draft=false')
    print('RELEASE_PUBLISHED ' + gh('release', 'view', tag, '--repo', repository, '--json', 'url', '--jq', '.url').strip())


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: ci-publish-release.py ARTIFACT_DIRECTORY')
    publish(Path(sys.argv[1]))
