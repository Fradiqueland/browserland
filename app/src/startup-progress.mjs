import {environmentValue} from './branding.mjs';
import {BrowserWindow} from 'electron';
import {join} from 'node:path';
export async function startupProgress({root,isTest=false}){
 const external=process.platform==='win32'&&environmentValue('SINGLE_FILE');
 let splash=null;
 const update=(percent,message)=>{
  if(splash&&!splash.isDestroyed()){splash.setProgressBar(percent/100);splash.webContents.send('startup-progress',{percent,message})}
 };
 if(!isTest&&!external){
  splash=new BrowserWindow({width:510,height:260,resizable:false,minimizable:false,maximizable:false,closable:false,show:false,autoHideMenuBar:true,title:'Starting Browserland',backgroundColor:'#121626',icon:join(root,'ui/assets/app-icon.png'),webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,preload:join(root,'src/startup-preload.cjs')}});
  splash.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  splash.webContents.on('will-navigate',event=>event.preventDefault());
  splash.webContents.on('will-redirect',event=>event.preventDefault());
  await splash.loadFile(join(root,'ui/startup.html'));splash.show();update(30,'Loading application components');
 }
 let completed=false;
 return {update,complete(manager){
  return new Promise((resolve,reject)=>{
   let painted=false,loaded=false,settled=false;
   const timer=setTimeout(()=>finish(Error('The application window did not finish loading within 45 seconds.')),45000);
   function finish(error){
    if(settled)return;settled=true;clearTimeout(timer);
    manager.removeListener('ready-to-show',onPaint);manager.webContents.removeListener('did-finish-load',onLoad);manager.webContents.removeListener('did-fail-load',onFail);
    if(error){if(splash&&!splash.isDestroyed())splash.destroy();reject(error);return}
    update(100,'Ready');if(!isTest&&!manager.isDestroyed())manager.show();
    if(splash&&!splash.isDestroyed()){splash.setProgressBar(-1);splash.destroy()}
    const token=environmentValue('STARTUP_TOKEN');
    if(!completed&&/^[0-9a-f]{32}$/.test(token||''))process.stdout.write((process.env.BROWSERLAND_STARTUP_TOKEN?'BROWSERLAND_STARTUP_READY=':'MULTIBROWSER_STARTUP_READY=')+token+'\n');
    completed=true;resolve();
   }
   function ready(){if(painted&&loaded)finish()}
   function onPaint(){painted=true;ready()}
   function onLoad(){loaded=true;update(95,'Preparing your workspace');ready()}
   function onFail(_event,code,description,_url,mainFrame){if(mainFrame!==false)finish(Error('Application page failed to load: '+description+' ('+code+')'))}
   manager.once('ready-to-show',onPaint);manager.webContents.once('did-finish-load',onLoad);manager.webContents.once('did-fail-load',onFail);
  });
 }};
}
