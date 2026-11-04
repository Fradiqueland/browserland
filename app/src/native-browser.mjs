import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,lstatSync,realpathSync,rmSync,readFileSync} from 'node:fs';
import {join,resolve,sep,dirname} from 'node:path';
import {nativeLaunchDirectory} from './native-path.mjs';
import {launchStandardBrowser,standardSessionActive,CLOSE_STANDARD} from './standard-browser.mjs';
import {CDPPipe} from './cdp-pipe.mjs';
import {bounded,until,settleOperations} from './operations.mjs';
import {safeURL,startupURLs,validateProfile,matchesProxyAuthority,cookiePartitionKey} from './core.mjs';
import {exportSiteStorage,importSiteStorage} from './site-storage.mjs';
import {languageSource,userAgentOverride,installWorkerUserAgent} from './identity.mjs';
import privacyPackage from './privacy.cjs';

export {discoverEngines as nativeEngines} from './platform.mjs';
import {discoverEngines as nativeEngines} from './platform.mjs';
const internalPages=new Set(['extensions','settings','history','downloads','bookmarks','version','settings/clearBrowserData']);
export function nativePage(engine,page){
 if(!internalPages.has(page))throw Error('Pagina interna nao autorizada.');
 return (engine==='edge'?'edge':'chrome')+'://'+page+'/';
}
export class NativeBrowsers {
 constructor({appRoot,dataRoot,headlessByDefault=false,decrypt=()=>'',changed=()=>{},history=()=>{},error=()=>{}}){
  Object.assign(this,{appRoot,dataRoot,headlessByDefault,decrypt,changed,history,error});this.records=new Map();this.opening=new Map();this.versions=new Map();
 }
 available(){return nativeEngines(this.appRoot).map(({id,name,path,manifestPath})=>{let details={};if(id==='chromium')try{const m=JSON.parse(readFileSync(manifestPath,'utf8').replace(/^\uFEFF/,''));details={version:m.version,revision:m.revision,automaticUpdates:false,channel:'snapshot'};}catch{}return {id,name,...details};});}
 has(id){return this.records.has(id)||this.opening.has(id)||standardSessionActive(this.dataRoot,id);}
 isStandard(id){return this.records.get(id)?.standard===true||standardSessionActive(this.dataRoot,id);}
 directory(profile){
  if(!/^[0-9a-f-]{36}$/i.test(profile.id))throw Error('Identificador de perfil invalido.');
  if(!['chromium','chrome','edge'].includes(profile.engine))throw Error('Motor Chromium invalido.');
  return join(resolve(this.dataRoot),'native-profiles',profile.id,profile.engine+(profile.launchMode==='plain'?'-normal':''));
 }
 open(profile,options={}){
  if(this.opening.has(profile.id))return this.opening.get(profile.id);
  if(this.records.has(profile.id)){const record=this.records.get(profile.id);if(record.closing)return Promise.reject(Error('Aguarde o fecho deste perfil antes de o abrir.'));return Promise.resolve(record);}
  if(standardSessionActive(this.dataRoot,profile.id))return Promise.reject(Error(CLOSE_STANDARD));
  const promise=this.launch(profile,options);this.opening.set(profile.id,promise);
  return promise.finally(()=>this.opening.delete(profile.id));
 }
 async launch(profile,{headless=this.headlessByDefault,urls=startupURLs(profile),standard=false}={}){
  const engine=nativeEngines(this.appRoot).find(e=>e.id===profile.engine);
  if(!engine)throw Error('Motor '+profile.engine+' indisponivel neste computador.');
  const directory=this.directory(profile);mkdirSync(directory,{recursive:true});
  if(standard||profile.launchMode==='plain'){
   const record=await launchStandardBrowser({profile,engine,directory,launchDirectory:profile.launchMode==='plain'?directory:nativeLaunchDirectory(directory),dataRoot:this.dataRoot,onExit:(closed,result)=>{if(this.records.get(profile.id)===closed)this.records.delete(profile.id);if(result.error)this.error(result.error);this.changed();}});
   if(record.child.exitCode!==null)throw Error('Normal browser did not stay open.');
   this.records.set(profile.id,record);this.changed();return record;
  }
  const args=['--user-data-dir='+nativeLaunchDirectory(directory),'--remote-debugging-pipe','--no-startup-window','--no-first-run','--no-default-browser-check','--disable-background-mode','--window-size='+profile.width+','+profile.height,'--lang='+profile.locale,'--accept-lang='+profile.locale];
  if(profile.userAgent)args.push('--user-agent='+profile.userAgent);
  if(headless)args.push('--headless=new');
  if(profile.proxy)args.push('--proxy-server='+profile.proxy,'--proxy-bypass-list=<-loopback>');
  else args.push('--no-proxy-server');
  if(profile.blockWebRTC)args.push('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
  // No arbitrary flags, credentials, debugging ports or personal Chrome directories.
  const child=spawn(engine.path,args,{windowsHide:headless,stdio:['ignore','ignore','pipe','pipe','pipe']});
  child.stderr.resume();
  const record={profile,engine,child,directory,targets:new Map(),sessions:new Map(),ready:false,closing:null};
  record.exited=new Promise(resolveExit=>{child.once('exit',(code,signal)=>resolveExit({code,signal}));child.once('error',error=>resolveExit({error}));});
  record.cdp=new CDPPipe(child);
  this.records.set(profile.id,record);
  record.exited.then(()=>{for(const pending of record.workerPauses?.values()||[])pending.reject(Error('Worker browser closed.'));record.workerPauses?.clear();clearTimeout(record.lastWindowTimer);record.cdp.finish();this.records.delete(profile.id);this.changed();});
  record.cdp.on('event',message=>this.event(record,message));
  try{
   record.version=await record.cdp.send('Browser.getVersion');this.versions.set(profile.engine,record.version.product);
   await record.cdp.send('Target.setDiscoverTargets',{discover:true});
   // Service workers belong to the browser: attach here only, never again
   // through the page session, which would pause the same target twice.
   await record.cdp.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'tab'},{type:'worker'},{type:'shared_worker'},{type:'service_worker'},{exclude:true}]});
   for(const url of urls.length?urls:['about:blank'])await this.navigateRecord(record,safeURL(url));
   record.ready=true;this.changed();return record;
  }catch(error){
   try{await this.closeRecord(record);}catch{if(child.exitCode===null)child.kill();await bounded(record.exited,'terminar Chromium que falhou no arranque',5000).catch(()=>{});}
   throw error;
  }
 }
 event(record,{method,params,sessionId}){
  if(method==='Debugger.paused'&&record.workerPauses?.has(sessionId)){record.workerPauses.get(sessionId).resolve(params);record.workerPauses.delete(sessionId);}
  if(method==='Target.attachedToTarget'){
   const {targetInfo,sessionId:attached}=params;
   if(!['tab','page','iframe','worker','shared_worker','service_worker'].includes(targetInfo.type))return;
   record.targets.set(targetInfo.targetId,{...targetInfo,sessionId:attached});
   const setup=['worker','shared_worker','service_worker'].includes(targetInfo.type)?this.configureWorker(record,attached,targetInfo):this.configure(record,attached,targetInfo);
   record.sessions.set(attached,setup);
   setup.catch(error=>{if(record.closing||!record.targets.has(targetInfo.targetId))return;this.error(error);this.stop(record.profile.id).catch(this.error);});
  }
  if(method==='Target.detachedFromTarget'){
   record.workerPauses?.get(params.sessionId)?.reject(Error('Worker detached before initialization.'));record.workerPauses?.delete(params.sessionId);
   record.sessions.delete(params.sessionId);
   for(const [id,target] of record.targets)if(target.sessionId===params.sessionId)record.targets.delete(id);
  }
  if(method==='Target.targetInfoChanged'){
   const info=params.targetInfo,target=record.targets.get(info.targetId);
   if(target){Object.assign(target,info);this.remember(record);if(info.type==='page'&&/^https?:/.test(info.url))this.history(record.profile.id,info.url,info.title);}
  }
  if(method==='Target.targetDestroyed'){
   const target=record.targets.get(params.targetId);if(target){record.workerPauses?.get(target.sessionId)?.reject(Error('Worker destroyed before initialization.'));record.workerPauses?.delete(target.sessionId);record.sessions.delete(target.sessionId);}record.targets.delete(params.targetId);this.remember(record);
   if(record.ready&&!record.closing){clearTimeout(record.lastWindowTimer);record.lastWindowTimer=setTimeout(async()=>{try{const {targetInfos}=await record.cdp.send('Target.getTargets');if(!targetInfos.some(t=>t.type==='page'))await this.stop(record.profile.id);}catch{}},200);}
  }
  if(method==='Fetch.requestPaused')record.cdp.send('Fetch.continueRequest',{requestId:params.requestId},sessionId).catch(this.error);
  if(method==='Fetch.authRequired'){
   const p=record.profile,auth=params.authChallenge;
   let response={response:'Default'};
   if(auth.source==='Proxy'){
    let valid=false;try{const observed=new URL(auth.origin);valid=matchesProxyAuthority(observed.hostname,observed.port||(observed.protocol==='https:'?443:80),p.proxy);}catch{}
    record.authAttempts??=new Set();
    if(valid&&p.proxyUser&&p.proxySecret&&!record.authAttempts.has(params.requestId)){
     record.authAttempts.add(params.requestId);try{response={response:'ProvideCredentials',username:p.proxyUser,password:this.decrypt(p.proxySecret)};}catch{response={response:'CancelAuth'};this.error(Error('Nao foi possivel desencriptar a credencial do proxy.'));}
    }else response={response:'CancelAuth'};
   }
   record.cdp.send('Fetch.continueWithAuth',{requestId:params.requestId,authChallengeResponse:response},sessionId).catch(this.error);
  }
 }
 remember(record){
  const urls=[...record.targets.values()].filter(t=>t.type==='page').map(t=>t.url).filter(url=>url==='about:blank'||/^https?:/.test(url)).slice(0,30);
  if(urls.length)record.profile.lastTabs=urls;
 }
 async configureWorker(record,sessionId,target){
  const send=(method,params={})=>record.cdp.send(method,params,sessionId),p=record.profile;
  if(/^(?:blob:)?(?:chrome(?:-extension|-untrusted)?|edge|devtools):/i.test(target.url)||(target.url&&!/^(https?|blob|data):/i.test(target.url))){await send('Runtime.runIfWaitingForDebugger');return;}
  await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'worker'},{exclude:true}]});
  await send('Debugger.enable');
  const {breakpointId}=await send('Debugger.setInstrumentationBreakpoint',{instrumentation:'beforeScriptExecution'});
  record.workerPauses??=new Map();let resolvePause,rejectPause;const paused=new Promise((resolve,reject)=>{resolvePause=resolve;rejectPause=reject;});paused.catch(()=>{});record.workerPauses.set(sessionId,{resolve:resolvePause,reject:rejectPause});
  try{
   await send('Runtime.runIfWaitingForDebugger');
   const pause=await bounded(paused,'preparar primeiro script do worker',15000),frame=pause.callFrames?.[0]?.callFrameId;
   if(!frame)throw Error('Worker initial script frame unavailable.');
   const globalObject=pause.callFrames[0].scopeChain.find(scope=>scope.type==='global')?.object?.objectId;
   if(!globalObject)throw Error('Worker global scope unavailable.');
   const invoke=async(functionDeclaration,args=[])=>{const result=await send('Runtime.callFunctionOn',{objectId:globalObject,functionDeclaration,arguments:args.map(value=>({value})),returnByValue:true});if(result.exceptionDetails)throw Error('Worker profile controls failed: '+result.exceptionDetails.text);return result.result?.value;};
   const current=await invoke('function(locale){return {protocol:this.location.protocol,locale:this.Intl.DateTimeFormat().resolvedOptions().locale,expectedLocale:this.Intl.DateTimeFormat(locale).resolvedOptions().locale,zone:this.Intl.DateTimeFormat().resolvedOptions().timeZone,userAgent:this.navigator.userAgent}}',[p.locale]);
   if(['http:','https:','blob:','data:'].includes(current.protocol)){
    if(current.locale!==current.expectedLocale)await send('Emulation.setLocaleOverride',{locale:p.locale});
    if(p.timezone&&p.timezoneEnabled!==false&&current.zone!==p.timezone)await send('Emulation.setTimezoneOverride',{timezoneId:p.timezone});
    if(p.userAgent)await send('Emulation.setUserAgentOverride',userAgentOverride(p.userAgent,p.locale));
    const source=languageSource(p.locale)+(Object.values(p.privacy||{}).some(Boolean)?'('+privacyPackage.installPrivacy.toString()+')('+JSON.stringify(p.privacy)+');':'');
    await invoke('function(){const globalThis=this;const {Object,Intl,navigator,location,DOMException,Promise}=this;'+source+(p.userAgent?'('+installWorkerUserAgent.toString()+')('+JSON.stringify(userAgentOverride(p.userAgent,p.locale))+');':'')+'}');
   }
   await send('Debugger.removeBreakpoint',{breakpointId});await send('Debugger.resume');await send('Debugger.disable');
  }finally{record.workerPauses.delete(sessionId);}
 }
 async configure(record,sessionId,target){
  const send=(method,params={})=>record.cdp.send(method,params,sessionId),p=record.profile;
  if(target.type==='tab'){
   // A download popup can have a tab without a JavaScript renderer. Release
   // its navigation only after arranging a separate, paused page attachment.
   // Real documents still receive every profile control before their scripts.
   await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'page'},{exclude:true}]});
   await send('Runtime.runIfWaitingForDebugger');return;
  }
  const {id:isolateId}=await send('Runtime.getIsolateId');
  record.isolateOverrides??=new Map();
  if(!record.isolateOverrides.has(isolateId))record.isolateOverrides.set(isolateId,new Map());
  const applied=record.isolateOverrides.get(isolateId);
  const override=async(method,params)=>{
   const key=JSON.stringify(params),existing=applied.get(method);
   if(existing){if(existing.key!==key)throw Error('Conflicting profile parameters in shared renderer.');await existing.pending;return;}
   const entry={key,pending:send(method,params)};applied.set(method,entry);
   try{await entry.pending;}catch(error){if(applied.get(method)===entry)applied.delete(method);throw error;}
  };
  // Prepare every tab for later web navigation; the document script excludes native origins.
  {
   await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'iframe'},{type:'worker'},{type:'shared_worker'},{exclude:true}]});
   await send('Page.enable');await send('Network.enable');
   await send('Network.setExtraHTTPHeaders',{headers:{'Accept-Language':p.locale}});
   await override('Emulation.setLocaleOverride',{locale:p.locale});
   if(p.userAgent)await send('Emulation.setUserAgentOverride',userAgentOverride(p.userAgent,p.locale));
   if(p.timezone&&p.timezoneEnabled!==false)await override('Emulation.setTimezoneOverride',{timezoneId:p.timezone});
   if(p.geolocation&&p.geolocationEnabled!==false)await send('Emulation.setGeolocationOverride',p.geolocation);
   if(p.emulateScreen&&target.type!=='iframe')await send('Emulation.setDeviceMetricsOverride',{width:p.width,height:p.height,deviceScaleFactor:1,mobile:false,screenWidth:p.width,screenHeight:p.height});
   const source=languageSource(p.locale)+(Object.values(p.privacy||{}).some(Boolean)?'('+privacyPackage.installPrivacy.toString()+')('+JSON.stringify(p.privacy)+');':'');
   await send('Page.addScriptToEvaluateOnNewDocument',{source:'if (["http:","https:","about:","blob:","data:"].includes(location.protocol)) {'+source+'}',runImmediately:true});
   if(p.proxyUser&&p.proxySecret)await send('Fetch.enable',{handleAuthRequests:true});
  }
  await send('Runtime.runIfWaitingForDebugger');
 }
 async navigateRecord(record,url){
  if(record.standard)throw Error('Utilize a barra de endereços e os menus da janela do navegador normal.');
  const {targetId}=await record.cdp.send('Target.createTarget',{url:'about:blank',newWindow:![...record.targets.values()].some(t=>t.type==='page')});
  const sessionId=await until(()=>{if(record.cdp.closed)throw Error('Chromium fechou durante o arranque do separador.');return record.targets.get(targetId)?.sessionId;},'preparar separador Chromium',15000);
  await record.sessions.get(sessionId);
  if(record.profile.geolocation&&record.profile.geolocationEnabled!==false&&/^https?:/.test(url))await record.cdp.send('Browser.grantPermissions',{origin:new URL(url).origin,permissions:['geolocation']});
  const result=await record.cdp.send('Page.navigate',{url},sessionId);
  if(result.errorText){
   const target=record.targets.get(targetId);
   if(!target||record.closing||record.cdp.closed)throw Error('Navegacao Chromium: '+result.errorText);
   target.navigationError=result.errorText;
   // Network failures belong to the page. Configuration/protocol failures still reject startup.
   if(result.errorText!=='net::ERR_ABORTED')this.error(Error('Navegacao Chromium: '+result.errorText));
  }
  return {targetId,sessionId,...(result.errorText?{navigationError:result.errorText}:{})};
 }
 async navigate(profile,url){if(profile.launchMode==='plain')throw Error('Utilize a barra de endereços e os menus da janela do navegador normal.');const record=await this.open(profile);return this.navigateRecord(record,safeURL(url));}
 async page(profile,page){if(profile.launchMode==='plain')throw Error('Utilize a barra de endereços e os menus da janela do navegador normal.');const record=await this.open(profile);return this.navigateRecord(record,nativePage(profile.engine,page));}
 async extensionStore(profile){if(profile.launchMode==='plain')throw Error('Utilize a barra de endereços e os menus da janela do navegador normal.');const record=await this.open(profile);return this.navigateRecord(record,profile.engine==='edge'?'https://microsoftedge.microsoft.com/addons/':'https://chromewebstore.google.com/');}
 async stop(id){
  if(this.opening.has(id))await this.opening.get(id).catch(()=>{});
  const record=this.records.get(id);if(!record){if(standardSessionActive(this.dataRoot,id))throw Error(CLOSE_STANDARD);return;}
  return this.closeRecord(record);
 }
 async closeRecord(record){
  if(record.standard)throw Error(CLOSE_STANDARD);
  if(record.closing)return record.closing;
  record.closing=(async()=>{
   this.remember(record);
   try{await record.cdp.send('Browser.close');}catch(error){if(!record.cdp.closed)throw error;}
   record.cdp.finish();
   const result=await bounded(record.exited,'fechar Chromium e guardar o perfil',45000);
   if(result.error)throw result.error;
   if(result.code!==0)throw Error('Chromium terminou com codigo '+result.code+'.');
  })();
  try{await record.closing;}catch(error){record.closing=null;throw error;}
 }
 async stopAll(){const ids=new Set([...this.records.keys(),...this.opening.keys()]);await settleOperations([...ids].map(id=>()=>this.stop(id)),'Fechar motores Chromium');}
 async use(profile,callback){
  if(profile.launchMode==='plain')throw Error('Neste perfil, utilize os menus do navegador para gerir cookies e sessões.');
  if(this.has(profile.id))throw Error('Feche o perfil antes de alterar os dados.');
  const record=await this.open({...profile},{headless:true,urls:['about:blank']});
  try{return await callback(record);}finally{await this.stop(profile.id);}
 }
 async engineVersion(engine){
  if(this.versions.has(engine))return this.versions.get(engine);
  const probe=validateProfile({name:'Verificacao do motor',engine,startupMode:'blank'});
  try{return await this.use(probe,r=>r.version.product);}finally{this.removeData(probe);}
 }
 async exportStorage(profile){if(profile.launchMode==='plain')throw Error('Neste perfil, utilize os menus do navegador para gerir cookies e sessões.');if(this.has(profile.id))throw Error('Feche o perfil antes de partilhar a sessao.');return exportSiteStorage(this.directory(profile),profile.engine);}
 async importStorage(profile,snapshot){if(profile.launchMode==='plain')throw Error('Neste perfil, utilize os menus do navegador para gerir cookies e sessões.');if(this.has(profile.id))throw Error('Feche o perfil antes de importar dados.');return importSiteStorage(this.directory(profile),snapshot,profile.engine,await this.engineVersion(profile.engine));}
 async cookies(profile){
  return this.use(profile,async record=>{
   const {cookies}=await record.cdp.send('Storage.getCookies');
   if(cookies.some(c=>c.partitionKeyOpaque))throw Error('Opaque cookie partitions cannot be transferred.');
   return cookies.map(c=>({...(c.partitionKey?{partitionKey:cookiePartitionKey(c.partitionKey)}:{}),name:c.name,value:c.value,domain:c.domain,hostOnly:!c.domain.startsWith('.'),path:c.path,secure:c.secure,httpOnly:c.httpOnly,expirationDate:c.expires>0?c.expires:undefined,sameSite:({Strict:'strict',Lax:'lax',None:'no_restriction'})[c.sameSite]}));
  });
 }
 async importCookies(profile,cookies){
  return this.use(profile,record=>record.cdp.send('Storage.setCookies',{cookies:cookies.map(c=>({...(c.partitionKey?{partitionKey:cookiePartitionKey(c.partitionKey)}:{}),name:c.name,value:c.value,url:c.url,domain:c.domain,path:c.path,secure:c.secure,httpOnly:c.httpOnly,...(c.expirationDate?{expires:c.expirationDate}:{}),...(c.sameSite?{sameSite:({strict:'Strict',lax:'Lax',no_restriction:'None',unspecified:undefined})[c.sameSite]}:{})}))}));
 }
 removeData(profile){
  if(this.has(profile.id))throw Error('Feche o perfil antes de eliminar os dados.');
  const base=resolve(this.dataRoot,'native-profiles'),target=resolve(base,profile.id);
  if(!/^[0-9a-f-]{36}$/i.test(profile.id)||!target.startsWith(base+sep))throw Error('Caminho de perfil invalido.');
  if(!existsSync(target))return;
  if(lstatSync(target).isSymbolicLink()||!realpathSync(target).startsWith(realpathSync(base)+sep))throw Error('Caminho de perfil externo recusado.');
  rmSync(target,{recursive:true,force:false,maxRetries:3,retryDelay:200});
 }
}
