$ErrorActionPreference='Stop'
$appRoot=Split-Path -Parent $PSScriptRoot
$runtime=& (Join-Path $PSScriptRoot 'runtime.ps1')
. (Join-Path $PSScriptRoot 'desktop-check.ps1')
$previousData=$env:BROWSERLAND_DATA
try{$report=Invoke-DesktopCheck ('"'+(Join-Path $appRoot 'tests/startup')+'"') 'startup-result.json' 'Arranque repetido e identidade desde o primeiro script';Write-Host "STARTUP_OK: $($report.tests.Count)"}finally{$env:BROWSERLAND_DATA=$previousData}
