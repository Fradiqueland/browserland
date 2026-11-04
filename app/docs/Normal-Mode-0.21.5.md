Historical release record. Product branding is Browserland; original archive filenames, hashes and compatibility identifiers below refer to the release named in this document. For current installation and behavior, see Browserland-0.22.0.md.

# Browserland 0.21.5: normal browser mode

The user reported Google's “browser or app may not be secure” message in Browserland, while signing in through Chrome directly worked. The existing full-browser path uses a debugging connection and injects profile identity/privacy settings. This is a plausible compatibility difference; Google's exact reason for rejecting this profile has not been verified.

Google documents restrictions on automated and embedded browsers: https://support.google.com/accounts/answer/7675428?hl=en.

## Using normal mode

1. Close the profile's browser windows.
2. Open the profile's additional actions menu and select **Open in normal mode** (Portuguese: **Abrir em modo normal**).
3. Read the confirmation, then open the browser and sign in manually.
4. Close the browser through its own window before editing the profile or exiting the manager.

This option is available for full Chromium, Chrome and Edge. It uses that profile's existing, isolated browser directory. It does not transfer data between engines or use a personal browser directory. The usual Open button retains managed mode; select normal mode again for later sessions that require it.

Normal mode has no debugging connection, injected scripts, custom User-Agent, simulated language/time zone/location/resolution or profile API restrictions. The configured proxy and WebRTC non-proxied UDP restriction are retained. Application-managed proxy credentials are refused rather than silently discarded. Previously installed extensions remain part of the browser profile.

The browser manages its own tabs, downloads, bookmarks and history. The manager cannot control or collect these through a debugging connection in this mode. Data changes and managed launches are blocked while a normal session owns the profile, including after a manager restart. A reservation with an invalid or incomplete record is conservatively treated as occupied; it must be investigated before removing it, to avoid two processes editing the same profile.

## Validation and limits

- Eight new unit tests passed, covering launch arguments, proxy preservation, unsupported credentials, URL validation, isolated data retention, launch/exit reservations, failed launches, stale reservations, restart protection and refusal of managed browser control. Process launch is simulated in these unit tests.
- The broader unit run passed 85 tests. One existing extension test was blocked by an environment `EPERM` when creating a Windows junction. The separate native-path tests were not repeated because they require the same unavailable operation.
- Syntax checks passed for the changed application entry points and browser manager.
- A disposable local browser diagnostic timed out in this environment, both with and without automation. It does not establish whether normal-mode browsing or Google login succeeds.
- Real Google login/account creation, graphical UI interaction, installation/update/uninstall and execution on macOS remain pending. No personal credentials were used.
- The Windows and Mac packages retain the native runtimes from verified 0.21.4 packages. All 390 Windows payload files matched the build manifest. The Mac verifier checked 2,658 entries and preserved 38 symbolic links, both architectures and the universal launcher. Reports are available under `app/reference`. Both packages remain unsigned; the Mac package is not notarized.

This is a compatibility option, not a guarantee of Google acceptance or of equivalence with Logii.

## Package checksums (SHA-256)

- `Multi-Browser-0.21.5-Windows-Setup.exe` (533,750,410 bytes): `eb201a18d7c0a4f78c0dc75a22827138fe9bb2466e826ef6b80910691801ddf2`
- `Multi-Browser-0.21.5-Mac-Portable.zip` (629,840,226 bytes): `3ff48d3214f6a8ffc34254143977ab7f8e980a201a034484678a00430c5b7429`

## Updating

Close the application and all profile windows. For an existing EXE installation, run the new EXE installer into the same installation directory; its installer preserves the `data` directory. An older MSI installation must first be removed through Windows Settings, as required by the EXE installer. Keep a backup of your profile data.

For Mac, retain the existing portable workspace/data and replace the application with the new package. Do not discard the old portable folder until the expected profiles are visible in the updated application. Native Mac execution has not been tested here.
