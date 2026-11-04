Historical release record. Product branding is Browserland; original archive filenames, hashes and compatibility identifiers below refer to the release named in this document. For current installation and behavior, see Browserland-0.22.0.md.

# Browserland 0.21.6: one Open button for full browsers

The user confirmed that Google login worked when the installed Chrome was started with a new profile and only a user-data directory, a new window and the Google Accounts URL. Earlier attempts inside Browserland, including the 0.21.5 normal-mode action, had been rejected. That comparison changed profile state, arguments, path and launching process together; it does not identify a single cause.

## Resulting behavior

- Chromium, Chrome and Edge use the same **Open** button. The additional normal-mode action and proposed separate creation button have been removed.
- Normal browsing starts the selected full browser without a debugging connection or identity/API injection. An empty proxy setting uses the browser/system network configuration. Explicit proxy routing is retained, including the configured restriction on non-proxied UDP. Application-managed proxy credentials require customized mode and are refused in normal mode.
- New full-browser profiles, including batch creation, default to normal browsing. Existing full-browser profiles without a recorded launch mode also use normal browsing. Electron remains customized/embedded and is not covered by the successful Chrome login test.
- Normal browsing uses `native-profiles/<profile-id>/<engine>-normal`. Customized browsing retains the original `native-profiles/<profile-id>/<engine>` directory. No cookies, extensions or other session data are copied between them.
- The first normal launch therefore starts a separate session. Subsequent Open operations reuse that session. Existing customized data and settings remain available by selecting **With profile settings** in the profile editor.
- Language, time zone, location, simulated resolution, User-Agent and API restrictions are retained in configuration but do not apply during normal browsing. The native browser controls these features. Proxy settings remain editable.
- A profile must be closed before editing its configuration or changing mode. Use the native browser's **Exit/Quit** command; closing its last window may leave background processes running.
- Session transfers and manager controls that would attach debugging are refused in normal mode. Configuration-only JSON and CSV exports/imports retain the selected mode. Tabs, bookmarks, history, extensions and downloads are managed through the native browser window.

## Validation

- 93 unit tests passed in the broader run, including configuration, localization, profile operations, normal-mode isolation and persistence.
- Three Windows junction-dependent tests were excluded by name because the execution environment previously rejected their required junction operation with `EPERM`. No claim is made that those tests ran here.
- After the proxy/UDP review adjustment, all 15 normal/standard browser tests passed again. The final batch-creation change passed syntax checking.
- The seven new tests cover minimal launch arguments, all three engine directory layouts, preservation of proxy routing, retention of legacy settings/data, mode changes, JSON/CSV persistence, isolated sessions and refusal of managed session transfers.
- UI syntax and localization checks passed. A separate form-state check covered all three full engines, switching to embedded mode, and preservation of proxy and customized settings. No graphical end-to-end UI run was available.
- The real successful Google login was performed manually by the user with the diagnostic Chrome launcher. Google login in the final integrated application, Google account creation, and login through Chromium or Edge still require manual confirmation.
- Both packages reuse verified native runtimes from 0.21.5. Package byte verification is recorded in `app/reference`. Real Mac execution and live installer/update/uninstall execution remain unverified. Packages are unsigned; the Mac package is not notarized.

## Updating

Close Browserland and every profile window first. Run the Windows EXE installer into the existing EXE installation directory to retain its `data` directory. For an older MSI installation, follow the EXE installer's instruction to remove the MSI through Windows Settings first. Keep a backup of profile data.

On Mac, preserve the existing portable workspace/data while replacing the application package. This update does not delete existing profile folders or import the temporary diagnostic Chrome session.

## Verified packages

All 390 Windows payload files matched the build manifest, and every shipped source/UI file matched the current workspace. The Mac verifier checked 2,658 entries and preserved 38 symbolic links; all 110 packaged source/UI/package copies across both architectures matched the current workspace.

- Windows: `533757244` bytes; SHA-256 `90ee65bd3d1d484d79a7c53a3fa533531602b66a9d408e6dc120c78c6c8a115e`.
- Mac: `629851279` bytes; SHA-256 `1240a62d3a7c0b10a75d10ddfd75cffc23c93ebf20a0aa48fa3f54b1491ab5d2`.
