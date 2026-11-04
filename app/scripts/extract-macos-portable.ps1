param(
 [string]$ArchivePath = (Join-Path $PSScriptRoot 'Browserland-0.22.0-Mac-Portable.zip'),
 [string]$Destination = (Join-Path $PSScriptRoot 'Mac-Portable')
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class MacPortableLink {
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
 [return: MarshalAs(UnmanagedType.U1)]
 public static extern bool CreateSymbolicLink(string link, string target, uint flags);
}
'@
$ArchivePath=[IO.Path]::GetFullPath($ArchivePath)
$Destination=[IO.Path]::GetFullPath($Destination)
if(Test-Path -LiteralPath $Destination){throw "Destino existente preservado: $Destination"}
if(-not(Test-Path -LiteralPath $ArchivePath -PathType Leaf)){throw "ZIP em falta: $ArchivePath"}
[IO.Directory]::CreateDirectory($Destination)|Out-Null
$prefix=$Destination.TrimEnd('\')+'\'
$zip=[IO.Compression.ZipFile]::OpenRead($ArchivePath)
$links=@()
$seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
try {
 foreach($entry in $zip.Entries){
  if(-not $entry.FullName.StartsWith('Mac-Portable/')){throw 'Estrutura ZIP inesperada.'}
  $relative=$entry.FullName.Substring(13).TrimEnd('/')
  if(-not $relative){continue}
  if($relative.Contains('\') -or $relative.Contains(':') -or $relative.Split('/') -contains '..'){throw 'Caminho ZIP inseguro.'}
  $target=[IO.Path]::GetFullPath((Join-Path $Destination $relative.Replace('/','\')))
  if(-not $target.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or -not $seen.Add($relative)){throw 'Caminho ZIP fora da pasta ou duplicado.'}
  $mode=([BitConverter]::ToUInt32([BitConverter]::GetBytes([int]$entry.ExternalAttributes),0) -shr 16)
  if(($mode -band 61440) -eq 40960){
   $reader=New-Object IO.StreamReader($entry.Open(),[Text.Encoding]::UTF8)
   try{$linkTarget=$reader.ReadToEnd()}finally{$reader.Dispose()}
   if([IO.Path]::IsPathRooted($linkTarget) -or $linkTarget.Contains(':') -or $linkTarget.Contains('\') -or $linkTarget.Contains([char]0)){throw 'Ligacao simbolica externa ou invalida.'}
   $resolved=[IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetDirectoryName($target)) $linkTarget.Replace('/','\')))
   if(-not $resolved.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Ligacao simbolica fora da pasta.'}
   $links+=@{Path=$target;Relative=$relative;Target=$linkTarget};continue
  }
  if($entry.FullName.EndsWith('/')){[IO.Directory]::CreateDirectory($target)|Out-Null;continue}
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
  $inputStream=$entry.Open();$outputStream=[IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$inputStream.CopyTo($outputStream)}finally{$outputStream.Dispose();$inputStream.Dispose()}
 }
} finally {$zip.Dispose()}
$metadata=Get-Content -LiteralPath (Join-Path $Destination 'mac-portable-metadata.json') -Raw|ConvertFrom-Json
foreach($link in $links){
 $record=$metadata.entries|Where-Object {$_.path -ceq $link.Relative}
 if(-not $record -or $record.kind -ne 'symlink' -or $record.target -cne $link.Target){throw 'Ligacao nao corresponde ao manifesto.'}
 $flags=[uint32]2;if($record.targetIsDirectory){$flags=$flags -bor 1}
 if(-not [MacPortableLink]::CreateSymbolicLink($link.Path,$link.Target.Replace('/','\'),$flags)){
  $code=[Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "Nao foi possivel preservar a ligacao (erro $code). O Windows pode exigir Modo de Programador. Nenhuma definicao foi alterada. Pasta parcial: $Destination"
 }
}
foreach($entry in $metadata.entries){
 if($entry.kind -ne 'file'){continue}
 $file=Join-Path $Destination $entry.path.Replace('/','\')
 if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.sha256){throw "Ficheiro nao corresponde ao manifesto: $($entry.path)"}
}
Write-Output "MAC_PORTABLE_EXTRACT_OK: $Destination"
Write-Output 'Escolha esta pasta em Software portable e selecione Browserland.app em Programa para Mac.'
