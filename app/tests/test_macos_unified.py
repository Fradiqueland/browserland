import importlib.util, os, subprocess, tempfile, unittest
from pathlib import Path
SPEC = importlib.util.spec_from_file_location('unified', Path(__file__).resolve().parents[1] / 'scripts/build-macos-unified.py')
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)
BASH = Path(os.environ.get('BROWSERLAND_TEST_BASH', os.environ.get('MULTIBROWSER_TEST_BASH', 'C:/Users/smark/AppData/Local/hermes/git/bin/bash.exe' if os.name == 'nt' else '/bin/sh')))

def shellpath(path):
    text = str(path.resolve()).replace('\\', '/')
    if len(text) > 1 and text[1] == ':':
        return '/' + text[0].lower() + text[2:]
    return text

class UnifiedLauncherTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='mac-unified-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'Portable $HOME & spaces'
        self.contents = self.root / 'Browserland.app/Contents'
        self.launcher = self.contents / 'MacOS/Browserland'
        self.launcher.parent.mkdir(parents=True)
        self.commands = {}
        for name, body in {
            'uname': 'printf "%s\\n" "$TEST_MACHINE"',
            'sysctl': 'if [ "$TEST_SILICON" = error ]; then exit 1; fi; printf "%s\\n" "$TEST_SILICON"',
            'alert': 'exit 0',
            'arch': 'printf "ARCH=%s\\n" "$1"; shift; exec "$@"',
        }.items():
            path = self.root / ('mock-' + name)
            path.write_text('#!/bin/sh\n' + body + '\n', newline='\n')
            path.chmod(0o755)
            self.commands[name] = shellpath(path)
        self.launcher.write_text(m.launcher_script(self.commands), newline='\n')
        self.executables = {}
        for arch in m.ARCHES:
            directory = self.contents / 'Resources/runtimes' / arch
            electron = directory / 'Browserland.app/Contents/MacOS/Electron'
            chrome = directory / '.runtime/chromium/Chromium.app/Contents/MacOS/Chromium'
            for file in (electron, chrome):
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text('#!/bin/sh\nexit 0\n', newline='\n')
                file.chmod(0o755)
            electron.write_text('#!/bin/sh\nprintf "RUNTIME=' + arch + '\\nDATA=%s\\n" "$BROWSERLAND_DATA"\nprintf "ARG=%s\\n" "$@"\nexit "${TEST_EXIT:-0}"\n', newline='\n')
            self.executables[arch] = electron

    def run_launcher(self, machine='x86_64', silicon='0', override=None, args=(), exit_code='0', legacy_override=None):
        env = dict(os.environ, TEST_MACHINE=machine, TEST_SILICON=silicon, TEST_EXIT=exit_code, MSYS_NO_PATHCONV='1')
        env.pop('BROWSERLAND_DATA', None)
        env.pop('MULTIBROWSER_DATA', None)
        if legacy_override is not None:
            env['MULTIBROWSER_DATA'] = legacy_override
        if override is not None:
            env['BROWSERLAND_DATA'] = override
        return subprocess.run([str(BASH), shellpath(self.launcher), *args], cwd=self.tmp.name, env=env, capture_output=True, text=True, timeout=15)

    def test_intel_native_and_external_data(self):
        r = self.run_launcher()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('ARCH=-x86_64\nRUNTIME=x64\n', r.stdout)
        self.assertIn('DATA=' + shellpath(self.root / 'data') + '\n', r.stdout)
        self.assertNotIn('/Resources/runtimes/x64/data', r.stdout)

    def test_apple_silicon_native(self):
        r = self.run_launcher('arm64', '1')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('ARCH=-arm64\nRUNTIME=arm64\n', r.stdout)

    def test_rosetta_selects_native_arm_without_translation(self):
        r = self.run_launcher('x86_64', '1')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('ARCH=-arm64\nRUNTIME=arm64\n', r.stdout)

    def test_intel_without_sysctl_and_arm_without_sysctl(self):
        for machine, expected in [('x86_64', 'x64'), ('arm64', 'arm64')]:
            with self.subTest(machine=machine):
                r = self.run_launcher(machine, 'error')
                self.assertEqual(r.returncode, 0, r.stderr)
                self.assertIn('RUNTIME=' + expected + '\n', r.stdout)

    def test_arguments_are_preserved_without_shell_evaluation(self):
        args = ('--name=a b', 'semi;$(printf attack)', '--self-test')
        r = self.run_launcher(args=args)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual([line[4:] for line in r.stdout.splitlines() if line.startswith('ARG=')], list(args))

    def test_both_architectures_share_same_data_and_override(self):
        paths = []
        for machine in ('x86_64', 'arm64'):
            r = self.run_launcher(machine, '0')
            paths.append(next(line for line in r.stdout.splitlines() if line.startswith('DATA=')))
            r = self.run_launcher(machine, '0', override=shellpath(self.root / 'Shared Profiles'))
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn('DATA=' + shellpath(self.root / 'Shared Profiles') + '\n', r.stdout)
        self.assertEqual(paths[0], paths[1])

    def test_legacy_override_is_accepted_without_losing_existing_data(self):
        data = self.root / 'Existing Sessions'
        data.mkdir()
        sentinel = data / 'session-sentinel'
        sentinel.write_text('existing-session')
        r = self.run_launcher(legacy_override=shellpath(data))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('DATA=' + shellpath(data) + '\n', r.stdout)
        self.assertEqual(sentinel.read_text(), 'existing-session')

    def test_new_override_takes_precedence(self):
        selected = self.root / 'Current Profiles'
        legacy = self.root / 'Legacy Profiles'
        r = self.run_launcher(override=shellpath(selected), legacy_override=shellpath(legacy))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('DATA=' + shellpath(selected) + '\n', r.stdout)
        self.assertTrue(selected.is_dir())
        self.assertFalse(legacy.exists())

    def test_relative_override_and_file_override_are_refused(self):
        conflict = self.root / 'conflicting-file'
        conflict.write_text('keep')
        for override in ('relative-path', shellpath(conflict)):
            with self.subTest(override=override):
                r = self.run_launcher(override=override)
                self.assertEqual(r.returncode, 1)
                self.assertNotIn('RUNTIME=', r.stdout)
        self.assertEqual(conflict.read_text(), 'keep')

    def test_unknown_architecture_stops(self):
        r = self.run_launcher('ppc64', '0')
        self.assertEqual(r.returncode, 1)
        self.assertIn('Unsupported Mac architecture', r.stderr)
        self.assertNotIn('RUNTIME=', r.stdout)

    def test_missing_engine_stops_instead_of_using_other_installation(self):
        self.executables['arm64'].unlink()
        r = self.run_launcher('arm64', '1')
        self.assertEqual(r.returncode, 1)
        self.assertIn('missing or not executable', r.stderr)
        self.assertNotIn('RUNTIME=', r.stdout)

    def test_child_exit_status_is_preserved(self):
        self.assertEqual(self.run_launcher(exit_code='37').returncode, 37)

    def test_production_script_and_plist(self):
        script = m.launcher_script()
        for command in ('/usr/bin/uname', '/usr/sbin/sysctl', '/usr/bin/arch', '/usr/bin/osascript'):
            self.assertIn(command, script)
        self.assertNotIn('mock-', script)
        self.assertNotIn('\r', script)
        self.assertNotIn('no-sandbox', script)
        self.assertNotIn('xattr', script)
        info = m.unified_plist('0.21.0', '13.0')
        self.assertEqual(info['CFBundleExecutable'], 'Browserland')
        self.assertEqual(info['CFBundlePackageType'], 'APPL')
        result = subprocess.run([str(BASH), '-n'], input=script, text=True, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)

if __name__ == '__main__':
    unittest.main(verbosity=2)
