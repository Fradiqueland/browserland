$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$nodeExe=Join-Path $projectRoot 'rea\.cache\rea-toolchain\node-v24.22.1-win-x64\node.exe'
if(-not (Test-Path -LiteralPath $nodeExe)){$nodeExe=(Get-Command node.exe -ErrorAction Stop).Source}
$runtime=$nodeExe
$fixture=Join-Path $PSScriptRoot 'fixtures\runner-process.cjs'
$fixtureWorkspace=Join-Path $projectRoot ('app\test-results\runner-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureWorkspace -Force | Out-Null
$appRoot=$fixtureWorkspace
. (Join-Path $projectRoot 'app\scripts\desktop-check.ps1')
$previousData=$env:BROWSERLAND_DATA
$passed=0;$limited=0
try {
 $report=Invoke-DesktopCheck ('"'+$fixture+'" success') 'result.json' 'Normal success fixture' 8
 if(-not $report.ok){throw 'Normal success rejected'};$passed++
 foreach($mode in @('failure','bad-report','missing-report','timeout')){
  $failed=$false;$message=''
  try {$unexpected=Invoke-DesktopCheck ('"'+$fixture+'" '+$mode) 'result.json' $mode 1} catch {$failed=$true;$message=$_.Exception.Message}
  if(-not $failed){throw "Runner incorrectly accepted $mode"}
  if($mode -eq 'failure' -and $message -notmatch 'codigo 7'){throw "Wrong failure diagnostic: $message"}
  if($mode -eq 'bad-report' -and $message -notmatch 'sem confirmacao'){throw "Wrong report diagnostic: $message"}
  if($mode -eq 'timeout' -and $message -notmatch 'excedeu 1 segundos'){throw "Wrong timeout diagnostic: $message"}
  Write-Host "PASS: $mode rejected correctly.";$passed++
 }
 Write-Host "RUNNER_TESTS_OK: $passed passed, $limited limited; PowerShell $($PSVersionTable.PSVersion)."
} finally {$env:BROWSERLAND_DATA=$previousData}
