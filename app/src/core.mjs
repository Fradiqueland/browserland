import {isBundleFormat} from './branding.mjs';
import {DEFAULT_LANGUAGE,normalizeLanguage} from './languages.mjs';
import {groupNames,profileGroups,ensureProfileGroups,validateGroupRecords} from './groups.mjs';
import {randomUUID, randomBytes, scryptSync, createCipheriv, createDecipheriv} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
export function text(value,max=200){return String(value??'').trim().slice(0,max);}
export function safeURL(raw){
 const value=text(raw,4096); if(!value||value==='about:blank')return 'about:blank';
 const authority=/^(?:localhost|(?:[\p{L}\p{N}_-]+\.)+[\p{L}\p{N}_-]+|\[[0-9a-f:]+\]):\d{1,5}(?:[/?#]|$)/iu.test(value);
 const loopback=/^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d{1,5})?(?:[/?#]|$)/i.test(value);
 const url=new URL(authority||loopback?(loopback?'http://':'https://')+value:/^[a-z][a-z0-9+.-]*:/i.test(value)?value:(value.includes('.')&&!value.includes(' ')?'https://'+value:'https://www.google.com/search?q='+encodeURIComponent(value)));
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Utilize um endereço HTTP ou HTTPS sem credenciais.');
 return url.href;
}
export function proxyConfig(raw){
 const value=text(raw,1000); if(!value)return '';
 const p=new URL(value); if(!['http:','https:','socks4:','socks5:'].includes(p.protocol)||p.username||p.password||p.pathname!=='/'&&p.pathname!==''||p.search||p.hash)throw new Error('Proxy: http://servidor:porta ou socks5://servidor:porta, sem credenciais no endereço.');
 return p.origin==='null'?p.protocol+'//'+p.host:p.origin;
}
export function validateProfile(input,previous={}){
 const id=previous.id??randomUUID(), name=text(input.name,80);
 const groups=input.groups!==undefined?groupNames(input.groups):input.group!==undefined?groupNames(input.group?[input.group]:[]):profileGroups(previous);
 const engine=input.engine??previous.engine??'embedded';if(!['embedded','chromium','chrome','edge'].includes(engine))throw Error('Motor de navegador invalido.');
 const launchMode=input.launchMode??previous.launchMode??'managed';
 if(!['managed','plain'].includes(launchMode))throw Error('Modo de abertura inválido.');
 if(launchMode==='plain'&&input.proxyPassword)throw Error('O modo normal não suporta credenciais de proxy geridas pela aplicação.');
 if(!name)throw new Error('Indique o nome do perfil.');
 const timezone=text(input.timezone??previous.timezone,100);if(timezone){try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{throw new Error('Fuso horário inválido.');}}
 const locale=text(input.locale||previous.locale||'pt-PT',40);try{Intl.getCanonicalLocales(locale);}catch{throw new Error('Idioma inválido.');}
 const width=Number(input.width||previous.width||1280),height=Number(input.height||previous.height||800);
 if(!Number.isInteger(width)||width<320||width>3840||!Number.isInteger(height)||height<240||height>2160)throw new Error('Resolução entre 320×240 e 3840×2160.');
 const explicitGeolocation=input.latitude!==undefined||input.longitude!==undefined;
 for(const flag of ['timezoneEnabled','geolocationEnabled'])if(input[flag]!==undefined&&typeof input[flag]!=='boolean')throw Error('Estado de ambiente invalido.');
 input={...input,latitude:input.latitude===undefined?previous.geolocation?.latitude:input.latitude,longitude:input.longitude===undefined?previous.geolocation?.longitude:input.longitude};
 let geolocation=null;
 if((input.latitude!==''&&input.latitude!==undefined&&input.latitude!==null)||(input.longitude!==''&&input.longitude!==undefined&&input.longitude!==null)){
  const latitude=Number(input.latitude),longitude=Number(input.longitude);
  if(input.latitude===''||input.latitude==null||!Number.isFinite(latitude)||Math.abs(latitude)>90||input.longitude===''||input.longitude==null||!Number.isFinite(longitude)||Math.abs(longitude)>180)throw new Error('Coordenadas inválidas.');
  const accuracy=Number(input.geolocationAccuracy??(previous.geolocation?.latitude===latitude&&previous.geolocation?.longitude===longitude?previous.geolocation.accuracy:100)??100);
  if(!Number.isFinite(accuracy)||accuracy<0)throw Error('Precisão da localização inválida.');
  geolocation={latitude,longitude,accuracy};
 }
 const timezoneEnabled=input.timezoneEnabled??(input.timezone!==undefined?!!timezone:previous.timezoneEnabled??!!timezone);const geolocationEnabled=input.geolocationEnabled??(explicitGeolocation?!!geolocation:previous.geolocationEnabled??!!geolocation);
 if(timezoneEnabled&&!timezone)throw Error('Indique um fuso horario para aplicar a alteracao.');if(geolocationEnabled&&!geolocation)throw Error('Indique latitude e longitude para aplicar a localizacao.');
 if(/[\r\n\0]/.test(String(input.userAgent||'')))throw new Error('User-Agent contém caracteres inválidos.');
 const startupMode=input.startupMode??previous.startupMode??'pages';
 if(!['blank','restore','pages'].includes(startupMode))throw Error('Modo de arranque invalido.');
 const startupInput=input.startupPages??previous.startupPages??[];
 const startupPages=(Array.isArray(startupInput)?startupInput:String(startupInput).split(/\r?\n/)).filter(v=>String(v).trim()).map(safeURL);
 if(startupPages.length>10)throw Error('Configure no maximo 10 paginas de arranque.');
 const proxy=proxyConfig(input.proxy??previous.proxy);
 const proxySecret=previous.proxy===proxy&&input.proxyPassword!==null?(previous.proxySecret??''):'';
 if(/^socks[45]:/.test(proxy)&&(input.proxyUser||input.proxyPassword||proxySecret))throw new Error('SOCKS5 com autenticação não é suportado pelo Chromium. Utilize um proxy HTTP.');
 const profile={id,name,engine,launchMode,startupMode,startupPages,lastTabs:previous.lastTabs??[],groups,group:groups[0]||'',notes:text(input.notes,2000),color:/^#[0-9a-f]{6}$/i.test(input.color)?input.color:'#7259f7',startURL:safeURL(input.startURL),locale,timezone,timezoneEnabled,geolocationEnabled,width,height,userAgent:text(input.userAgent??previous.userAgent,800),proxy,proxyUser:text(input.proxyUser??previous.proxyUser,200),proxySecret,geolocation,blockWebRTC:input.blockWebRTC===undefined?(previous.blockWebRTC??(launchMode!=='plain')):input.blockWebRTC!==false,privacy:Object.fromEntries(['canvas','webgl','audio','fonts','webrtc'].map(key=>[key,(input.privacy??previous.privacy??{})[key]===true])),emulateScreen:input.emulateScreen??previous.emulateScreen??false,pinned:previous.pinned??false,lastOpened:previous.lastOpened??null,useCount:previous.useCount??0,extensions:previous.extensions??[],createdAt:previous.createdAt??new Date().toISOString(),updatedAt:new Date().toISOString()};
 if(launchMode==='plain')assertPlainProfile({...profile,proxySecret:profile.proxySecret||input.proxySecret});
 return profile;
}
export function assertPlainProfile(profile){
 if(profile.launchMode!=='plain'||!['chrome','chromium','edge'].includes(profile.engine))throw Error('Selecione um navegador completo para o modo normal.');
 if(profile.proxyUser||profile.proxySecret||profile.proxyPassword)throw Error('O modo normal não suporta credenciais de proxy geridas pela aplicação.');
}

export class Store{
 constructor(directory){
  this.directory=directory;mkdirSync(directory,{recursive:true});this.file=join(directory,'workspace.json');
  this.state={schema:2,profiles:[],groups:['Personal','Work'],history:[],bookmarks:[],groupDetails:{},downloads:[],settings:{theme:'dark',language:DEFAULT_LANGUAGE,appearance:'classic'}};
  if(existsSync(this.file)){try{const value=JSON.parse(readFileSync(this.file,'utf8'));if(![1,2].includes(value.schema)||!Array.isArray(value.profiles))throw Error('Formato inválido');this.state={...this.state,...value};this.state.groupDetails??={};this.state.downloads??=[];}catch(e){throw new Error('Não foi possível ler workspace.json. O ficheiro foi preservado: '+e.message);}}
  // Legacy full profiles use normal browsing in a separate directory. Keep every
  // saved setting and the original managed data available when switching back.
  for(const profile of this.state.profiles)if(profile.launchMode===undefined)profile.launchMode=['chrome','chromium','edge'].includes(profile.engine)?'plain':'managed';
  this.state.schema=2;this.state.groups=groupNames(this.state.groups);ensureProfileGroups(this.state,this.state.profiles);
  this.state.settings={appearance:this.state.settings?.appearance==='modern'?'modern':'classic',theme:this.state.settings?.theme==='light'?'light':'dark',language:normalizeLanguage(this.state.settings?.language)};
 }
 save(){const temp=this.file+'.tmp';if(existsSync(this.file))copyFileSync(this.file,this.file+'.backup');writeFileSync(temp,JSON.stringify(this.state,null,2),{mode:0o600});renameSync(temp,this.file);}
 get(id){const p=this.state.profiles.find(p=>p.id===id);if(!p)throw Error('Perfil não encontrado.');return p;}
 upsert(input){const previous=input.id?this.get(input.id):{};const p=validateProfile(input,previous);const i=this.state.profiles.findIndex(x=>x.id===p.id);if(i<0)this.state.profiles.push(p);else this.state.profiles[i]=p;ensureProfileGroups(this.state,[p]);this.save();return p;}
 remove(id){this.get(id);this.state.profiles=this.state.profiles.filter(p=>p.id!==id);this.state.history=this.state.history.filter(p=>p.profileId!==id);this.state.bookmarks=this.state.bookmarks.filter(p=>p.profileId!==id);this.state.downloads=this.state.downloads.filter(p=>p.profileId!==id);this.save();}
 removeHistory(ids){
  if(!Array.isArray(ids)||ids.length>5000||ids.some(id=>typeof id!=='string'))throw Error('Selecao de historico invalida.');
  const selected=new Set(ids),known=new Set(this.state.history.map(h=>h.id));
  if([...selected].some(id=>!known.has(id)))throw Error('O historico mudou. Atualize a selecao.');
  const count=selected.size;if(count){this.state.history=this.state.history.filter(h=>!selected.has(h.id));this.save();}return count;
 }
 history(profileId,url,title){if(!/^https?:\/\//.test(url))return;const last=this.state.history.at(-1);if(last?.profileId===profileId&&last.url===url){last.title=text(title,300);last.at=new Date().toISOString();}else this.state.history.push({id:randomUUID(),profileId,url,title:text(title,300),at:new Date().toISOString()});this.state.history=this.state.history.slice(-5000);this.save();}
}
export function encryptBundle(value,password){
 if(typeof password!=='string'||password.length<12)throw Error('Utilize uma palavra-passe com pelo menos 12 caracteres.');
 const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(password,salt,32),cipher=createCipheriv('aes-256-gcm',key,iv);
 const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return JSON.stringify({format:'browserland-encrypted',version:1,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:bytes.toString('base64')});
}
export function decryptBundle(raw,password){
 if(Buffer.byteLength(raw)>30*1024*1024)throw Error('Ficheiro demasiado grande.');
 const b=JSON.parse(raw);if(!isBundleFormat(b.format,'encrypted')||b.version!==1)throw Error('Formato de partilha inválido.');
 const salt=Buffer.from(b.salt,'base64'),iv=Buffer.from(b.iv,'base64'),tag=Buffer.from(b.tag,'base64');
 if(salt.length!==16||iv.length!==12||tag.length!==16)throw Error('Ficheiro inválido.');
 try{const decipher=createDecipheriv('aes-256-gcm',scryptSync(password,salt,32),iv);decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(Buffer.from(b.data,'base64')),decipher.final()]).toString('utf8'));}catch{throw Error('Palavra-passe incorreta ou ficheiro alterado.');}
}
export function configurationBundle(profiles,groups=[]){return {format:'browserland-profiles',version:2,groups:validateGroupRecords(groups),profiles:profiles.map(({id,proxySecret,extensions,lastTabs,running,busy,hasProxyPassword,...p})=>({...p,groups:profileGroups(p),group:profileGroups(p)[0]||''}))};}
export function configurationInputs(bundle){
 if(isBundleFormat(bundle?.format,'profiles')&&[1,2].includes(bundle.version)&&Array.isArray(bundle.profiles))return bundle.profiles;
 if(isBundleFormat(bundle?.format,'session')&&[1,2].includes(bundle.version)&&Array.isArray(bundle.cookies))return [bundle.profile];
 throw Error('Ficheiro de importação inválido.');
}
export function importProfileConfiguration(input){
 const p=validateProfile({...input,id:undefined,latitude:input.geolocation?.latitude??input.latitude,longitude:input.geolocation?.longitude??input.longitude});
 if(input.pinned!==undefined){if(typeof input.pinned!=='boolean')throw Error('Fixação inválida.');p.pinned=input.pinned;}
 for(const key of ['createdAt','updatedAt','lastOpened'])if(input[key]!==undefined){const value=input[key];if(key==='lastOpened'&&value===null){p[key]=null;continue;}if(typeof value!=='string'||value.length>40||!Number.isFinite(Date.parse(value)))throw Error('Data inválida: '+key);p[key]=value;}
 if(input.useCount!==undefined){if(!Number.isSafeInteger(input.useCount)||input.useCount<0)throw Error('Contagem de aberturas inválida.');p.useCount=input.useCount;}
 if(input.geolocation?.accuracy!==undefined){const accuracy=Number(input.geolocation.accuracy);if(!Number.isFinite(accuracy)||accuracy<0)throw Error('Precisão da localização inválida.');if(p.geolocation)p.geolocation.accuracy=accuracy;}
 return p;
}
export function cookiePartitionKey(value){
 if(!value||typeof value!=='object'||typeof value.topLevelSite!=='string'||typeof value.hasCrossSiteAncestor!=='boolean')throw Error('Invalid cookie partition key.');
 const url=new URL(value.topLevelSite);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Invalid cookie partition site.');
 return {topLevelSite:url.origin,hasCrossSiteAncestor:value.hasCrossSiteAncestor};
}
export function cookieForImport(cookie,{partitioned=false}={}){
 if(cookie?.partitionKeyOpaque===true)throw Error('Opaque cookie partitions cannot be transferred.');
 if(cookie?.partitionKey!==undefined&&!partitioned)throw Error('Partitioned cookies require the full Chromium engine.');
 if(!cookie||typeof cookie.name!=='string'||typeof cookie.value!=='string'||typeof cookie.domain!=='string'||!cookie.domain||/[\s/\\]/.test(cookie.domain))throw Error('Cookie inválido.');
 const domain=cookie.domain.replace(/^\./,''),path=cookie.path??'/';
 if(/[?@#]/.test(domain)||(domain.includes(':')&&!/^\[[0-9a-f:.]+\]$/i.test(domain)))throw Error('Cookie domain must contain only a hostname.');
 if(!domain||domain.startsWith('.')||typeof path!=='string'||!path.startsWith('/')||/[\x00-\x1f\x7f]/.test(path))throw Error('Cookie path or domain invalid.');
 const url=new URL((cookie.secure?'https://':'http://')+domain);
 if(url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash)throw Error('Cookie domain must contain only a hostname.');
 url.pathname=path;
 const value={url:url.href,name:cookie.name,value:cookie.value,path,secure:!!cookie.secure,httpOnly:!!cookie.httpOnly};
 if(!cookie.hostOnly)value.domain=cookie.domain;
 if(['unspecified','no_restriction','lax','strict'].includes(cookie.sameSite))value.sameSite=cookie.sameSite;
 if(Number.isFinite(cookie.expirationDate))value.expirationDate=cookie.expirationDate;
 if(cookie.partitionKey!==undefined)value.partitionKey=cookiePartitionKey(cookie.partitionKey);
 return value;
}

export function startupURLs(profile){
 if(profile.startupMode==='blank')return ['about:blank'];
 const urls=profile.startupMode==='restore'&&profile.lastTabs?.length?profile.lastTabs:profile.startupPages?.length?profile.startupPages:[profile.startURL||'about:blank'];
 return urls.slice(0,30).map(safeURL);
}
export function clearPlan(input,now=Date.now()){
 const hours=Number(input.hours??0);if(![0,1,24,168,672].includes(hours))throw Error('Periodo invalido.');
 const dataTypes=[];if(input.siteData===true)dataTypes.push('cookies','localStorage','indexedDB','serviceWorkers','fileSystems','backgroundFetch','webSQL');if(input.cache===true)dataTypes.push('cache');
 if(!dataTypes.length&&input.history!==true)throw Error('Selecione os dados a limpar.');
 return {dataTypes,history:input.history===true,since:hours?now-hours*3600000:0};
}

export function matchesProxyAuthority(host,port,proxy){
 try{const url=new URL(proxy);if(!['http:','https:'].includes(url.protocol))return false;
  const normalize=value=>String(value).replace(/^\[|\]$/g,'').toLowerCase();
  const expected=Number(url.port||(url.protocol==='https:'?443:80));
  return normalize(host)===normalize(url.hostname)&&Number.isInteger(Number(port))&&Number(port)===expected;
 }catch{return false;}
}
