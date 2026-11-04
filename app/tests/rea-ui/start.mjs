import {join,resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {app,BrowserWindow,dialog} from 'electron';
const appRoot=resolve(import.meta.dirname,'../..');
process.env.BROWSERLAND_DATA=(process.env.BROWSERLAND_DATA||process.env.MULTIBROWSER_DATA)||join(appRoot,'test-results','rea-ui-'+randomUUID());
const {quitApplication}=await import('../../src/main.mjs');
if(process.argv.includes('--ui-suite')||process.argv.includes('--context-suite'))app.whenReady().then(()=>{
 const timer=setInterval(async()=>{
  const manager=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/ui/index.html'));
  if(!manager||manager.webContents.isLoading())return;clearInterval(timer);
  const directory=join((process.env.BROWSERLAND_DATA||process.env.MULTIBROWSER_DATA),'ui-checks');let report;
  if(process.argv.includes('--context-suite')){
   const tests=[];mkdirSync(directory,{recursive:true});const originalMessage=dialog.showMessageBox;dialog.showMessageBox=async()=>({response:1});
   try{await manager.webContents.executeJavaScript("window.desktop.request('language',{language:'en'})");const {runContextSmoke}=await import('../../src/context-smoke.mjs');await runContextSmoke({manager,directory,pass:(name,value)=>{if(!value)throw Error(name);tests.push({name,ok:true});console.log('PASS: '+name);}});report={ok:true,tests};}catch(error){report={ok:false,tests,error:error.stack};}finally{dialog.showMessageBox=originalMessage;}writeFileSync(join(directory,'ui-result.json'),JSON.stringify(report,null,2));
  }else{const {runUISmoke}=await import('../../src/ui-smoke.mjs');report=await runUISmoke({manager,dialog,directory});}
  if(process.argv.includes('--ui-test-exit'))await quitApplication(report.ok?0:1);
 },50);
});
