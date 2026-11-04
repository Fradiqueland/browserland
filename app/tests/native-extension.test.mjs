import {validateProfile} from '../src/core.mjs';
// Exercises a generated local extension in an isolated Chrome profile.
// The extra extension-debugging flag exists only in this finite test.
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {nativeEngines,NativeBrowsers} from '../src/native-browser.mjs';
import {CDPPipe} from '../src/cdp-pipe.mjs';
import {bounded,closeHTTPServer,until} from '../src/operations.mjs';
const appRoot=resolve(import.meta.dirname,'..'),root=(process.env.BROWSERLAND_DATA||process.env.MULTIBROWSER_DATA)?resolve((process.env.BROWSERLAND_DATA||process.env.MULTIBROWSER_DATA)):mkdtempSync(join(appRoot,'test-results','native-extension-')),extension=join(root,'fixture');
mkdirSync(extension,{recursive:true});writeFileSync(join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Browserland local test',version:'1.0',permissions:['storage'],background:{service_worker:'background.js'},content_scripts:[{matches:['http://127.0.0.1/*'],js:['content.js']}]}));
writeFileSync(join(extension,'background.js'),"const first={canvas:(()=>{try{return new OffscreenCanvas(1,1).getContext('2d').getImageData(0,0,1,1).data.length===4}catch{return false}})(),userAgent:navigator.userAgent};chrome.runtime.onMessage.addListener((message,sender,reply)=>{if(message!=='background-probe')return;chrome.storage.local.set({background:'worker-api-ok'}).then(()=>chrome.storage.local.get('background')).then(value=>reply({...first,stored:value.background}));return true});");
writeFileSync(join(extension,'options.html'),'<!doctype html><title>Extension options</title><h1>Options</h1>');
writeFileSync(join(extension,'content.js'),"chrome.storage.local.set({fixture:'extension-api-ok'}).then(()=>chrome.storage.local.get('fixture')).then(v=>document.documentElement.dataset.extensionResult=v.fixture);");
const requestedEngine=process.argv.find(a=>a.startsWith('--engine='))?.slice(9);const engines=nativeEngines(appRoot);const engine=requestedEngine?engines.find(e=>e.id===requestedEngine):engines.find(e=>e.id==='chromium')||engines.find(e=>e.id==='chrome')||engines[0];
if(!engine)throw Error('Motor Chromium completo indisponivel.');
const server=createServer((_req,res)=>res.end('<!doctype html><title>Extension fixture</title><h1>Local</h1>'));
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const child=spawn(engine.path,['--user-data-dir='+join(root,'profile'),'--remote-debugging-pipe','--enable-unsafe-extension-debugging','--headless=new','--no-first-run','--no-default-browser-check','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe','pipe','pipe']});child.stderr.resume();
const exited=new Promise(resolve=>{child.once('exit',(code,signal)=>resolve({code,signal}));child.once('error',error=>resolve({error:error.message}));}),cdp=new CDPPipe(child),checks=[];let report;
try{
 const setupErrors=[],controller=new NativeBrowsers({appRoot,dataRoot:root,error:error=>setupErrors.push(error.message)}),profile=validateProfile({name:'Restricted extension fixture',locale:'fr-FR',privacy:{canvas:true,audio:true,webrtc:true}});profile.userAgent='Mozilla/5.0 Chrome/120.0.0.0';const record={cdp,profile,targets:new Map(),sessions:new Map(),ready:false};cdp.on('event',event=>controller.event(record,event));
 await cdp.send('Browser.getVersion');
 await cdp.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'service_worker'},{exclude:true}]});
 const {id}=await cdp.send('Extensions.loadUnpacked',{path:extension});assert.ok(id);checks.push({name:'Extensao MV3 local instalada no motor completo',ok:true});
 const {targetId}=await cdp.send('Target.createTarget',{url:'http://127.0.0.1:'+server.address().port+'/'}),{sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
 await until(async()=>{const result=await cdp.send('Runtime.evaluate',{expression:"document.documentElement?.dataset.extensionResult",returnByValue:true},sessionId);return result.result?.value==='extension-api-ok';},'content script e chrome.storage.local',15000);
 checks.push({name:'Content script e API chrome.storage funcionam realmente',ok:true});
 await controller.configure(record,sessionId,{url:'about:blank'});
 await cdp.send('Page.navigate',{url:'chrome-extension://'+id+'/options.html'},sessionId);
 await until(async()=>{const r=await cdp.send('Runtime.evaluate',{expression:"location.protocol==='chrome-extension:'&&document.readyState==='complete'",returnByValue:true},sessionId);return r.result.value;},'extension options ready');
 const options=await cdp.send('Runtime.evaluate',{expression:"(async()=>{await chrome.storage.local.set({options:'native-api-ok'});return document.createElement('canvas').toDataURL().startsWith('data:')&&typeof AudioContext==='function'&&typeof RTCPeerConnection==='function'&&(await chrome.storage.local.get('options')).options==='native-api-ok'})()",awaitPromise:true,returnByValue:true},sessionId);
 assert.equal(options.result.value,true);checks.push({name:'Pagina da extensao conserva canvas audio WebRTC e chrome.storage com restricoes ativas',ok:true});
 const background=await cdp.send('Runtime.evaluate',{expression:"chrome.runtime.sendMessage('background-probe')",awaitPromise:true,returnByValue:true},sessionId);assert.ok(!background.exceptionDetails&&background.result.value?.canvas&&background.result.value.stored==='worker-api-ok'&&background.result.value.userAgent!==profile.userAgent&&setupErrors.length===0);checks.push({name:'Service worker MV3 conserva canvas chrome.storage e identidade nativa da extensao',ok:true});
 await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'},sessionId);
 await until(async()=>{const r=await cdp.send('Runtime.evaluate',{expression:"location.protocol==='http:'&&document.documentElement?.dataset.extensionResult==='extension-api-ok'",returnByValue:true},sessionId);return r.result.value;},'return to restricted site');
 const restricted=await cdp.send('Runtime.evaluate',{expression:"(()=>{let blocked=false;try{document.createElement('canvas').toDataURL()}catch{blocked=true}return blocked&&navigator.language==='fr-FR'})()",returnByValue:true},sessionId);
 assert.equal(restricted.result.value,true);checks.push({name:'Regressar ao site reativa identidade e privacidade sem impedir o content script',ok:true});
 await cdp.send('Extensions.uninstall',{id});checks.push({name:'Extensao local removida do perfil de teste',ok:true});
 report={ok:true,engine:engine.id,tests:checks};
}catch(error){report={ok:false,tests:checks,error:error.stack||String(error)};}
finally{
 try{await cdp.send('Browser.close').catch(e=>{if(!cdp.closed)throw e;});const exit=await bounded(exited,'encerrar teste de extensao',15000);assert.equal(exit.code,0);checks.push({name:'Encerramento nativo confirmado',ok:true});await closeHTTPServer(server);}
 catch(error){report.ok=false;report.cleanupError=error.message;if(child.exitCode===null)child.kill();}
 writeFileSync(join(root,'extension-result.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({ok:report.ok,checks:checks.length,directory:root,error:report.error,cleanupError:report.cleanupError}));if(!report.ok)process.exitCode=1;
