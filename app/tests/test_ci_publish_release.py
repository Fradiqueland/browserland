import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('publish_release', Path(__file__).resolve().parents[1] / 'scripts/ci-publish-release.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class PublishReleaseTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='browserland-publish-test-')
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / 'package.json').write_text('{"version":"0.22.1"}')
        self.source = self.root / 'artifacts'
        self.source.mkdir()
        self.windows = self.source / 'browserland-windows-verification'
        self.mac = self.source / 'browserland-macos-verification'
        self.windows.mkdir()
        self.mac.mkdir()
        pairs = [('Windows-Setup.exe', self.windows, 'electron-installer', 'sha256'),
                 ('Windows-Portable.exe', self.windows, 'windows-single-file', 'sha256'),
                 ('mac.dmg', self.mac, 'mac-dmg', 'sha256'),
                 ('Mac-Portable.zip', self.mac, 'mac-portable', 'zipSHA256')]
        for index, (suffix, folder, proof, key) in enumerate(pairs):
            data = bytes([index + 1]) * 1_000_001
            (self.source / ('Browserland-0.22.1-' + suffix)).write_bytes(data)
            (folder / (proof + '-0.22.1.json')).write_text(json.dumps({'ok': True, key: hashlib.sha256(data).hexdigest()}))
        for folder, name in [(self.windows, 'electron-payload'), (self.windows, 'ci-windows-verification'), (self.mac, 'mac-ci')]:
            (folder / (name + '-0.22.1.json')).write_text(json.dumps({'ok': True, 'nativeFixtureVerified': True,
                'profileDataPreserved': True, 'iconResourcesVerified': True, 'structuralValidation': True, 'commit': 'a' * 40}))
        self.calls = []
        self.existing = False
        self.incomplete = False
        self.addCleanup(patch.stopall)
        patch.object(module, 'ROOT', self.root).start()
        patch.dict(os.environ, {'GITHUB_REPOSITORY': 'Fradiqueland/browserland', 'GITHUB_SHA': 'a' * 40}).start()
        patch.object(module, 'gh', self.gh).start()

    def gh(self, *args):
        self.calls.append(args)
        if args[:2] == ('api', '--paginate'):
            return json.dumps([[{'tag_name': 'v0.22.1'}]] if self.existing else [[]])
        if args[0] == 'api':
            return '[]'
        if args[:2] == ('release', 'create'):
            self.assets = [Path(p) for p in args[args.index('--notes-file') + 2:]]
            return ''
        if args[:2] == ('release', 'view') and 'assets,isDraft' in args:
            assets = self.assets[:-1] if self.incomplete else self.assets
            return json.dumps({'assets': [{'name': p.name, 'size': p.stat().st_size} for p in assets], 'isDraft': True})
        return 'https://github.com/Fradiqueland/browserland/releases/tag/v0.22.1'

    def test_only_complete_verified_draft_is_published(self):
        module.publish(self.source)
        writes = [args[1] for args in self.calls if args[0] == 'release' and args[1] in ('create', 'edit')]
        self.assertEqual(writes, ['create', 'edit'])
        self.assertIn('--draft', next(args for args in self.calls if args[:2] == ('release', 'create')))
        self.assertEqual(len(self.assets), 6)

    def test_modified_binary_is_never_uploaded(self):
        path = self.source / 'Browserland-0.22.1-Windows-Setup.exe'
        path.write_bytes(b'changed' * 200_000)
        with self.assertRaisesRegex(ValueError, 'checksum'):
            module.publish(self.source)
        self.assertEqual(self.calls, [])

    def test_missing_native_verification_stops_publication(self):
        (self.windows / 'ci-windows-verification-0.22.1.json').unlink()
        with self.assertRaisesRegex(ValueError, 'required package verification'):
            module.publish(self.source)
        self.assertEqual(self.calls, [])

    def test_existing_release_is_preserved(self):
        self.existing = True
        with self.assertRaisesRegex(ValueError, 'Existing release preserved'):
            module.publish(self.source)
        self.assertFalse(any(args[:2] == ('release', 'create') for args in self.calls))

    def test_incomplete_upload_stays_draft(self):
        self.incomplete = True
        with self.assertRaisesRegex(ValueError, 'draft left unpublished'):
            module.publish(self.source)
        self.assertFalse(any(args[:2] == ('release', 'edit') for args in self.calls))

    def test_other_repository_cannot_publish(self):
        with patch.dict(os.environ, {'GITHUB_REPOSITORY': 'someone/else'}):
            with self.assertRaisesRegex(ValueError, 'Unexpected release context'):
                module.publish(self.source)
        self.assertEqual(self.calls, [])


if __name__ == '__main__':
    unittest.main()
