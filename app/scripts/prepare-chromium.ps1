param([ValidatePattern('^\d{1,10}$')][string]$Revision)
$ErrorActionPreference='Stop'
$appRoot=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$runtimeRoot=Join-Path $appRoot '.runtime'
$destination=Join-Path $runtimeRoot 'chromium'
$executable=Join-Path $destination 'chrome.exe'
$manifest=Join-Path $destination 'browserland-runtime.json'
if(-not(Test-Path -LiteralPath $manifest)){$legacyManifest=Join-Path $destination 'multi-browser-runtime.json';if(Test-Path -LiteralPath $legacyManifest){$manifest=$legacyManifest}}
if(Test-Path -LiteralPath $destination){
 if((Test-Path -LiteralPath $executable) -and (Test-Path -LiteralPath $manifest)){
  $existing=Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
  if($Revision -and $existing.revision -ne $Revision){throw 'O Chromium existente tem outra revisao. Preserve-o antes de atualizar.'}
  if((Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash -ne $existing.executableSha256){throw 'O executavel Chromium nao corresponde ao manifesto.'}
  Write-Host "CHROMIUM_READY: $($existing.version) revisao $($existing.revision)";exit 0
 }
 throw 'A pasta Chromium ja existe sem manifesto verificavel. Foi preservada.'
}
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$base='https://commondatastorage.googleapis.com/chromium-browser-snapshots/Win_x64'
function Read-OfficialText([string]$Uri){
 $response=Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 90
 if($response.Content -is [byte[]]){return [Text.Encoding]::UTF8.GetString($response.Content)}
 return [string]$response.Content
}
if(-not $Revision){$Revision=(Read-OfficialText "$base/LAST_CHANGE").Trim()}
if($Revision -notmatch '^\d{1,10}$'){throw 'Revisao oficial Chromium invalida.'}
$download=Join-Path $runtimeRoot 'downloads'
New-Item -ItemType Directory -Path $download -Force | Out-Null
$archive=Join-Path $download "chromium-win-x64-$Revision.zip"
$url="$base/$Revision/chrome-win.zip"
Write-Host "A descarregar Chromium oficial, revisao $Revision..."
if(-not(Test-Path -LiteralPath $archive)){Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing -TimeoutSec 300}
$sha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
$staging=Join-Path $runtimeRoot ('chromium-stage-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($archive)
try{
 foreach($entry in $zip.Entries){
  $relative=$entry.FullName.Replace('\','/')
  if($relative -notmatch '^chrome-win/' -or $relative -match '(^|/)\.\.(/|$)|:'){throw 'Caminho inesperado no arquivo Chromium.'}
  $resolved=[IO.Path]::GetFullPath((Join-Path $staging $entry.FullName))
  if(-not $resolved.StartsWith($staging+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Entrada fora da pasta de extracao.'}
 }
}finally{$zip.Dispose()}
Expand-Archive -LiteralPath $archive -DestinationPath $staging
$source=[IO.Path]::GetFullPath((Join-Path $staging 'chrome-win'))
if(-not(Test-Path -LiteralPath (Join-Path $source 'chrome.exe'))){throw 'Executavel ausente no arquivo oficial.'}
# Retain the upstream license and embedded chrome://credits notices.
$license=Read-OfficialText 'https://chromium.googlesource.com/chromium/src/+/main/LICENSE?format=TEXT'
[IO.File]::WriteAllBytes((Join-Path $source 'CHROMIUM-LICENSE.txt'),[Convert]::FromBase64String($license.Trim()))
$version=(Get-Item -LiteralPath (Join-Path $source 'chrome.exe')).VersionInfo.ProductVersion
if($version -notmatch '\d+\.\d+\.\d+\.\d+'){throw 'Versao Chromium indisponivel.'}
$details=[ordered]@{source=$url;revision=$Revision;version=$version;archiveSha256=$sha256;executableSha256=(Get-FileHash -LiteralPath (Join-Path $source 'chrome.exe') -Algorithm SHA256).Hash;downloadedAt=(Get-Date).ToUniversalTime().ToString('o');automaticUpdates=$false}
$details | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $source 'browserland-runtime.json') -Encoding UTF8
# Resolve both targets immediately before moving; both must stay under this runtime root.
$allowed=[IO.Path]::GetFullPath($runtimeRoot)+[IO.Path]::DirectorySeparatorChar
foreach($target in @($source,$destination)){if(-not([IO.Path]::GetFullPath($target).StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase))){throw 'Destino Chromium fora do projeto.'}}
Move-Item -LiteralPath $source -Destination $destination
Write-Host "CHROMIUM_READY: $version revisao $Revision; SHA256 $sha256"
