# Browserland

Browser profile manager for Windows and macOS, created by Antonio Fradique.

Source repository: [Fradiqueland/browserland](https://github.com/Fradiqueland/browserland).

## Browserland 0.22.0

Browserland is the new name of the application. The interface, application icons, menus, exported files, launchers and current Windows/Mac packages use the new identity.

- One **Open** button for Chromium, Google Chrome and Microsoft Edge.
- Separate persistent sessions for each profile, with normal browsing selected by default for full browsers.
- An embedded browser and a customized mode for profile identity and API settings.
- Groups, search, configuration import/export, extensions and eleven interface languages.
- Explicit proxy routing; application-managed proxy credentials require customized mode.
- Local storage, portable Mac operation and a Windows installer with Desktop/Start menu shortcuts.

Normal browsing does not apply the application's identity/API overrides. The native browser manages its tabs, bookmarks, extensions, downloads and session data. Google acceptance is controlled by Google; successful login in a clean Chrome diagnostic does not establish acceptance in every engine or profile.

## Updating and existing data

Close the application and every profile browser before updating. The Windows EXE installer detects the previous registered EXE installation and reuses its directory, preserving `data`. New installations use `%LOCALAPPDATA%\Programs\Browserland`. The existing directory may retain its original name to avoid moving profile data. An older MSI installation must be removed through Windows Settings before using the EXE installer.

On macOS, keep the existing `data` directory beside `Browserland.app` when replacing the application package. Keep the complete portable bundle and its symbolic links. The package contains both Intel and Apple Silicon runtimes and requires macOS 13 or later.

Old configuration files and encrypted exports remain readable. New exports use `browserland-*` format identifiers. `BROWSERLAND_*` environment variables take precedence, with the old variable names accepted as compatibility aliases. Existing macOS workspaces retain the internal encryption identity required to access their prior Keychain data. Compatibility identifiers and immutable historical archive names are intentionally retained in migration code and historical reports.

Current packages are `Browserland-0.22.0-Windows-Setup.exe` and `Browserland-0.22.0-Mac-Portable.zip`. Distribution binaries and private profile data are excluded from this source repository.

## Development and verification

```sh
cd app
npm test
```

Development requires Node.js 24 or later. Windows preparation scripts pin Electron and Chromium runtimes; users of the packaged app do not need separate runtime installations. `scripts/verify-desktop.ps1` exercises the application with isolated test data.

Packaging entry points:

- `scripts/build-electron-installer.py --base-setup <verified-prior-installer>` builds the Windows NSIS installer.
- `scripts/verify-electron-payload.py` checks every packaged file and compares shipped sources with the workspace.
- `scripts/update-portable-sources.py --mac <verified-prior-mac-archive>` updates the portable Mac package while preserving native runtime bytes and symbolic links.
- The remaining Windows portable/MSI and Mac bundle builders are development alternatives and may require locally prepared toolchains.

The final `npm test` run passed 99 tests; three Windows junction-dependent tests could not create their fixtures because the sandbox rejected the required operation (`EPERM`). The three portable-package rebrand tests also passed. All 391 Windows payload files and 2,660 Mac manifest entries were verified, including 38 Mac symbolic links. Native installer execution and real macOS/Keychain execution remain unverified here. Detailed checks and package hashes are recorded in [the release notes](app/docs/Browserland-0.22.0.md).

The optional `rea` submodule pins [morluto/rea](https://github.com/morluto/rea). It is a development tool and is not required to run Browserland.

## License and credits

The application declares `UNLICENSED`; a public source backup does not grant an open-source license. Electron, Chromium, REA and other third-party components retain their own licenses and notices.

Created by **Antonio Fradique** - [More products](https://AntonioFradique.net).
