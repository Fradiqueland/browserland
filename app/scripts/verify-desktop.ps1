$ErrorActionPreference='Stop'
$appRoot=Split-Path -Parent $PSScriptRoot
$runtime=& (Join-Path $PSScriptRoot 'runtime.ps1')
$nodeExe=Join-Path (Split-Path -Parent $appRoot) 'rea\.cache\rea-toolchain\node-v24.22.1-win-x64\node.exe'
if (-not (Test-Path -LiteralPath $nodeExe)) { $nodeExe=(Get-Command node.exe -ErrorAction Stop).Source }
# Only the test-owned main process for this exact runtime and project is eligible.
$previousTests=@()
try { $previousTests=@(Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue | Where-Object {
 $_.ExecutablePath -eq $runtime -and $_.CommandLine -match '(^|\s)--(self-test|ui-suite)(\s|$)' -and $_.CommandLine.Contains($appRoot)
}) } catch { Write-Host 'Pesquisa de testes anteriores indisponivel neste ambiente. O novo teste tera limpeza propria.' }
foreach($previousTest in $previousTests) {
 $current=Get-CimInstance Win32_Process -Filter ("ProcessId="+$previousTest.ProcessId) -ErrorAction SilentlyContinue
 if($current -and $current.ExecutablePath -eq $runtime -and $current.CreationDate -eq $previousTest.CreationDate) {
  Write-Host "A terminar o teste anterior bloqueado (PID $($current.ProcessId))..."
  & "$env:SystemRoot\System32\taskkill.exe" /PID $current.ProcessId /T /F | Out-Null
 }
}
. (Join-Path $PSScriptRoot 'desktop-check.ps1')
Push-Location -LiteralPath $appRoot
$previousData=$env:BROWSERLAND_DATA
try {
 & (Join-Path $appRoot 'tests/runtime.test.ps1') | Out-Host
 $coreDirectory=Join-Path $appRoot ('test-results\core-'+[guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory -Path $coreDirectory -Force | Out-Null
 $coreOutput=Join-Path $coreDirectory 'tap.log';$coreErrors=Join-Path $coreDirectory 'stderr.log'
 $coreProcess=Start-Process -FilePath $nodeExe -ArgumentList '--test --test-reporter=tap tests/core.test.mjs tests/branding.test.mjs tests/groups.test.mjs tests/localization.test.mjs tests/portable-extensions.test.mjs tests/platform.test.mjs tests/profile-import.test.mjs tests/profile-tasks.test.mjs tests/native-path.test.mjs tests/standard-browser.test.mjs tests/plain-browser.test.mjs' -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $coreOutput -RedirectStandardError $coreErrors
 try {
  [void]$coreProcess.Handle
  if(-not $coreProcess.WaitForExit(30000)){Stop-DesktopCheckProcess $coreProcess;throw 'Tempo limite nos testes de dominio.'}
  $tap=Get-Content -LiteralPath $coreOutput -Raw
  if($coreProcess.ExitCode -ne 0 -or $tap -notmatch '# fail 0' -or $tap -notmatch '# tests [1-9][0-9]*') {Get-Content -LiteralPath $coreErrors | Out-Host;throw "Falha nos testes de dominio. Registos: $coreDirectory"}
  Write-Host ('Testes de dominio aprovados. '+($tap -split "`n" | Where-Object {$_ -match '^# tests '})+'; falhas: 0.') -ForegroundColor Green
 } finally {$coreProcess.Dispose()}
 $startup=Invoke-DesktopCheck ('"'+(Join-Path $appRoot 'tests/startup')+'"') 'startup-result.json' 'Arranque repetido e navegacao protegida'
 $navigation=Invoke-DesktopCheck ('"'+(Join-Path $appRoot 'tests/navigation')+'" --ui-suite') 'navigation-result.json' 'Navegacao imediata em ciclos completos'
 $electronRuntime=$runtime
 $runtime=$nodeExe
 $native=Invoke-DesktopCheck ('"'+(Join-Path $appRoot 'tests\native-browser.test.mjs')+'"') 'native-result.json' 'Chromium completo: isolamento, identidade, proxy e partilha'
 $nativeDownloads=Invoke-DesktopCheck ('"'+(Join-Path $appRoot 'tests\native-download.test.mjs')+'" --headed') 'native-download-result.json' 'Downloads Chromium em separadores novos e com redirecionamentos'
 $background=Invoke-DesktopCheck ('"'+(Join-Path $appRoot 'tests\native-background.test.mjs')+'"') 'background-result.json' 'Service workers, cache offline e persistencia'
 $extensions=Invoke-DesktopCheck ('"'+(Join-Path $appRoot 'tests\native-extension.test.mjs')+'"') 'extension-result.json' 'Extensao Manifest V3 real no Chromium'
 $lifecycle=Invoke-DesktopCheck ('"'+(Join-Path $appRoot 'tests\native-lifecycle.test.mjs')+'"') 'lifecycle-result.json' 'Fecho sob carga, arranque concorrente e recuperacao'
 $runtime=$electronRuntime
 $desktop=Invoke-DesktopCheck ('"'+$appRoot+'" --self-test') 'smoke-result.json' 'Integracoes, isolamento, privacidade, proxy e transferencias locais'
 $fixture=Join-Path $appRoot 'tests\rea-ui'
 $interface=Invoke-DesktopCheck ('"'+$fixture+'" --ui-suite --ui-test-exit --native-ui-tests') 'ui-checks\ui-result.json' 'Botoes, formularios e controlos do navegador'
 Write-Host "BROWSERLAND_DESKTOP_OK: $($startup.tests.Count) arranque + $($navigation.tests.Count) navegacao + $($native.tests.Count) Chromium + $($nativeDownloads.tests.Count) downloads Chromium + $($background.tests.Count) background + $($extensions.tests.Count) extensoes + $($lifecycle.tests.Count) ciclo de vida + $($desktop.tests.Count) integracoes + $($interface.tests.Count) interface." -ForegroundColor Green
} finally {$env:BROWSERLAND_DATA=$previousData;Pop-Location}
