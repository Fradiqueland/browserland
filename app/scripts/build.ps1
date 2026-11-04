$ErrorActionPreference='Stop'
$appRoot=Split-Path -Parent $PSScriptRoot
$runtime=& (Join-Path $PSScriptRoot 'runtime.ps1')
$version=(Get-Content (Join-Path $appRoot 'package.json') -Raw | ConvertFrom-Json).version
$chromium=Join-Path $appRoot '.runtime\chromium'
$chromiumExecutable=Join-Path $chromium 'chrome.exe'
$chromiumManifest=Join-Path $chromium 'browserland-runtime.json'
if(-not(Test-Path -LiteralPath $chromiumManifest)){$chromiumManifest=Join-Path $chromium 'multi-browser-runtime.json'} # Existing verified runtime.
if(-not(Test-Path -LiteralPath $chromiumExecutable) -or -not(Test-Path -LiteralPath $chromiumManifest)){throw 'Prepare o Chromium incluido com scripts/prepare-chromium.ps1 antes de compilar.'}
$engineInfo=Get-Content -LiteralPath $chromiumManifest -Raw | ConvertFrom-Json
if((Get-FileHash -LiteralPath $chromiumExecutable -Algorithm SHA256).Hash -ne $engineInfo.executableSha256){throw 'O Chromium nao corresponde ao manifesto de preparacao.'}
$dist=Join-Path $appRoot 'dist'
$output=Join-Path $dist ("Browserland-$version-win-x64")
if (Test-Path -LiteralPath $output) { throw "A pasta de saida ja existe: $output. Preserve-a antes de compilar novamente." }
New-Item -ItemType Directory -Path $output -Force | Out-Null
Get-ChildItem -LiteralPath (Split-Path -Parent $runtime) | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $output -Recurse }
Rename-Item -LiteralPath (Join-Path $output 'electron.exe') -NewName 'Browserland.exe'

$python=$env:CODEX_PRIMARY_RUNTIME_PYTHON
if(-not $python -or -not(Test-Path -LiteralPath $python)){
 $cachedPython=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
 if(Test-Path -LiteralPath $cachedPython){$python=$cachedPython}else{$python=(Get-Command python.exe -ErrorAction Stop).Source}
}
& $python (Join-Path $PSScriptRoot 'app_icons.py') --windows (Join-Path $output 'Browserland.exe')
if($LASTEXITCODE -ne 0){throw 'Nao foi possivel aplicar o icone ao executavel Windows.'}

$portableRoot=Join-Path $output '.runtime'
New-Item -ItemType Directory -Path $portableRoot -Force | Out-Null
Copy-Item -LiteralPath $chromium -Destination $portableRoot -Recurse
$package=Join-Path $output 'resources\app'
New-Item -ItemType Directory -Path $package -Force | Out-Null
foreach ($name in @('src','ui','package.json')) { Copy-Item -LiteralPath (Join-Path $appRoot $name) -Destination $package -Recurse }
$launcher="@echo off"+[Environment]::NewLine+'start "" "%~dp0Browserland.exe"'
Set-Content -LiteralPath (Join-Path $output 'Browserland.cmd') -Value $launcher -Encoding ASCII
Copy-Item -LiteralPath (Join-Path $appRoot 'LEIA-ME.txt') -Destination (Join-Path $output 'LEIA-ME.txt')
$zip=Join-Path $dist ("Browserland-$version-win-x64.zip")
Compress-Archive -LiteralPath $output -DestinationPath $zip
Get-FileHash -LiteralPath $zip -Algorithm SHA256 | Format-List
Write-Host "BROWSERLAND_BUILD_OK: $zip"

