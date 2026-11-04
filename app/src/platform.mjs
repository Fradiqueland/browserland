import {win32,posix} from 'node:path';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
const paths=platform=>platform==='win32'?win32:posix;
export function portableDirectory({platform=process.platform,execPath=process.execPath}={}){
 const p=paths(platform);
 if(platform==='darwin'){
  const match=execPath.match(/^(.*\.app)\/Contents\/MacOS\/[^/]+$/);
  if(match)return p.dirname(match[1]);
 }
 return p.dirname(execPath);
}
export function applicationDataDirectory({appRoot,packaged=false,platform=process.platform,execPath=process.execPath,override}={}){
 const p=paths(platform);
 return p.resolve(override||p.join(packaged?portableDirectory({platform,execPath}):appRoot,'data'));
}
export function engineCandidates(appRoot,{platform=process.platform,execPath=process.execPath,env=process.env,home=homedir(),exists=existsSync}={}){
 const p=paths(platform),roots=[appRoot,portableDirectory({platform,execPath})];
 const candidates=[];
 if(platform==='win32'||platform==='darwin')for(const root of roots){
  const runtime=p.join(root,'.runtime','chromium');
  const branded=p.join(runtime,'browserland-runtime.json'),legacy=p.join(runtime,'multi-browser-runtime.json');
  candidates.push({id:'chromium',name:'Chromium portátil',path:p.join(runtime,...(platform==='darwin'?['Chromium.app','Contents','MacOS','Chromium']:['chrome.exe'])),manifestPath:exists(branded)||!exists(legacy)?branded:legacy});
 }
 if(platform==='win32'){
  for(const root of [env.PROGRAMFILES||'C:/Program Files',env.LOCALAPPDATA||'C:/Users/Default/AppData/Local'])candidates.push({id:'chrome',name:'Google Chrome',path:p.join(root,'Google','Chrome','Application','chrome.exe')});
  for(const root of [env.PROGRAMFILES||'C:/Program Files',env['PROGRAMFILES(X86)']||'C:/Program Files (x86)'])candidates.push({id:'edge',name:'Microsoft Edge',path:p.join(root,'Microsoft','Edge','Application','msedge.exe')});
 }else if(platform==='darwin'){
  for(const root of ['/Applications',p.join(home,'Applications')])for(const [id,name] of [['chrome','Google Chrome'],['edge','Microsoft Edge']])candidates.push({id,name,path:p.join(root,name+'.app','Contents','MacOS',name)});
 }
 return candidates;
}
export function discoverEngines(appRoot,options={}){
 const exists=options.exists||existsSync,seen=new Set();
 return engineCandidates(appRoot,options).filter(candidate=>{if(seen.has(candidate.id)||!exists(candidate.path))return false;seen.add(candidate.id);return true;});
}
