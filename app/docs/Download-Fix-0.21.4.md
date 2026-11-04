Historical release record. Product branding is Browserland; original archive filenames, hashes and compatibility identifiers below refer to the release named in this document. For current installation and behavior, see Browserland-0.22.0.md.

# Browserland 0.21.4

Full Chromium could close when an attachment download opened a new tab. The
profile initializer waited for `Runtime.getIsolateId` on a target without a
renderer; the timeout then closed the profile. Browser-level attachment now
uses tab targets, installs paused page attachment, and releases the tab's
navigation. Actual documents still receive profile controls before scripts run.
The same source fix is included in the Windows and both Mac architectures.

## Updating

- Windows EXE installation: close the manager and every browser profile, run
  the new Setup.exe, and keep the same installation directory. The installer
  updates application-owned files and leaves `data` in place. An older MSI
  installation must be removed first if the installer reports it.
- Mac portable: close the app and replace `Multi-Browser.app`, preserving the
  adjacent `data` directory and the app's complete internal structure.

## Validation

183 checks passed on Windows: 80 domain tests, 59 native Chromium checks,
18 background/service-worker checks, 5 window checks, 7 extension checks,
8 lifecycle checks, and 6 download regression checks.

The download regression covers same-tab attachments, new-tab attachments,
redirected downloads, direct manager navigation to an attachment, and two
popup creation flows whose first scripts must see the profile's language,
time zone and canvas restriction. Downloaded bytes are compared to a local
fixture and pending configuration operations must finish without errors.
No personal Google Drive account was accessed.

The Windows installer was extracted independently and all 388 shipped files
matched the build manifest. The Mac ZIP was checked against all 2,654 manifest
entries, including Unix modes and all 38 symbolic links. Native runtime bytes
were retained in both packages.

Real macOS execution and live Windows installation/update/uninstall are not
verified by these checks. The packages are unsigned; the Mac bundle is not
notarized.

## Artifacts

Artifacts are delivered separately and are not stored in the source repository.

| File | Bytes | SHA256 |
| --- | ---: | --- |
| Multi-Browser-0.21.4-Windows-Setup.exe | 533742231 | f77a36d5de041880e2d35cd97e332c1f1e8fac4fb8daf53a2a00c803cef7e03b |
| Multi-Browser-0.21.4-Mac-Portable.zip | 629826019 | 2fe3dcc22487f6f4e1c710e51176238ea449320f6305ae7bb110ad9873929f10 |

## Reproduction and packaging

With the bundled Chromium prepared in `app/.runtime/chromium`:

```sh
node app/tests/native-download.test.mjs --headed
```

The desktop verifier now includes this regression. The download test accepts
`--app-root=PATH` to use a prepared application payload and `MULTIBROWSER_DATA`
for a dedicated test directory. Never point test data at personal profiles.

Incremental packaging from verified prior deliveries:

```sh
python app/scripts/build-electron-installer.py --base-setup app/dist/Multi-Browser-0.21.3-Windows-Setup.exe
python app/scripts/verify-electron-payload.py
python app/scripts/update-portable-sources.py --mac app/dist/Multi-Browser-0.21.3-Mac-Portable.zip
```

These build commands require the previous delivery artifacts and their local
verification metadata, which are intentionally excluded from Git. The Windows
route also requires the prepared NSIS and 7-Zip tools. The Mac source updater
uses the configured Go ZIP helper when present, with a Python ZIP fallback
that preserves Unix metadata when that compiler is unavailable.
