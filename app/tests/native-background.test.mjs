import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {NativeBrowsers} from '../src/native-browser.mjs';
import {validateProfile} from '../src/core.mjs';
import {until,bounded,closeHTTPServer} from '../src/operations.mjs';
const appRoot=resolve(import.meta.dirname,'..'),root=process.argv.find(a=>a.startsWith('--data-root='))?.slice(12)|| ((process.env.BROWSERLAND_DATA||process.env.MULTIBROWSER_DATA)?resolve((process.env.BROWSERLAND_DATA||process.env.MULTIBROWSER_DATA)):mkdtempSync(join(appRoot,'test-results','native-background-')));
mkdirSync(root,{recursive:true});
const checks=[],errors=[],requests=[],serviceErrors=[];
const pass=(name,ok)=>{assert.ok(ok,name);checks.push({name,ok:true});console.log('PASS Background: '+name);};
const manager=new NativeBrowsers({appRoot,dataRoot:root,error:e=>errors.push(e.message)});
const engine=manager.available().find(e=>e.id==='chromium')||manager.available()[0];if(!engine)throw Error('Bundled Chromium unavailable.');
let generation=1;
const probe="let blocked=false;try{new OffscreenCanvas(1,1).getContext('2d').getImageData(0,0,1,1)}catch{blocked=true}const first={blocked,language:navigator.language,zone:Intl.DateTimeFormat().resolvedOptions().timeZone,userAgent:navigator.userAgent,metadata:navigator.userAgentData?.toJSON(),node:typeof require,ipc:typeof self.desktop};";
const server=createServer((req,res)=>{
 if(req.url.startsWith('/service-worker.js')){requests.push({path:req.url,headers:req.headers});res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store','Service-Worker-Allowed':'/'});res.end('const generation='+generation+';'+probe+"self.addEventListener('install',event=>event.waitUntil(caches.open('profile-cache').then(cache=>cache.put('/saved',new Response('cache-'+generation))).then(()=>self.skipWaiting())));self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));self.addEventListener('message',event=>event.ports[0]?.postMessage({...first,generation}));self.addEventListener('fetch',event=>{if(new URL(event.request.url).pathname.endsWith('/snapshot'))event.respondWith(Response.json({...first,generation}));else if(new URL(event.request.url).pathname.endsWith('/saved'))event.respondWith(caches.open('profile-cache').then(cache=>cache.match('/saved')))});");return;}
 if(req.url==='/missing-worker.js'){res.writeHead(404,{'Content-Type':'text/javascript'});res.end('missing');return;}
 if(req.url==='/broken-worker.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('const = syntax error');return;}
 res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Background fixture</title><h1>Background</h1>');
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const base='http://127.0.0.1:'+server.address().port;
const a=validateProfile({name:'Restricted background',engine:engine.id,locale:'pt-PT',timezone:'Asia/Tokyo',privacy:{canvas:true},startupPages:[base+'/']}),b=validateProfile({name:'Plain background',engine:engine.id,locale:'en-US',timezone:'America/New_York',startupPages:[base+'/']});
a.userAgent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const page=record=>[...record.targets.values()].find(t=>t.type==='page');
const evaluate=async(record,expression)=>{const target=page(record);await record.sessions.get(target.sessionId);const result=await record.cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},target.sessionId);if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;};
const ready=record=>until(()=>evaluate(record,"document.readyState==='complete'&&document.querySelector('h1')?.textContent==='Background'"),'background fixture ready',15000);
const register=async(record,mode='classic')=>evaluate(record,"(async()=>{const r=await navigator.serviceWorker.register('/service-worker.js?mode="+mode+"',{scope:'/"+mode+"/',type:'"+(mode==='module'?'module':'classic')+"'});const worker=r.installing||r.waiting||r.active;if(worker.state!=='activated')await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Service worker activation timeout')),10000);worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timer);resolve()}else if(worker.state==='redundant'){clearTimeout(timer);reject(Error('Service worker redundant'))}})});return await new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>reject(Error('Service worker response timeout')),7000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data)};r.active.postMessage('snapshot',[channel.port2])})})()");
let report;
try{
 let ra=await manager.open(a,{headless:true}),rb=await manager.open(b,{headless:true});await ready(ra);await ready(rb);if(process.argv.includes('--trace-workers'))for(const record of [ra,rb]){const original=record.cdp.send.bind(record.cdp);record.cdp.send=async(method,params,session)=>{console.log('CDP begin '+method+' '+session);try{const result=await original(method,params,session);console.log('CDP end '+method+' '+session);return result}catch(error){console.log('CDP fail '+method+' '+session+' '+error.message);throw error}};record.cdp.on('event',event=>{if(event.method==='Target.attachedToTarget')console.log('Attached '+JSON.stringify(event.params.targetInfo));if(event.method==='Debugger.paused')console.log('Paused '+JSON.stringify({session:event.sessionId,reason:event.params.reason,scope:event.params.callFrames?.[0]?.scopeChain?.map(s=>s.type)}))})}ra.cdp.on('event',event=>{if(event.method==='ServiceWorker.workerErrorReported')serviceErrors.push(event.params)});await ra.cdp.send('ServiceWorker.enable',{},page(ra).sessionId);
 for(const path of ['/missing-worker.js','/broken-worker.js']){
  const failed=await evaluate(ra,"new Promise((resolve,reject)=>{const worker=new Worker("+JSON.stringify(path)+");const timer=setTimeout(()=>{worker.terminate();reject(Error('Worker error not delivered'))},8000);worker.onerror=e=>{e.preventDefault();clearTimeout(timer);worker.terminate();resolve(true)}})");
  pass('Falha normal de worker '+path+' e comunicada sem encerrar o perfil',failed&&ra.child.exitCode===null&&errors.length===0);
 }
 for(const mode of ['classic','module']){
  const result=await register(ra,mode);console.log('Service worker '+JSON.stringify({mode,result}));
  pass('Service worker '+mode+' recebe parametros antes do primeiro script',result.blocked&&result.language===a.locale&&result.zone===a.timezone&&result.userAgent===a.userAgent&&result.metadata?.brands.some(x=>x.version==='120'));
  pass('Service worker '+mode+' nao tem Node nem IPC do gestor',result.node==='undefined'&&result.ipc==='undefined');
  const normal=await register(rb,mode);pass('Service worker '+mode+' conserva APIs nativas no perfil normal',!normal.blocked&&normal.language===b.locale&&normal.zone===b.timezone);
 }
 pass('Pedidos de service worker respeitam User-Agent e idioma',requests.filter(r=>r.headers['user-agent']===a.userAgent).length>=2&&requests.filter(r=>r.headers['user-agent']===a.userAgent).every(r=>r.headers['accept-language'].startsWith(a.locale)));
 await ra.cdp.send('Page.navigate',{url:base+'/classic/'},page(ra).sessionId);await ready(ra);
 await until(()=>evaluate(ra,'!!navigator.serviceWorker.controller'),'service worker controls page',10000);
 const controlled=await evaluate(ra,"fetch('/classic/snapshot').then(r=>r.json())");pass('Service worker controla pedidos reais e conserva identidade',controlled.blocked&&controlled.zone===a.timezone);
 const cacheA=await evaluate(ra,"fetch('/classic/saved').then(r=>r.text())");pass('Cache Storage funciona com restricoes ativas',cacheA==='cache-1');
 await evaluate(rb,"caches.open('profile-cache').then(c=>c.put('/saved',new Response('only-profile-b')))");pass('Caches dos dois perfis ficam isoladas',await evaluate(ra,"caches.open('profile-cache').then(c=>c.match('/saved')).then(r=>r.text())")==='cache-1');
 await ra.cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1},page(ra).sessionId);
 pass('Resposta em cache continua disponivel sem rede',await evaluate(ra,"fetch('/classic/saved').then(r=>r.text())")==='cache-1');
 await ra.cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1},page(ra).sessionId);
 await manager.stop(a.id);a.startupPages=[base+'/classic/'];ra=await manager.open(a,{headless:true});await ready(ra);
 await until(()=>evaluate(ra,'!!navigator.serviceWorker.controller'),'restored service worker controls page',10000);
 const restored=await evaluate(ra,"fetch('/classic/snapshot').then(r=>r.json())");pass('Service worker persistente reinicia com os parametros do perfil',restored.blocked&&restored.language===a.locale&&restored.zone===a.timezone&&restored.userAgent===a.userAgent);
 pass('Cache Storage persiste apos fechar e reabrir',await evaluate(ra,"fetch('/classic/saved').then(r=>r.text())")==='cache-1');
 generation=2;await evaluate(ra,"navigator.serviceWorker.getRegistration('/classic/').then(r=>r.update()).then(()=>true)");
 await until(async()=>{try{return (await evaluate(ra,"fetch('/classic/snapshot').then(r=>r.json())")).generation===2}catch{return false}},'service worker update activates',12000);
 const updated=await evaluate(ra,"fetch('/classic/snapshot').then(r=>r.json())");pass('Atualizacao do service worker volta a aplicar os controlos',updated.generation===2&&updated.blocked&&updated.zone===a.timezone);
 const failedRegistration=await evaluate(ra,"navigator.serviceWorker.register('/missing-worker.js',{scope:'/failed/'}).then(()=>false,()=>true)");pass('Registo invalido e recusado sem encerrar o navegador',failedRegistration&&manager.has(a.id)&&errors.length===0);
 await evaluate(ra,"navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister())))");pass('Remover registos num perfil nao remove os do outro',await evaluate(rb,"navigator.serviceWorker.getRegistrations().then(rs=>rs.length===2)"));
 report={ok:true,engine:engine.id,tests:checks,httpIdentity:requests.map(r=>({path:r.path,userAgent:r.headers['user-agent'],language:r.headers['accept-language'],clientHints:r.headers['sec-ch-ua']}))};
}catch(error){report={ok:false,engine:engine.id,tests:checks,error:error.stack||String(error),diagnostics:errors,serviceErrors};}
finally{const results=await Promise.allSettled([manager.stopAll(),closeHTTPServer(server)]);const failure=results.find(r=>r.status==='rejected');if(failure){report.ok=false;report.cleanupError=failure.reason.message;}writeFileSync(join(root,'background-result.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({ok:report.ok,checks:checks.length,directory:root,error:report.error,diagnostics:errors,serviceErrors}));if(!report.ok)process.exitCode=1;
