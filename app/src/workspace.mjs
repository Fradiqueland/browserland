import {isBundleFormat} from './branding.mjs';
import {profileGroups,setProfileGroups,validateGroupRecords,groupNames} from './groups.mjs';
import {validateProfile,importProfileConfiguration,text} from './core.mjs';
const csvSecrets=new WeakMap();
export function takeCSVPassword(profile){const value=csvSecrets.get(profile);csvSecrets.delete(profile);return value;}
export function proxyInput(raw){
 let value=String(raw||'').trim(),username='',password='';
 if(!value)return {proxy:'',username,password};
 if(!/^[a-z]+:\/\//i.test(value)){
  const parts=value.split(':');
  if(!value.includes('@')&&parts.length>=4&&!value.startsWith('[')){username=parts[2];password=parts.slice(3).join(':');value=parts[0]+':'+parts[1];}
  value='http://'+value;
 }
 const url=new URL(value);
 if(url.username||url.password){username=decodeURIComponent(url.username);password=decodeURIComponent(url.password);}
 url.username='';url.password='';
 return {proxy:url.href,username,password};
}
export const CSV_FIELDS=['name','description','group','proxy','locale','userAgent','timeZone','width','height','latitude','longitude','disableWebrtc','disableCanvas','disableWebGL','blockFont','disableAudioContext','changeResolution','disableWebRTC','startURL','color','startupMode','startupPages','engine','applyTimeZone','disableGeoLocation','fileFormat','recordType','groups','proxyUser','pinned','createdAt','updatedAt','lastOpened','useCount','geolocationAccuracy','launchMode'];
export function parseCSV(source){
 if(typeof source!=='string'||source.length>10*1024*1024)throw Error('CSV demasiado grande.');
 const rows=[];let row=[],field='',quoted=false,afterQuote=false;
 source=source.replace(/^\uFEFF/,'');
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(quoted){if(c==='"'){if(source[i+1]==='"'){field+='"';i++;}else{quoted=false;afterQuote=true;}}else field+=c;continue;}
  if(c==='"'&&!field&&!afterQuote){quoted=true;continue;}
  if(c===','){row.push(field);field='';afterQuote=false;}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&source[i+1]==='\n')i++;row.push(field);if(row.some(x=>x!==''))rows.push(row);row=[];field='';afterQuote=false;}
  else{if(afterQuote&&!/\s/.test(c))throw Error('CSV: texto inesperado depois de aspas.');if(!afterQuote)field+=c;}
 }
 if(quoted)throw Error('CSV: aspas por fechar.');
 row.push(field);if(row.some(x=>x!==''))rows.push(row);
 if(!rows.length)throw Error('CSV vazio. Utilize o modelo para criar o ficheiro.');
 if(rows.length>2001)throw Error('Limite de 1000 perfis e 1000 grupos por ficheiro.');
 const headers=rows.shift().map(h=>h.trim());if(new Set(headers).size!==headers.length)throw Error('CSV com colunas repetidas.');
 for(const key of new Set(headers.map(h=>h.toLowerCase()))){
  const same=headers.filter(h=>h.toLowerCase()===key);
  if(same.length>1&&!(same.length===2&&same.includes('disableWebrtc')&&same.includes('disableWebRTC')))throw Error('CSV com colunas repetidas.');
 }
 if(!headers.some(h=>['name','nome'].includes(h.toLowerCase())))throw Error('CSV sem coluna name.');
 return rows.map((values,index)=>{if(values.length!==headers.length)throw Error('CSV: número de colunas incorreto na linha '+(index+2));return Object.fromEntries(headers.map((h,i)=>[h,values[i]]));});
}
function bool(value){return ['true','1','yes','sim','on'].includes(String(value).toLowerCase());}
const CSV_FORMAT='browserland-csv/2';
function ownCSV(row){return isBundleFormat(row.fileFormat,'csv/2');}
function decodeCSV(row){return ownCSV(row)?Object.fromEntries(Object.entries(row).map(([key,value])=>[key,/^'(?:'|[\s]*[=+@-])/.test(value)?value.slice(1):value])):row;}
export function csvProfile(row){
 const own=ownCSV(row);row=decodeCSV(row);
 const r=Object.fromEntries(Object.entries(row).map(([k,v])=>[k.toLowerCase(),v]));
const connection=proxyInput(r.proxy);
 const timezone=(r.timezone||'').match(/\(([^()]*)\)$/)?.[1]||r.timezone||'';
 const original=r.applytimezone!==undefined;
 const profile=validateProfile({name:r.name||r.nome,engine:r.engine||'embedded',launchMode:r.launchmode||'managed',notes:r.description||r.notes||'',group:r.group||r.groupname||'',...(r.groups?{groups:JSON.parse(r.groups)}:{}),proxy:connection.proxy,proxyUser:own?r.proxyuser||'':connection.username,locale:r.locale||'pt-PT',userAgent:r.useragent||'',timezone,timezoneEnabled:original?bool(r.applytimezone):!!timezone,geolocationEnabled:r.disablegeolocation===undefined?!!(r.latitude||r.longitude):bool(r.disablegeolocation),width:r.width||r.resolutionwidth||1280,height:r.height||r.resolutionheight||800,latitude:r.latitude||'',longitude:r.longitude||'',blockWebRTC:row.disableWebrtc===undefined?r.launchmode!=='plain':bool(row.disableWebrtc),privacy:{canvas:bool(r.disablecanvas),webgl:bool(r.disablewebgl),fonts:bool(r.blockfont),audio:bool(r.disableaudiocontext),webrtc:bool(row.disableWebRTC??r.blockwebrtc)},emulateScreen:bool(r.changeresolution),startURL:r.starturl,color:r.color,startupMode:r.startupmode||'pages',startupPages:r.startuppages||[]});
 if(own){const metadata={...profile,pinned:bool(r.pinned),lastOpened:r.lastopened||null,useCount:r.usecount===''?0:Number(r.usecount)};for(const key of ['createdAt','updatedAt'])if(r[key.toLowerCase()])metadata[key]=r[key.toLowerCase()];if(profile.geolocation&&r.geolocationaccuracy!=='')metadata.geolocation={...profile.geolocation,accuracy:Number(r.geolocationaccuracy)};Object.assign(profile,importProfileConfiguration(metadata),{id:profile.id});}
 if(connection.password)csvSecrets.set(profile,connection.password);return profile;
}
export function csvText(profiles,groups=[]){
 const quote=v=>{let s=String(v??'');if(/^(?:'|[\s]*[=+@-])/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const rows=profiles.map(p=>[p.name,p.notes,profileGroups(p)[0]||'',p.proxy,p.locale,p.userAgent,p.timezone,p.width,p.height,p.geolocation?.latitude??'',p.geolocation?.longitude??'',p.blockWebRTC,p.privacy?.canvas??false,p.privacy?.webgl??false,p.privacy?.fonts??false,p.privacy?.audio??false,p.emulateScreen??false,p.privacy?.webrtc??false,p.startURL,p.color,p.startupMode??'pages',(p.startupPages||[]).join('\n'),p.engine||'embedded',p.timezoneEnabled??!!p.timezone,p.geolocationEnabled??!!p.geolocation,CSV_FORMAT,'profile',JSON.stringify(profileGroups(p)),p.proxyUser||'',p.pinned??false,p.createdAt,p.updatedAt,p.lastOpened,p.useCount??0,p.geolocation?.accuracy??'',p.launchMode||'managed']);
 for(const group of validateGroupRecords(groups)){const row={name:group.name,description:group.description,fileFormat:CSV_FORMAT,recordType:'group'};rows.push(CSV_FIELDS.map(key=>row[key]??''));}
 return '\uFEFF'+[CSV_FIELDS,...rows].map(row=>row.map(quote).join(',')).join('\r\n');
}
export function csvImport(source){
 const profiles=[],groups=[];
 for(const raw of parseCSV(source)){
  if(raw.fileFormat&&!ownCSV(raw))throw Error('Versão CSV não suportada.');
  if(ownCSV(raw)){const row=decodeCSV(raw);if(row.recordType==='group'){groups.push({name:row.name,description:row.description});continue;}if(row.recordType!=='profile')throw Error('Tipo de registo CSV inválido.');}
  profiles.push(csvProfile(raw));
 }
 if(profiles.length>1000)throw Error('Limite de 1000 perfis por ficheiro.');return {profiles,groups:validateGroupRecords(groups)};
}
export function selectedProfiles(store,ids){
 if(ids===undefined)return [...store.state.profiles];
 if(!Array.isArray(ids)||!ids.length||ids.length>1000||new Set(ids).size!==ids.length)throw Error('Seleção de perfis inválida.');
 return ids.map(id=>store.get(id));
}
export function saveGroup(store,input){
 const previous=input.previous?text(input.previous,60):'',name=groupNames([String(input.name??'')])[0]||'',description=text(input.description,1000);
 if(!name)throw Error('Indique o nome do grupo.');
 if(previous&&!store.state.groups.includes(previous))throw Error('Grupo não encontrado.');
 if(name!==previous&&store.state.groups.includes(name))throw Error('Já existe um grupo com esse nome.');
 if(previous){store.state.groups=store.state.groups.map(g=>g===previous?name:g);for(const p of store.state.profiles)setProfileGroups(p,profileGroups(p).map(group=>group===previous?name:group));}
 else store.state.groups.push(name);
 store.state.groupDetails??={};if(previous&&previous!==name)delete store.state.groupDetails[previous];Object.defineProperty(store.state.groupDetails,name,{value:{description},enumerable:true,writable:true,configurable:true});
 return name;
}
