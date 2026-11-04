import {NativeBrowsers} from '../src/native-browser.mjs';
import {validateProfile} from '../src/core.mjs';
import {bounded,until,closeHTTPServer} from '../src/operations.mjs';
import {createServer} from 'node:http';
import {Worker} from 'node:worker_threads';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),directory=(process.env.BROWSERLAND_DATA||process.env.MULTIBROWSER_DATA)||mkdtempSync(join(root,'test-results','native-lifecycle-'));mkdirSync(directory,{recursive:true});
const manager=new NativeBrowsers({appRoot:root,dataRoot:directory}),tests=[],records=[];
const originalCloseRecord=manager.closeRecord;manager.closeRecord=async function(record){const start=performance.now();try{return await originalCloseRecord.call(this,record);}finally{console.log('Close observation '+JSON.stringify({pid:record.child.pid,milliseconds:Math.round(performance.now()-start),exitCode:record.child.exitCode,pipeClosed:record.cdp.closed}));}};
const check=(name,value)=>{assert.ok(value,name);tests.push({name,ok:true});console.log('PASS: '+name);};
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Lifecycle fixture</title><h1>Local window</h1>');});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const url='http://127.0.0.1:'+server.address().port+'/';let report,worker,compressionDone=false,compression,windowRecord;
try{
 for(let i=0;i<10;i++){const p=validateProfile({name:'Ciclo '+i,engine:'chromium',locale:i%2?'pt-PT':'en-US',startupPages:[url]});const r=await manager.open(p,{headless:i!==0});records.push(r);console.log('Perfil '+(i+1)+'/10 pronto');}
 windowRecord=records[0];windowRecord.stderrTail='';windowRecord.child.stderr.on('data',chunk=>{windowRecord.stderrTail=(windowRecord.stderrTail+chunk.toString()).slice(-6000);});windowRecord.exited.then(result=>console.log('Window exited '+JSON.stringify(result)));check('Dez perfis com pastas exclusivas durante a janela Windows',manager.records.size===10&&new Set(records.map(r=>r.directory)).size===10);
 const first=[...windowRecord.targets.values()].find(t=>t.type==='page'),firstWindow=await windowRecord.cdp.send('Browser.getWindowForTarget',{targetId:first.targetId});
 const second=await manager.navigate(windowRecord.profile,url+'second'),secondWindow=await windowRecord.cdp.send('Browser.getWindowForTarget',{targetId:second.targetId});
 check('Segundo separador permanece na mesma janela sob carga',firstWindow.windowId===secondWindow.windowId);
 await until(async()=>{const result=await windowRecord.cdp.send('Runtime.evaluate',{expression:"document.readyState==='complete'&&document.querySelector('h1')?.textContent==='Local window'",returnByValue:true},second.sessionId);return result.result?.value;},'documento sob carga');
 const started=new Promise((resolve,reject)=>{
  worker=new Worker("const {workerData,parentPort}=require('node:worker_threads');const {createReadStream,createWriteStream}=require('node:fs');const {createGzip}=require('node:zlib');const {pipeline}=require('node:stream/promises');parentPort.postMessage('started');pipeline(createReadStream(workerData.input),createGzip({level:6}),createWriteStream(workerData.output)).then(()=>parentPort.postMessage('done')).catch(error=>{throw error});",{eval:true,workerData:{input:join(root,'.runtime','chromium','chrome.dll'),output:join(directory,'compression-fixture.gz')}});
  worker.once('message',resolve);worker.once('error',reject);
 });
 compression=new Promise((resolve,reject)=>{worker.on('message',message=>{if(message==='done'){compressionDone=true;resolve();}});worker.once('error',reject);worker.once('exit',code=>{if(code!==0)reject(Error('Compressao terminou com codigo '+code));});});compression.catch(()=>{});
 await started;
 await windowRecord.cdp.send('Target.closeTarget',{targetId:first.targetId});check('Fechar um separador sob compressao conserva o outro',(await windowRecord.cdp.send('Target.getTargets')).targetInfos.some(t=>t.targetId===second.targetId));
 if(process.argv.includes('--natural-close'))windowRecord.ready=false;
 const closingStarted=performance.now();await windowRecord.cdp.send('Target.closeTarget',{targetId:second.targetId});const exit=await bounded(windowRecord.exited,'ultima janela com dez perfis e compressao',60000);
 check('Ultima janela termina normalmente sob carga e compressao',exit.code===0);
 report={ok:true,tests,lastWindowCloseMilliseconds:Math.round(performance.now()-closingStarted),compressionFinishedBeforeLastWindowClose:compressionDone};
 await manager.stopAll();check('Os dez motores terminam normalmente apesar da compressao',(await Promise.all(records.map(r=>r.exited))).every(r=>r.code===0));
 await bounded(compression,'concluir compressao concorrente',60000);
 const inFlight=validateProfile({name:'Parar durante arranque',engine:'chromium',startupMode:'blank'}),opening=manager.open(inFlight,{headless:true}),stopping=manager.stop(inFlight.id),opened=await opening;records.push(opened);await stopping;
 check('Parar durante o arranque aguarda configuracao e confirma fecho',!manager.has(inFlight.id)&&(await opened.exited).code===0);
 const active=[];for(let i=0;i<2;i++){const r=await manager.open(validateProfile({name:'Falha isolada '+i,engine:'chromium',startupMode:'blank'}),{headless:true});active.push(r);records.push(r);}
 const stop=manager.stop;try{manager.stop=async function(id){if(id===active[0].profile.id)throw Error('Fecho controlado recusado');return stop.call(this,id);};await assert.rejects(manager.stopAll(),/Fecho controlado recusado/);check('Falha de um motor nao impede fecho confirmado do outro',(await active[1].exited).code===0&&manager.has(active[0].profile.id));}finally{manager.stop=stop;}
 await manager.stopAll();check('Nova tentativa fecha o motor recusado sem forcar o processo',(await active[0].exited).code===0&&!manager.records.size);
}catch(error){console.log('FAIL: '+error.message);report={ok:false,tests,error:error.stack||String(error),diagnostics:{records:[...manager.records.values()].map(r=>({pid:r.child.pid,exitCode:r.child.exitCode,ready:r.ready,closing:!!r.closing,signal:r.child.signalCode,stderr:r===windowRecord?r.stderrTail:undefined,pipeClosed:r.cdp.closed,targets:[...r.targets.values()].map(t=>({type:t.type,url:t.url}))}))}};}
finally{
 if(windowRecord)windowRecord.ready=true;
 const cleanup=await Promise.allSettled([manager.stopAll(),closeHTTPServer(server),...(compression?[bounded(compression,'concluir compressao de teste',60000)]:[])]);const failed=cleanup.find(r=>r.status==='rejected');
 if(failed){report.ok=false;report.cleanupError=String(failed.reason);for(const r of records)if(r.child.exitCode===null){r.child.kill();await bounded(r.exited,'limpar apenas motor deste teste',5000).catch(()=>{});}if(worker&&!compressionDone)await worker.terminate();}
 writeFileSync(join(directory,'lifecycle-result.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({ok:report.ok,checks:tests.length,directory,lastWindowCloseMilliseconds:report.lastWindowCloseMilliseconds,error:report.error,cleanupError:report.cleanupError,diagnostics:report.diagnostics}));if(!report.ok)process.exitCode=1;
