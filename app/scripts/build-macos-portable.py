"""Create a Builder-ready Mac-Portable folder and Unix-preserving ZIP."""
from pathlib import Path
import hashlib,importlib.util,json,os,plistlib,posixpath,shlex,shutil,stat,struct,subprocess,sys,zipfile
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('mac_package',ROOT/'scripts/build-macos.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
README="""BROWSERLAND 0.21.0 â€” MAC-PORTABLE

Importar no Windows & Mac Software Builder 2.6.5 ou posterior:
1. Software portable > Escolher pasta: selecione a pasta Mac-Portable completa.
2. Programa para Mac: selecione Browserland.app. Deixe Wine desativado.
3. Guarde o modulo e exporte a aplicacao para Mac.
4. No Mac, abra a aplicacao exportada e clique no modulo para abrir o Browserland.

O lancador principal e um Mach-O universal (Intel e Apple Silicon).
Electron e Chromium de ambas as arquiteturas estao dentro da app. Nao requer
Node.js, Electron, Chrome, Python, Go ou Wine instalados no Mac.
Requer macOS 13+. A app tambem pode ser aberta diretamente fora do DMG.
Conserve a pasta numa localizacao com permissao de escrita. Os dados sao
guardados em data ao lado de Browserland.app. No Viewer do construtor,
a pasta de trabalho e persistente e gerida pelo proprio construtor.

EXTRAIR O ZIP NO MAC:
Use o Utilitario de Arquivo do Finder ou:
  ditto -x -k Browserland-0.21.0-Mac-Portable.zip ./Entrega
Depois selecione Entrega/Mac-Portable no construtor.
O ZIP conserva os modos Unix e as ligacoes simbolicas relativas originais.

EXTRAIR O ZIP NO WINDOWS:
A pasta Mac-Portable entregue neste computador ja contem as ligacoes corretas.
Para outra extracao, use o script Extrair-Mac-Portable.ps1 fornecido ao lado do ZIP:
  & '.\\Extrair-Mac-Portable.ps1' -ArchivePath '.\\Browserland-0.21.0-Mac-Portable.zip'
O Windows pode exigir Modo de Programador para criar ligacoes simbolicas.
O script nao altera essa definicao, nao pede elevacao e nao substitui pastas existentes.
Nao use uma extracao que transforme ligacoes em ficheiros de texto.
O construtor 2.6.5 reconhece Mach-O no Windows e atribui permissao de execucao
a esses executaveis na exportacao Mac. Para manter todos os modos Unix originais,
prefira extrair e importar num Mac. Se a pasta passou por Windows, pode restaurar
os modos e as ligacoes no Mac, antes de importar, com o comando de sistema:
  sh './Mac-Portable/Restaurar-permissoes-Mac.command'
O restauro atua apenas nos caminhos declarados nesta pasta.

VALIDACAO E ASSINATURA:
Abertura real num Mac fora do DMG: NAO EXECUTADA (ambiente disponivel: Windows).
Os testes de cabecalhos, ficheiros, ligacoes, caminhos e integracao nao substituem
esse teste. Bundle externo sem assinatura Developer ID e sem notarizacao.
As assinaturas/recursos existentes dos motores internos sao conservados byte a byte;
isso nao certifica o bundle externo nem corrige assinaturas anteriormente alteradas.
Nao desative as protecoes do macOS.

Criado por Antonio Fradique â€” https://AntonioFradique.net
"""
def compile_tools():
 config_path=ROOT/'.cache/portable-go.json'
 configured=json.loads(config_path.read_text()) if config_path.exists() else {}
 cache=Path(configured.get('work',ROOT/'.cache/dmg-toolchain'))
 go_root=Path(configured.get('goRoot',cache/'go'));go=go_root/'bin/go.exe'
 if not go.exists():raise FileNotFoundError('Prepare the pinned build-only Go toolchain using scripts/prepare-portable-go.py first.')
 env=dict(os.environ,GOROOT=str(go_root),GOPATH=str(cache/'gopath'),GOCACHE=str(cache/'gocache'),GOMODCACHE=str(cache/'gomodcache'),GOTOOLCHAIN='local',CGO_ENABLED='0',TEMP=str(cache),TMP=str(cache))
 launch=ROOT/'scripts/mac-portable-launcher'
 subprocess.run([go,'test','./...'],cwd=launch,env=env,check=True)
 for arch in ('amd64','arm64'):
  subprocess.run([go,'build','-trimpath','-ldflags=-s -w -buildid=','-o',ROOT/'.cache'/('mac-launcher-'+arch),'./'],cwd=launch,env=dict(env,GOOS='darwin',GOARCH=arch),check=True)
 subprocess.run([go,'build','-trimpath','-ldflags=-s -w -buildid=','-o',ROOT/'.cache/mac-portable-zip.exe',ROOT/'scripts/mac-portable-zip.go'],env=env,check=True)

def fat_launcher():
 result=bytearray(struct.pack('>II',0xcafebabe,2));parts=[];offset=16384
 for name,cpu in [('amd64',0x1000007),('arm64',0x100000c)]:
  b=(ROOT/'.cache'/('mac-launcher-'+name)).read_bytes()
  assert struct.unpack_from('<II',b)==(0xfeedfacf,cpu) and struct.unpack_from('<I',b,12)[0]==2
  subtype=struct.unpack_from('<I',b,8)[0]
  result.extend(struct.pack('>IIIII',cpu,subtype,offset,len(b),14));parts.append((offset,b))
  offset=(offset+len(b)+16383)&~16383
 for offset,b in parts:
  result.extend(b'\0'*(offset-len(result)));result.extend(b)
 p=ROOT/'.cache/mac-launcher-universal';p.write_bytes(result);return p

def restore_script(entries):
 q=shlex.quote
 lines=['#!/bin/sh','set -eu','root=$(CDPATH= cd -P "$(dirname "$0")" && pwd -P)',
        '[ -d "$root/Browserland.app/Contents" ] || { echo "Bundle incompleto." >&2; exit 1; }',
        'restore_link() {','  file="$root/$1"; target="$2"',
        '  if [ -L "$file" ]; then [ "$(readlink "$file")" = "$target" ] || { echo "Ligacao alterada: $1" >&2; exit 1; }',
        '  elif [ -f "$file" ] && [ "$(cat "$file")" = "$target" ]; then rm "$file"; ln -s "$target" "$file";',
        '  else echo "Ligacao em falta ou alterada: $1" >&2; exit 1; fi','}']
 for e in entries:
  if e['kind']=='symlink':lines.append('restore_link '+q(e['path'])+' '+q(e['target']))
 for e in entries:
  if e['kind']!='symlink':
   p='"$root"/'+q(e['path'])
   lines.append('[ ! -L '+p+' ] || { echo "Caminho substituido por ligacao." >&2; exit 1; }')
   lines.append('chmod '+format(e['mode']&0o777,'o')+' '+p)
 lines.append('echo "Permissoes e ligacoes Mac restauradas."')
 return '\n'.join(lines)+'\n'

def verify_delivery(dest,archive,launcher,entries,proof,version):
 print('Verifying complete folder/ZIP...',flush=True)
 with base.checked_archive(archive) as z:
  if z.testzip():raise ValueError('Output ZIP CRC failure')
  for e in entries:
   n='Mac-Portable/'+e['path']+('/' if e['kind']=='directory' else '');info=z.getinfo(n)
   assert info.external_attr>>16==e['mode'],n
   if e['kind']=='symlink':assert z.read(info).decode()==e['target']
   elif e['kind']=='file':
    h=hashlib.sha256()
    with z.open(info) as f:
     for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    assert h.hexdigest()==e['sha256'],n
    assert base.digest(dest/e['path'])==e['sha256'],n
  fat=z.read('Mac-Portable/Browserland.app/Contents/MacOS/Browserland')
  assert fat==launcher.read_bytes() and struct.unpack_from('>II',fat)==(0xcafebabe,2)
 report=dict(ok=True,version=version,folder=str(dest),zip=str(archive),zipBytes=archive.stat().st_size,
             zipSHA256=base.digest(archive),sourceZipSHA256=proof['sha256'],entriesVerified=len(entries),
             symlinksPreserved=sum(e['kind']=='symlink' for e in entries),launcher='universal-mach-o',architectures=['x64','arm64'],
             executionVerified=False,signed=False,notarized=False,windowsSourceChanged=False)
 (ROOT/'reference'/f'mac-portable-{version}.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(report),flush=True)
 return report

def build():
 version=json.loads((ROOT/'package.json').read_text())['version']
 proof=json.loads((ROOT/'reference'/f'mac-single-{version}.json').read_text())
 sources=[ROOT/'dist'/f'Browserland-{version}-mac.zip',Path('D:/workspace/BrowserlandPackages')/f'Browserland-{version}-mac.zip']
 source=next((p for p in sources if p.exists()),None)
 if not source or base.digest(source)!=proof['sha256']:raise ValueError('Verified source ZIP unavailable/mismatched')
 dest=ROOT/'dist'/version/'Mac-Portable';archive=ROOT/'dist'/f'Browserland-{version}-Mac-Portable.zip'
 if dest.exists() or archive.exists():raise FileExistsError('Existing delivery preserved')
 compile_tools()
 dest.mkdir(parents=True);launcher=fat_launcher();entries=[];links=[]
 with base.checked_archive(source) as z:
  infos=z.infolist();names={i.filename.rstrip('/'):i for i in infos}
  def resolve(n,seen=None):
   seen=set() if seen is None else seen
   parts=n.split('/')
   for k in range(1,len(parts)+1):
    p='/'.join(parts[:k]);item=names.get(p)
    if item and stat.S_ISLNK(item.external_attr>>16):
     if p in seen:raise ValueError('Link cycle')
     seen.add(p);target=z.read(item).decode();mapped=posixpath.normpath(posixpath.join(posixpath.dirname(p),target,*parts[k:]))
     if mapped.split('/')[0]!='Browserland.app' or target.startswith('/') or '\\' in target:raise ValueError('Escaping link')
     return resolve(mapped,seen)
   if n not in names:raise ValueError('Missing link target: '+n)
   return n
  for info in infos:
   n=info.filename.rstrip('/');base.safe_name(n)
   if not n.startswith('Browserland.app/'):raise ValueError('Unexpected source entry')
   mode=info.external_attr>>16;p=dest/n
   if stat.S_ISLNK(mode):
    target=z.read(info).decode('utf-8');resolved=resolve(n)
    e=dict(path=n,mode=mode,kind='symlink',target=target,targetIsDirectory=names[resolved].is_dir())
    links.append((p,target,e['targetIsDirectory']));entries.append(e);continue
   if info.is_dir():p.mkdir(parents=True,exist_ok=True);entries.append(dict(path=n,mode=mode,kind='directory'));continue
   p.parent.mkdir(parents=True,exist_ok=True);h=hashlib.sha256()
   incoming=launcher.open('rb') if n=='Browserland.app/Contents/MacOS/Browserland' else z.open(info)
   with incoming,p.open('xb') as out:
    for b in iter(lambda:incoming.read(1024*1024),b''):out.write(b);h.update(b)
   os.chmod(p,mode&0o777)
   entries.append(dict(path=n,mode=mode,kind='file',bytes=p.stat().st_size,sha256=h.hexdigest()))
  for p,target,is_dir in links:
   p.parent.mkdir(parents=True,exist_ok=True);os.symlink(target.replace('/',os.sep),p,target_is_directory=is_dir)
  if os.name!='nt':
   for e in entries:
    if e['kind']=='directory':os.chmod(dest/e['path'],e['mode']&0o777)
 metadata=dict(schema=1,product='Browserland',version=version,architectures=['x64','arm64'],
               launcher='universal-mach-o',runtimes='separate native Intel/Apple Silicon engines inside one app',
               sourceZipSHA256=proof['sha256'],minimumMacOS='13.0',entries=entries,
               signature=dict(outerSigned=False,notarized=False,originalEngineSignatureFilesPreserved=True),
               macExecutionTest='not executed: no Mac available')
 (dest/'mac-portable-metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 (dest/'LEIA-ME.txt').write_text(README.replace('0.21.0',version),encoding='utf-8')
 (dest/'Restaurar-permissoes-Mac.command').write_text(restore_script(entries),encoding='utf-8',newline='\n')
 os.chmod(dest/'Restaurar-permissoes-Mac.command',0o755)
 shutil.copyfile(ROOT/'scripts/extract-macos-portable.ps1',ROOT/'dist/Extrair-Mac-Portable.ps1')
 subprocess.run([ROOT/'.cache/mac-portable-zip.exe',source,archive,launcher,dest],check=True)
 return verify_delivery(dest,archive,launcher,entries,proof,version)

if __name__=='__main__':
 if '--verify-only' in sys.argv:
  version=json.loads((ROOT/'package.json').read_text())['version'];dest=ROOT/'dist'/version/'Mac-Portable'
  archive=ROOT/'dist'/f'Browserland-{version}-Mac-Portable.zip';launcher=ROOT/'.cache/mac-launcher-universal'
  entries=json.loads((dest/'mac-portable-metadata.json').read_text(encoding='utf-8'))['entries']
  proof=json.loads((ROOT/'reference'/f'mac-single-{version}.json').read_text())
  verify_delivery(dest,archive,launcher,entries,proof,version)
 else:build()
