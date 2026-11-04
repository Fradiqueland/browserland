# Browserland

Browser profile manager for Windows and macOS, created by Antonio Fradique.

Source repository: [Fradiqueland/browserland](https://github.com/Fradiqueland/browserland).

## Browserland 0.22.1

Version 0.22.1 applies the circular blue icon to Windows and Mac packages. The automated build publishes packages only after the Windows installer and Mac package checks pass. Downloads appear on [GitHub Releases](https://github.com/Fradiqueland/browserland/releases).

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

The 0.22.1 build produces `Browserland-0.22.1-Windows-Setup.exe`, `Browserland-0.22.1-Windows-Portable.exe`, `Browserland-0.22.1-mac.dmg` and `Browserland-0.22.1-Mac-Portable.zip`. Distribution binaries and private profile data are excluded from this source repository.

## Development and verification

```sh
cd app
npm test
```

Development requires Node.js 24 or later. Windows preparation scripts pin Electron and Chromium runtimes; users of the packaged app do not need separate runtime installations. `scripts/verify-desktop.ps1` exercises the application with isolated test data.

Packaging entry points:

- `.github/workflows/build-release.yml` builds from a clean checkout on isolated Windows runners, validates the packages and publishes checksums with the release. It runs when the package version, icon or CI scripts change on `main`, and can also be started manually.
- `scripts/ci-build-windows.ps1` and `scripts/ci-build-macos.ps1` prepare the public build dependencies and run package verification. Windows Chromium resolves an official snapshot revision once and records the selected revision in the release evidence; previous local runtime bytes are not available to a clean build.
- `scripts/build-electron-installer.py --base-setup <verified-prior-installer>` builds the Windows NSIS installer.
- `scripts/verify-electron-payload.py` checks every packaged file and compares shipped sources with the workspace.
- `scripts/update-portable-sources.py --mac <verified-prior-mac-archive>` updates the portable Mac package while preserving native runtime bytes and symbolic links.
- The remaining Windows portable/MSI and Mac bundle builders are development alternatives and may require locally prepared toolchains.

The earlier 0.22.0 `npm test` run passed 99 tests; three Windows junction-dependent tests could not create their fixtures because the sandbox rejected the required operation (`EPERM`). The three portable-package rebrand tests also passed. All 391 Windows payload files and 2,660 Mac manifest entries were verified, including 38 Mac symbolic links. Detailed historical checks and package hashes are recorded in [the 0.22.0 release notes](app/docs/Browserland-0.22.0.md). The 0.22.1 workflow records new results and tests native Windows installation using an isolated fixture. Real macOS/Keychain execution, signing and notarization remain unverified.

The optional `rea` submodule pins [morluto/rea](https://github.com/morluto/rea). It is a development tool and is not required to run Browserland.

## License and credits

The application declares `UNLICENSED`; a public source backup does not grant an open-source license. Electron, Chromium, REA and other third-party components retain their own licenses and notices.

Created by **Antonio Fradique** - [More products](https://AntonioFradique.net).
