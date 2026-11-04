#Requires -Version 7.0
<# Build the existing Mac deliverables on an isolated Windows GitHub runner. #>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $IsWindows -or $env:GITHUB_ACTIONS -ne 'true') {
    throw 'This helper requires an isolated Windows GitHub Actions runner.'
}
$appRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$distRoot = Join-Path $appRoot 'dist'
$version = (Get-Content -LiteralPath (Join-Path $appRoot 'package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid package version.' }

function Invoke-BuildStep([string]$Program, [string[]]$Arguments) {
    Write-Host ('BUILD: ' + $Program + ' ' + ($Arguments -join ' '))
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Build command failed ($LASTEXITCODE): $Program" }
}

# Only the exact intermediate files created by this invocation may be removed.
$intermediates = @(
    (Join-Path $distRoot "Browserland-$version-mac-x64-candidate.zip"),
    (Join-Path $distRoot "Browserland-$version-mac-arm64-candidate.zip"),
    (Join-Path $distRoot "Browserland-$version-mac-unified-candidate.zip")
)
$deliverables = @(
    (Join-Path $distRoot "Browserland-$version-mac.zip"),
    (Join-Path $distRoot "Browserland-$version-mac.dmg"),
    (Join-Path $distRoot "Browserland-$version-Mac-Portable.zip")
)
foreach ($file in ($intermediates + $deliverables)) {
    if (Test-Path -LiteralPath $file) { throw "Existing delivery preserved: $file" }
}
if (Test-Path -LiteralPath (Join-Path $distRoot "$version/Mac-Portable")) {
    throw 'Existing Mac-Portable folder preserved.'
}
foreach ($relative in @('dist', 'reference', 'test-results', '.cache', '.runtime/chromium')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $appRoot $relative) | Out-Null
}
function Remove-BuildIntermediate([string]$Path) {
    $resolved = [IO.Path]::GetFullPath($Path)
    $allowedRoot = [IO.Path]::GetFullPath($distRoot) + [IO.Path]::DirectorySeparatorChar
    if ($resolved -notin $intermediates -or -not $resolved.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Intermediate path is outside the allowed build outputs.'
    }
    $item = Get-Item -LiteralPath $resolved
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Intermediate must be a regular file.'
    }
    Remove-Item -LiteralPath $resolved
}

# The upstream licence is pinned independently of the Windows Chromium runtime.
$licensePath = Join-Path $appRoot '.runtime/chromium/CHROMIUM-LICENSE.txt'
$licenseURL = 'https://raw.githubusercontent.com/chromium/chromium/2170ebc8260021b10f23042e7aca8ee814829942/LICENSE'
$licenseSHA256 = '368cca1106be99d39ecd32a38d8305585d802a475effb66380b91ffc9bcf709b'
if (-not (Test-Path -LiteralPath $licensePath)) {
    Invoke-WebRequest -Uri $licenseURL -OutFile $licensePath -TimeoutSec 90
}
if ((Get-FileHash -LiteralPath $licensePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $licenseSHA256) {
    throw 'Pinned Chromium licence checksum mismatch.'
}

$gitPath = (Get-Command git -CommandType Application).Source
$gitRoot = Split-Path -Parent (Split-Path -Parent $gitPath)
$gitBash = Join-Path $gitRoot 'bin/bash.exe'
if (-not (Test-Path -LiteralPath $gitBash)) { throw 'Git Bash is required by the Mac launcher tests.' }
$env:BROWSERLAND_TEST_BASH = $gitBash

Push-Location $appRoot
try {
    Invoke-BuildStep 'python' @('-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_macos_*.py', '-v')
    @'
from pathlib import Path
import os, tempfile
cache = (Path.cwd() / '.cache').resolve()
with tempfile.TemporaryDirectory(prefix='ci-mac-symlink-', dir=cache) as directory:
    probe = Path(directory).resolve()
    assert probe.is_relative_to(cache)
    target = probe / 'target'
    target.mkdir()
    link = probe / 'link'
    os.symlink('target', link, target_is_directory=True)
    assert link.is_symlink() and link.resolve() == target.resolve()
print('MAC_SYMLINK_CAPABILITY_VERIFIED')
'@ | & python -
    if ($LASTEXITCODE -ne 0) { throw 'The runner cannot preserve Mac directory symlinks.' }
    Invoke-BuildStep 'node' @('scripts/prepare-macos.mjs')
    Invoke-BuildStep 'python' @('scripts/build-macos.py', '--arch', 'all')
    Invoke-BuildStep 'python' @('scripts/build-macos-unified.py')
    # Unified packaging has compared every entry against both verified candidates.
    Remove-BuildIntermediate $intermediates[0]
    Remove-BuildIntermediate $intermediates[1]
    Invoke-BuildStep 'python' @('scripts/build-macos-single.py')
    Remove-BuildIntermediate $intermediates[2]
    # The DMG builder invokes the independent UDIF/HFSX verifier automatically.
    Invoke-BuildStep 'python' @('scripts/build-macos-dmg.py')
    Invoke-BuildStep 'python' @('scripts/prepare-portable-go.py')
    Invoke-BuildStep 'python' @('scripts/build-macos-portable.py')

    # Verify the final ZIP assets against this checkout, including both runtimes.
    @'
from pathlib import Path
import json, zipfile
root = Path.cwd()
version = json.loads((root / 'package.json').read_text())['version']
assets = {name: (root / 'ui/assets' / name).read_bytes() for name in ('app-icon.png', 'app-icon.ico', 'app-icon.icns')}
for suffix, prefix in [('mac.zip', ''), ('Mac-Portable.zip', 'Mac-Portable/')]:
    with zipfile.ZipFile(root / 'dist' / f'Browserland-{version}-{suffix}') as archive:
        assert archive.read(prefix + 'Browserland.app/Contents/Resources/app-icon.icns') == assets['app-icon.icns']
        for arch in ('x64', 'arm64'):
            runtime = prefix + 'Browserland.app/Contents/Resources/runtimes/' + arch + '/Browserland.app/Contents/Resources/'
            assert archive.read(runtime + 'app-icon.icns') == assets['app-icon.icns']
            for name, expected in assets.items():
                assert archive.read(runtime + 'app/ui/assets/' + name) == expected
print('MAC_FINAL_ICONS_VERIFIED: outer application and both native runtimes')
'@ | & python -
    if ($LASTEXITCODE -ne 0) { throw 'Final Mac package icon validation failed.' }

    $artifacts = foreach ($file in $deliverables) {
        $item = Get-Item -LiteralPath $file
        if ($item.Length -le 0) { throw "Empty deliverable: $file" }
        [ordered]@{file=$item.Name; bytes=$item.Length; sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}
    }
    $checksumLines = $artifacts | ForEach-Object { "$($_.sha256)  $($_.file)" }
    [IO.File]::WriteAllText((Join-Path $distRoot 'SHA256SUMS-mac.txt'), ($checksumLines -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
    $receipt = [ordered]@{
        ok=$true; version=$version; commit=$env:GITHUB_SHA; artifacts=@($artifacts)
        architectures=@('x64','arm64'); structuralValidation=$true
        executionVerified=$false; signed=$false; notarized=$false
        chromiumLicense=[ordered]@{source=$licenseURL; sha256=$licenseSHA256}
    }
    $receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $appRoot "reference/mac-ci-$version.json") -Encoding utf8
    Write-Host "MAC_CI_BUILD_VERIFIED: $version"
} finally {
    Pop-Location
}
