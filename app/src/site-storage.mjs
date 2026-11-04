import {isBundleFormat} from './branding.mjs';
import {existsSync,lstatSync,readdirSync,readFileSync,mkdirSync,writeFileSync,realpathSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {gzip,gunzip} from 'node:zlib';
import {promisify} from 'node:util';
const compress=promisify(gzip),decompress=promisify(gunzip);
const roots=['Default/Local Storage','Default/IndexedDB','Default/Session Storage','Default/Service Worker','Default/File System','Default/WebStorage'];
const exact=new Set(['Default/QuotaManager','Default/QuotaManager-journal',...['LocalStorage','SessionStorage'].flatMap(name=>['','-journal','-wal','-shm'].map(suffix=>'Default/'+name+suffix))]);
const MAX_BYTES=128*1024*1024,MAX_JSON=192*1024*1024,MAX_COMPRESSED=16*1024*1024,MAX_FILES=20000;
function allowed(path){return exact.has(path)||roots.some(root=>path.startsWith(root+'/'));}
function safePath(path){
 if(typeof path!=='string'||!allowed(path)||path.includes('\\')||path.split('/').some(part=>!part||part==='.'||part==='..'||/[<>:"|?*\x00-\x1f]/.test(part)||/[. ]$/.test(part)||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part)))throw Error('Caminho de armazenamento nao autorizado.');
 return path;
}
export async function exportSiteStorage(directory,engine){
 const base=resolve(directory),files=[];let total=0;
 function walk(relative){
  const path=join(base,relative);
  if(!existsSync(path))return;
  const stat=lstatSync(path);if(stat.isSymbolicLink())throw Error('Ligacoes externas no armazenamento recusadas.');
  if(!realpathSync(path).startsWith(realpathSync(base)+sep))throw Error('Armazenamento fora do perfil recusado.');
  if(stat.isDirectory()){for(const name of readdirSync(path))walk(relative+'/'+name);return;}
  if(!stat.isFile())throw Error('Tipo de ficheiro de armazenamento invalido.');
  safePath(relative);
  if(stat.size>MAX_BYTES||total+stat.size>MAX_BYTES||files.length>=MAX_FILES)throw Error('Armazenamento excede o limite de 128 MiB ou 20000 ficheiros.');
  const bytes=readFileSync(path);total+=bytes.length;if(total>MAX_BYTES)throw Error('Armazenamento demasiado grande.');
  files.push({path:relative,bytes:bytes.toString('base64')});
 }
 if(!existsSync(base))return null;
 for(const root of roots)walk(root);for(const path of exact)walk(path);
 const version=existsSync(join(base,'Last Version'))?readFileSync(join(base,'Last Version'),'utf8').trim():'';
 const packed=await compress(Buffer.from(JSON.stringify({files})));
 if(packed.length>MAX_COMPRESSED)throw Error('Armazenamento comprimido excede 16 MiB. Exporte este perfil sem dados dos sites.');
 return {format:'browserland-site-storage',version:1,engine,browserVersion:version,bytes:total,compression:'gzip',data:packed.toString('base64')};
}
export async function importSiteStorage(directory,snapshot,engine,browserVersion){
 if(!snapshot||!isBundleFormat(snapshot.format,'site-storage')||snapshot.version!==1||snapshot.compression!=='gzip'||snapshot.engine!==engine||typeof snapshot.data!=='string'||snapshot.data.length>Math.ceil(MAX_COMPRESSED/3)*4)throw Error('Armazenamento de sessao invalido ou motor diferente.');
 if(snapshot.browserVersion&&!/^\d+(?:\.\d+){1,3}$/.test(snapshot.browserVersion))throw Error('Versao de navegador invalida.');
 const installedMajor=Number(browserVersion.match(/(?:Chrome|Chromium|Edg)\/(\d+)/)?.[1]);
 if(snapshot.browserVersion&&(!installedMajor||installedMajor<Number(snapshot.browserVersion.split('.')[0])))throw Error('Atualize o navegador: a sessao foi criada numa versao mais recente.');
 let payload;try{payload=JSON.parse((await decompress(Buffer.from(snapshot.data,'base64'),{maxOutputLength:MAX_JSON})).toString('utf8'));}catch{throw Error('Armazenamento comprimido invalido ou demasiado grande.');}
 if(!Array.isArray(payload.files)||payload.files.length>MAX_FILES)throw Error('Lista de armazenamento invalida.');
 const seen=new Set();let total=0;
 // Validate the complete archive before creating or overwriting any entry.
 const files=payload.files.map(file=>{
  const path=safePath(file.path),key=path.toLowerCase();
  if(seen.has(key)||typeof file.bytes!=='string'||file.bytes.length>Math.ceil(MAX_BYTES/3)*4||/[^A-Za-z0-9+/=]/.test(file.bytes))throw Error('Ficheiro de armazenamento invalido ou repetido.');
  seen.add(key);const bytes=Buffer.from(file.bytes,'base64');if(bytes.toString('base64')!==file.bytes)throw Error('Conteudo de armazenamento invalido.');total+=bytes.length;if(total>MAX_BYTES)throw Error('Armazenamento demasiado grande.');
  return {path,bytes};
 });
 const base=resolve(directory);mkdirSync(base,{recursive:true});
 for(const file of files){
  const target=resolve(base,...file.path.split('/'));if(!target.startsWith(base+sep))throw Error('Destino fora do perfil recusado.');
  const parts=file.path.split('/');let parent=base;
  for(const part of parts.slice(0,-1)){parent=join(parent,part);if(existsSync(parent)&&lstatSync(parent).isSymbolicLink())throw Error('Destino de armazenamento externo recusado.');mkdirSync(parent,{recursive:true});}
  // Only fresh imported profiles are supported; no running or existing site data is replaced.
  writeFileSync(target,file.bytes,{flag:'wx',mode:0o600});
 }
 return {files:files.length,bytes:total};
}
