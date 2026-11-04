import {app,BrowserWindow} from 'electron';
import {createServer} from 'node:http';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {bounded,until,closeHTTPServer} from '../../src/operations.mjs';
const root=resolve(import.meta.dirname,'../..'),directory=process.argv.find(arg=>arg.startsWith('--fixture-directory='))?.slice('--fixture-directory='.length)||(process.env.BROWSERLAND_DATA||process.env.MULTIBROWSER_DATA)||join(root,'test-results','navigation-'+randomUUID());mkdirSync(directory,{recursive:true});process.env.BROWSERLAND_DATA=directory;
const {quitApplication}=await import('../../src/main.mjs');
const observations=[];let server,report;
const watchdog=setTimeout(()=>{writeFileSync(join(directory,'navigation-result.json'),JSON.stringify({ok:false,error:'Navigation fixture exceeded 150 seconds',observations},null,2));app.exit(1);},150000);watchdog.unref();
app.whenReady().then(async()=>{
try{
 let manager;await until(()=>{manager=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/ui/index.html'));return manager&&!manager.webContents.isLoading();},'manager loaded');
 server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Navigation readiness</title><h1>ready</h1>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const request=(action,data={})=>bounded(manager.webContents.executeJavaScript('window.desktop.request('+JSON.stringify(action)+','+JSON.stringify(data)+')'),'manager request',15000);
 for(let cycle=0;cycle<12;cycle++){
  const profile=await request('save',{name:'Navigation '+cycle,engine:'embedded',startupMode:'blank'}),previous=new Set(BrowserWindow.getAllWindows().map(w=>w.id));await request('open',{id:profile.id});
  const window=BrowserWindow.getAllWindows().find(w=>!previous.has(w.id)),page=window.contentView.children.find(view=>view.webContents)?.webContents,events=[];
  for(const name of ['did-start-navigation','did-navigate','did-fail-load','did-stop-loading'])page.on(name,(_event,...args)=>events.push({name,args}));
  const typed='localhost:'+server.address().port+'/cycle-'+cycle;
  await bounded(window.webContents.executeJavaScript('window.desktop.request("navigate",{url:'+JSON.stringify(typed)+'})'),'typed navigation',15000);
  const atReturn={url:page.getURL(),loading:page.isLoading()};
  const document=await bounded(page.executeJavaScript('({url:location.href,title:document.title,heading:document.querySelector("h1")?.textContent})'),'navigation document',5000);
  observations.push({cycle,atReturn,document,events});console.log(JSON.stringify(observations.at(-1)));
  await request('stop',{id:profile.id});
 }
 report={tests:observations.map(o=>({name:'Navegacao imediata '+o.cycle,ok:o.atReturn.url===o.document.url&&o.document.heading==='ready'&&!o.atReturn.loading})),ok:observations.every(o=>o.atReturn.url===o.document.url&&o.document.heading==='ready'&&!o.atReturn.loading),observations};
}catch(error){report={ok:false,error:error.stack,observations};}
finally{clearTimeout(watchdog);await closeHTTPServer(server);writeFileSync(join(directory,'navigation-result.json'),JSON.stringify(report,null,2));await quitApplication(report.ok?0:1);}

});
