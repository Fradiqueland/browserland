import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {NativeBrowsers} from '../src/native-browser.mjs';
import {validateProfile,cookieForImport} from '../src/core.mjs';
import {bounded,closeHTTPServer,until} from '../src/operations.mjs';
const appRoot=resolve(import.meta.dirname,'..'),dataRoot=(process.env.BROWSERLAND_DATA||process.env.MULTIBROWSER_DATA)?resolve((process.env.BROWSERLAND_DATA||process.env.MULTIBROWSER_DATA)):mkdtempSync(join(appRoot,'test-results','native-suite-'));
mkdirSync(dataRoot,{recursive:true});
const checks=[],errors=[];
const pass=(name,ok)=>{assert.ok(ok,name);checks.push({name,ok:true});console.log('PASS Chromium: '+name);};
const manager=new NativeBrowsers({appRoot,dataRoot,decrypt:()=> 'password-local',error:e=>errors.push(e.message)});
const requestedEngine=process.argv.find(a=>a.startsWith('--engine='))?.slice(9);
const engine=requestedEngine?manager.available().find(e=>e.id===requestedEngine):manager.available().find(e=>e.id==='chromium')||manager.available().find(e=>e.id==='chrome')||manager.available()[0];
if(!engine)throw Error('Instale Chrome/Edge ou coloque Chromium portable em .runtime/chromium.');
const workerProbeSource="const snapshot=(()=>{let blocked=false;try{new OffscreenCanvas(1,1).getContext('2d').getImageData(0,0,1,1)}catch{blocked=true}return {blocked,language:navigator.language,languages:[...navigator.languages],zone:Intl.DateTimeFormat().resolvedOptions().timeZone,userAgent:navigator.userAgent,requestUA:typeof requestedUA==='undefined'?null:requestedUA,metadata:navigator.userAgentData?.toJSON()}})();const result=()=>navigator.userAgentData?.getHighEntropyValues(['fullVersionList','architecture']).then(entropy=>({...snapshot,entropy}))||Promise.resolve(snapshot);if('onconnect' in self)self.onconnect=e=>{const port=e.ports[0];port.onmessage=()=>close();result().then(v=>port.postMessage(v))};else result().then(v=>postMessage(v));";
const server=createServer((req,res)=>{if(req.url.startsWith('/worker-parent.js')){res.setHeader('Content-Type','text/javascript');res.end("const child=new Worker('/worker-probe.js');child.onmessage=e=>{postMessage(e.data);child.terminate()}");return;}if(req.url.startsWith('/worker-probe.js')){res.setHeader('Content-Type','text/javascript');const shadowed=req.url.includes('shadow=1');const source=shadowed?'const navigator=null,Intl=null,Object=null,location=null,DOMException=null,Promise=null,globalThis=null;'+workerProbeSource.replace(/\b(navigator|Intl|Promise)\b/g,'self.$1'):workerProbeSource;res.end('const requestedUA='+JSON.stringify(req.headers['user-agent'])+';'+source);return;}if(req.url.startsWith('/frame-probe?')){res.setHeader('Content-Type','text/html');const parsed=new URL(req.url,'http://fixture.test'),payload=parsed.searchParams.get('html');res.end(parsed.searchParams.has('nested')?'<script>addEventListener("message",e=>parent.postMessage(e.data,"*"))</script><iframe src="http://127.0.0.1:'+server.address().port+'/frame-probe?html='+encodeURIComponent(payload)+'"></iframe>':payload);return;}if(req.url==='/disconnect'){req.socket.destroy();return;}if(req.url==='/no-content'){res.writeHead(204);res.end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>Chromium local</title><h1>Teste</h1><script>window.firstIdentity={language:navigator.language,zone:Intl.DateTimeFormat().resolvedOptions().timeZone,canvas:(()=>{try{document.createElement("canvas").toDataURL();return false}catch{return true}})()};window.receivedHeaders='+JSON.stringify(req.headers)+'</script>');});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const url='http://127.0.0.1:'+server.address().port+'/';
let proxy;
const evaluate=async(record,expression)=>{
 const target=[...record.targets.values()].find(t=>t.type==='page'&&t.url.startsWith(url))||[...record.targets.values()].find(t=>t.type==='page');
 const result=await record.cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},target.sessionId);
 if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
 return result.result.value;
};
const wait=predicate=>until(predicate,'verificar documento Chromium',15000);
let report;
try{
 const a=validateProfile({name:'A',locale:'pt-PT',timezone:'Asia/Tokyo',startupPages:[url],privacy:{canvas:true,webgl:true,audio:true,webrtc:true},emulateScreen:true}),b=validateProfile({name:'B',locale:'en-US',timezone:'America/New_York',startupPages:[url]});
 a.engine=b.engine=engine.id;a.userAgent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
 const ra=await manager.open(a,{headless:true}),rb=await manager.open(b,{headless:true});
 await wait(async()=>await evaluate(ra,"document.querySelector('h1')?.textContent==='Teste'")&&await evaluate(rb,"document.querySelector('h1')?.textContent==='Teste'"));
 pass('Motor Chromium completo responde por pipe privado',/Chrome|Chromium|Edg/.test(ra.version.product)&&!ra.child.spawnargs.some(a=>a.startsWith('--remote-debugging-port')));
 pass('Cada perfil usa uma pasta propria',ra.directory!==rb.directory&&ra.directory.includes(a.id));
 pass('Idioma de APIs, Intl e HTTP corresponde ao perfil',await evaluate(ra,"navigator.language==='pt-PT'&&navigator.languages[0]==='pt-PT'&&Intl.DateTimeFormat().resolvedOptions().locale==='pt-PT'&&receivedHeaders['accept-language'].startsWith('pt-PT')"));
 pass('Fusos independentes',await evaluate(ra,"Intl.DateTimeFormat().resolvedOptions().timeZone==='Asia/Tokyo'")&&await evaluate(rb,"Intl.DateTimeFormat().resolvedOptions().timeZone==='America/New_York'"));
 pass('Paginas nativas sem Node ou ponte do gestor',await evaluate(ra,"typeof require==='undefined'&&typeof window.desktop==='undefined'"));
 pass('Resolucao e privacidade aplicadas antes da pagina',await evaluate(ra,"(()=>{let blocked=false;try{document.createElement('canvas').toDataURL()}catch{blocked=true}return blocked&&document.createElement('canvas').getContext('webgl')===null&&screen.width===1280&&screen.height===800})()"));
 pass('Perfil normal conserva as APIs Chromium',await evaluate(rb,"document.createElement('canvas').toDataURL().startsWith('data:')&&typeof RTCPeerConnection==='function'"));
 for(const mode of ['dedicated','shared','blob','nested','module','shadowed']){
  const expression="new Promise((resolve,reject)=>{let objectURL;const worker="+(mode==='shared'?"new SharedWorker('/worker-probe.js?'+Math.random())":mode==='shadowed'?"new Worker('/worker-probe.js?shadow=1')":mode==='module'?"new Worker('/worker-probe.js',{type:'module'})":mode==='nested'?"new Worker('/worker-parent.js')":mode==='blob'?"new Worker(objectURL=URL.createObjectURL(new Blob(["+JSON.stringify(workerProbeSource)+"],{type:'text/javascript'})))":"new Worker('/worker-probe.js')")+";const port=worker.port||worker;const timer=setTimeout(()=>{cleanup();reject(Error('Worker result missing'))},7000);const cleanup=()=>{clearTimeout(timer);if(worker.port){port.postMessage('stop');port.close()}else worker.terminate();if(objectURL)URL.revokeObjectURL(objectURL)};port.onmessage=event=>{cleanup();resolve(event.data)};port.onmessageerror=()=>{cleanup();reject(Error('Worker message failed'))};worker.onerror=event=>{cleanup();reject(Error(event.message||'Worker failed'))};if(worker.port)port.start()})";
  const result=await evaluate(ra,expression);console.log('Worker observation '+JSON.stringify({mode,result}));pass('Worker '+mode+' recebe controlos antes do primeiro script',result.blocked===true&&result.language===a.locale&&result.zone===a.timezone&&result.userAgent===a.userAgent&&(mode==='blob'||result.requestUA===a.userAgent)&&result.metadata?.brands.some(b=>b.version==='120')&&result.entropy?.fullVersionList.some(b=>b.version==='120.0.0.0'));
  const plain=await evaluate(rb,expression);pass('Worker '+mode+' conserva APIs e identidade no perfil normal',plain.blocked===false&&plain.language===b.locale&&plain.zone===b.timezone);
 }
 await evaluate(ra,"(()=>{for(let i=0;i<12;i++){const worker=new Worker('/worker-probe.js?cancel='+i);worker.terminate()}return true})()");
 await wait(()=>!ra.workerPauses?.size);pass('Workers terminados durante arranque libertam suspensoes sem fechar o perfil',manager.has(a.id)&&ra.child.exitCode===null&&errors.length===0);
 const {targetId:blankId}=await ra.cdp.send('Target.createTarget',{url:'about:blank'});
 await wait(()=>ra.targets.get(blankId)?.sessionId);const blankSession=ra.targets.get(blankId).sessionId;await ra.sessions.get(blankSession);
 const blankState=await ra.cdp.send('Runtime.evaluate',{expression:"(()=>{let blocked=false;try{document.createElement('canvas').toDataURL()}catch{blocked=true}return {blocked,language:navigator.language,zone:Intl.DateTimeFormat().resolvedOptions().timeZone}})()",returnByValue:true},blankSession);
 pass('Pagina vazia inicial recebe restricoes e identidade sem segunda navegacao',blankState.result.value?.blocked===true&&blankState.result.value.language===a.locale&&blankState.result.value.zone===a.timezone);
 await ra.cdp.send('Target.closeTarget',{targetId:blankId});
 const frameProbe="new Promise((resolve,reject)=>{const frame=document.createElement('iframe');frame.src='about:blank';frame.onload=()=>{try{const w=frame.contentWindow;let blocked=false;try{w.document.createElement('canvas').toDataURL()}catch{blocked=true}const result={blocked,language:w.navigator.language,zone:w.Intl.DateTimeFormat().resolvedOptions().timeZone};frame.remove();resolve(result)}catch(error){reject(error)}};document.body.append(frame)})";
 const restrictedFrame=await evaluate(ra,frameProbe);pass('Frame about blank conserva privacidade idioma e fuso do perfil',restrictedFrame.blocked===true&&restrictedFrame.language===a.locale&&restrictedFrame.zone===a.timezone);
 const plainFrame=await evaluate(rb,frameProbe);pass('Frame de perfil normal conserva canvas nativo e identidade propria',plainFrame.blocked===false&&plainFrame.language===b.locale&&plainFrame.zone===b.timezone);
 for(const mode of ['srcdoc','blob','data','cross-site','cross-site-nested']){
  const expression="new Promise((resolve,reject)=>{const frame=document.createElement('iframe');let objectURL;const timer=setTimeout(()=>{cleanup();reject(Error('Frame result missing'))},5000);const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive);frame.remove();if(objectURL)URL.revokeObjectURL(objectURL)};const receive=event=>{if(event.source!==frame.contentWindow)return;const value=event.data;cleanup();resolve(value)};window.addEventListener('message',receive);const html='<script>let blocked=false;try{document.createElement(\"canvas\").toDataURL()}catch{blocked=true}parent.postMessage({blocked,language:navigator.language,zone:Intl.DateTimeFormat().resolvedOptions().timeZone},\"*\")<'+ '/script>';const mode="+JSON.stringify(mode)+";if(mode==='srcdoc')frame.srcdoc=html;else if(mode==='blob'){objectURL=URL.createObjectURL(new Blob([html],{type:'text/html'}));frame.src=objectURL}else if(mode.startsWith('cross-site'))frame.src="+JSON.stringify('http://localhost:'+server.address().port+'/frame-probe?html=')+"+encodeURIComponent(html)+(mode==='cross-site-nested'?'&nested=1':'');else frame.src='data:text/html,'+encodeURIComponent(html);document.body.append(frame)})";
  const result=await evaluate(ra,expression);console.log('Frame observation '+JSON.stringify({mode,result}));pass('Frame '+mode+' aplica identidade e restricoes antes do primeiro script',result.blocked===true&&result.language===a.locale&&result.zone===a.timezone);
 }
 for(const internal of ['newtab','settings']){
  const {targetId}=await ra.cdp.send('Target.createTarget',{url:(engine.id==='edge'?'edge':'chrome')+'://'+internal+'/'});
  await wait(()=>ra.targets.get(targetId)?.sessionId);const sid=ra.targets.get(targetId).sessionId;await ra.sessions.get(sid);
  await wait(async()=>{const r=await ra.cdp.send('Runtime.evaluate',{expression:"document.readyState==='complete'",returnByValue:true},sid);return r.result.value;});
  const internalAPIs=await ra.cdp.send('Runtime.evaluate',{expression:"document.createElement('canvas').toDataURL().startsWith('data:')",returnByValue:true},sid);
  pass('Pagina interna '+internal+' conserva APIs nativas',internalAPIs.result.value===true);
  await ra.cdp.send('Page.navigate',{url:url+'from-'+internal},sid);
  await wait(async()=>{const r=await ra.cdp.send('Runtime.evaluate',{expression:"location.pathname==='/from-"+internal+"'&&document.readyState==='complete'",returnByValue:true},sid);return r.result.value;});
  const first=await ra.cdp.send('Runtime.evaluate',{expression:'firstIdentity',returnByValue:true},sid);
  pass('Site aberto a partir de '+internal+' recebe identidade antes do primeiro script',first.result.value?.language===a.locale&&first.result.value?.zone===a.timezone&&first.result.value?.canvas===true);
  await ra.cdp.send('Page.navigate',{url:(engine.id==='edge'?'edge':'chrome')+'://settings/'},sid);
  await wait(async()=>{const r=await ra.cdp.send('Runtime.evaluate',{expression:"location.protocol==='"+(engine.id==='edge'?'edge:':'chrome:')+"'&&document.readyState==='complete'",returnByValue:true},sid);return r.result.value;});
  const restored=await ra.cdp.send('Runtime.evaluate',{expression:"document.createElement('canvas').toDataURL().startsWith('data:')",returnByValue:true},sid);pass('Regressar a pagina interna conserva APIs '+internal,restored.result.value===true);
  await ra.cdp.send('Target.closeTarget',{targetId});
 }
 await evaluate(ra,"document.cookie='onlyA=private; path=/; max-age=3600';localStorage.setItem('onlyA','private');new Promise((resolve,reject)=>{const q=indexedDB.open('onlyA',1);q.onupgradeneeded=()=>q.result.createObjectStore('values');q.onsuccess=()=>{const tx=q.result.transaction('values','readwrite');tx.objectStore('values').put({bytes:new Uint8Array([1,2,255]),map:new Map([['item',3]]),blob:new Blob(['binary-value'])},'sample');tx.oncomplete=()=>{q.result.close();resolve(true)};tx.onerror=()=>reject(tx.error)};q.onerror=()=>reject(q.error)})");
 pass('Cookies, LocalStorage e IndexedDB separados',await evaluate(rb,"!document.cookie.includes('onlyA')&&localStorage.getItem('onlyA')===null&&indexedDB.databases().then(d=>!d.some(x=>x.name==='onlyA'))"));
 await manager.page(b,'extensions');await wait(async()=>{const target=[...rb.targets.values()].find(t=>t.url.includes('://extensions'));if(!target)return false;const r=await rb.cdp.send('Runtime.evaluate',{expression:engine.id==='edge'?"!!document.querySelector('root-app')":"!!document.querySelector('extensions-manager')",returnByValue:true},target.sessionId);return r.result.value;});
 pass('Gestor nativo de extensoes completo abre no perfil',true);
 for(const page of ['settings','history','downloads','bookmarks']){
  const {targetId}=await manager.page(b,page);
  await wait(async()=>{const target=rb.targets.get(targetId);if(!target?.sessionId)return false;const result=await rb.cdp.send('Runtime.evaluate',{expression:"document.readyState==='complete'&&!!document.body?.children.length&&/^(chrome|edge):$/.test(location.protocol)",returnByValue:true},target.sessionId);return result.result?.value===true;});
  pass('Pagina Chromium '+page,true);
 }
 const resultA=ra.exited;await manager.stop(a.id);pass('Fecho Chromium termina naturalmente com codigo zero',(await resultA).code===0);
 const restored=await manager.open(a,{headless:true});await wait(async()=>await evaluate(restored,"document.querySelector('h1')?.textContent==='Teste'"));
 pass('Cookies e LocalStorage persistem apos reabrir',await evaluate(restored,"document.cookie.includes('onlyA=private')&&localStorage.getItem('onlyA')==='private'"));
 await restored.cdp.send('Storage.setCookies',{cookies:[{name:'__Host-portable',value:'exact-host',url:'https://cookie.example.test/',path:'/',secure:true,httpOnly:true,expires:Math.floor(Date.now()/1000)+3600},{name:'domain-portable',value:'subdomains',domain:'.cookie.example.test',path:'/',secure:true,expires:Math.floor(Date.now()/1000)+3600}]});
 await restored.cdp.send('Storage.setCookies',{cookies:[
 {name:'partition-check',value:'first-site',url:'https://cookie.example.test/',path:'/',secure:true,sameSite:'None',expires:Math.floor(Date.now()/1000)+3600,partitionKey:{topLevelSite:'https://first.example',hasCrossSiteAncestor:true}},
 {name:'partition-check',value:'second-site',url:'https://cookie.example.test/',path:'/',secure:true,sameSite:'None',expires:Math.floor(Date.now()/1000)+3600,partitionKey:{topLevelSite:'https://second.example',hasCrossSiteAncestor:false}},
 {name:'partition-check',value:'unpartitioned',url:'https://cookie.example.test/',path:'/',secure:true,sameSite:'None',expires:Math.floor(Date.now()/1000)+3600}
 ]});
 const cookies=await manager.stop(a.id).then(()=>manager.cookies(a));pass('Partilha obtem cookies sem ler a base encriptada do Chrome',cookies.some(c=>c.name==='onlyA'&&c.value==='private'));
 const snapshot=await manager.exportStorage(a),transferred=validateProfile({name:'Sessao importada',engine:engine.id,locale:'pt-PT',startupPages:[url]});
 await manager.importStorage(transferred,snapshot);await manager.importCookies(transferred,cookies.map(cookie=>cookieForImport(cookie,{partitioned:true})));
 pass('Exportacao distingue cookies de dominio exato e subdominios',cookies.find(c=>c.name==='__Host-portable')?.hostOnly===true&&cookies.find(c=>c.name==='domain-portable')?.hostOnly===false);
 const transferredRecord=await manager.open(transferred,{headless:true});await wait(async()=>await evaluate(transferredRecord,"document.querySelector('h1')?.textContent==='Teste'"));
 const targetSession=[...transferredRecord.targets.values()].find(t=>t.type==='page').sessionId;
 const exactCookies=(await transferredRecord.cdp.send('Network.getCookies',{urls:['https://cookie.example.test/']},targetSession)).cookies;
 const childCookies=(await transferredRecord.cdp.send('Network.getCookies',{urls:['https://child.cookie.example.test/']},targetSession)).cookies;
 pass('Partilha conserva __Host e nao alarga cookies aos subdominios',exactCookies.some(c=>c.name==='__Host-portable'&&c.httpOnly&&c.secure)&&!childCookies.some(c=>c.name==='__Host-portable')&&childCookies.some(c=>c.name==='domain-portable'));
 const partitioned=(await transferredRecord.cdp.send('Storage.getCookies')).cookies.filter(c=>c.name==='partition-check');
 pass('Partilha conserva cookies homonimos em duas particoes e fora delas',partitioned.length===3&&partitioned.some(c=>c.value==='first-site'&&c.partitionKey?.topLevelSite==='https://first.example'&&c.partitionKey.hasCrossSiteAncestor===true)&&partitioned.some(c=>c.value==='second-site'&&c.partitionKey?.topLevelSite==='https://second.example'&&c.partitionKey.hasCrossSiteAncestor===false)&&partitioned.some(c=>c.value==='unpartitioned'&&!c.partitionKey));
 const transferCheck=await evaluate(transferredRecord,"indexedDB.databases().then(d=>({cookie:document.cookie.includes('onlyA=private'),localStorage:localStorage.getItem('onlyA')==='private',indexedDB:d.some(x=>x.name==='onlyA')}))");if(!Object.values(transferCheck).every(Boolean))console.log('Transfer diagnostic '+JSON.stringify(transferCheck));pass('Partilha restaura cookies LocalStorage e IndexedDB noutro perfil',Object.values(transferCheck).every(Boolean));
 pass('IndexedDB transferido conserva bytes Map e Blob',await evaluate(transferredRecord,"new Promise((resolve,reject)=>{const q=indexedDB.open('onlyA');q.onsuccess=()=>{const get=q.result.transaction('values').objectStore('values').get('sample');get.onsuccess=async()=>{const v=get.result;resolve(v.bytes instanceof Uint8Array&&v.bytes[2]===255&&v.map.get('item')===3&&await v.blob.text()==='binary-value');q.result.close()};get.onerror=()=>reject(get.error)};q.onerror=()=>reject(q.error)})"));


 const c=validateProfile({name:'Identidade',locale:'de-DE',timezone:'Asia/Tokyo',startupPages:[url],latitude:38.7,longitude:-9.1,userAgent:ra.version.userAgent.replace('HeadlessChrome/','Chrome/')});c.engine=engine.id;
 const rc=await manager.open(c,{headless:true});await wait(async()=>await evaluate(rc,"document.querySelector('h1')?.textContent==='Teste'"));
 pass('User-Agent e Client Hints concordam',await evaluate(rc,"navigator.userAgent===receivedHeaders['user-agent']&&navigator.userAgentData.brands.some(b=>b.brand==='Chromium'&&navigator.userAgent.includes('/'+b.version+'.'))"));
 pass('Geolocalizacao configurada chega a API do site',await evaluate(rc,"new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>resolve(p.coords.latitude===38.7&&p.coords.longitude===-9.1),reject,{timeout:5000}))"));
 let authenticated=0;
 proxy=createServer((req,res)=>{if(req.headers['proxy-authorization']!=='Basic '+Buffer.from('user-local:password-local').toString('base64')){res.writeHead(407,{'Proxy-Authenticate':'Basic realm=local'});res.end();return;}authenticated++;res.setHeader('Content-Type','text/html');res.end('<title>Proxy</title><h1>Proxy autenticado</h1>');});
 await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve);});
 const proxyProfile=validateProfile({name:'Proxy',locale:'pt-PT',proxy:'http://127.0.0.1:'+proxy.address().port,proxyUser:'user-local',startupPages:['http://native-proxy.test/']});proxyProfile.engine=engine.id;proxyProfile.proxySecret='protected-reference';
 const rp=await manager.open(proxyProfile,{headless:true});await wait(async()=>await evaluate(rp,"document.querySelector('h1')?.textContent==='Proxy autenticado'"));
 pass('Proxy HTTP autenticado encaminha navegacao real',authenticated>0);
 pass('Credenciais nao aparecem nos argumentos do processo',!rp.child.spawnargs.join(' ').includes('password-local')&&!rp.child.spawnargs.join(' ').includes('user-local'));
 const inactive=validateProfile({name:'Sem override',engine:engine.id,locale:'pt-PT',timezone:'Pacific/Honolulu',timezoneEnabled:false,latitude:38.7,longitude:-9.1,geolocationEnabled:false,startupPages:[url]});
 const inactiveRecord=await manager.open(inactive,{headless:true});await wait(async()=>await evaluate(inactiveRecord,"document.querySelector('h1')?.textContent==='Teste'"));
 pass('Fuso desativado conserva o fuso nativo do sistema',await evaluate(inactiveRecord,"Intl.DateTimeFormat().resolvedOptions().timeZone!=='Pacific/Honolulu'"));
 pass('Localizacao desativada nao concede permissao automaticamente',await evaluate(inactiveRecord,"navigator.permissions.query({name:'geolocation'}).then(p=>p.state!=='granted')"));
 pass('Sem erros de configuracao de paginas',errors.length===0);
 const offline=validateProfile({name:'Erro de rede recuperavel',engine:engine.id,locale:'pl-PL',timezone:'Asia/Seoul',privacy:{canvas:true},startupPages:[url+'disconnect']}),offlineRecord=await manager.open(offline,{headless:true});
 const failedTarget=[...offlineRecord.targets.values()].find(t=>t.type==='page');
 pass('Falha de rede inicial conserva o perfil e a pagina de erro nativa',manager.has(offline.id)&&offlineRecord.ready&&offlineRecord.child.exitCode===null&&failedTarget.navigationError?.startsWith('net::ERR_'));
 pass('Erro de rede e comunicado sem ser tratado como falha de configuracao',errors.length===1&&errors[0].includes(failedTarget.navigationError));
 const recovered=await manager.navigate(offline,url+'recovered');await wait(async()=>{const r=await offlineRecord.cdp.send('Runtime.evaluate',{expression:"document.querySelector('h1')?.textContent==='Teste'&&navigator.language==='pl-PL'&&Intl.DateTimeFormat().resolvedOptions().timeZone==='Asia/Seoul'&&typeof require==='undefined'&&typeof window.desktop==='undefined'",returnByValue:true},recovered.sessionId);return r.result?.value===true;});
 pass('Navegacao apos erro recupera no mesmo processo com identidade e isolamento',offlineRecord.child.exitCode===null&&manager.records.get(offline.id)===offlineRecord);
 const empty=validateProfile({name:'Resposta sem documento',engine:engine.id,startupPages:[url+'no-content']}),emptyRecord=await manager.open(empty,{headless:true});
 pass('Resposta HTTP 204 nao encerra o perfil nem cria aviso de erro',manager.has(empty.id)&&emptyRecord.ready&&emptyRecord.child.exitCode===null&&errors.length===1);

 report={ok:true,engine:engine.id,version:manager.versions.get(engine.id),tests:checks};
}catch(error){report={ok:false,engine:engine.id,tests:checks,error:error.stack||String(error),diagnostics:errors};}
finally{const cleanup=await Promise.allSettled([manager.stopAll(),closeHTTPServer(server),closeHTTPServer(proxy)]);const failed=cleanup.find(r=>r.status==='rejected');if(failed){report.ok=false;report.cleanupError=failed.reason.message;}writeFileSync(join(dataRoot,'native-result.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({ok:report.ok,checks:checks.length,directory:dataRoot,error:report.error,cleanupError:report.cleanupError}));
if(!report.ok)process.exitCode=1;
