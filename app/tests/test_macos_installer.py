"""Installer boundary checks; real installation runs on the disposable Mac job."""
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import zipfile

SPEC = importlib.util.spec_from_file_location('mac_installer',
    Path(__file__).resolve().parents[1] / 'scripts/build-macos-installer.py')
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class InstallerBoundaries(unittest.TestCase):
    def test_source_comparison_allows_only_text_line_endings(self):
        self.assertTrue(m.source_matches(b'const a=1;\r\n', b'const a=1;\n', 'app.mjs'))
        self.assertTrue(m.source_matches(b'const a=1;\n', b'const a=1;\r\n', 'app.mjs'))
        self.assertFalse(m.source_matches(b'const a=2;\r\n', b'const a=1;\n', 'app.mjs'))
        self.assertFalse(m.source_matches(b'const a=1; \r\n', b'const a=1;\n', 'app.mjs'))
        self.assertFalse(m.source_matches(b'asset\r\n', b'asset\n', 'app.png'))

    def test_installed_workspace_is_outside_application_and_portable_stays_unchanged(self):
        portable = m.unified.launcher_script()
        installed = m.installed_launcher()
        self.assertIn('"$portable_dir/data"', portable)
        self.assertNotIn('"$portable_dir/data"', installed)
        self.assertIn('"$HOME/Library/Application Support/Browserland"', installed)
        self.assertIn('${BROWSERLAND_DATA:-${MULTIBROWSER_DATA:-', installed)
        self.assertEqual(portable, m.unified.launcher_script())
        for selection in ('runtime_arch=arm64', 'runtime_arch=x64', 'native_arch=arm64',
                          'native_arch=x86_64', 'exec /usr/bin/arch', '"$@"'):
            self.assertIn(selection, installed)

    def test_unexpected_launcher_contract_is_not_silently_changed(self):
        with patch.object(m.unified, 'launcher_script', return_value='#!/bin/sh\nexit 1\n'):
            with self.assertRaisesRegex(ValueError, 'contract changed'):
                m.installed_launcher()

    def test_distribution_has_no_scripts_and_cannot_relocate_the_target_volume(self):
        doc = ET.fromstring(m.distribution('1.2.3', '13.0'))
        self.assertEqual(doc.find('options').get('hostArchitectures'), 'x86_64,arm64')
        self.assertEqual(doc.find('options').get('allow-external-scripts'), 'no')
        self.assertEqual(doc.find('options').get('require-scripts'), 'false')
        self.assertEqual(doc.find('domains').get('enable_anywhere'), 'false')
        self.assertEqual(doc.find('domains').get('enable_localSystem'), 'true')
        self.assertEqual(doc.find('.//os-version').get('min'), '13.0')
        self.assertEqual({a.get('id') for a in doc.findall('.//must-close/app')},
                         {m.APP_ID, 'net.antoniofradique.browserland'})

    def test_installation_checks_refuse_non_disposable_host(self):
        with patch.dict(os.environ, {'GITHUB_ACTIONS': ''}):
            with self.assertRaisesRegex(RuntimeError, 'disposable'):
                m.native_check(Path('unused.pkg'), {}, '1.2.3')

    def test_unverified_input_is_rejected_before_extraction(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, proof = root / 'source.zip', root / 'proof.json'
            source.write_bytes(b'not an archive')
            proof.write_text(json.dumps({'ok': True, 'sha256': '0' * 64}))
            with self.assertRaisesRegex(ValueError, 'checksum or proof'):
                m.verify_input(source, proof, '1.2.3')

    def test_unrelated_application_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, proof = root / 'source.zip', root / 'proof.json'
            with zipfile.ZipFile(source, 'w') as archive:
                archive.writestr('Browserland.app/Contents/Info.plist',
                    plistlib.dumps(dict(CFBundleIdentifier='another.app', CFBundleShortVersionString='1.2.3')))
            proof.write_text(json.dumps({'ok': True, 'sha256': m.base.digest(source)}))
            with self.assertRaisesRegex(ValueError, 'unrelated'):
                m.verify_input(source, proof, '1.2.3')


if __name__ == '__main__':
    unittest.main()
