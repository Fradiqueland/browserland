import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {APPLICATION_NAME,APPLICATION_ID,environmentValue,encryptionApplicationName} from '../src/branding.mjs';
import {applicationDataDirectory,engineCandidates} from '../src/platform.mjs';
import {validateProfile,configurationBundle,configurationInputs,importProfileConfiguration,encryptBundle,decryptBundle} from '../src/core.mjs';
import {csvText,csvImport} from '../src/workspace.mjs';
import {exportSiteStorage,importSiteStorage} from '../src/site-storage.mjs';

const results=join(import.meta.dirname,'../test-results');mkdirSync(results,{recursive:true});
const temporary=()=>mkdtempSync(join(results,'browserland-branding-'));

test('Browserland environment names take precedence while old launchers retain their data directory',()=>{
 assert.equal(APPLICATION_NAME,'Browserland');assert.equal(APPLICATION_ID,'net.antoniofradique.browserland');
 const env={MULTIBROWSER_DATA:'D:/Existing/data',MULTIBROWSER_STARTUP_TOKEN:'legacy-token'};
 assert.equal(environmentValue('DATA',env),'D:/Existing/data');assert.equal(environmentValue('STARTUP_TOKEN',env),'legacy-token');
 env.BROWSERLAND_DATA='D:/Selected/data';assert.equal(environmentValue('DATA',env),'D:/Selected/data');
 for(const name of ['Multi-Browser','Browserland']){
  assert.equal(applicationDataDirectory({platform:'win32',packaged:true,execPath:'D:/Existing/'+name+'.exe'}),'D:\\Existing\\data');
  assert.equal(applicationDataDirectory({platform:'darwin',packaged:true,execPath:'/Applications/Portable/'+name+'.app/Contents/MacOS/Electron'}),'/Applications/Portable/data');
 }
});

test('macOS upgrades retain their encryption identity and new workspaces keep Browserland on restart',()=>{
 const upgraded=temporary();writeFileSync(join(upgraded,'workspace.json'),'{}');
 assert.equal(encryptionApplicationName(upgraded,'darwin'),'Multi-Browser');
 assert.equal(encryptionApplicationName(upgraded,'darwin'),'Multi-Browser');
 assert.equal(readFileSync(join(upgraded,'workspace.json'),'utf8'),'{}');
 const fresh=temporary();assert.equal(encryptionApplicationName(fresh,'darwin'),'Browserland');
 writeFileSync(join(fresh,'workspace.json'),'{}');assert.equal(encryptionApplicationName(fresh,'darwin'),'Browserland');
 const windows=temporary();assert.equal(encryptionApplicationName(windows,'win32'),'Browserland');assert.equal(existsSync(join(windows,'application-identity.json')),false);
 writeFileSync(join(fresh,'application-identity.json'),'{"version":1,"keychainName":"unrelated"}');
 assert.throws(()=>encryptionApplicationName(fresh,'darwin'),/encryption identity/);
});

test('Bundled Chromium accepts legacy runtime manifests and prefers the Browserland manifest',()=>{
 const options={platform:'darwin',execPath:'/portable/Browserland.app/Contents/MacOS/Electron',home:'/Users/test',env:{}};
 const old=engineCandidates('/source',{...options,exists:path=>path.endsWith('/multi-browser-runtime.json')});
 assert.ok(old.filter(c=>c.id==='chromium').every(c=>c.manifestPath.endsWith('/multi-browser-runtime.json')));
 const current=engineCandidates('/source',{...options,exists:()=>true});
 assert.ok(current.filter(c=>c.id==='chromium').every(c=>c.manifestPath.endsWith('/browserland-runtime.json')));
});

test('New branded JSON and legacy JSON imports preserve profile configuration without secrets',()=>{
 const profile=validateProfile({name:'Existing profile',engine:'chrome',launchMode:'plain',group:'Work',proxy:'http://127.0.0.1:8123',locale:'en-GB'});
 profile.proxySecret='private';const bundle=configurationBundle([profile],[{name:'Work',description:'Preserved group'}]);
 assert.equal(bundle.format,'browserland-profiles');assert.equal(JSON.stringify(bundle).includes('private'),false);
 for(const format of ['browserland-profiles','multi-browser-profiles']){
  const imported=configurationInputs({...bundle,format}).map(importProfileConfiguration);
  assert.equal(imported[0].name,profile.name);assert.equal(imported[0].launchMode,'plain');assert.equal(imported[0].proxy,profile.proxy);assert.notEqual(imported[0].id,profile.id);
 }
 for(const format of ['browserland-session','multi-browser-session'])assert.deepEqual(configurationInputs({format,version:1,cookies:[],profile:bundle.profiles[0]}),bundle.profiles);
 assert.throws(()=>configurationInputs({...bundle,version:99}),/importação inválido/);
 assert.throws(()=>configurationInputs({...bundle,format:'unknown-profiles'}),/importação inválido/);
});

test('Encrypted sessions accept either brand marker without changing authenticated ciphertext',()=>{
 const value={format:'multi-browser-session',version:1,profile:{name:'Legacy'},cookies:[{name:'fixture',value:'private'}]},password='isolated-test-password';
 const serialized=encryptBundle(value,password),encrypted=JSON.parse(serialized);assert.equal(encrypted.format,'browserland-encrypted');assert.ok(!serialized.includes('private'));
 assert.deepEqual(decryptBundle(serialized,password),value);
 const legacy=JSON.stringify({...encrypted,format:'multi-browser-encrypted'});assert.deepEqual(decryptBundle(legacy,password),value);
 assert.throws(()=>decryptBundle(legacy,'incorrect-password'));
 assert.throws(()=>decryptBundle(JSON.stringify({...encrypted,format:'unknown-encrypted'}),password));
 const damaged={...encrypted,data:Buffer.from('altered').toString('base64')};assert.throws(()=>decryptBundle(JSON.stringify(damaged),password));
});

test('Legacy and Browserland CSV preserve escaping, groups and selected launch mode',()=>{
 const profile=validateProfile({name:'=fixture()',engine:'edge',launchMode:'plain',groups:['Work'],notes:"'Preserved"});
 const csv=csvText([profile],[{name:'Work',description:'Group'}]);assert.ok(csv.includes('browserland-csv/2'));
 for(const input of [csv,csv.replaceAll('browserland-csv/2','multi-browser-csv/2')]){
  const result=csvImport(input);assert.equal(result.profiles[0].name,profile.name);assert.equal(result.profiles[0].notes,profile.notes);assert.equal(result.profiles[0].launchMode,'plain');assert.deepEqual(result.groups,[{name:'Work',description:'Group'}]);
 }
 assert.throws(()=>csvImport(csv.replaceAll('browserland-csv/2','browserland-csv/99')));
});

test('Native storage transfers accept both brand markers with the same isolation checks',async()=>{
 const source=temporary(),storage=join(source,'Default','Local Storage');mkdirSync(storage,{recursive:true});writeFileSync(join(storage,'fixture'),'session-data');writeFileSync(join(source,'Last Version'),'156.0.1.0');
 const snapshot=await exportSiteStorage(source,'chrome');assert.equal(snapshot.format,'browserland-site-storage');
 for(const format of ['browserland-site-storage','multi-browser-site-storage']){
  const target=temporary();assert.deepEqual(await importSiteStorage(target,{...snapshot,format},'chrome','Chrome/156.0.1.0'),{files:1,bytes:12});assert.equal(readFileSync(join(target,'Default','Local Storage','fixture'),'utf8'),'session-data');
  await assert.rejects(importSiteStorage(target,{...snapshot,format},'chrome','Chrome/156.0.1.0'),/EEXIST/);
 }
 await assert.rejects(importSiteStorage(temporary(),snapshot,'edge','Edg/156.0.1.0'),/motor diferente/);
});
