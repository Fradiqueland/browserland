import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {NativeBrowsers} from '../src/native-browser.mjs';
import {validateProfile} from '../src/core.mjs';
import {until,closeHTTPServer} from '../src/operations.mjs';

const root=resolve(import.meta.dirname,'..');
const appRoot=resolve((process.env.BROWSERLAND_TEST_APP_ROOT||process.env.MULTIBROWSER_TEST_APP_ROOT)||process.argv.find(a=>a.startsWith('--app-root='))?.slice(11)||root);
const dataRoot=(process.env.BROWSERLAND_DATA||process.env.MULTIBROWSER_DATA)?resolve((process.env.BROWSERLAND_DATA||process.env.MULTIBROWSER_DATA)):mkdtempSync(join(root,'test-results','native-download-'));
mkdirSync(dataRoot,{recursive:true});
const errors=[],events=[],checks=[];
const manager=new NativeBrowsers({appRoot,dataRoot,error:error=>{errors.push(error.message);console.log('BROWSER ERROR '+error.message);}});
const downloads=join(dataRoot,'downloads');mkdirSync(downloads);
const payload='Browserland local download fixture\n';
const server=createServer((req,res)=>{
 if(req.url==='/redirect'){res.writeHead(302,{Location:'/file?redirected'});res.end();return;}
 if(req.url.startsWith('/file')){res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="fixture.txt"'});res.end(payload);return;}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Download fixture</title><script>window.firstIdentity={language:navigator.language,zone:Intl.DateTimeFormat().resolvedOptions().timeZone,blocked:(()=>{try{document.createElement("canvas").toDataURL();return false}catch{return true}})()}</script><a id="file" href="/file">Download</a><a id="popup" target="_blank" href="/file?popup">New tab download</a><a id="redirect" target="_blank" href="/redirect">Redirected download</a>');
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const base='http://127.0.0.1:'+server.address().port;
let record,report;
try{
 const profile=validateProfile({name:'Isolated download regression',engine:'chromium',locale:'pt-PT',timezone:'Europe/Lisbon',startupPages:[base],privacy:{canvas:true}});
 record=await manager.open(profile,{headless:!process.argv.includes('--headed')});
 record.cdp.on('event',e=>{if(e.method.startsWith('Browser.download')||e.method.startsWith('Target.'))events.push(e);});
 record.exited.then(exit=>console.log('BROWSER EXIT '+JSON.stringify(exit)));
 await record.cdp.send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:downloads,eventsEnabled:true});
 const page=[...record.targets.values()].find(t=>t.type==='page');
 const evaluate=async expression=>{const r=await record.cdp.send('Runtime.evaluate',{expression,returnByValue:true,userGesture:true},page.sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result?.value;};
 await until(()=>evaluate('!!document.querySelector("#file")'),'download fixture loaded');
 for(const selector of ['#file','#popup','#redirect']){
  const start=events.length;await evaluate('document.querySelector('+JSON.stringify(selector)+').click()');
  const done=await until(()=>{assert.equal(record.child.exitCode,null,'browser must stay running');assert.deepEqual(errors,[]);return events.slice(start).find(e=>e.method==='Browser.downloadProgress'&&e.params.state==='completed');},'download completion');
  assert.equal(readFileSync(join(downloads,done.params.guid),'utf8'),payload);
  // Let transient download UI attach and finish profile setup, too.
  await new Promise(resolve=>setTimeout(resolve,1200));
  await Promise.all(record.sessions.values());
  assert.deepEqual(errors,[]);assert.equal(record.child.exitCode,null);
  assert.equal(await evaluate('navigator.language'),'pt-PT');
  checks.push(selector+' downloads exact bytes and keeps profile running');console.log('PASS '+checks.at(-1));
 }
 for(const expression of ['window.open("/document","_blank")','window.open("about:blank","_blank").location.href="/document?blank"']){
  const previous=new Set(record.targets.keys());await evaluate(expression+';true');
  const opened=await until(()=>[...record.targets.values()].find(t=>t.type==='page'&&!previous.has(t.targetId)&&t.url.startsWith(base+'/document')),'popup document');
  await record.sessions.get(opened.sessionId);
  const identity=await until(async()=>{const r=await record.cdp.send('Runtime.evaluate',{expression:'window.firstIdentity',returnByValue:true},opened.sessionId);return r.result?.value;},'first popup script');
  assert.deepEqual(identity,{language:'pt-PT',zone:'Europe/Lisbon',blocked:true});
  await record.cdp.send('Target.closeTarget',{targetId:opened.targetId});
  checks.push('Popup first script receives profile controls: '+expression);console.log('PASS '+checks.at(-1));
 }
 const start=events.length;await manager.navigate(profile,base+'/file?manager');
 const direct=await until(()=>events.slice(start).find(e=>e.method==='Browser.downloadProgress'&&e.params.state==='completed'),'manager download');
 assert.equal(readFileSync(join(downloads,direct.params.guid),'utf8'),payload);
 await Promise.all(record.sessions.values());
 assert.deepEqual(errors,[]);assert.equal(record.child.exitCode,null);
 checks.push('Manager navigation to attachment keeps browser running');
 report={ok:true,checks};
}catch(error){report={ok:false,checks,error:error.stack};process.exitCode=1;}
finally{
 const cleanup=await Promise.allSettled([manager.stopAll(),closeHTTPServer(server)]);
 for(const result of cleanup)if(result.status==='rejected'){report.ok=false;report.cleanupError=String(result.reason);process.exitCode=1;}
 writeFileSync(join(dataRoot,'native-download-result.json'),JSON.stringify({...report,tests:checks.map(name=>({name,ok:true})),errors,events},null,2));
 console.log(JSON.stringify({...report,errors,dataRoot}));
}
