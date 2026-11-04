param([ValidatePattern('^\d{1,10}$')][string]$ChromiumRevision)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows -or $PSVersionTable.PSVersion.Major -lt 7) { throw 'Use PowerShell 7 on a Windows build runner.' }
$appRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$buildLog = Join-Path $appRoot ('test-results\ci-windows-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $buildLog,(Join-Path $appRoot 'reference'),(Join-Path $appRoot 'dist') | Out-Null
$python = (Get-Command python -ErrorAction Stop).Source
$pwsh = (Get-Command pwsh -ErrorAction Stop).Source

function Invoke-BuildProcess([string]$Label, [string]$Executable, [string[]]$Arguments, [int]$TimeoutSeconds = 1200) {
    Write-Host "Running $Label"
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $Executable
    $info.WorkingDirectory = $appRoot
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    try {
        if (-not $process.Start()) { throw "Could not start $Label" }
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            $process.Kill($true)
            $process.WaitForExit(10000) | Out-Null
            throw "$Label exceeded $TimeoutSeconds seconds"
        }
        $output = $stdout.GetAwaiter().GetResult()
        $errors = $stderr.GetAwaiter().GetResult()
        [IO.File]::WriteAllText((Join-Path $buildLog ($Label + '.stdout.log')), $output)
        [IO.File]::WriteAllText((Join-Path $buildLog ($Label + '.stderr.log')), $errors)
        if ($output) { Write-Host $output }
        if ($errors) { Write-Host $errors }
        if ($process.ExitCode -ne 0) { throw "$Label failed with exit code $($process.ExitCode)" }
    } finally { $process.Dispose() }
}

# No historical Windows snapshot pin is included in the source repository.
# Resolve the official snapshot once, then record and pass that exact revision.
$revisionOrigin = 'explicit-input'
if (-not $ChromiumRevision) {
    $uri = 'https://commondatastorage.googleapis.com/chromium-browser-snapshots/Win_x64/LAST_CHANGE'
    $response = Invoke-WebRequest -Uri $uri -TimeoutSec 90
    $text = if ($response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($response.Content) } else { [string]$response.Content }
    $ChromiumRevision = $text.Trim()
    if ($ChromiumRevision -notmatch '^\d{1,10}$') { throw 'Invalid official Windows Chromium revision.' }
    $revisionOrigin = $uri
}
@{ revision = $ChromiumRevision; source = $revisionOrigin; resolvedAt = [DateTime]::UtcNow.ToString('o'); historicalRuntimePreserved = $false } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $appRoot 'reference\ci-windows-chromium-selection.json') -Encoding utf8
Invoke-BuildProcess 'prepare-electron' $pwsh @('-NoProfile', '-File', (Join-Path $PSScriptRoot 'runtime.ps1'))
Invoke-BuildProcess 'prepare-chromium' $pwsh @('-NoProfile', '-File', (Join-Path $PSScriptRoot 'prepare-chromium.ps1'), '-Revision', $ChromiumRevision)
Invoke-BuildProcess 'prepare-go' $python @('scripts/prepare-portable-go.py')
Invoke-BuildProcess 'prepare-nsis' $python @('scripts/prepare-nsis-toolchain.py')
Invoke-BuildProcess 'build-portable' $python @('scripts/build-windows-single-file.py') 1800
Invoke-BuildProcess 'build-installer' $python @('scripts/build-electron-installer.py') 1200

# The full 7-Zip distribution is provided by the Windows runner image.
$sevenZip = Get-Command 7z.exe -ErrorAction SilentlyContinue
$sevenZipPath = if ($sevenZip) { $sevenZip.Source } else { Join-Path $env:ProgramFiles '7-Zip\7z.exe' }
if (-not (Test-Path -LiteralPath $sevenZipPath -PathType Leaf)) { throw 'The runner must provide the full 7-Zip distribution.' }
$sevenZipDestination = Join-Path $appRoot '.cache\electron-installer\full-sevenzip'
if (Test-Path -LiteralPath $sevenZipDestination) { throw 'Existing verification tool directory preserved.' }
Copy-Item -LiteralPath (Split-Path -Parent $sevenZipPath) -Destination $sevenZipDestination -Recurse
Invoke-BuildProcess 'verify-installer-payload' $python @('scripts/verify-electron-payload.py') 300
Invoke-BuildProcess 'verify-native-installer' $python @('scripts/verify-ci-windows.py') 600
Copy-Item -LiteralPath (Join-Path $appRoot '.runtime\chromium\browserland-runtime.json') -Destination (Join-Path $appRoot 'reference\ci-windows-chromium-runtime.json')
$version = (Get-Content -LiteralPath (Join-Path $appRoot 'package.json') -Raw | ConvertFrom-Json).version
Write-Host "BROWSERLAND_WINDOWS_CI_OK: dist/Browserland-$version-Windows-Setup.exe"
