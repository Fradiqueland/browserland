# Browserland 0.22.0

Browserland replaces the application's former public name. The interface, window
titles, menus, application icons, launchers, new exports, Windows installer and
Mac portable package use Browserland. The source repository is
[Fradiqueland/browserland](https://github.com/Fradiqueland/browserland).

## Updating an existing installation

- Close the manager and every profile browser before updating.
- The Windows EXE installer recognizes a registered previous EXE installation
  and reuses its directory. The `data` directory is retained. New installations
  use `%LOCALAPPDATA%\Programs\Browserland`. Existing directory names can remain
  unchanged so profile and credential stores do not move.
- Windows shortcuts and the uninstall entry use Browserland. Legacy application
  files and shortcuts are retired only after the new installation files and
  metadata have been written. Application uninstall retains user data.
- A previous MSI installation must be removed through Windows Settings before
  using the EXE installer; the installer detects this case.
- On Mac, replace the application bundle while retaining the existing `data`
  directory beside `Browserland.app`. Preserve the complete portable layout and
  symbolic links. The archive includes Intel and Apple Silicon runtimes and
  requires macOS 13 or later.

Old configuration, CSV, encrypted session and site-storage formats remain
readable. New files use `browserland-*` format names. `BROWSERLAND_*` environment
variables take precedence, while previous variable names remain accepted.
Existing macOS workspaces retain their private encryption identity so the name
change does not silently select a different Keychain service. Stable native
profile-path aliases and necessary installer migration identifiers are retained.
These compatibility strings are not visible product labels.

## Packages

| File | Bytes | SHA256 |
| --- | ---: | --- |
| Browserland-0.22.0-Windows-Setup.exe | 533164348 | `a13852036e98ffbaac33c8090a0b6cb84d5899789177506b7d3f65c6f2b97f80` |
| Browserland-0.22.0-Mac-Portable.zip | 627025799 | `02145c26ee6b44a24ee9c1fd3e653f40d9eda9a1d13b129ab2cff9a53ecf8287` |

Distribution binaries and private profile data are excluded from the source
repository. The packages include their browser runtimes; end users do not need
to install Node.js, Electron or Chromium separately.

## Verification

- Final `npm test`: 102 tests, 99 passed. Three fixture-creation failures were
  caused by the Windows sandbox denying junction creation (`EPERM`): the two
  native-path junction tests and the extension-source junction rejection test.
  These are unresolved execution limitations, not passing tests.
- `python tests/test_portable_rebrand.py`: all three tests passed, covering
  runtime/link/identity preservation, modified-base rejection and renamed-path
  collision rejection.
- Windows: the complete final installer checksum and all 391 payload files
  matched their manifest. Packaged `src` and `ui` bytes matched the workspace.
  Windows version metadata reports Browserland and Browserland Setup.
- Mac: all 2,660 manifest entries, 38 symbolic links, 112 shared source copies,
  architecture entrypoints and three bundle names/versions were checked. Native
  runtime binaries were preserved while application resources were rebranded.
- Earlier graphical UI automation could not connect to its loopback test
  endpoint (`EACCES`). It is not counted as successful graphical validation.
- Installing/upgrading on a real Windows user profile and running on a real Mac,
  including Keychain access, remain unverified. Packages are unsigned; the Mac
  package is not notarized.

## Manual and historical records

The current manual is
[Browserland-Manual-Multilingue-0.22.0.pdf](Browserland-Manual-Multilingue-0.22.0.pdf).
It contains current-release update pages in English and Portuguese, followed by
the eleven-language reference chapters from 0.21.0 with the new brand. The update
pages explain changed browser-opening behavior and upgrading; the historical
chapters are not presented as a complete rewrite for 0.22.0.

Older versioned release notes retain actual archive names and checksums as
historical records. For the current downloadable filenames, use the package
table above rather than historical build examples in older documentation.
