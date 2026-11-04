function Stop-DesktopCheckProcess([System.Diagnostics.Process]$Process) {
 if($Process.HasExited){return}
 # Operate only on the process object retained by this verifier's Start-Process.
 $treeKill=$Process.GetType().GetMethod('Kill',[type[]]@([bool]))
 if($treeKill){$Process.Kill($true)}
 else {
  & "$env:SystemRoot\System32\taskkill.exe" /PID $Process.Id /T /F | Out-Null
  if(-not $Process.HasExited){$Process.Kill()}
 }
 if(-not $Process.WaitForExit(5000)){throw 'Nao foi possivel confirmar o fim do processo de teste.'}
}
function Invoke-DesktopCheck([string]$LaunchArguments,[string]$ReportRelativePath,[string]$Label,[int]$TimeoutSeconds=150) {
 $run=Join-Path $appRoot ('test-results\run-'+[guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory -Path $run -Force | Out-Null
 $env:BROWSERLAND_DATA=$run
 $stdout=Join-Path $run 'stdout.log';$stderr=Join-Path $run 'stderr.log';$progress=Join-Path $run 'progress.log'
 $testProcess=$null
 try {
  Write-Host "$Label. Limite: $TimeoutSeconds segundos."
  Add-Content -LiteralPath (Join-Path $run 'verifier.log') -Value ('launch '+(Get-Date -Format o))
  $testProcess=Start-Process -FilePath $runtime -ArgumentList $LaunchArguments -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru
  [void]$testProcess.Handle
  Add-Content -LiteralPath (Join-Path $run 'verifier.log') -Value ('started pid='+$testProcess.Id)
  $reportPath=Join-Path $run $ReportRelativePath
  $started=[Diagnostics.Stopwatch]::StartNew();$shownLines=0;$lastHeartbeat=0
  while(-not $testProcess.HasExited) {
   if(Test-Path -LiteralPath $progress) {
    $lines=@(Get-Content -LiteralPath $progress -Encoding UTF8)
    for($index=$shownLines;$index -lt $lines.Count;$index++){Write-Host $lines[$index]}
    $shownLines=$lines.Count
   }
   if($started.Elapsed.TotalSeconds-$lastHeartbeat -ge 10){$lastHeartbeat=$started.Elapsed.TotalSeconds;Write-Host ('A aguardar encerramento do teste (PID '+$testProcess.Id+', '+[int]$lastHeartbeat+' s).');Add-Content -LiteralPath (Join-Path $run 'verifier.log') -Value ('alive '+[int]$lastHeartbeat+'s report='+(Test-Path -LiteralPath $reportPath))}
   if($started.Elapsed.TotalSeconds -gt $TimeoutSeconds) {
    Stop-DesktopCheckProcess $testProcess
    throw "O teste excedeu $TimeoutSeconds segundos e foi terminado. Etapas: $progress. Erros: $stderr"
   }
   Start-Sleep -Milliseconds 500;$testProcess.Refresh()
  }
  Add-Content -LiteralPath (Join-Path $run 'verifier.log') -Value ('parent exited '+(Get-Date -Format o))
  # No redirected output streams or asynchronous output readers are retained.
  if(-not $testProcess.WaitForExit(5000)){throw "O processo nao confirmou a saida. Registos: $run"}
  if(Test-Path -LiteralPath $progress) {
   $lines=@(Get-Content -LiteralPath $progress -Encoding UTF8)
   for($index=$shownLines;$index -lt $lines.Count;$index++){Write-Host $lines[$index]}
  }
  $reportPath=Join-Path $run $ReportRelativePath
  if($testProcess.ExitCode -ne 0) {
   if(Test-Path -LiteralPath $stderr){Get-Content -LiteralPath $stderr | Out-Host}
   if(Test-Path -LiteralPath (Join-Path $run 'smoke-error.log')){Get-Content -LiteralPath (Join-Path $run 'smoke-error.log') | Out-Host}
   if(Test-Path -LiteralPath $reportPath){Get-Content -LiteralPath $reportPath | Out-Host}
   throw "Teste Electron falhou (codigo $($testProcess.ExitCode)). Registos: $run"
  }
  $report=Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
  if(-not $report.ok){throw "Teste sem confirmacao de sucesso: $reportPath"}
  Add-Content -LiteralPath (Join-Path $run 'verifier.log') -Value ('validated exit='+$testProcess.ExitCode+' checks='+$report.tests.Count)
  Write-Host "$Label aprovado: $($report.tests.Count) verificacoes. Relatorio: $reportPath" -ForegroundColor Green
  return $report
 } finally {
  if($testProcess){if(-not $testProcess.HasExited){Stop-DesktopCheckProcess $testProcess};$testProcess.Dispose();Add-Content -LiteralPath (Join-Path $run 'verifier.log') -Value ('disposed '+(Get-Date -Format o))}
 }
}
