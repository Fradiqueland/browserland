import {app,BrowserWindow,WebContentsView,session} from 'electron';
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {prepareEmbeddedPage,navigatePreparedPage} from '../../src/embedded-page.mjs';
import {validateProfile} from '../../src/core.mjs';
import {bounded,closeWebContents,closeWindow,closeHTTPServer} from '../../src/operations.mjs';
const root=resolve(import.meta.dirname,'../..'),directory=(process.env.BROWSERLAND_DATA||process.env.MULTIBROWSER_DATA)||join(root,'test-results','startup-'+randomUUID());mkdirSync(directory,{recursive:true});app.setPath('userData',join(directory,'engine'));
const checks=[],timings=[],requests=[];let report,host,server;
const pass=(name,ok)=>{assert.ok(ok,name);checks.push({name,ok:true});appendFileSync(join(directory,'progress.log'),'PASS startup: '+name+'\n');};
app.whenReady().then(async()=>{
 try{
  server=createServer((_req,res)=>{requests.push(_req.url);res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>First navigation</title><script>window.initialIdentity={language:navigator.language,zone:Intl.DateTimeFormat().resolvedOptions().timeZone,node:typeof require,ipc:typeof window.desktop};try{document.createElement("canvas").toDataURL();window.initialCanvas=false}catch{window.initialCanvas=true}</script>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/';
  host=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  for(let cycle=0;cycle<6;cycle++){
   const views=[];
   try{await Promise.all([false,true].map(async background=>{
    const profile=validateProfile({name:'Startup '+cycle+' '+background,locale:background?'fr-FR':'de-DE',timezone:background?'Asia/Tokyo':'America/New_York',privacy:{canvas:true},emulateScreen:true,width:1100,height:800});
    const view=new WebContentsView({webPreferences:{session:session.fromPath(join(directory,'profile-'+profile.id)),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});views.push(view);view.setBounds({x:0,y:100,width:900,height:500});if(!background)host.contentView.addChildView(view);
    const started=performance.now(),wc=view.webContents,tab={view,ready:prepareEmbeddedPage(wc,profile,view.getBounds())},abandoned='abandoned-'+cycle+'-'+background,chosen='chosen-'+cycle+'-'+background;
    await bounded(Promise.all([navigatePreparedPage(tab,url+abandoned),navigatePreparedPage(tab,url+chosen)]),'primeira navegacao preparada',15000);
    pass('Ciclo '+cycle+' '+background+' aguarda parametros e abre apenas o ultimo endereco',wc.getURL()===url+chosen&&!requests.includes('/'+abandoned));
    const result=await bounded(wc.executeJavaScript('({...initialIdentity,canvas:initialCanvas,width:screen.width})'),'identidade inicial',5000);
    pass('Ciclo '+cycle+' '+(background?'segundo plano':'principal')+' aplica identidade antes do primeiro script',result.language===profile.locale&&result.zone===profile.timezone&&result.canvas&&result.width===1100&&result.node==='undefined'&&result.ipc==='undefined');
    await bounded(wc.loadURL('about:blank'),'separador vazio',15000);pass('Ciclo '+cycle+' '+background+' conserva idioma numa pagina vazia',await wc.executeJavaScript('navigator.language')===profile.locale);
    timings.push({cycle,background,milliseconds:Math.round(performance.now()-started)});
   }));}finally{for(const view of views){if(host.contentView.children.includes(view))host.contentView.removeChildView(view);await closeWebContents(view.webContents);}}
  }
  report={ok:true,tests:checks,timings};
 }catch(error){report={ok:false,tests:checks,timings,error:error.stack};}
 finally{await closeHTTPServer(server);await closeWindow(host);writeFileSync(join(directory,'startup-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok,checks:checks.length,directory,error:report.error}));app.exit(report.ok?0:1);}
});
