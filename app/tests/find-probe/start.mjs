import {app,BrowserWindow} from 'electron';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..'),directory=join(root,'test-results','find-probe-'+randomUUID());
mkdirSync(directory,{recursive:true});process.env.BROWSERLAND_DATA=directory;
const {quitApplication}=await import('../../src/main.mjs');
app.whenReady().then(()=>setTimeout(async()=>{
 let server;const result={events:[]};
 try{
  const manager=BrowserWindow.getAllWindows()[0];while(manager.webContents.isLoading())await new Promise(r=>setTimeout(r,30));
  const request=(action,data={})=>manager.webContents.executeJavaScript('window.desktop.request('+JSON.stringify(action)+','+JSON.stringify(data)+')');
  server=createServer((_req,res)=>res.end('<!doctype html><title>Find probe</title><p>needle one</p><p>needle two</p><p>needle three</p>'));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/';
  await request('language',{language:'en'});const p=await request('save',{name:'Find probe',engine:'embedded',startupMode:'blank'});await request('open',{id:p.id,url});
  const window=BrowserWindow.getAllWindows().find(w=>w.id!==manager.id);
  const wc=window.contentView.children.find(v=>v.webContents?.getURL()===url)?.webContents;
  while(wc.isLoading())await new Promise(r=>setTimeout(r,30));
  wc.on('found-in-page',(_e,r)=>result.events.push(r));
  result.rawId='not-run';await new Promise(r=>setTimeout(r,100));
  result.rawCount=await window.webContents.executeJavaScript("document.querySelector('#find-count').textContent");
  await window.webContents.executeJavaScript("document.querySelector('#find').click();document.querySelector('#find-query').value='needle';document.querySelector('#find-query').dispatchEvent(new Event('input'))");
  await new Promise(r=>setTimeout(r,600));
  result.uiCount=await window.webContents.executeJavaScript("document.querySelector('#find-count').textContent");
  result.active=await window.webContents.executeJavaScript("window.desktop.request('browserState')");result.text=await wc.executeJavaScript('document.body.innerText');result.visible=window.isVisible();
  await request('stop',{id:p.id});
 }catch(error){result.error=error.stack||String(error);}
 finally{server?.closeAllConnections();server?.close();writeFileSync(join(directory,'probe.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({directory,result}));await quitApplication(result.error?1:0);}
},150));
