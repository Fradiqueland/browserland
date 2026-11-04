import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,openSync,closeSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
const root=resolve(import.meta.dirname,'..'),version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Versao invalida.');
const executable=join(root,'dist','Browserland-'+version+'-win-x64','Browserland.exe'),run=mkdtempSync(join(root,'test-results','portable-'));
const unrelated=join(run,'unrelated-working-directory'),absent=join(run,'no-installed-browsers');mkdirSync(unrelated);mkdirSync(absent);
const output=openSync(join(run,'console.log'),'w');
const child=spawn(executable,['--self-test'],{cwd:unrelated,env:{...process.env,BROWSERLAND_DATA:run,BROWSERLAND_PORTABLE_TEST:'1',PROGRAMFILES:absent,'PROGRAMFILES(X86)':absent,LOCALAPPDATA:absent},windowsHide:true,stdio:['ignore',output,output]});closeSync(output);
let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},150000);
const exit=await new Promise(resolve=>{child.once('exit',(code,signal)=>resolve({code,signal}));child.once('error',error=>resolve({error:error.message}));});clearTimeout(timer);
let report;try{report=JSON.parse(readFileSync(join(run,'smoke-result.json'),'utf8'));}catch{}
const result={ok:exit.code===0&&!timedOut&&report?.ok===true,exit,timedOut,checks:report?.tests?.length||0,bundledChromium:report?.bundledChromium,installedBrowserDiscoveryDisabled:true,unrelatedWorkingDirectory:unrelated,executable,directory:run};
writeFileSync(join(run,'portable-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
